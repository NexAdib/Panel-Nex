import type { Hono } from 'hono';
import { z } from 'zod';
import { DEFAULT_OPERATORS, FINGERPRINTS } from '../../shared/constants';
import type { CleanIpDto, OperatorDto } from '../../shared/types';
import { auditStmt } from '../db/audit';
import { clearCleanIpCache, clearOperatorCache, type OperatorRow, toOperator } from '../db/operators';
import { HttpError } from '../lib/http';
import { parseIpList } from '../sub/ips';
import { type AppEnv, actorOf, type Ctx, ipOf, readBody } from './context';

interface CleanIpRow {
  id: number;
  operator: string;
  address: string;
  port: number;
  label: string;
  enabled: number;
  healthy: number;
  latency_ms: number | null;
  checked_at: number | null;
}

const BUILTIN = new Set(DEFAULT_OPERATORS.map((o) => o.code));

const toIpDto = (r: CleanIpRow): CleanIpDto => ({
  id: r.id,
  operator: r.operator,
  address: r.address,
  port: r.port,
  label: r.label,
  enabled: !!r.enabled,
  healthy: !!r.healthy,
  latencyMs: r.latency_ms,
  checkedAt: r.checked_at,
});

const CODE = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,31}$/);
const PORT = z.number().int().min(1).max(65535);
const RANGE = z
  .string()
  .trim()
  .regex(/^\d{1,4}(-\d{1,4})?$/);

const configSchema = z.object({
  ports: z.array(PORT).max(12).optional(),
  fingerprint: z.union([z.enum(FINGERPRINTS), z.literal('')]).optional(),
  fragment: z
    .object({
      enabled: z.boolean(),
      packets: z
        .string()
        .regex(/^(tlshello|\d{1,2}-\d{1,2})$/)
        .optional(),
      length: RANGE.optional(),
      interval: RANGE.optional(),
    })
    .optional(),
});

const operatorSchema = z.object({
  code: CODE,
  nameFa: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().min(1).max(40),
  asns: z.array(z.number().int().min(1).max(4_294_967_295)).max(40),
  enabled: z.boolean().optional(),
  sort: z.number().int().min(0).max(10_000).optional(),
  config: configSchema.optional(),
});

const ipPatchSchema = z.object({
  port: z.number().int().min(0).max(65535).optional(),
  label: z.string().max(60).optional(),
  enabled: z.boolean().optional(),
  healthy: z.boolean().optional(),
  latencyMs: z.number().int().min(0).max(60_000).nullable().optional(),
});

async function listDtos(db: D1Database): Promise<OperatorDto[]> {
  const [ops, counts] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT * FROM operators ORDER BY sort, code'),
    db.prepare(
      `SELECT operator, COUNT(*) AS total, SUM(enabled) AS enabled, SUM(CASE WHEN enabled = 1 AND healthy = 1 THEN 1 ELSE 0 END) AS healthy
       FROM clean_ips GROUP BY operator`,
    ),
  ]);
  const byOp = new Map(
    (counts!.results as { operator: string; total: number; enabled: number; healthy: number }[]).map((r) => [
      r.operator,
      r,
    ]),
  );
  return (ops!.results as unknown as OperatorRow[]).map((r) => {
    const o = toOperator(r);
    const c = byOp.get(o.code);
    return {
      ...o,
      builtin: BUILTIN.has(o.code),
      ips: { total: c?.total ?? 0, enabled: c?.enabled ?? 0, healthy: c?.healthy ?? 0 },
    };
  });
}

async function mustExist(c: Ctx, code: string): Promise<void> {
  const row = await c.env.DB.prepare('SELECT 1 FROM operators WHERE code = ?1').bind(code).first();
  if (!row) throw new HttpError(404, 'not_found');
}

function changed(): void {
  clearOperatorCache();
  clearCleanIpCache();
}

