import { TtlLru } from '../lib/lru';

export interface OperatorConfig {
  /** Preferred ports for this ISP (empty = global setting). */
  ports?: number[];
  fingerprint?: string;
  fragment?: { enabled: boolean; packets?: string; length?: string; interval?: string };
}

export interface OperatorRow {
  code: string;
  name_fa: string;
  name_en: string;
  asns: string;
  enabled: number;
  sort: number;
  config: string;
}

export interface Operator {
  code: string;
  nameFa: string;
  nameEn: string;
  asns: number[];
  enabled: boolean;
  sort: number;
  config: OperatorConfig;
}

export function toOperator(r: OperatorRow): Operator {
  let asns: number[] = [];
  let config: OperatorConfig = {};
  try {
    asns = (JSON.parse(r.asns) as unknown[]).map(Number).filter(Number.isFinite);
  } catch {}
  try {
    config = JSON.parse(r.config) as OperatorConfig;
  } catch {}
  return {
    code: r.code,
    nameFa: r.name_fa,
    nameEn: r.name_en,
    asns,
    enabled: !!r.enabled,
    sort: r.sort,
    config,
  };
}

let cache: { at: number; list: Operator[] } | null = null;

export function clearOperatorCache(): void {
  cache = null;
}

export async function listOperators(db: D1Database): Promise<Operator[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.list;
  const res = await db.prepare('SELECT * FROM operators ORDER BY sort, code').all<OperatorRow>();
  cache = { at: Date.now(), list: res.results.map(toOperator) };
  return cache.list;
}

/** ISP from the client's autonomous system number, if it belongs to a known operator. */
export async function operatorByAsn(
  db: D1Database,
  asn: number | undefined | null,
): Promise<Operator | null> {
  if (!asn) return null;
  const ops = await listOperators(db);
  return ops.find((o) => o.enabled && o.asns.includes(asn)) ?? null;
}

export interface CleanIp {
  address: string;
  port: number;
}

const ipCache = new TtlLru<string, CleanIp[]>(64, 60_000);

export function clearCleanIpCache(): void {
  ipCache.clear();
}

export async function cleanIpsFor(db: D1Database, operator: string): Promise<CleanIp[]> {
  const hit = ipCache.get(operator);
  if (hit) return hit;
  const res = await db
    .prepare(
      'SELECT address, port FROM clean_ips WHERE operator = ?1 AND enabled = 1 AND healthy = 1 ORDER BY COALESCE(latency_ms, 9999), id LIMIT 60',
    )
    .bind(operator)
    .all<CleanIp>();
  ipCache.set(operator, res.results);
  return res.results;
}
