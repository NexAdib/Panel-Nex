// Periodic upkeep shared by the cron trigger and a lazy runner (for installs
// without a cron): fold usage, apply resets and expiry, and prune old rows.
// Never runs on the proxy data path.
import { DAY_MS } from '../../shared/constants';
import { getMeta, setMeta } from '../db/meta';
import { getSettings } from '../db/settings';
import type { Env } from '../env';
import { dayKey, startOfDay } from '../lib/time';
import { clearUserCache } from '../proxy/users';
import { aggregateUsage } from './aggregate';
import { acquireLock, releaseLock } from './lock';

export interface MaintenanceResult {
  ran: boolean;
  journalRows: number;
  activeUsers: number;
  limited: number;
  expired: number;
  resets: number;
}

const LOCK = 'maintenance';
const LEASE_MS = 90_000;

/** Resets, expiry transitions and retention, as one batch. */
export function upkeepStatements(db: D1Database, now: number, tz: string): D1PreparedStatement[] {
  const week = 7 * DAY_MS;
  const month = 30 * DAY_MS;
  const reset = (strategy: string, cond: string, lastReset: string, second: number) =>
    db
      .prepare(
        `UPDATE users SET used_up = 0, used_down = 0, last_reset_at = ${lastReset},
           status = CASE WHEN status = 'limited' THEN 'active' ELSE status END, updated_at = ?1
         WHERE reset_strategy = '${strategy}' AND ${cond}`,
      )
      .bind(now, second);
  return [
    reset('daily', 'last_reset_at < ?2', '?1', startOfDay(now, tz)),
    reset(
      'weekly',
      'last_reset_at <= ?1 - ?2',
      'last_reset_at + CAST((?1 - last_reset_at) / ?2 AS INTEGER) * ?2',
      week,
    ),
    reset(
      'monthly',
      'last_reset_at <= ?1 - ?2',
      'last_reset_at + CAST((?1 - last_reset_at) / ?2 AS INTEGER) * ?2',
      month,
    ),
    db
      .prepare(
        `INSERT INTO audit_log (created_at, actor, action, target, ip, details)
         SELECT ?1, 'system', 'user_expired', 'user:' || id, NULL, json_object('name', name)
         FROM users WHERE status IN ('active', 'limited') AND expire_at IS NOT NULL AND expire_at <= ?1`,
      )
      .bind(now),
    db
      .prepare(
        `UPDATE users SET status = 'expired', updated_at = ?1
         WHERE status IN ('active', 'limited') AND expire_at IS NOT NULL AND expire_at <= ?1`,
      )
      .bind(now),
    db.prepare('DELETE FROM user_ips WHERE last_seen < ?1').bind(now - 30 * DAY_MS),
    db.prepare('DELETE FROM usage_daily WHERE day < ?1').bind(dayKey(now - 400 * DAY_MS, tz)),
    db.prepare('DELETE FROM audit_log WHERE created_at < ?1').bind(now - 180 * DAY_MS),
  ];
}

export async function runMaintenance(env: Env): Promise<MaintenanceResult> {
  const db = env.DB;
  const result: MaintenanceResult = {
    ran: false,
    journalRows: 0,
    activeUsers: 0,
    limited: 0,
    expired: 0,
    resets: 0,
  };
  const holder = await acquireLock(db, LOCK, LEASE_MS);
  if (!holder) return result;
  try {
    const { timezone } = await getSettings(db, 'general');
    const deadline = Date.now() + 20_000;
    // Drain the journal in bounded chunks.
    for (let i = 0; i < 5 && Date.now() < deadline; i++) {
      const r = await aggregateUsage(db, timezone);
      result.journalRows += r.rows;
      result.activeUsers += r.users;
      result.limited += r.limited;
      if (r.rows < 1000) break;
    }
    const now = Date.now();
    const out = await db.batch(upkeepStatements(db, now, timezone));
    result.resets = out.slice(0, 3).reduce((n, x) => n + (x.meta.changes ?? 0), 0);
    result.expired = out[4]?.meta.changes ?? 0;
    await setMeta(db, 'maintenance_at', String(now));
    if (result.limited || result.expired || result.resets) clearUserCache();
    result.ran = true;
    return result;
  } finally {
    await releaseLock(db, LOCK, holder).catch(() => {});
  }
}

let lastLocalCheck = 0;
const LAZY_EVERY_MS = 6 * 60_000;

/**
 * Runs maintenance from ordinary (non-proxy) requests when the cron has not done
 * it recently, e.g. on installs that were pasted into the dashboard without a
 * cron trigger. At most one D1 read per isolate per minute.
 */
export function maybeMaintenance(
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void },
  maxAgeMs = LAZY_EVERY_MS,
): void {
  const now = Date.now();
  if (now - lastLocalCheck < 60_000) return;
  lastLocalCheck = now;
  ctx.waitUntil(
    (async () => {
      const last = Number((await getMeta(env.DB, 'maintenance_at')) ?? 0);
      if (now - last >= maxAgeMs) await runMaintenance(env);
    })().catch((err) => console.error('maintenance', err instanceof Error ? err.message : err)),
  );
}

/** For tests. */
export function resetMaintenanceThrottle(): void {
  lastLocalCheck = 0;
}
