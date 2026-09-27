import { toBase64Url } from '../lib/bytes';
import { randomBytes, sha256Hex } from '../lib/crypto';

export const SESSION_COOKIE = 'nx_s';
const TOUCH_INTERVAL_MS = 5 * 60_000;

export interface SessionInfo {
  adminId: number;
  username: string;
  idHash: string;
  via: string;
  createdAt: number;
}

/** Minimal waitUntil surface shared by the Workers runtime and Hono. */
export interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

export interface SessionPolicy {
  sessionHours: number;
  idleMinutes: number;
}

export async function createSession(
  db: D1Database,
  adminId: number,
  policy: SessionPolicy,
  meta: { ip: string | null; ua: string | null; via: 'password' | 'cloudflare' | 'sso' },
): Promise<{ token: string; maxAge: number }> {
  const token = toBase64Url(randomBytes(32));
  const idHash = await sha256Hex(token);
  const now = Date.now();
  const maxAge = policy.sessionHours * 3600;
  await db
    .prepare(
      `INSERT INTO sessions (id_hash, admin_id, created_at, last_seen_at, expires_at, ip, ua, via)
       VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(idHash, adminId, now, now + maxAge * 1000, meta.ip, (meta.ua ?? '').slice(0, 300), meta.via)
    .run();
  return { token, maxAge };
}

export async function validateSession(
  db: D1Database,
  token: string,
  policy: SessionPolicy,
  ctx?: WaitUntil,
): Promise<SessionInfo | null> {
  if (!token || token.length > 128) return null;
  const idHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT s.admin_id, s.created_at, s.last_seen_at, s.expires_at, s.via, a.username
       FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.id_hash = ?1`,
    )
    .bind(idHash)
    .first<{
      admin_id: number;
      created_at: number;
      last_seen_at: number;
      expires_at: number;
      via: string;
      username: string;
    }>();
  if (!row) return null;
  const now = Date.now();
  if (row.expires_at <= now || now - row.last_seen_at > policy.idleMinutes * 60_000) {
    const del = db.prepare('DELETE FROM sessions WHERE id_hash = ?1').bind(idHash).run();
    if (ctx) ctx.waitUntil(del);
    else await del;
    return null;
  }
  if (now - row.last_seen_at > TOUCH_INTERVAL_MS) {
    const touch = db
      .prepare('UPDATE sessions SET last_seen_at = ?2 WHERE id_hash = ?1')
      .bind(idHash, now)
      .run();
    if (ctx) ctx.waitUntil(touch);
    else await touch;
  }
  return { adminId: row.admin_id, username: row.username, idHash, via: row.via, createdAt: row.created_at };
}

export async function revokeSession(db: D1Database, idHash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id_hash = ?1').bind(idHash).run();
}

export async function revokeAllSessions(
  db: D1Database,
  adminId: number,
  exceptIdHash?: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM sessions WHERE admin_id = ?1 AND id_hash != ?2')
    .bind(adminId, exceptIdHash ?? '')
    .run();
}

export function sessionCookie(token: string, path: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie(path: string): string {
  return `${SESSION_COOKIE}=; Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
