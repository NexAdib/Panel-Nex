// Folds usage_journal rows (one per isolate flush) into users, usage_daily,
// usage_global_daily and user_ips. Each run is one read plus one atomic batch
// whose size does not depend on the number of users: per-user deltas travel as
// a JSON parameter and are applied with json_each().
//
// Exactly-once: the batch first records a run token only if every journal row
// it read is still present, and every write is conditional on that token. If
// another runner consumed the same rows first, this batch applies nothing.
import { randomString } from '../lib/crypto';
import { dayKey } from '../lib/time';

/** Journal payload written by proxy/meter.ts. */
interface JournalData {
  v: number;
  c?: number;
  b?: number;
  u?: [number, number, number, [string, number][]][];
}

export interface AggregateResult {
  rows: number;
  users: number;
  /** Ids of users that crossed their data limit in this run. */
  limited: number;
}

const TOKEN_OK = `EXISTS (SELECT 1 FROM meta WHERE k = 'agg_token' AND v = ?9)`;

export async function aggregateUsage(db: D1Database, tz: string, limit = 1000): Promise<AggregateResult> {
  const res = await db
    .prepare('SELECT id, created_at, data FROM usage_journal ORDER BY id LIMIT ?1')
    .bind(limit)
    .all<{ id: number; created_at: number; data: string }>();
  const rows = res.results;
  if (!rows.length) return { rows: 0, users: 0, limited: 0 };

  const users = new Map<number, { up: number; down: number; last: number }>();
  const daily = new Map<string, [number, string, number, number]>();
  const global = new Map<string, [string, number, number, number, number]>();
  const ips = new Map<string, [number, string, number]>();

  for (const r of rows) {
    let d: JournalData;
    try {
      d = JSON.parse(r.data) as JournalData;
    } catch {
      continue;
    }
    const day = dayKey(r.created_at, tz);
    const g = global.get(day) ?? [day, 0, 0, 0, 0];
    g[3] += Math.max(0, Number(d.c) || 0);
    g[4] += Math.max(0, Number(d.b) || 0);
    for (const entry of d.u ?? []) {
      const [id, rawUp, rawDown, seen] = entry;
      if (!Number.isInteger(id) || id <= 0) continue;
      const up = Math.max(0, Math.round(Number(rawUp) || 0));
      const down = Math.max(0, Math.round(Number(rawDown) || 0));
      const u = users.get(id) ?? { up: 0, down: 0, last: 0 };
      u.up += up;
      u.down += down;
      for (const [ip, ts] of Array.isArray(seen) ? seen : []) {
        if (typeof ip !== 'string' || !ip || ip.length > 64) continue;
        const k = `${id}|${ip}`;
        const prev = ips.get(k);
        if (!prev || prev[2] < ts) ips.set(k, [id, ip, ts]);
        if (ts > u.last) u.last = ts;
      }
      if ((up || down) && r.created_at > u.last) u.last = r.created_at;
      users.set(id, u);
      const dk = `${id}|${day}`;
      const dd = daily.get(dk) ?? [id, day, 0, 0];
      dd[2] += up;
      dd[3] += down;
      daily.set(dk, dd);
      g[1] += up;
      g[2] += down;
    }
    global.set(day, g);
  }

  const lastId = rows[rows.length - 1]!.id;
  const token = randomString(16);
  const now = Date.now();
  const userJson = JSON.stringify([...users].map(([id, u]) => [id, u.up, u.down, u.last || null]));
  const dailyJson = JSON.stringify([...daily.values()]);
  const globalJson = JSON.stringify([...global.values()]);
  const ipJson = JSON.stringify([...ips.values()]);

  // Every statement binds the same parameter list so ?9 (the token) is shared.
  const bind = (st: D1PreparedStatement) =>
    st.bind(lastId, rows.length, userJson, dailyJson, globalJson, ipJson, now, null, token);

  const out = await db.batch([
    bind(
      db.prepare(
        `INSERT INTO meta (k, v) SELECT 'agg_token', ?9
         WHERE (SELECT COUNT(*) FROM usage_journal WHERE id <= ?1) = ?2
         ON CONFLICT(k) DO UPDATE SET v = excluded.v`,
      ),
    ),
    bind(
      db.prepare(
        `UPDATE users SET
           used_up = used_up + j.up,
           used_down = used_down + j.down,
           lifetime_used = lifetime_used + j.up + j.down,
           last_online_at = MAX(COALESCE(last_online_at, 0), COALESCE(j.last, 0))
         FROM (SELECT json_extract(value, '$[0]') AS id, json_extract(value, '$[1]') AS up,
                      json_extract(value, '$[2]') AS down, json_extract(value, '$[3]') AS last
               FROM json_each(?3)) AS j
         WHERE users.id = j.id AND ${TOKEN_OK}`,
      ),
    ),
    // Only users that just received traffic can newly cross their limit.
    bind(
      db.prepare(
        `INSERT INTO audit_log (created_at, actor, action, target, ip, details)
         SELECT ?7, 'system', 'user_limited', 'user:' || u.id, NULL, json_object('name', u.name)
         FROM users u JOIN json_each(?3) j ON u.id = json_extract(j.value, '$[0]')
         WHERE u.status = 'active' AND u.data_limit > 0 AND u.used_up + u.used_down >= u.data_limit AND ${TOKEN_OK}`,
      ),
    ),
    bind(
      db.prepare(
        `UPDATE users SET status = 'limited', updated_at = ?7
         WHERE status = 'active' AND data_limit > 0 AND used_up + used_down >= data_limit
           AND id IN (SELECT json_extract(value, '$[0]') FROM json_each(?3)) AND ${TOKEN_OK}`,
      ),
    ),
    bind(
      db.prepare(
        `INSERT INTO usage_daily (user_id, day, up, down)
         SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]')
         FROM json_each(?4)
         WHERE EXISTS (SELECT 1 FROM users WHERE id = json_extract(value, '$[0]')) AND ${TOKEN_OK}
         ON CONFLICT(user_id, day) DO UPDATE SET up = up + excluded.up, down = down + excluded.down`,
      ),
    ),
    bind(
      db.prepare(
        `INSERT INTO usage_global_daily (day, up, down, conns, blocked)
         SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
                json_extract(value, '$[3]'), json_extract(value, '$[4]')
         FROM json_each(?5)
         WHERE ${TOKEN_OK}
         ON CONFLICT(day) DO UPDATE SET up = up + excluded.up, down = down + excluded.down,
           conns = conns + excluded.conns, blocked = blocked + excluded.blocked`,
      ),
    ),
    bind(
      db.prepare(
        `INSERT INTO user_ips (user_id, ip, last_seen)
         SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]')
         FROM json_each(?6)
         WHERE EXISTS (SELECT 1 FROM users WHERE id = json_extract(value, '$[0]')) AND ${TOKEN_OK}
         ON CONFLICT(user_id, ip) DO UPDATE SET last_seen = MAX(last_seen, excluded.last_seen)`,
      ),
    ),
    bind(db.prepare(`DELETE FROM usage_journal WHERE id <= ?1 AND ${TOKEN_OK}`)),
    bind(db.prepare(`DELETE FROM meta WHERE k = 'agg_token' AND v = ?9`)),
  ]);
  const applied = (out[0]?.meta.changes ?? 0) > 0;
  if (!applied) return { rows: 0, users: 0, limited: 0 };
  return { rows: rows.length, users: users.size, limited: out[3]?.meta.changes ?? 0 };
}
