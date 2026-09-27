import { DAY_MS, type ResetStrategy, type UserStatus } from '../../shared/constants';
import type { UserDto } from '../../shared/types';
import { newSubToken, newUuid, randomString } from '../lib/crypto';
import { HttpError } from '../lib/http';
import { sha224Hex } from '../lib/sha224';

export interface UserRow {
  id: number;
  name: string;
  uuid: string;
  trojan_password: string;
  trojan_hash: string;
  sub_token: string;
  plan_id: number | null;
  status: UserStatus;
  data_limit: number;
  used_up: number;
  used_down: number;
  lifetime_used: number;
  expire_at: number | null;
  duration_days: number | null;
  reset_strategy: ResetStrategy;
  last_reset_at: number;
  device_limit: number;
  allowed_exits: string;
  force_exit: number;
  operator: string | null;
  warp_enabled: number;
  filter_exempt: number;
  note: string;
  tags: string;
  disabled_reason: string | null;
  rev: number;
  created_at: number;
  updated_at: number;
  first_used_at: number | null;
  last_online_at: number | null;
  sub_updated_at: number | null;
  sub_last_ua: string | null;
}

function parseList(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function subUrlFor(host: string, subPath: string, token: string): string {
  return `https://${host}/${subPath}/${token}`;
}

export function toDto(r: UserRow, subBase: { host: string; subPath: string }): UserDto {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    uuid: r.uuid,
    trojanPassword: r.trojan_password,
    subToken: r.sub_token,
    subUrl: subUrlFor(subBase.host, subBase.subPath, r.sub_token),
    dataLimit: r.data_limit,
    usedUp: r.used_up,
    usedDown: r.used_down,
    used: r.used_up + r.used_down,
    lifetimeUsed: r.lifetime_used,
    expireAt: r.expire_at,
    durationDays: r.duration_days,
    resetStrategy: r.reset_strategy,
    lastResetAt: r.last_reset_at,
    deviceLimit: r.device_limit,
    allowedExits: parseList(r.allowed_exits),
    forceExit: !!r.force_exit,
    operator: r.operator,
    warpEnabled: !!r.warp_enabled,
    filterExempt: !!r.filter_exempt,
    note: r.note,
    tags: parseList(r.tags),
    disabledReason: r.disabled_reason,
    planId: r.plan_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    firstUsedAt: r.first_used_at,
    lastOnlineAt: r.last_online_at,
    subUpdatedAt: r.sub_updated_at,
    subLastUa: r.sub_last_ua,
    rev: r.rev,
  };
}

/**
 * Derives the status that the stored fields imply. Explicit admin states
 * (disabled, on_hold) win; otherwise expiry and quota decide.
 */
export function deriveStatus(
  r: Pick<UserRow, 'status' | 'expire_at' | 'data_limit' | 'used_up' | 'used_down'>,
  now = Date.now(),
): UserStatus {
  if (r.status === 'disabled' || r.status === 'on_hold') return r.status;
  if (r.expire_at !== null && r.expire_at <= now) return 'expired';
  if (r.data_limit > 0 && r.used_up + r.used_down >= r.data_limit) return 'limited';
  return 'active';
}

export interface NewUserFields {
  name: string;
  dataLimit: number;
  days: number; // 0 = unlimited
  expireAt?: number | null;
  onHold: boolean;
  deviceLimit: number;
  resetStrategy: ResetStrategy;
  allowedExits: string[];
  forceExit: boolean;
  operator: string | null;
  warpEnabled: boolean;
  filterExempt: boolean;
  note: string;
  tags: string[];
  planId: number | null;
}

export function newCredentials(): {
  uuid: string;
  trojanPassword: string;
  trojanHash: string;
  subToken: string;
} {
  const trojanPassword = randomString(20);
  return { uuid: newUuid(), trojanPassword, trojanHash: sha224Hex(trojanPassword), subToken: newSubToken() };
}

