import { DEFAULT_EXIT_COUNTRIES, DEFAULT_OPERATORS, GB } from '../shared/constants';
import { defaultSettings } from '../shared/settings';
import { serveAsset } from './assets';
import { hashPassword, passwordProblems } from './auth/password';
import { createSession, sessionCookie } from './auth/session';
import { auditStmt } from './db/audit';
import { markInstalledCache, setMetaStmt } from './db/meta';
import { clearSettingsCache, validateSettings } from './db/settings';
import { decoy } from './decoy';
import type { Env } from './env';
import { newPathSegment, newSecret, timingSafeEqual } from './lib/crypto';
import { json } from './lib/http';
import { clientIp, isSameOriginMutation } from './lib/request';

export const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

export interface InstallInput {
  username: string;
  password: string;
  language?: 'fa' | 'en';
  /** Optional overrides used by the account manager when it installs a panel remotely. */
  panelPath?: string;
  subPath?: string;
  wsPath?: string;
  domains?: string[];
}

/** Statements that seed a fresh database. Shared by /install and the remote installer. */
export async function buildInstallStatements(
  db: D1Database,
  input: InstallInput,
  iters: number,
): Promise<{ statements: D1PreparedStatement[]; general: ReturnType<typeof defaultSettings>['general'] }> {
  const now = Date.now();
  const pw = await hashPassword(input.password, iters);
  const defaults = defaultSettings();
  const general = validateSettings('general', {
    ...defaults.general,
    panelPath: input.panelPath ?? newPathSegment(14),
    subPath: input.subPath ?? newPathSegment(10),
    wsPath: input.wsPath ?? newPathSegment(10),
    domains: input.domains ?? [],
    language: input.language ?? 'fa',
  });
  const statements: D1PreparedStatement[] = [
    // Plain INSERT: if the panel is already installed this violates the primary key
    // and the whole batch (one transaction) rolls back, so a racing second installer
    // can never overwrite the first one's settings.
    db.prepare(`INSERT INTO meta (k, v) VALUES ('installed_at', ?1)`).bind(String(now)),
    db
      .prepare(
        `INSERT INTO admins (username, pass_hash, pass_salt, pass_iters, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)`,
      )
      .bind(input.username, pw.hash, pw.salt, pw.iters, now),
    db
      .prepare(
        `INSERT INTO settings (grp, doc, version, updated_at) VALUES ('general', ?1, 1, ?2)
         ON CONFLICT(grp) DO UPDATE SET doc = excluded.doc, version = settings.version + 1, updated_at = excluded.updated_at`,
      )
      .bind(JSON.stringify(general), now),
    setMetaStmt(db, 'instance_id', newSecret(16)),
  ];
  DEFAULT_OPERATORS.forEach((op, i) => {
    statements.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO operators (code, name_fa, name_en, asns, sort) VALUES (?1, ?2, ?3, ?4, ?5)',
        )
        .bind(op.code, op.fa, op.en, JSON.stringify(op.asns), i),
    );
  });
  for (const c of DEFAULT_EXIT_COUNTRIES) {
    for (const host of c.suggested) {
      statements.push(
        db
          .prepare(
            `INSERT INTO exits (country, type, address, port, label, enabled, created_at)
             SELECT ?1, 'proxyip', ?2, 443, 'suggested', 1, ?3
             WHERE NOT EXISTS (SELECT 1 FROM exits WHERE address = ?2)`,
          )
          .bind(c.code, host, now),
      );
    }
  }
  const plans: [string, number, number, number][] = [
    ['۳۰ گیگ – یک‌ماهه', 30, 30, 2],
    ['۵۰ گیگ – یک‌ماهه', 50, 30, 2],
    ['نامحدود – یک‌ماهه', 0, 30, 1],
    ['۱۰۰ گیگ – سه‌ماهه', 100, 90, 2],
  ];
  plans.forEach(([name, gb, days, devices], i) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO plans (name, data_limit, duration_days, device_limit, sort, created_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = ?1)`,
        )
        .bind(name, gb * GB, days, devices, i, now),
    );
  });
  return { statements, general };
}

export async function handleInstall(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (path === '/install' || path === '/install/')
      return serveAsset('panel.html', request) ?? decoy(request, 'nginx');
    if (path.startsWith('/assets/')) return serveAsset(path.slice(1), request) ?? decoy(request, 'nginx');
    if (path === '/api/install/status') {
      return json({ installed: false, needsToken: !!env.SETUP_TOKEN, version: __NEXADIB_VERSION__ });
    }
    return decoy(request, 'nginx');
  }
  if (request.method === 'POST' && path === '/api/install') {
    if (!isSameOriginMutation(request)) return json({ error: 'forbidden' }, 403);
    return install(request, env);
  }
  return decoy(request, 'nginx');
}

async function install(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const language = body.language === 'en' ? 'en' : 'fa';
  if (env.SETUP_TOKEN) {
    const token = String(body.setupToken ?? '');
    if (!timingSafeEqual(token, env.SETUP_TOKEN)) return json({ error: 'bad_setup_token' }, 403);
  }
  if (!USERNAME_RE.test(username)) return json({ error: 'bad_username' }, 400);
  const problem = passwordProblems(password);
  if (problem) return json({ error: `password_${problem}` }, 400);

  const iters = defaultSettings().security.pbkdf2Iterations;
  const { statements, general } = await buildInstallStatements(
    env.DB,
    { username, password, language },
    iters,
  );
  statements.push(auditStmt(env.DB, username, 'install', null, clientIp(request)));
  try {
    await env.DB.batch(statements);
  } catch {
    markInstalledCache(false);
    return json({ error: 'already_installed' }, 409);
  }
  clearSettingsCache();
  markInstalledCache(true);

  const admin = await env.DB.prepare('SELECT id FROM admins WHERE username = ?1')
    .bind(username)
    .first<{ id: number }>();
  const base = `/${general.panelPath}`;
  const sec = defaultSettings().security;
  const { token, maxAge } = await createSession(env.DB, admin!.id, sec, {
    ip: clientIp(request),
    ua: request.headers.get('user-agent'),
    via: 'password',
  });
  return json({ ok: true, panelPath: base + '/', subPath: general.subPath }, 200, {
    'set-cookie': sessionCookie(token, base, maxAge),
  });
}