export function operatorRoutes(api: Hono<AppEnv>): void {
  api.get('/operators', async (c) => c.json({ items: await listDtos(c.env.DB) }));

  api.post('/operators', async (c) => {
    const b = await readBody(c, operatorSchema);
    const db = c.env.DB;
    const exists = await db.prepare('SELECT 1 FROM operators WHERE code = ?1').bind(b.code).first();
    if (exists) throw new HttpError(409, 'code_taken');
    const max = await db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM operators').first<{ m: number }>();
    await db.batch([
      db
        .prepare(
          'INSERT INTO operators (code, name_fa, name_en, asns, enabled, sort, config) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
        )
        .bind(
          b.code,
          b.nameFa,
          b.nameEn,
          JSON.stringify(b.asns),
          b.enabled === false ? 0 : 1,
          b.sort ?? (max?.m ?? 0) + 1,
          JSON.stringify(b.config ?? {}),
        ),
      auditStmt(db, actorOf(c), 'operator_created', `operator:${b.code}`, ipOf(c)),
    ]);
    changed();
    return c.json({ items: await listDtos(db) }, 201);
  });

  api.patch('/operators/:code', async (c) => {
    const code = c.req.param('code');
    const b = await readBody(c, operatorSchema.omit({ code: true }).partial());
    const db = c.env.DB;
    const cur = await db.prepare('SELECT * FROM operators WHERE code = ?1').bind(code).first<OperatorRow>();
    if (!cur) throw new HttpError(404, 'not_found');
    const o = toOperator(cur);
    await db.batch([
      db
        .prepare(
          'UPDATE operators SET name_fa = ?2, name_en = ?3, asns = ?4, enabled = ?5, sort = ?6, config = ?7 WHERE code = ?1',
        )
        .bind(
          code,
          b.nameFa ?? o.nameFa,
          b.nameEn ?? o.nameEn,
          JSON.stringify(b.asns ?? o.asns),
          (b.enabled ?? o.enabled) ? 1 : 0,
          b.sort ?? o.sort,
          JSON.stringify(b.config ?? o.config),
        ),
      auditStmt(db, actorOf(c), 'operator_updated', `operator:${code}`, ipOf(c), {
        fields: Object.keys(b),
      }),
    ]);
    changed();
    return c.json({ items: await listDtos(db) });
  });

  api.post('/operators/reorder', async (c) => {
    const b = await readBody(c, z.object({ codes: z.array(CODE).min(1).max(100) }));
    const db = c.env.DB;
    await db.batch(
      b.codes.map((code, i) => db.prepare('UPDATE operators SET sort = ?2 WHERE code = ?1').bind(code, i)),
    );
    changed();
    return c.json({ items: await listDtos(db) });
  });

  api.delete('/operators/:code', async (c) => {
    const code = c.req.param('code');
    if (code === 'all') throw new HttpError(400, 'cannot_delete_all');
    await mustExist(c, code);
    const db = c.env.DB;
    await db.batch([
      db.prepare('DELETE FROM clean_ips WHERE operator = ?1').bind(code),
      db.prepare('DELETE FROM operators WHERE code = ?1').bind(code),
      db.prepare('UPDATE users SET operator = NULL WHERE operator = ?1').bind(code),
      auditStmt(db, actorOf(c), 'operator_deleted', `operator:${code}`, ipOf(c)),
    ]);
    changed();
    return c.json({ items: await listDtos(db) });
  });

  api.get('/operators/:code/ips', async (c) => {
    const code = c.req.param('code');
    await mustExist(c, code);
    const res = await c.env.DB.prepare(
      'SELECT * FROM clean_ips WHERE operator = ?1 ORDER BY enabled DESC, healthy DESC, COALESCE(latency_ms, 99999), id',
    )
      .bind(code)
      .all<CleanIpRow>();
    return c.json({ items: res.results.map(toIpDto) });
  });

  api.post('/operators/:code/ips', async (c) => {
    const code = c.req.param('code');
    await mustExist(c, code);
    const b = await readBody(c, z.object({ text: z.string().max(100_000), replace: z.boolean().optional() }));
    const { items, errors } = parseIpList(b.text);
    const db = c.env.DB;
    const stmts: D1PreparedStatement[] = [];
    if (b.replace) stmts.push(db.prepare('DELETE FROM clean_ips WHERE operator = ?1').bind(code));
    for (const it of items) {
      stmts.push(
        db
          .prepare('INSERT OR IGNORE INTO clean_ips (operator, address, port, label) VALUES (?1, ?2, ?3, ?4)')
          .bind(code, it.address, it.port, it.label),
      );
    }
    stmts.push(
      auditStmt(db, actorOf(c), 'clean_ips_imported', `operator:${code}`, ipOf(c), {
        count: items.length,
        replace: !!b.replace,
      }),
    );
    const res = await db.batch(stmts);
    const added = res
      .slice(b.replace ? 1 : 0, (b.replace ? 1 : 0) + items.length)
      .reduce((n, r) => n + (r.meta.changes ?? 0), 0);
    changed();
    return c.json({ added, skipped: items.length - added, errors });
  });

  api.patch('/clean-ips/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const b = await readBody(c, ipPatchSchema);
    const db = c.env.DB;
    const cur = await db.prepare('SELECT * FROM clean_ips WHERE id = ?1').bind(id).first<CleanIpRow>();
    if (!cur) throw new HttpError(404, 'not_found');
    const row = await db
      .prepare(
        'UPDATE clean_ips SET port = ?2, label = ?3, enabled = ?4, healthy = ?5, latency_ms = ?6, checked_at = ?7 WHERE id = ?1 RETURNING *',
      )
      .bind(
        id,
        b.port ?? cur.port,
        b.label ?? cur.label,
        (b.enabled ?? !!cur.enabled) ? 1 : 0,
        (b.healthy ?? !!cur.healthy) ? 1 : 0,
        b.latencyMs !== undefined ? b.latencyMs : cur.latency_ms,
        b.latencyMs !== undefined || b.healthy !== undefined ? Date.now() : cur.checked_at,
      )
      .first<CleanIpRow>();
    changed();
    return c.json(toIpDto(row!));
  });

  api.post('/clean-ips/bulk', async (c) => {
    const b = await readBody(
      c,
      z.object({
        ids: z.array(z.number().int().positive()).min(1).max(500),
        action: z.enum(['delete', 'enable', 'disable', 'healthy', 'unhealthy']),
      }),
    );
    const db = c.env.DB;
    const sql: Record<typeof b.action, string> = {
      delete: 'DELETE FROM clean_ips WHERE id = ?1',
      enable: 'UPDATE clean_ips SET enabled = 1 WHERE id = ?1',
      disable: 'UPDATE clean_ips SET enabled = 0 WHERE id = ?1',
      healthy: 'UPDATE clean_ips SET healthy = 1, checked_at = ?2 WHERE id = ?1',
      unhealthy: 'UPDATE clean_ips SET healthy = 0, checked_at = ?2 WHERE id = ?1',
    };
    const now = Date.now();
    const withTime = b.action === 'healthy' || b.action === 'unhealthy';
    await db.batch([
      ...b.ids.map((id) => {
        const st = db.prepare(sql[b.action]);
        return withTime ? st.bind(id, now) : st.bind(id);
      }),
      auditStmt(db, actorOf(c), `clean_ips_${b.action}`, null, ipOf(c), { count: b.ids.length }),
    ]);
    changed();
    return c.json({ ok: true, count: b.ids.length });
  });
}
