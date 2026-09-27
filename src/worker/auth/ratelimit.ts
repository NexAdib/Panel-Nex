// Login throttling stored in D1, so it holds across isolates and data centers
// (the reference panels kept these counters in per-isolate memory).

export interface LockState {
  locked: boolean;
  retryAfterSec: number;
}

export async function checkLock(db: D1Database, keys: string[]): Promise<LockState> {
  const now = Date.now();
  const placeholders = keys.map((_, i) => `?${i + 1}`).join(',');
  const rows = await db
    .prepare(`SELECT locked_until FROM login_attempts WHERE k IN (${placeholders})`)
    .bind(...keys)
    .all<{ locked_until: number }>();
  let until = 0;
  for (const r of rows.results) until = Math.max(until, r.locked_until);
  return until > now
    ? { locked: true, retryAfterSec: Math.ceil((until - now) / 1000) }
    : { locked: false, retryAfterSec: 0 };
}

export async function recordFailure(
  db: D1Database,
  keys: string[],
  maxFails: number,
  lockMinutes: number,
): Promise<void> {
  const now = Date.now();
  const windowStart = now - lockMinutes * 60_000;
  const lockUntil = now + lockMinutes * 60_000;
  await db.batch(
    keys.map((k) =>
      db
        .prepare(
          `INSERT INTO login_attempts (k, fails, first_at, locked_until) VALUES (?1, 1, ?2, 0)
           ON CONFLICT(k) DO UPDATE SET
             fails = CASE WHEN login_attempts.first_at < ?3 THEN 1 ELSE login_attempts.fails + 1 END,
             first_at = CASE WHEN login_attempts.first_at < ?3 THEN ?2 ELSE login_attempts.first_at END,
             locked_until = CASE
               WHEN (CASE WHEN login_attempts.first_at < ?3 THEN 1 ELSE login_attempts.fails + 1 END) >= ?4 THEN ?5
               ELSE login_attempts.locked_until END`,
        )
        .bind(k, now, windowStart, maxFails, lockUntil),
    ),
  );
}

export async function clearFailures(db: D1Database, keys: string[]): Promise<void> {
  const placeholders = keys.map((_, i) => `?${i + 1}`).join(',');
  await db
    .prepare(`DELETE FROM login_attempts WHERE k IN (${placeholders})`)
    .bind(...keys)
    .run();
}
