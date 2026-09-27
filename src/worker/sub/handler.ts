// Public subscription endpoint under the secret sub path:
//   GET  /<sub>/<token>          config for VPN apps (format from ?f= or User-Agent), portal page for browsers
//   GET  /<sub>/<token>/info     portal data (JSON)
//   POST /<sub>/<token>/op       save the subscriber's operator choice
//   GET  /<sub>/assets/*         portal assets
// Unknown tokens and paths get the decoy, so the path reveals nothing.
import { DEFAULT_EXIT_COUNTRIES, flagEmoji } from '../../shared/constants';
import type { GeneralSettings } from '../../shared/settings';
import type { PortalData } from '../../shared/types';
import { serveAsset } from '../assets';
import { auditStmt } from '../db/audit';
import type { UserRow } from '../db/users';
import type { Env } from '../env';
import { json, PANEL_CSP } from '../lib/http';
import { TtlLru } from '../lib/lru';
import { clientIp, isSameOriginMutation } from '../lib/request';
import { formatFromParam, formatFromUa, isBrowser, type SubFormat } from './detect';
import { subHeaders } from './headers';
import { countryLabel } from './nodes';
import { CONTENT_TYPES, type Prepared, prepare, render } from './service';
import { nodeUri } from './uri';

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const unknownTokens = new TtlLru<string, true>(4096, 5 * 60_000);

async function findByToken(db: D1Database, token: string): Promise<UserRow | null> {
  if (!TOKEN_RE.test(token) || unknownTokens.get(token)) return null;
  const row = await db.prepare('SELECT * FROM users WHERE sub_token = ?1').bind(token).first<UserRow>();
  if (!row) unknownTokens.set(token, true);
  return row;
}

function asnOf(request: Request): number | null {
  const asn = (request as Request & { cf?: { asn?: number } }).cf?.asn;
  return typeof asn === 'number' && asn > 0 ? asn : null;
}

function langOf(url: URL, general: GeneralSettings): 'fa' | 'en' {
  const l = url.searchParams.get('lang');
  return l === 'en' || l === 'fa' ? l : general.language;
}

function pageUrl(general: GeneralSettings, url: URL, token: string): string {
  return `https://${general.subHost || url.host}/${general.subPath}/${token}`;
}

function portalData(
  p: Prepared,
  row: UserRow,
  general: GeneralSettings,
  url: URL,
  token: string,
): PortalData {
  const base = pageUrl(general, url, token);
  const allowAll = p.user.allowedExits.includes('*');
  const countries = p.nodes
    .filter((n) => !n.info && n.country)
    .map((n) => n.country!)
    .filter((c, i, a) => a.indexOf(c) === i)
    .filter((c) => allowAll || p.user.allowedExits.includes(c));
  return {
    brand: general.brandTitle,
    announcement: general.announcement,
    supportUrl: general.supportUrl,
    lang: general.language,
    user: {
      name: row.name,
      status: p.user.status,
      dataLimit: row.data_limit,
      up: row.used_up,
      down: row.used_down,
      used: row.used_up + row.used_down,
      expireAt: row.expire_at,
      durationDays: row.duration_days,
      resetStrategy: row.reset_strategy,
      createdAt: row.created_at,
      lastOnlineAt: row.last_online_at,
    },
    subUrl: base,
    formats: {
      b64: `${base}?f=b64`,
      clash: `${base}?f=clash`,
      singbox: `${base}?f=singbox`,
      xray: `${base}?f=xray`,
    },
    operator: {
      current: p.choice.operator?.code ?? null,
      detected: p.choice.detected?.code ?? null,
      saved: row.operator,
      source: p.choice.source,
      list: p.operators.filter((o) => o.enabled).map((o) => ({ code: o.code, fa: o.nameFa, en: o.nameEn })),
    },
    countries: countries.map((c) => ({
      code: c,
      flag: flagEmoji(c),
      fa: DEFAULT_EXIT_COUNTRIES.find((x) => x.code === c)?.fa ?? countryLabel(c, 'fa'),
      en: DEFAULT_EXIT_COUNTRIES.find((x) => x.code === c)?.en ?? countryLabel(c, 'en'),
    })),
    configs: p.nodes
      .filter((n) => !n.info)
      .map((n) => ({ name: n.name, proto: n.proto, country: n.country, uri: nodeUri(n, p.cred, p.options) })),
    fragment: p.options.fragment.enabled,
    now: Date.now(),
  };
}

