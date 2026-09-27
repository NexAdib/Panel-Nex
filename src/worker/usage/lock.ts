// Lease locks in D1: a holder owns the lock until it releases it or the lease expires.
import { randomString } from '../lib/crypto';

export async function acquireLock(db: D1Database, name: string, ttlMs: number): Promise<string | null> {
  const holder = randomString(16);
  const now = Date.now();
  const row = await db
    .prepare(
      `INSERT INTO locks (name, holder, expires_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(name) DO UPDATE SET holder = excluded.holder, expires_at = excluded.expires_at
       WHERE locks.expires_at < ?4
       RETURNING holder`,
    )
    .bind(name, holder, now + ttlMs, now)
    .first<{ holder: string }>();
  return row?.holder === holder ? holder : null;
}

export async function releaseLock(db: D1Database, name: string, holder: string): Promise<void> {
  await db.prepare('DELETE FROM locks WHERE name = ?1 AND holder = ?2').bind(name, holder).run();
}
