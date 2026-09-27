import { DAY_MS, type UserStatus } from '../../shared/constants';
import { TtlLru } from '../lib/lru';

/** The subset of a user row the data plane needs, cached per isolate. */
export interface ProxyUser {
  id: number;
  status: UserStatus;
  dataLimit: number;
  used: number;
  expireAt: number | null;
  durationDays: number | null;
  deviceLimit: number;
  allowedExits: string[];
  forceExit: boolean;
  filterExempt: boolean;
  operator: string | null;
  /** Recently seen client IPs from other isolates (only loaded when a device limit is set). */
  recentIps: string[];
}

interface Row {
  id: number;
  status: UserStatus;
  data_limit: number;
  used_up: number;
  used_down: number;
  expire_at: number | null;
  duration_days: number | null;
  device_limit: number;
  allowed_exits: string;
  force_exit: number;
  filter_exempt: number;
  operator: string | null;
}

const POSITIVE_TTL = 60_000;
const NEGATIVE_TTL = 30_000;
export const DEVICE_WINDOW_MS = 5 * 60_000;

const cache = new TtlLru<string, ProxyUser | null>(10_000, POSITIVE_TTL);
const inflight = new Map<string, Promise<ProxyUser | null>>();

export function clearUserCache(): void {
  cache.clear();
}

function parseExits(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) && v.length ? v.map((x) => String(x).toUpperCase()) : ['*'];
  } catch {
    return ['*'];
  }
}

async function load(db: D1Database, column: 'uuid' | 'trojan_hash', key: string): Promise<ProxyUser | null> {
  const row = await db
    .prepare(
      `SELECT id, status, data_limit, used_up, used_down, expire_at, duration_days, device_limit,
              allowed_exits, force_exit, filter_exempt, operator
       FROM users WHERE ${column} = ?1`,
    )
    .bind(key)
    .first<Row>();
  if (!row) return null;
  let recentIps: string[] = [];
  if (row.device_limit > 0) {
    const ips = await db
      .prepare('SELECT ip FROM user_ips WHERE user_id = ?1 AND last_seen > ?2 LIMIT 50')
      .bind(row.id, Date.now() - DEVICE_WINDOW_MS)
      .all<{ ip: string }>();
    recentIps = ips.results.map((r) => r.ip);
  }
  return {
    id: row.id,
    status: row.status,
    dataLimit: row.data_limit,
    used: row.used_up + row.used_down,
    expireAt: row.expire_at,
    durationDays: row.duration_days,
    deviceLimit: row.device_limit,
    allowedExits: parseExits(row.allowed_exits),
    forceExit: !!row.force_exit,
    filterExempt: !!row.filter_exempt,
    operator: row.operator,
    recentIps,
  };
}

/** Looks a user up by credential with an LRU cache and in-flight de-duplication. */
export async function findUser(
  db: D1Database,
  proto: 'vless' | 'trojan',
  credential: string,
): Promise<ProxyUser | null> {
  const key = `${proto}:${credential}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let p = inflight.get(key);
  if (!p) {
    p = load(db, proto === 'vless' ? 'uuid' : 'trojan_hash', credential)
      .then((u) => {
        cache.set(key, u, u ? POSITIVE_TTL : NEGATIVE_TTL);
        return u;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/** Updates the cached copy after this isolate changed the user (e.g. on-hold activation). */
export function patchCachedUser(
  proto: 'vless' | 'trojan',
  credential: string,
  patch: Partial<ProxyUser>,
): void {
  const key = `${proto}:${credential}`;
  const cur = cache.get(key);
  if (cur) cache.set(key, { ...cur, ...patch });
}

export type Denial = 'disabled' | 'expired' | 'limited' | 'devices' | 'exit_not_allowed';

/** Normalizes an IP for device counting: IPv6 privacy addresses rotate inside a /64. */
export function deviceKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  const parts = ip.split(':');
  return `${parts.slice(0, 4).join(':')}::/64`;
}

export function checkAccess(
  u: ProxyUser,
  opts: { now: number; pendingBytes: number; exit: string | null; ip: string; localIps: string[] },
): Denial | null {
  if (u.status === 'disabled') return 'disabled';
  if (u.status === 'expired') return 'expired';
  if (u.status === 'on_hold') {
    // activates on this connection
  } else if (u.expireAt !== null && u.expireAt <= opts.now) return 'expired';
  if (u.status === 'limited') return 'limited';
  if (u.dataLimit > 0 && u.used + opts.pendingBytes >= u.dataLimit) return 'limited';
  if (opts.exit && !u.allowedExits.includes('*') && !u.allowedExits.includes(opts.exit))
    return 'exit_not_allowed';
  if (u.deviceLimit > 0) {
    const me = deviceKey(opts.ip);
    const seen = new Set([...u.recentIps.map(deviceKey), ...opts.localIps.map(deviceKey)]);
    if (!seen.has(me) && seen.size >= u.deviceLimit) return 'devices';
  }
  return null;
}

/** Expiry assigned when an on-hold user connects for the first time. */
export function onHoldExpiry(u: ProxyUser, now: number): number {
  return now + (u.durationDays ?? 30) * DAY_MS;
}
