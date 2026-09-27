import type { Hono } from 'hono';
import { z } from 'zod';
import { hashPassword, passwordProblems, verifyPassword } from '../auth/password';
import { checkLock, clearFailures, recordFailure } from '../auth/ratelimit';
import {
  clearSessionCookie,
  createSession,
  readCookie,
  revokeAllSessions,
  revokeSession,
  SESSION_COOKIE,
  sessionCookie,
  validateSession,
} from '../auth/session';
import { newTotpSecret, otpauthUri, verifyTotp } from '../auth/totp';
import { audit } from '../db/audit';
import { getMeta, setMeta } from '../db/meta';
import { getSettings } from '../db/settings';
import { toHex } from '../lib/bytes';
import { randomBytes, randomString, sha256Hex } from '../lib/crypto';
import { HttpError } from '../lib/http';
import { type AppEnv, actorOf, type Ctx, ipOf, readBody } from './context';

interface AdminRow {
  id: number;
  username: string;
  pass_hash: string;
  pass_salt: string;
  pass_iters: number;
  totp_secret: string | null;
  totp_enabled: number;
  recovery_codes: string;
  last_login_at: number | null;
}

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
  otp: z.string().max(12).optional(),
  recovery: z.string().max(32).optional(),
});

async function loadAdmin(db: D1Database, username: string): Promise<AdminRow | null> {
  return db
    .prepare('SELECT * FROM admins WHERE username = ?1 COLLATE NOCASE')
    .bind(username)
    .first<AdminRow>();
}

/** Consumes a recovery code if it matches; returns the remaining list or null. */
async function useRecoveryCode(admin: AdminRow, code: string): Promise<string[] | null> {
  const list = JSON.parse(admin.recovery_codes || '[]') as string[];
  const hash = await sha256Hex(
    code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ''),
  );
  const i = list.indexOf(hash);
  if (i < 0) return null;
  list.splice(i, 1);
  return list;
}

export async function currentSession(c: Ctx) {
  const token = readCookie(c.req.raw, SESSION_COOKIE);
  if (!token) return null;
  const sec = await getSettings(c.env.DB, 'security');
  return validateSession(c.env.DB, token, sec, c.executionCtx);
}

export async function issueSession(
  c: Ctx,
  adminId: number,
  via: 'password' | 'cloudflare' | 'sso',
): Promise<void> {
  const sec = await getSettings(c.env.DB, 'security');
  const { token, maxAge } = await createSession(c.env.DB, adminId, sec, {
    ip: ipOf(c),
    ua: c.req.header('user-agent') ?? null,
    via,
  });
  c.header('set-cookie', sessionCookie(token, c.get('base'), maxAge));
  await c.env.DB.prepare('UPDATE admins SET last_login_at = ?2 WHERE id = ?1')
    .bind(adminId, Date.now())
    .run();
}

