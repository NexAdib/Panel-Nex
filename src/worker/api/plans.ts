import type { Hono } from 'hono';
import { z } from 'zod';
import { RESET_STRATEGIES } from '../../shared/constants';
import type { PlanDto } from '../../shared/types';
import { audit } from '../db/audit';
import { HttpError } from '../lib/http';
import { type AppEnv, actorOf, ipOf, readBody } from './context';

interface PlanRow {
  id: number;
  name: string;
  data_limit: number;
  duration_days: number;
  device_limit: number;
  allowed_exits: string;
  warp_enabled: number;
  reset_strategy: (typeof RESET_STRATEGIES)[number];
  on_hold: number;
  sort: number;
}

const toDto = (r: PlanRow): PlanDto => ({
  id: r.id,
  name: r.name,
  dataLimit: r.data_limit,
  durationDays: r.duration_days,
  deviceLimit: r.device_limit,
  allowedExits: JSON.parse(r.allowed_exits || '["*"]'),
  warpEnabled: !!r.warp_enabled,
  resetStrategy: r.reset_strategy,
  onHold: !!r.on_hold,
  sort: r.sort,
});

const planSchema = z.object({
  name: z.string().trim().min(1).max(60),
  dataLimit: z.number().int().min(0).max(1e15),
  durationDays: z.number().int().min(0).max(3650),
  deviceLimit: z.number().int().min(0).max(100),
  allowedExits: z.array(z.string().regex(/^(\*|[A-Za-z]{2})$/)).max(60),
  warpEnabled: z.boolean(),
  resetStrategy: z.enum(RESET_STRATEGIES),
  onHold: z.boolean(),
  sort: z.number().int().min(0).max(10_000),
});

export function planRoutes(api: Hono<AppEnv>): void {
  api.get('/plans', async (c) => {
    const rows = await c.env.DB.prepare('SELECT * FROM plans ORDER BY sort, id').all<PlanRow>();
    return c.json({ items: rows.results.map(toDto) });
  });

  api.post('/plans', async (c) => {
    const b = await readBody(c, planSchema.partial().required({ name: true }));
    const row = await c.env.DB.prepare(
      `INSERT INTO plans (name, data_limit, duration_days, device_limit, allowed_exits, warp_enabled, reset_strategy, on_hold, sort, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) RETURNING *`,
    )
      .bind(
        b.name,
        b.dataLimit ?? 0,
        b.durationDays ?? 30,
        b.deviceLimit ?? 0,
        JSON.stringify(b.allowedExits ?? ['*']),
        b.warpEnabled === false ? 0 : 1,
        b.resetStrategy ?? 'none',
        b.onHold ? 1 : 0,
        b.sort ?? 0,
        Date.now(),
      )
      .first<PlanRow>();
    await audit(c.env.DB, actorOf(c), 'plan_created', null, ipOf(c), { name: b.name });
    return c.json(toDto(row!), 201);
  });

  api.patch('/plans/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const b = await readBody(c, planSchema.partial());
    const cur = await c.env.DB.prepare('SELECT * FROM plans WHERE id = ?1').bind(id).first<PlanRow>();
    if (!cur) throw new HttpError(404, 'not_found');
    const row = await c.env.DB.prepare(
      `UPDATE plans SET name = ?2, data_limit = ?3, duration_days = ?4, device_limit = ?5, allowed_exits = ?6,
         warp_enabled = ?7, reset_strategy = ?8, on_hold = ?9, sort = ?10 WHERE id = ?1 RETURNING *`,
    )
      .bind(
        id,
        b.name ?? cur.name,
        b.dataLimit ?? cur.data_limit,
        b.durationDays ?? cur.duration_days,
        b.deviceLimit ?? cur.device_limit,
        b.allowedExits ? JSON.stringify(b.allowedExits) : cur.allowed_exits,
        b.warpEnabled === undefined ? cur.warp_enabled : b.warpEnabled ? 1 : 0,
        b.resetStrategy ?? cur.reset_strategy,
        b.onHold === undefined ? cur.on_hold : b.onHold ? 1 : 0,
        b.sort ?? cur.sort,
      )
      .first<PlanRow>();
    await audit(c.env.DB, actorOf(c), 'plan_updated', `plan:${id}`, ipOf(c));
    return c.json(toDto(row!));
  });

  api.delete('/plans/:id', async (c) => {
    const id = Number(c.req.param('id'));
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET plan_id = NULL WHERE plan_id = ?1').bind(id),
      c.env.DB.prepare('DELETE FROM plans WHERE id = ?1').bind(id),
    ]);
    await audit(c.env.DB, actorOf(c), 'plan_deleted', `plan:${id}`, ipOf(c));
    return c.json({ ok: true });
  });
}
