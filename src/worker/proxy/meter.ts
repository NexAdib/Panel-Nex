// Per-isolate traffic accounting. Connections add bytes here; roughly once a
// minute the isolate writes ONE usage_journal row with every user's deltas, and
// the cron aggregator folds the journal into users/usage tables. This keeps D1
// writes independent of the number of connections.
import type { Env } from '../env';

interface Pending {
  up: number;
  down: number;
  ips: Map<string, number>;
}

const pending = new Map<number, Pending>();
const recentIps = new Map<number, Map<string, number>>();
let conns = 0;
let blocked = 0;
let lastFlush = Date.now();
let flushing: Promise<void> | null = null;

const FLUSH_INTERVAL_MS = 60_000;
const FLUSH_BYTES = 256 * 1024 * 1024;
const IP_WINDOW_MS = 5 * 60_000;

function slot(userId: number): Pending {
  let p = pending.get(userId);
  if (!p) {
    p = { up: 0, down: 0, ips: new Map() };
    pending.set(userId, p);
  }
  return p;
}

export function noteConnection(userId: number, ip: string): void {
  conns++;
  const now = Date.now();
  slot(userId).ips.set(ip, now);
  let m = recentIps.get(userId);
  if (!m) {
    m = new Map();
    recentIps.set(userId, m);
  }
  m.set(ip, now);
}

export function noteBlocked(): void {
  blocked++;
}

export function addBytes(userId: number, up: number, down: number): void {
  const p = slot(userId);
  p.up += up;
  p.down += down;
}

/** Bytes this isolate has counted for the user but not yet written. */
export function pendingBytes(userId: number): number {
  const p = pending.get(userId);
  return p ? p.up + p.down : 0;
}

/** Client IPs seen by this isolate for the user within the device window. */
export function localIps(userId: number): string[] {
  const m = recentIps.get(userId);
  if (!m) return [];
  const cutoff = Date.now() - IP_WINDOW_MS;
  const out: string[] = [];
  for (const [ip, ts] of m) {
    if (ts < cutoff) m.delete(ip);
    else out.push(ip);
  }
  return out;
}

function totalPending(): number {
  let n = 0;
  for (const p of pending.values()) n += p.up + p.down;
  return n;
}

/** Serializes and clears the pending counters (restored if the write fails). */
async function flush(env: Env): Promise<void> {
  if (pending.size === 0 && conns === 0 && blocked === 0) return;
  const snapshot = [...pending.entries()];
  const c = conns;
  const b = blocked;
  pending.clear();
  conns = 0;
  blocked = 0;
  lastFlush = Date.now();
  const data = {
    v: 1,
    c,
    b,
    u: snapshot.map(([id, p]) => [id, p.up, p.down, [...p.ips.entries()]]),
  };
  try {
    await env.DB.prepare('INSERT INTO usage_journal (created_at, data) VALUES (?1, ?2)')
      .bind(lastFlush, JSON.stringify(data))
      .run();
  } catch (err) {
    // Put the counters back so the next flush retries them.
    for (const [id, p] of snapshot) {
      const s = slot(id);
      s.up += p.up;
      s.down += p.down;
      for (const [ip, ts] of p.ips) s.ips.set(ip, Math.max(ts, s.ips.get(ip) ?? 0));
    }
    conns += c;
    blocked += b;
    console.error('usage flush failed', err instanceof Error ? err.message : err);
  }
}

/** Flushes when the interval elapsed, a lot of traffic is pending, or `force` is set. */
export function maybeFlush(env: Env, ctx: { waitUntil(p: Promise<unknown>): void }, force = false): void {
  if (flushing) return;
  const interval = env.USAGE_FLUSH_MS ? Number(env.USAGE_FLUSH_MS) : FLUSH_INTERVAL_MS;
  const due = force || Date.now() - lastFlush >= interval || totalPending() >= FLUSH_BYTES;
  if (!due || (pending.size === 0 && conns === 0 && blocked === 0)) return;
  flushing = flush(env).finally(() => {
    flushing = null;
  });
  ctx.waitUntil(flushing);
}

/** Test helper: write whatever is pending right now. */
export async function flushNow(env: Env): Promise<void> {
  if (flushing) await flushing;
  await flush(env);
}