export function authPublicRoutes(api: Hono<AppEnv>): void {
  api.get('/auth/status', async (c) => {
    const s = await currentSession(c);
    return c.json({
      authenticated: !!s,
      username: s?.username ?? null,
      version: __NEXADIB_VERSION__,
    });
  });

  api.post('/auth/login', async (c) => {
    const body = await readBody(c, loginSchema);
    const db = c.env.DB;
    const sec = await getSettings(db, 'security');
    const ip = ipOf(c) ?? 'unknown';
    const keys = [`ip:${ip}`, `user:${body.username.toLowerCase()}`];
    const failKeys = [
      { k: keys[0]!, max: sec.loginMaxFails },
      { k: keys[1]!, max: sec.loginMaxFails * 10 },
    ];
    const lock = await checkLock(db, keys);
    if (lock.locked) {
      c.header('retry-after', String(lock.retryAfterSec));
      return c.json({ error: 'locked', retryAfter: lock.retryAfterSec }, 429);
    }
    const admin = await loadAdmin(db, body.username);
    let ok = false;
    if (admin) {
      ok = await verifyPassword(body.password, {
        hash: admin.pass_hash,
        salt: admin.pass_salt,
        iters: admin.pass_iters,
      });
    } else {
      // Spend comparable time on unknown usernames so they cannot be enumerated.
      await hashPassword(body.password, 10_000);
    }
    if (!admin || !ok) {
      await recordFailure(db, failKeys, sec.lockMinutes);
      await audit(db, body.username.slice(0, 32), 'login_failed', null, ip);
      return c.json({ error: 'invalid_credentials' }, 401);
    }
    if (admin.totp_enabled && admin.totp_secret) {
      if (body.recovery) {
        const remaining = await useRecoveryCode(admin, body.recovery);
        if (!remaining) {
          await recordFailure(db, failKeys, sec.lockMinutes);
          return c.json({ error: 'invalid_otp' }, 401);
        }
        await db
          .prepare('UPDATE admins SET recovery_codes = ?2 WHERE id = ?1')
          .bind(admin.id, JSON.stringify(remaining))
          .run();
      } else {
        if (!body.otp) return c.json({ error: 'otp_required' }, 401);
        const step = await verifyTotp(admin.totp_secret, body.otp);
        const lastStep = Number((await getMeta(db, 'totp_last_step')) ?? 0);
        if (step === null || step <= lastStep) {
          await recordFailure(db, failKeys, sec.lockMinutes);
          return c.json({ error: 'invalid_otp' }, 401);
        }
        await setMeta(db, 'totp_last_step', String(step));
      }
    }
    await clearFailures(db, keys);
    await issueSession(c, admin.id, 'password');
    await audit(db, admin.username, 'login', null, ip);
    return c.json({ ok: true, username: admin.username });
  });
}

