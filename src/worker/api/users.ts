import type { Hono } from 'hono';
import { z } from 'zod';
import { DAY_MS, RESET_STRATEGIES, USER_STATUSES } from '../../shared/constants';
import { auditStmt } from '../db/audit';
import { getSettings } from '../db/settings';
import {
  deriveStatus,
  getUserRow,
  insertUserStmt,
  isUniqueViolation,
  listUsers,
  type NewUserFields,
  newCredentials,
  statusCounts,
  toDto,
  type UserRow,
} from '../db/users';
import { newSubToken } from '../lib/crypto';
import { HttpError } from '../lib/http';
import { type AppEnv, actorOf, type Ctx, ipOf, readBody } from './context';

const NAME = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\p{L}\p{N} _.@-]+$/u, 'name');
const EXIT = z
  .string()
  .regex(/^(\*|[A-Za-z]{2})$/)
  .transform((s) => s.toUpperCase());
const TAG = z.string().trim().min(1).max(24);

const baseFields = {
  dataLimit: z.number().int().min(0).max(1e15),
  days: z.number().int().min(0).max(3650),
  expireAt: z.number().int().nullable(),
  onHold: z.boolean(),
  deviceLimit: z.number().int().min(0).max(100),
  resetStrategy: z.enum(RESET_STRATEGIES),
  allowedExits: z.array(EXIT).max(60),
  forceExit: z.boolean(),
  operator: z.string().max(24).nullable(),
  warpEnabled: z.boolean(),
  filterExempt: z.boolean(),
  note: z.string().max(500),
  tags: z.array(TAG).max(10),
  planId: z.number().int().nullable(),
};

const createSchema = z
  .object({ name: NAME, ...baseFields })
  .partial()
  .required({ name: true });
const updateSchema = z.object({ name: NAME, ...baseFields, rev: z.number().int() }).partial();

function withDefaults(input: z.infer<typeof createSchema>): NewUserFields {
  return {
    name: input.name,
    dataLimit: input.dataLimit ?? 0,
    days: input.days ?? 30,
    expireAt: input.expireAt,
    onHold: input.onHold ?? false,
    deviceLimit: input.deviceLimit ?? 0,
    resetStrategy: input.resetStrategy ?? 'none',
    allowedExits: input.allowedExits ?? ['*'],
    forceExit: input.forceExit ?? false,
    operator: input.operator ?? null,
    warpEnabled: input.warpEnabled ?? true,
    filterExempt: input.filterExempt ?? false,
    note: input.note ?? '',
    tags: input.tags ?? [],
    planId: input.planId ?? null,
  };
}

async function subBase(c: Ctx): Promise<{ host: string; subPath: string }> {
  const g = await getSettings(c.env.DB, 'general');
  return { host: g.subHost || new URL(c.req.url).host, subPath: g.subPath };
}

function idParam(c: Ctx): number {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'bad_id');
  return id;
}

