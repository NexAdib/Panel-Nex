export type ExitType = 'proxyip' | 'socks5' | 'http';

export interface ExitRow {
  id: number;
  country: string;
  type: ExitType;
  address: string;
  port: number;
  username: string | null;
  password: string | null;
  label: string;
  enabled: number;
  healthy: number;
  fail_streak: number;
  egress_ip: string | null;
  egress_country: string | null;
  latency_ms: number | null;
  scope: string | null;
  checked_at: number | null;
  last_error: string | null;
  created_at: number;
}

export async function listExits(db: D1Database): Promise<ExitRow[]> {
  const res = await db
    .prepare('SELECT * FROM exits ORDER BY country, healthy DESC, latency_ms')
    .all<ExitRow>();
  return res.results;
}
