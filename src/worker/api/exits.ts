import type { Hono } from 'hono';
import { z } from 'zod';
import { auditStmt } from '../db/audit';
import { type ExitRow, listExits } from '../db/exits';
import { getSettings } from '../db/settings';
import { probeExit, resultStatement, runHealthChecks } from '../exits/health';
import { parseExitList } from '../exits/import';
import { clearExitCache } from '../exits/select';
import { HttpError } from '../lib/http';
import { type AppEnv, actorOf, type Ctx, ipOf, readBody } from './context';

export interface ExitDto {
  id: number;
  country: string;
  type: ExitRow['type'];
  address: string;
  port: number;
  username: string | null;
  hasPassword: boolean;
  label: string;
  enabled: boolean;
  healthy: boolean;
  failStreak: number;
  egressIp: string | null;
  egressCountry: string | null;
  latencyMs: number | null;
  scope: 'cf' | 'all' | null;
  checkedAt: number | null;
  lastError: string | null;
}

const toDto = (r: ExitRow): ExitDto => ({
  id: r.id,
  country: r.country,
  type: r.type,
  address: r.address,
  port: r.port,
  username: r.username,
  hasPassword: !!r.password,
  label: r.label,
  enabled: !!r.enabled,
  healthy: !!r.healthy,
  failStreak: r.fail_streak,
  egressIp: r.egress_ip,
  egressCountry: r.egress_country,
  latencyMs: r.latency_ms,
  scope: (r.scope as ExitDto['scope']) ?? null,
  checkedAt: r.checked_at,
  lastError: r.last_error,
});

const COUNTRY = z
  .string()
  .regex(/^[A-Za-z]{2}$/)
  .transform((s) => s.toUpperCase());

const exitSchema = z.object({
  country: COUNTRY,
  type: z.enum(['proxyip', 'socks5', 'http']),
  address: z.string().trim().min(1).max(253),
  port: z.number().int().min(0).max(65535),
  username: z.string().max(128).nullable().optional(),
  password: z.string().max(256).nullable().optional(),
  label: z.string().max(60).optional(),
  enabled: z.boolean().optional(),
});

async function probeAndSave(c: Ctx, id: number): Promise<ExitDto> {
  const db = c.env.DB;
  const row = await db.prepare('SELECT * FROM exits WHERE id = ?1').bind(id).first<ExitRow>();
  if (!row) throw new HttpError(404, 'not_found');
  const result = await probeExit(row);
  await resultStatement(db, row, result).run();
  clearExitCache();
  const updated = await db.prepare('SELECT * FROM exits WHERE id = ?1').bind(id).first<ExitRow>();
  return toDto(updated!);
}

export function exitRoutes(api: Hono<AppEnv>): void {
  api.get('/exits', async (c) => {
    const [rows, settings] = await Promise.all([listExits(c.env.DB), getSettings(c.env.DB, 'exits')]);
    return c.json({ items: rows.map(toDto), countries: settings.countries, aiCountry: settings.aiCountry });
  });

  api.post('/exits', async (c) => {
    const b = await readBody(c, exitSchema);
    if (b.type !== 'proxyip' && !b.port) throw new HttpError(400, 'port_required');
    const row = await c.env.DB.prepare(
      `INSERT INTO exits (country, type, address, port, username, password, label, enabled, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) RETURNING *`,
    )
      .bind(
        b.country,
        b.type,
        b.address.toLowerCase(),
        b.port,
        b.username ?? null,
        b.password ?? null,
        b.label ?? '',
        b.enabled === false ? 0 : 1,
        Date.now(),
      )
      .first<ExitRow>();
    await auditStmt(c.env.DB, actorOf(c), 'exit_created', `exit:${row!.id}`, ipOf(c), {
      country: b.country,
      type: b.type,
    }).run();
    return c.json(await probeAndSave(c, row!.id), 201);
  });

  api.patch('/exits/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const b = await readBody(c, exitSchema.partial());
    const cur = await c.env.DB.prepare('SELECT * FROM exits WHERE id = ?1').bind(id).first<ExitRow>();
    if (!cur) throw new HttpError(404, 'not_found');
    const row = await c.env.DB.prepare(
      `UPDATE exits SET country = ?2, type = ?3, address = ?4, port = ?5, username = ?6, password = ?7, label = ?8, enabled = ?9
       WHERE id = ?1 RETURNING *`,
    )
      .bind(
        id,
        b.country ?? cur.country,
        b.type ?? cur.type,
        b.address?.toLowerCase() ?? cur.address,
        b.port ?? cur.port,
        b.username === undefined ? cur.username : b.username,
        b.password === undefined || b.password === '••••' ? cur.password : b.password,
        b.label ?? cur.label,
        b.enabled === undefined ? cur.enabled : b.enabled ? 1 : 0,
      )
      .first<ExitRow>();
    clearExitCache();
    return c.json(toDto(row!));
  });

  api.delete('/exits/:id', async (c) => {
    const id = Number(c.req.param('id'));
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM exits WHERE id = ?1').bind(id),
      auditStmt(c.env.DB, actorOf(c), 'exit_deleted', `exit:${id}`, ipOf(c)),
    ]);
    clearExitCache();
    return c.json({ ok: true });
  });

  api.post('/exits/:id/test', async (c) => c.json(await probeAndSave(c, Number(c.req.param('id')))));

  api.post('/exits-check', async (c) => {
    const n = await runHealthChecks(c.env, { limit: 12 });
    return c.json({ checked: n });
  });

  api.post('/exits-import', async (c) => {
    const b = await readBody(
      c,
      z.object({ text: z.string().max(50_000), country: z.union([COUNTRY, z.literal('auto')]) }),
    );
    const { items, errors } = parseExitList(b.text);
    if (items.length > 200) throw new HttpError(400, 'too_many');
    const db = c.env.DB;
    const now = Date.now();
    const country = b.country === 'auto' ? 'ZZ' : b.country;
    const inserted: ExitRow[] = [];
    for (const it of items) {
      const row = await db
        .prepare(
          `INSERT INTO exits (country, type, address, port, username, password, label, enabled, created_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8
           WHERE NOT EXISTS (SELECT 1 FROM exits WHERE type = ?2 AND address = ?3 AND port = ?4)
           RETURNING *`,
        )
        .bind(country, it.type, it.address, it.port, it.username, it.password, it.label, now)
        .first<ExitRow>();
      if (row) inserted.push(row);
    }
    // Probe the first batch now (auto-classifies country); the cron checks the rest.
    const probed = await runHealthChecks(c.env, { ids: inserted.slice(0, 12).map((r) => r.id) });
    await auditStmt(db, actorOf(c), 'exits_imported', null, ipOf(c), { count: inserted.length }).run();
    const rows = await listExits(db);
    return c.json({
      added: inserted.length,
      skipped: items.length - inserted.length,
      invalid: errors,
      probed,
      items: rows.map(toDto),
    });
  });
}