export function insertUserStmt(db: D1Database, f: NewUserFields, now = Date.now()): D1PreparedStatement {
  const cred = newCredentials();
  const onHold = f.onHold && f.days > 0 && f.expireAt === undefined;
  const expireAt = onHold
    ? null
    : f.expireAt !== undefined
      ? f.expireAt
      : f.days > 0
        ? now + f.days * DAY_MS
        : null;
  return db
    .prepare(
      `INSERT INTO users (name, uuid, trojan_password, trojan_hash, sub_token, plan_id, status, data_limit,
         expire_at, duration_days, reset_strategy, last_reset_at, device_limit, allowed_exits, force_exit,
         operator, warp_enabled, filter_exempt, note, tags, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?12, ?12)
       RETURNING *`,
    )
    .bind(
      f.name,
      cred.uuid,
      cred.trojanPassword,
      cred.trojanHash,
      cred.subToken,
      f.planId,
      onHold ? 'on_hold' : 'active',
      f.dataLimit,
      expireAt,
      onHold ? f.days : f.days > 0 ? f.days : null,
      f.resetStrategy,
      now,
      f.deviceLimit,
      JSON.stringify(f.allowedExits),
      f.forceExit ? 1 : 0,
      f.operator,
      f.warpEnabled ? 1 : 0,
      f.filterExempt ? 1 : 0,
      f.note,
      JSON.stringify(f.tags),
    );
}

export async function getUserRow(db: D1Database, id: number): Promise<UserRow> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?1').bind(id).first<UserRow>();
  if (!row) throw new HttpError(404, 'user_not_found');
  return row;
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

export interface ListQuery {
  q?: string;
  status?: UserStatus | 'all';
  sort?: 'created' | 'name' | 'used' | 'expire' | 'online';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
  tag?: string;
}

const SORTS: Record<NonNullable<ListQuery['sort']>, string> = {
  created: 'created_at',
  name: 'name COLLATE NOCASE',
  used: '(used_up + used_down)',
  expire: 'COALESCE(expire_at, 9e15)',
  online: 'COALESCE(last_online_at, 0)',
};

export async function listUsers(db: D1Database, q: ListQuery): Promise<{ rows: UserRow[]; total: number }> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (q.q) {
    args.push(`%${q.q.replace(/[%_]/g, '')}%`);
    const i = args.length;
    where.push(`(name LIKE ?${i} OR note LIKE ?${i} OR uuid LIKE ?${i} OR sub_token LIKE ?${i})`);
  }
  if (q.status && q.status !== 'all') {
    args.push(q.status);
    where.push(`status = ?${args.length}`);
  }
  if (q.tag) {
    args.push(`%"${q.tag.replace(/["%_]/g, '')}"%`);
    where.push(`tags LIKE ?${args.length}`);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sort = SORTS[q.sort ?? 'created'];
  const order = q.order === 'asc' ? 'ASC' : 'DESC';
  const [rows, count] = await db.batch([
    db
      .prepare(
        `SELECT * FROM users ${w} ORDER BY ${sort} ${order}, id DESC LIMIT ${q.limit} OFFSET ${q.offset}`,
      )
      .bind(...args),
    db.prepare(`SELECT COUNT(*) AS n FROM users ${w}`).bind(...args),
  ]);
  return {
    rows: (rows?.results ?? []) as UserRow[],
    total: Number((count?.results?.[0] as { n: number } | undefined)?.n ?? 0),
  };
}

export async function statusCounts(db: D1Database): Promise<Record<UserStatus | 'all', number>> {
  const res = await db
    .prepare('SELECT status, COUNT(*) AS n FROM users GROUP BY status')
    .all<{ status: UserStatus; n: number }>();
  const out: Record<UserStatus | 'all', number> = {
    all: 0,
    active: 0,
    disabled: 0,
    expired: 0,
    limited: 0,
    on_hold: 0,
  };
  for (const r of res.results) {
    out[r.status] = r.n;
    out.all += r.n;
  }
  return out;
}