export function authPrivateRoutes(api: Hono<AppEnv>): void {
  api.post('/auth/logout', async (c) => {
    await revokeSession(c.env.DB, c.get('session').idHash);
    c.header('set-cookie', clearSessionCookie(c.get('base')));
    return c.json({ ok: true });
  });

  api.get('/auth/me', async (c) => {
    const s = c.get('session');
    const admin = await c.env.DB.prepare(
      'SELECT username, totp_enabled, recovery_codes, created_at, last_login_at FROM admins WHERE id = ?1',
    )
      .bind(s.adminId)
      .first<{
        username: string;
        totp_enabled: number;
        recovery_codes: string;
        created_at: number;
        last_login_at: number;
      }>();
    if (!admin) throw new HttpError(401, 'unauthorized');
    return c.json({
      username: admin.username,
      totpEnabled: !!admin.totp_enabled,
      recoveryCodesLeft: (JSON.parse(admin.recovery_codes || '[]') as string[]).length,
      createdAt: admin.created_at,
      lastLoginAt: admin.last_login_at,
      via: s.via,
    });
  });

  api.post('/auth/password', async (c) => {
    const body = await readBody(c, z.object({ current: z.string().max(256), next: z.string().max(256) }));
    const s = c.get('session');
    const db = c.env.DB;
    const admin = await db.prepare('SELECT * FROM admins WHERE id = ?1').bind(s.adminId).first<AdminRow>();
    if (!admin) throw new HttpError(401, 'unauthorized');
    const ok = await verifyPassword(body.current, {
      hash: admin.pass_hash,
      salt: admin.pass_salt,
      iters: admin.pass_iters,
    });
    if (!ok) throw new HttpError(400, 'wrong_password');
    const problem = passwordProblems(body.next);
    if (problem) throw new HttpError(400, `password_${problem}`);
    const sec = await getSettings(db, 'security');
    const pw = await hashPassword(body.next, sec.pbkdf2Iterations);
    await db
      .prepare(
        'UPDATE admins SET pass_hash = ?2, pass_salt = ?3, pass_iters = ?4, updated_at = ?5 WHERE id = ?1',
      )
      .bind(s.adminId, pw.hash, pw.salt, pw.iters, Date.now())
      .run();
    await revokeAllSessions(db, s.adminId, s.idHash);
    await audit(db, actorOf(c), 'password_changed', null, ipOf(c));
    return c.json({ ok: true });
  });

  api.post('/auth/2fa/setup', async (c) => {
    const s = c.get('session');
    const secret = newTotpSecret();
    await setMeta(c.env.DB, 'totp_pending', secret);
    const general = await getSettings(c.env.DB, 'general');
    return c.json({ secret, uri: otpauthUri(secret, s.username, general.brandTitle || 'NexAdib') });
  });

  api.post('/auth/2fa/enable', async (c) => {
    const body = await readBody(c, z.object({ code: z.string().max(12) }));
    const db = c.env.DB;
    const pending = await getMeta(db, 'totp_pending');
    if (!pending) throw new HttpError(400, 'no_pending_secret');
    const step = await verifyTotp(pending, body.code);
    if (step === null) throw new HttpError(400, 'invalid_otp');
    const codes = Array.from({ length: 8 }, () => randomString(10, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'));
    const hashes = await Promise.all(codes.map((code) => sha256Hex(code)));
    await db.batch([
      db
        .prepare(
          'UPDATE admins SET totp_secret = ?2, totp_enabled = 1, recovery_codes = ?3, updated_at = ?4 WHERE id = ?1',
        )
        .bind(c.get('session').adminId, pending, JSON.stringify(hashes), Date.now()),
      db.prepare(`DELETE FROM meta WHERE k = 'totp_pending'`),
      db
        .prepare(
          `INSERT INTO meta (k, v) VALUES ('totp_last_step', ?1) ON CONFLICT(k) DO UPDATE SET v = excluded.v`,
        )
        .bind(String(step)),
    ]);
    await audit(db, actorOf(c), '2fa_enabled', null, ipOf(c));
    // Formatted XXXXX-XXXXX, shown once.
    return c.json({ ok: true, recoveryCodes: codes.map((x) => `${x.slice(0, 5)}-${x.slice(5)}`) });
  });

  api.post('/auth/2fa/disable', async (c) => {
    const body = await readBody(c, z.object({ password: z.string().max(256) }));
    const db = c.env.DB;
    const admin = await db
      .prepare('SELECT * FROM admins WHERE id = ?1')
      .bind(c.get('session').adminId)
      .first<AdminRow>();
    if (!admin) throw new HttpError(401, 'unauthorized');
    const ok = await verifyPassword(body.password, {
      hash: admin.pass_hash,
      salt: admin.pass_salt,
      iters: admin.pass_iters,
    });
    if (!ok) throw new HttpError(400, 'wrong_password');
    await db
      .prepare(`UPDATE admins SET totp_secret = NULL, totp_enabled = 0, recovery_codes = '[]' WHERE id = ?1`)
      .bind(admin.id)
      .run();
    await audit(db, actorOf(c), '2fa_disabled', null, ipOf(c));
    return c.json({ ok: true });
  });

  api.get('/auth/sessions', async (c) => {
    const s = c.get('session');
    const rows = await c.env.DB.prepare(
      'SELECT id_hash, created_at, last_seen_at, expires_at, ip, ua, via FROM sessions WHERE admin_id = ?1 ORDER BY last_seen_at DESC LIMIT 50',
    )
      .bind(s.adminId)
      .all<{
        id_hash: string;
        created_at: number;
        last_seen_at: number;
        expires_at: number;
        ip: string;
        ua: string;
        via: string;
      }>();
    return c.json({
      sessions: rows.results.map((r) => ({
        id: r.id_hash.slice(0, 16),
        current: r.id_hash === s.idHash,
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at,
        expiresAt: r.expires_at,
        ip: r.ip,
        ua: r.ua,
        via: r.via,
      })),
    });
  });

  api.post('/auth/sessions/revoke-others', async (c) => {
    const s = c.get('session');
    await revokeAllSessions(c.env.DB, s.adminId, s.idHash);
    await audit(c.env.DB, actorOf(c), 'sessions_revoked', null, ipOf(c));
    return c.json({ ok: true });
  });
}

/** Random hex suitable for one-time values. */
export const randomHex = (n = 16): string => toHex(randomBytes(n));
