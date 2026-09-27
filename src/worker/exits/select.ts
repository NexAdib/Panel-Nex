// Sticky exit selection with rendezvous (highest-random-weight) hashing: each
// user keeps the same endpoint (and so the same egress IP) while it is healthy,
// and when an endpoint fails only the users on that endpoint move.
import { type ExitRow, listExits } from '../db/exits';
import type { Hop } from '../proxy/dial';

/** 32-bit FNV-1a over a string, then an avalanche mix. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Orders items by HRW score for the given key (highest first). */
export function hrwOrder<T>(items: T[], key: string, id: (t: T) => string): T[] {
  return items
    .map((t) => ({ t, s: hash32(`${key}|${id(t)}`) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.t);
}

let cached: { at: number; byCountry: Map<string, ExitRow[]>; all: ExitRow[] } | null = null;
const TTL = 60_000;

export function clearExitCache(): void {
  cached = null;
}

async function healthyExits(db: D1Database) {
  if (cached && Date.now() - cached.at < TTL) return cached;
  const rows = (await listExits(db)).filter((r) => r.enabled && r.healthy);
  const byCountry = new Map<string, ExitRow[]>();
  for (const r of rows) {
    const list = byCountry.get(r.country) ?? [];
    list.push(r);
    byCountry.set(r.country, list);
  }
  cached = { at: Date.now(), byCountry, all: rows };
  return cached;
}

export function rowToHop(r: ExitRow, key?: string): Hop {
  switch (r.type) {
    case 'socks5':
      return {
        kind: 'socks5',
        host: r.address,
        port: r.port,
        username: r.username ?? undefined,
        password: r.password ?? undefined,
        exitId: r.id,
      };
    case 'http':
      return {
        kind: 'http',
        host: r.address,
        port: r.port,
        username: r.username ?? undefined,
        password: r.password ?? undefined,
        exitId: r.id,
      };
    default:
      return { kind: 'proxyip', host: r.address, port: r.port || null, exitId: r.id, key };
  }
}

/** Up to `max` hops for a country, sticky per user. `scopeAll` keeps only endpoints that relay any site. */
export async function countryHops(
  db: D1Database,
  country: string,
  userKey: string,
  opts: { max?: number; scopeAll?: boolean } = {},
): Promise<Hop[]> {
  const { byCountry } = await healthyExits(db);
  let rows = byCountry.get(country) ?? [];
  if (opts.scopeAll) rows = rows.filter((r) => r.type !== 'proxyip' || r.scope === 'all');
  return hrwOrder(rows, userKey, (r) => String(r.id))
    .slice(0, opts.max ?? 2)
    .map((r) => rowToHop(r, userKey));
}

/** Fallback hops for "Auto" connections that hit a Cloudflare-hosted site. */
export async function fallbackHops(
  db: D1Database,
  country: string,
  userKey: string,
  max = 2,
): Promise<Hop[]> {
  const { all } = await healthyExits(db);
  const pool = country ? all.filter((r) => r.country === country) : all;
  return hrwOrder(pool.length ? pool : all, userKey, (r) => String(r.id))
    .slice(0, max)
    .map((r) => rowToHop(r, userKey));
}
