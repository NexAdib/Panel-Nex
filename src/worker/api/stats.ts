import type { Hono } from 'hono';
import { DAY_MS, type UserStatus } from '../../shared/constants';
import type { DailyUsage, OverviewDto, UserUsageDto } from '../../shared/types';
import { getMeta } from '../db/meta';
import { getSettings } from '../db/settings';
import { HttpError } from '../lib/http';
import { dayKey } from '../lib/time';
import { runMaintenance } from '../usage/maintenance';
import type { AppEnv } from './context';

/** Last `n` calendar days (oldest first) in the panel's time zone. */
export function lastDays(n: number, tz: string, now = Date.now()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = dayKey(now - i * DAY_MS, tz);
    if (out[out.length - 1] !== key) out.push(key);
  }
  return out;
}

/** Folds pending usage first so the numbers are fresh (skipped if another run holds the lock). */
async function freshen(env: AppEnv['Bindings']): Promise<void> {
  const last = Number((await getMeta(env.DB, 'maintenance_at')) ?? 0);
  if (Date.now() - last > 30_000) await runMaintenance(env).catch(() => {});
}

export function statsRoutes(api: Hono<AppEnv>): void {
  api.get('/stats/overview', async (c) => {
    const db = c.env.DB;
    await freshen(c.env);
    const { timezone } = await getSettings(db, 'general');
    const now = Date.now();
    const days = lastDays(30, timezone, now);
    const today = days[days.length - 1]!;
    const [counts, extra, daily, top, exits, recent] = await db.batch<Record<string, unknown>>([
      db.prepare('SELECT status, COUNT(*) AS n FROM users GROUP BY status'),
      db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM users WHERE last_online_at >= ?1) AS online,
             (SELECT COUNT(*) FROM users WHERE status = 'active' AND expire_at IS NOT NULL AND expire_at BETWEEN ?2 AND ?3) AS expiring,
             (SELECT COUNT(*) FROM users WHERE status = 'active' AND data_limit > 0 AND used_up + used_down >= data_limit * 0.9) AS near`,
        )
        .bind(now - 10 * 60_000, now, now + 3 * DAY_MS),
      db
        .prepare('SELECT day, up, down, conns, blocked FROM usage_global_daily WHERE day >= ?1 ORDER BY day')
        .bind(days[0]),
      db
        .prepare(
          `SELECT u.id, u.name, u.status, t.total FROM (
             SELECT user_id, SUM(up + down) AS total FROM usage_daily WHERE day >= ?1
             GROUP BY user_id ORDER BY total DESC LIMIT 6
           ) t JOIN users u ON u.id = t.user_id ORDER BY t.total DESC`,
        )
        .bind(days[0]),
      db.prepare(
        `SELECT country, COUNT(*) AS total, SUM(CASE WHEN enabled = 1 AND healthy = 1 THEN 1 ELSE 0 END) AS healthy
         FROM exits WHERE enabled = 1 GROUP BY country ORDER BY country`,
      ),
      db.prepare(
        'SELECT id, created_at, actor, action, target, details FROM audit_log ORDER BY id DESC LIMIT 8',
      ),
    ]);

    const users = {
      all: 0,
      active: 0,
      disabled: 0,
      expired: 0,
      limited: 0,
      on_hold: 0,
    } as OverviewDto['users'];
    for (const r of counts!.results as { status: UserStatus; n: number }[]) {
      users[r.status] = r.n;
      users.all += r.n;
    }
    const x = (extra!.results[0] ?? {}) as { online?: number; expiring?: number; near?: number };
    users.online = x.online ?? 0;
    users.expiringSoon = x.expiring ?? 0;
    users.nearLimit = x.near ?? 0;

    const byDay = new Map(
      (daily!.results as { day: string; up: number; down: number; conns: number; blocked: number }[]).map(
        (r) => [r.day, r],
      ),
    );
    const series = days.map((day) => {
      const r = byDay.get(day);
      return { day, up: r?.up ?? 0, down: r?.down ?? 0, conns: r?.conns ?? 0 };
    });
    const t = byDay.get(today);
    const body: OverviewDto = {
      users,
      today: { up: t?.up ?? 0, down: t?.down ?? 0, conns: t?.conns ?? 0, blocked: t?.blocked ?? 0 },
      last30: series.reduce((a, d) => ({ up: a.up + d.up, down: a.down + d.down }), { up: 0, down: 0 }),
      daily: series,
      top: top!.results as OverviewDto['top'],
      exits: exits!.results as OverviewDto['exits'],
      recent: (
        recent!.results as {
          id: number;
          created_at: number;
          actor: string;
          action: string;
          target: string | null;
          details: string | null;
        }[]
      ).map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        actor: r.actor,
        action: r.action,
        target: r.target,
        details: r.details,
      })),
      maintenanceAt: Number((await getMeta(db, 'maintenance_at')) ?? 0) || null,
      timezone,
    };
    return c.json(body);
  });

  api.get('/users/:id/usage', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'bad_id');
    const db = c.env.DB;
    await freshen(c.env);
    const { timezone } = await getSettings(db, 'general');
    const n = Math.min(90, Math.max(7, Number(c.req.query('days')) || 30));
    const days = lastDays(n, timezone);
    const [rows, ips] = await db.batch<Record<string, unknown>>([
      db
        .prepare('SELECT day, up, down FROM usage_daily WHERE user_id = ?1 AND day >= ?2 ORDER BY day')
        .bind(id, days[0]),
      db
        .prepare('SELECT ip, last_seen FROM user_ips WHERE user_id = ?1 ORDER BY last_seen DESC LIMIT 30')
        .bind(id),
    ]);
    const byDay = new Map((rows!.results as unknown as DailyUsage[]).map((r) => [r.day, r]));
    const body: UserUsageDto = {
      daily: days.map((day) => ({ day, up: byDay.get(day)?.up ?? 0, down: byDay.get(day)?.down ?? 0 })),
      ips: (ips!.results as { ip: string; last_seen: number }[]).map((r) => ({
        ip: r.ip,
        lastSeen: r.last_seen,
      })),
    };
    return c.json(body);
  });
}