const PORTAL_CSP = PANEL_CSP;

export async function handleSub(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  general: GeneralSettings,
): Promise<Response | null> {
  const url = new URL(request.url);
  const rest = url.pathname.slice(general.subPath.length + 1);
  const parts = rest.split('/').filter(Boolean);
  const method = request.method;
  const readOnly = method === 'GET' || method === 'HEAD';

  if (parts[0] === 'assets' && parts.length === 2 && readOnly) {
    return serveAsset(`assets/${parts[1]}`, request, PORTAL_CSP);
  }
  if (parts.length < 1 || parts.length > 2) return null;
  const token = parts[0]!;
  const action = parts[1] ?? '';
  if (action && action !== 'info' && action !== 'op') return null;

  const db = env.DB;
  const row = await findByToken(db, token);
  if (!row) return null;
  const lang = langOf(url, general);

  if (action === 'op') {
    if (method !== 'POST') return null;
    if (!isSameOriginMutation(request)) return json({ error: 'csrf' }, 403);
    let body: { op?: unknown };
    try {
      body = (await request.json()) as { op?: unknown };
    } catch {
      return json({ error: 'bad_request' }, 400);
    }
    const op =
      body.op === null || body.op === 'auto' ? null : typeof body.op === 'string' ? body.op : undefined;
    if (op === undefined) return json({ error: 'bad_request' }, 400);
    if (op !== null) {
      const exists = await db
        .prepare('SELECT 1 FROM operators WHERE code = ?1 AND enabled = 1')
        .bind(op)
        .first();
      if (!exists) return json({ error: 'unknown_operator' }, 400);
    }
    await db.batch([
      db
        .prepare('UPDATE users SET operator = ?2, updated_at = ?3 WHERE id = ?1')
        .bind(row.id, op, Date.now()),
      auditStmt(db, 'portal', 'user.operator', row.name, clientIp(request), { op }),
    ]);
    row.operator = op;
    const p = await prepare(db, {
      row,
      general,
      requestHost: url.host,
      opParam: null,
      asn: asnOf(request),
      lang,
    });
    return json(portalData(p, row, general, url, token));
  }

  if (!readOnly) return null;

  if (action === 'info') {
    const p = await prepare(db, {
      row,
      general,
      requestHost: url.host,
      opParam: url.searchParams.get('op'),
      asn: asnOf(request),
      lang,
    });
    return json(portalData(p, row, general, url, token));
  }

  const forced = formatFromParam(url.searchParams.get('f'));
  if (!forced && isBrowser(request)) {
    if (url.pathname.endsWith('/')) {
      return new Response(null, {
        status: 301,
        headers: { location: url.pathname.replace(/\/+$/, '') + url.search },
      });
    }
    return serveAsset('portal.html', request, PORTAL_CSP);
  }

  const ua = request.headers.get('user-agent') ?? '';
  const format: SubFormat = forced ?? formatFromUa(ua);
  const p = await prepare(db, {
    row,
    general,
    requestHost: url.host,
    opParam: url.searchParams.get('op'),
    asn: asnOf(request),
    lang,
  });
  const body = render(p, format);

  const now = Date.now();
  if (!row.sub_updated_at || now - row.sub_updated_at > 60_000) {
    ctx.waitUntil(
      db
        .prepare('UPDATE users SET sub_updated_at = ?2, sub_last_ua = ?3 WHERE id = ?1')
        .bind(row.id, now, ua.slice(0, 200) || null)
        .run()
        .catch(() => {}),
    );
  }

  const headers = subHeaders(
    {
      up: row.used_up,
      down: row.used_down,
      total: row.data_limit,
      expireAt: row.expire_at,
      title: `${p.profileTitle} | ${row.name}`,
      updateHours: p.updateHours,
      supportUrl: general.supportUrl,
      pageUrl: pageUrl(general, url, token),
      filename: `${p.profileTitle}-${row.name}`,
    },
    CONTENT_TYPES[format],
  );
  return new Response(method === 'HEAD' ? null : body, { headers });
}