/** Writes a new state for a user, bumping rev and re-deriving status. */
async function saveUser(c: Ctx, row: UserRow, patch: Partial<UserRow>, action: string, expectRev?: number) {
  const next: UserRow = { ...row, ...patch };
  next.status = deriveStatus(next);
  if (next.status !== 'disabled') next.disabled_reason = null;
  const now = Date.now();
  const res = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE users SET name = ?2, status = ?3, data_limit = ?4, used_up = ?5, used_down = ?6, expire_at = ?7,
         duration_days = ?8, reset_strategy = ?9, last_reset_at = ?10, device_limit = ?11, allowed_exits = ?12,
         force_exit = ?13, operator = ?14, warp_enabled = ?15, filter_exempt = ?16, note = ?17, tags = ?18,
         disabled_reason = ?19, plan_id = ?20, uuid = ?21, trojan_password = ?22, trojan_hash = ?23,
         sub_token = ?24, rev = rev + 1, updated_at = ?25
       WHERE id = ?1 AND rev = ?26 RETURNING *`,
    ).bind(
      row.id,
      next.name,
      next.status,
      next.data_limit,
      next.used_up,
      next.used_down,
      next.expire_at,
      next.duration_days,
      next.reset_strategy,
      next.last_reset_at,
      next.device_limit,
      next.allowed_exits,
      next.force_exit,
      next.operator,
      next.warp_enabled,
      next.filter_exempt,
      next.note,
      next.tags,
      next.disabled_reason,
      next.plan_id,
      next.uuid,
      next.trojan_password,
      next.trojan_hash,
      next.sub_token,
      now,
      expectRev ?? row.rev,
    ),
    auditStmt(c.env.DB, actorOf(c), action, `user:${row.id}`, ipOf(c), { name: next.name }),
  ]);
  const updated = res[0]?.results?.[0] as UserRow | undefined;
  if (!updated) throw new HttpError(409, 'version_conflict');
  return toDto(updated, await subBase(c));
}

function applyUpdate(row: UserRow, b: z.infer<typeof updateSchema>, now = Date.now()): Partial<UserRow> {
  const p: Partial<UserRow> = {};
  if (b.name !== undefined) p.name = b.name;
  if (b.dataLimit !== undefined) p.data_limit = b.dataLimit;
  if (b.deviceLimit !== undefined) p.device_limit = b.deviceLimit;
  if (b.resetStrategy !== undefined) p.reset_strategy = b.resetStrategy;
  if (b.allowedExits !== undefined) p.allowed_exits = JSON.stringify(b.allowedExits);
  if (b.forceExit !== undefined) p.force_exit = b.forceExit ? 1 : 0;
  if (b.operator !== undefined) p.operator = b.operator;
  if (b.warpEnabled !== undefined) p.warp_enabled = b.warpEnabled ? 1 : 0;
  if (b.filterExempt !== undefined) p.filter_exempt = b.filterExempt ? 1 : 0;
  if (b.note !== undefined) p.note = b.note;
  if (b.tags !== undefined) p.tags = JSON.stringify(b.tags);
  if (b.planId !== undefined) p.plan_id = b.planId;
  if (b.expireAt !== undefined) {
    p.expire_at = b.expireAt;
    if (row.status === 'on_hold') p.status = 'active';
  } else if (b.onHold && b.days) {
    // (Re)arm on-hold: the countdown starts at the next first connection.
    p.status = 'on_hold';
    p.expire_at = null;
    p.duration_days = b.days;
  } else if (b.days !== undefined) {
    if (row.status === 'on_hold' && b.days > 0) {
      p.duration_days = b.days;
    } else {
      p.expire_at = b.days > 0 ? now + b.days * DAY_MS : null;
      p.duration_days = b.days > 0 ? b.days : null;
      if (row.status === 'on_hold') p.status = 'active';
    }
  }
  return p;
}

export function userRoutes(api: Hono<AppEnv>): void {
  api.get('/users', async (c) => {
    const q = c.req.query();
    const status = USER_STATUSES.includes(q.status as never)
      ? (q.status as (typeof USER_STATUSES)[number])
      : 'all';
    const size = Math.min(200, Math.max(1, Number(q.size) || 25));
    const page = Math.max(1, Number(q.page) || 1);
    const sort =
      (['created', 'name', 'used', 'expire', 'online'] as const).find((s) => s === q.sort) ?? 'created';
    const [{ rows, total }, counts, base] = await Promise.all([
      listUsers(c.env.DB, {
        q: q.q?.slice(0, 64),
        status,
        sort,
        order: q.order === 'asc' ? 'asc' : 'desc',
        limit: size,
        offset: (page - 1) * size,
        tag: q.tag?.slice(0, 24),
      }),
      statusCounts(c.env.DB),
      subBase(c),
    ]);
    return c.json({ items: rows.map((r) => toDto(r, base)), total, counts });
  });

  api.post('/users', async (c) => {
    const body = await readBody(c, createSchema);
    const fields = withDefaults(body);
    try {
      const [res] = await c.env.DB.batch([
        insertUserStmt(c.env.DB, fields),
        auditStmt(c.env.DB, actorOf(c), 'user_created', null, ipOf(c), { name: fields.name }),
      ]);
      return c.json(toDto(res!.results[0] as UserRow, await subBase(c)), 201);
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'name_taken');
      throw err;
    }
  });

  api.post('/users/batch-create', async (c) => {
    const body = await readBody(
      c,
      z.object({
        prefix: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[\p{L}\p{N}_.-]+$/u),
        start: z.number().int().min(0).max(1_000_000),
        count: z.number().int().min(1).max(200),
        template: createSchema.omit({ name: true }),
      }),
    );
    const width = String(body.start + body.count - 1).length;
    const stmts = Array.from({ length: body.count }, (_, i) =>
      insertUserStmt(
        c.env.DB,
        withDefaults({
          ...body.template,
          name: `${body.prefix}${String(body.start + i).padStart(width, '0')}`,
        }),
      ),
    );
    stmts.push(auditStmt(c.env.DB, actorOf(c), 'users_batch_created', null, ipOf(c), { count: body.count }));
    try {
      const res = await c.env.DB.batch(stmts);
      const base = await subBase(c);
      return c.json(
        { items: res.slice(0, body.count).map((r) => toDto(r.results[0] as UserRow, base)) },
        201,
      );
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'name_taken');
      throw err;
    }
  });

  api.get('/users/:id', async (c) => {
    const row = await getUserRow(c.env.DB, idParam(c));
    return c.json(toDto(row, await subBase(c)));
  });

  api.patch('/users/:id', async (c) => {
    const body = await readBody(c, updateSchema);
    const row = await getUserRow(c.env.DB, idParam(c));
    try {
      return c.json(await saveUser(c, row, applyUpdate(row, body), 'user_updated', body.rev));
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'name_taken');
      throw err;
    }
  });

  api.delete('/users/:id', async (c) => {
    const id = idParam(c);
    const row = await getUserRow(c.env.DB, id);
    await c.env.DB.batch(deleteStatements(c, [id], row.name));
    return c.json({ ok: true });
  });

  api.post('/users/:id/:action', async (c) => {
    const row = await getUserRow(c.env.DB, idParam(c));
    const action = c.req.param('action');
    const body = (await c.req.json().catch(() => ({}))) as { days?: number; gb?: number; reason?: string };
    const now = Date.now();
    switch (action) {
      case 'reset':
        return c.json(
          await saveUser(c, row, { used_up: 0, used_down: 0, last_reset_at: now }, 'user_usage_reset'),
        );
      case 'enable':
        return c.json(
          await saveUser(
            c,
            row,
            { status: row.status === 'disabled' ? 'active' : row.status },
            'user_enabled',
          ),
        );
      case 'disable':
        return c.json(
          await saveUser(
            c,
            row,
            { status: 'disabled', disabled_reason: String(body.reason ?? 'admin').slice(0, 80) },
            'user_disabled',
          ),
        );
      case 'extend': {
        const days = Math.trunc(Number(body.days));
        if (!Number.isFinite(days) || days < 1 || days > 3650) throw new HttpError(400, 'bad_days');
        if (row.status === 'on_hold') {
          return c.json(
            await saveUser(c, row, { duration_days: (row.duration_days ?? 0) + days }, 'user_extended'),
          );
        }
        const from = row.expire_at && row.expire_at > now ? row.expire_at : now;
        return c.json(await saveUser(c, row, { expire_at: from + days * DAY_MS }, 'user_extended'));
      }
      case 'add-data': {
        const gb = Number(body.gb);
        if (!Number.isFinite(gb) || gb <= 0 || gb > 100_000) throw new HttpError(400, 'bad_gb');
        if (row.data_limit === 0) throw new HttpError(400, 'already_unlimited');
        return c.json(
          await saveUser(
            c,
            row,
            { data_limit: row.data_limit + Math.round(gb * 1024 ** 3) },
            'user_data_added',
          ),
        );
      }
      case 'revoke':
        return c.json(await saveUser(c, row, { sub_token: newSubToken() }, 'user_link_revoked'));
      case 'regenerate': {
        const cred = newCredentials();
        return c.json(
          await saveUser(
            c,
            row,
            {
              uuid: cred.uuid,
              trojan_password: cred.trojanPassword,
              trojan_hash: cred.trojanHash,
              sub_token: cred.subToken,
            },
            'user_credentials_regenerated',
          ),
        );
      }
      default:
        throw new HttpError(404, 'not_found');
    }
  });

  api.post('/users-bulk', async (c) => {
    const body = await readBody(
      c,
      z.object({
        ids: z.array(z.number().int().positive()).min(1).max(500),
        action: z.enum(['enable', 'disable', 'delete', 'reset', 'extend', 'add_data', 'revoke']),
        days: z.number().int().min(1).max(3650).optional(),
        gb: z.number().positive().max(100_000).optional(),
      }),
    );
    const db = c.env.DB;
    const ids = [...new Set(body.ids)];
    const inList = ids.map((_, i) => `?${i + 2}`).join(',');
    const now = Date.now();
    let stmts: D1PreparedStatement[];
    switch (body.action) {
      case 'delete':
        stmts = deleteStatements(c, ids, `${ids.length} users`);
        break;
      case 'enable':
        stmts = [
          db
            .prepare(
              `UPDATE users SET status = CASE
                 WHEN expire_at IS NOT NULL AND expire_at <= ?1 THEN 'expired'
                 WHEN data_limit > 0 AND used_up + used_down >= data_limit THEN 'limited'
                 ELSE 'active' END, disabled_reason = NULL, rev = rev + 1, updated_at = ?1
               WHERE status = 'disabled' AND id IN (${inList})`,
            )
            .bind(now, ...ids),
        ];
        break;
      case 'disable':
        stmts = [
          db
            .prepare(
              `UPDATE users SET status = 'disabled', disabled_reason = 'admin', rev = rev + 1, updated_at = ?1 WHERE id IN (${inList})`,
            )
            .bind(now, ...ids),
        ];
        break;
      case 'reset':
        stmts = [
          db
            .prepare(
              `UPDATE users SET used_up = 0, used_down = 0, last_reset_at = ?1,
                 status = CASE WHEN status = 'limited' THEN 'active' ELSE status END, rev = rev + 1, updated_at = ?1
               WHERE id IN (${inList})`,
            )
            .bind(now, ...ids),
        ];
        break;
      case 'extend': {
        if (!body.days) throw new HttpError(400, 'bad_days');
        const add = body.days * DAY_MS;
        stmts = [
          db
            .prepare(
              `UPDATE users SET
                 duration_days = CASE WHEN status = 'on_hold' THEN COALESCE(duration_days, 0) + ${body.days} ELSE duration_days END,
                 expire_at = CASE WHEN status = 'on_hold' OR expire_at IS NULL THEN expire_at
                                  ELSE MAX(expire_at, ?1) + ${add} END,
                 status = CASE WHEN status = 'expired' THEN 'active' ELSE status END,
                 rev = rev + 1, updated_at = ?1
               WHERE id IN (${inList})`,
            )
            .bind(now, ...ids),
        ];
        break;
      }
      case 'add_data': {
        if (!body.gb) throw new HttpError(400, 'bad_gb');
        const add = Math.round(body.gb * 1024 ** 3);
        stmts = [
          db
            .prepare(
              `UPDATE users SET data_limit = data_limit + ${add},
                 status = CASE WHEN status = 'limited' AND used_up + used_down < data_limit + ${add} THEN 'active' ELSE status END,
                 rev = rev + 1, updated_at = ?1
               WHERE data_limit > 0 AND id IN (${inList})`,
            )
            .bind(now, ...ids),
        ];
        break;
      }
      case 'revoke':
        stmts = ids.map((id) =>
          db
            .prepare('UPDATE users SET sub_token = ?2, rev = rev + 1, updated_at = ?1 WHERE id = ?3')
            .bind(now, newSubToken(), id),
        );
        break;
    }
    stmts.push(auditStmt(db, actorOf(c), `users_bulk_${body.action}`, null, ipOf(c), { count: ids.length }));
    await db.batch(stmts);
    return c.json({ ok: true, count: ids.length });
  });

  api.get('/users-export.csv', async (c) => {
    const rows = await c.env.DB.prepare('SELECT * FROM users ORDER BY id').all<UserRow>();
    const base = await subBase(c);
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['id,name,status,used_gb,limit_gb,expire_at,device_limit,sub_url,note'];
    for (const r of rows.results) {
      const d = toDto(r, base);
      lines.push(
        [
          d.id,
          esc(d.name),
          d.status,
          (d.used / 1024 ** 3).toFixed(2),
          d.dataLimit ? (d.dataLimit / 1024 ** 3).toFixed(2) : 'unlimited',
          d.expireAt ? new Date(d.expireAt).toISOString() : '',
          d.deviceLimit,
          esc(d.subUrl),
          esc(d.note),
        ].join(','),
      );
    }
    return new Response(`﻿${lines.join('\n')}`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="nexadib-users.csv"',
        'cache-control': 'no-store',
      },
    });
  });
}

function deleteStatements(c: Ctx, ids: number[], label: string): D1PreparedStatement[] {
  const db = c.env.DB;
  const inList = ids.map((_, i) => `?${i + 1}`).join(',');
  return [
    db.prepare(`DELETE FROM usage_daily WHERE user_id IN (${inList})`).bind(...ids),
    db.prepare(`DELETE FROM user_ips WHERE user_id IN (${inList})`).bind(...ids),
    // WARP registrations are revoked by the cron janitor before rows disappear.
    db.prepare(`UPDATE warp_accounts SET status = 'revoke' WHERE user_id IN (${inList})`).bind(...ids),
    db.prepare(`DELETE FROM users WHERE id IN (${inList})`).bind(...ids),
    auditStmt(db, actorOf(c), 'user_deleted', null, ipOf(c), { name: label }),
  ];
}
