// Exit health checks. Each probe opens TLS *through* the exit to Cloudflare's
// /cdn-cgi/trace, which reports the egress IP (ip=) and country (loc=) that
// destinations will see. For ProxyIPs a second probe to a non-Cloudflare site
// tells whether the relay forwards any site ("all") or only Cloudflare ("cf").
import { connect } from 'cloudflare:sockets';
import type { ExitRow } from '../db/exits';
import type { Env } from '../env';
import { concatBytes, fromUtf8, utf8 } from '../lib/bytes';
import { socketHost } from '../proxy/protocol';
import { httpConnectHandshake, socks5Handshake } from './net';
import { isIp, resolve } from './resolve';
import { clearExitCache } from './select';

export const TRACE_HOST = 'www.cloudflare.com';
export const NON_CF_HOST = 'www.google.com';
const PROBE_TIMEOUT_MS = 9000;

export interface ProbeResult {
  ok: boolean;
  egressIp?: string;
  country?: string;
  latencyMs?: number;
  scope?: 'cf' | 'all';
  error?: string;
}

export function parseTrace(body: string): { ip?: string; loc?: string } {
  const out: { ip?: string; loc?: string } = {};
  for (const line of body.split('\n')) {
    const [k, v] = line.split('=');
    if (k === 'ip' && v) out.ip = v.trim();
    if (k === 'loc' && v) out.loc = v.trim().toUpperCase();
  }
  return out;
}

function timeout<T>(p: Promise<T>, ms: number, cleanup: () => void): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      t = setTimeout(() => {
        cleanup();
        reject(new Error('probe_timeout'));
      }, ms);
    }),
  ]).finally(() => {
    if (t !== undefined) clearTimeout(t);
  });
}

async function httpOverTls(tls: Socket, host: string, path: string, method = 'GET'): Promise<string> {
  const writer = tls.writable.getWriter();
  await writer.write(
    utf8(
      `${method} ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: Mozilla/5.0\r\nAccept: */*\r\nConnection: close\r\n\r\n`,
    ),
  );
  writer.releaseLock();
  const reader = tls.readable.getReader();
  let buf: Uint8Array = new Uint8Array(0);
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf = concatBytes(buf, value);
    if (buf.byteLength > 32_000) break;
    if (method === 'HEAD' && fromUtf8(buf).includes('\r\n\r\n')) break;
  }
  reader.releaseLock();
  return fromUtf8(buf);
}

/** Opens a socket to the exit that is ready for STARTTLS towards `sni`. */
async function openTunnel(row: ExitRow, sni: string): Promise<Socket> {
  if (row.type === 'proxyip') {
    const ips = isIp(row.address) ? [row.address] : await resolve(row.address, 'A');
    const ip = ips[0];
    if (!ip) throw new Error('no_address');
    const s = connect(
      { hostname: socketHost(ip), port: row.port || 443 },
      { secureTransport: 'starttls', allowHalfOpen: false },
    );
    await s.opened;
    return s;
  }
  const s = connect(
    { hostname: socketHost(row.address), port: row.port },
    { secureTransport: 'starttls', allowHalfOpen: false },
  );
  await s.opened;
  const auth = { username: row.username, password: row.password };
  const hs =
    row.type === 'socks5'
      ? await socks5Handshake(s, { host: sni, port: 443 }, auth)
      : await httpConnectHandshake(s, { host: sni, port: 443 }, auth);
  hs.reader.releaseLock();
  return s;
}

export async function probeExit(row: ExitRow): Promise<ProbeResult> {
  const started = Date.now();
  let raw: Socket | null = null;
  try {
    const body = await timeout(
      (async () => {
        raw = await openTunnel(row, TRACE_HOST);
        const tls = raw.startTls({ expectedServerHostname: TRACE_HOST });
        return httpOverTls(tls, TRACE_HOST, '/cdn-cgi/trace');
      })(),
      PROBE_TIMEOUT_MS,
      () => raw?.close().catch(() => {}),
    );
    const latencyMs = Date.now() - started;
    (raw as Socket | null)?.close().catch(() => {});
    const trace = parseTrace(body.slice(body.indexOf('\r\n\r\n') + 4));
    if (!trace.ip) return { ok: false, error: 'no_trace' };
    let scope: 'cf' | 'all' = row.type === 'proxyip' ? 'cf' : 'all';
    if (row.type === 'proxyip') {
      let s2: Socket | null = null;
      try {
        const head = await timeout(
          (async () => {
            s2 = await openTunnel(row, NON_CF_HOST);
            const tls = s2.startTls({ expectedServerHostname: NON_CF_HOST });
            return httpOverTls(tls, NON_CF_HOST, '/', 'HEAD');
          })(),
          PROBE_TIMEOUT_MS,
          () => s2?.close().catch(() => {}),
        );
        if (/^HTTP\/1\.[01] \d{3}/.test(head)) scope = 'all';
      } catch {
        // relay only reaches Cloudflare
      } finally {
        (s2 as Socket | null)?.close().catch(() => {});
      }
    }
    return { ok: true, egressIp: trace.ip, country: trace.loc, latencyMs, scope };
  } catch (err) {
    (raw as Socket | null)?.close().catch(() => {});
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : 'probe_failed' };
  }
}

/** Persists a probe result with hysteresis: an endpoint turns unhealthy after two failures in a row. */
export function resultStatement(db: D1Database, row: ExitRow, r: ProbeResult): D1PreparedStatement {
  const now = Date.now();
  if (r.ok) {
    return db
      .prepare(
        `UPDATE exits SET healthy = 1, fail_streak = 0, egress_ip = ?2, egress_country = ?3, latency_ms = ?4, scope = ?5,
           checked_at = ?6, last_error = NULL, country = CASE WHEN country = 'ZZ' AND ?3 IS NOT NULL THEN ?3 ELSE country END
         WHERE id = ?1`,
      )
      .bind(row.id, r.egressIp ?? null, r.country ?? null, r.latencyMs ?? null, r.scope ?? null, now);
  }
  return db
    .prepare(
      `UPDATE exits SET fail_streak = fail_streak + 1, healthy = CASE WHEN fail_streak + 1 >= 2 THEN 0 ELSE healthy END,
         checked_at = ?2, last_error = ?3 WHERE id = ?1`,
    )
    .bind(row.id, now, r.error ?? 'failed');
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!);
      }
    }),
  );
  return out;
}

/** Probes the least recently checked exits (bounded to stay within subrequest limits). */
export async function runHealthChecks(
  env: Env,
  opts: { limit?: number; ids?: number[] } = {},
): Promise<number> {
  const db = env.DB;
  const rows = opts.ids?.length
    ? (
        await db
          .prepare(`SELECT * FROM exits WHERE id IN (${opts.ids.map((_, i) => `?${i + 1}`).join(',')})`)
          .bind(...opts.ids)
          .all<ExitRow>()
      ).results
    : (
        await db
          .prepare('SELECT * FROM exits WHERE enabled = 1 ORDER BY COALESCE(checked_at, 0) ASC LIMIT ?1')
          .bind(opts.limit ?? 8)
          .all<ExitRow>()
      ).results;
  if (!rows.length) return 0;
  const results = await mapLimit(rows, 3, probeExit);
  await db.batch(rows.map((r, i) => resultStatement(db, r, results[i]!)));
  clearExitCache();
  return rows.length;
}
