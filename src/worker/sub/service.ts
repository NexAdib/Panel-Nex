// Assembles everything a subscription needs for one user and renders it in the
// requested format. Shared by the public subscription endpoint and the panel.
import type { GeneralSettings } from '../../shared/settings';
import { type CleanIp, cleanIpsFor, listOperators, type Operator } from '../db/operators';
import { getSettings } from '../db/settings';
import { deriveStatus, type UserRow } from '../db/users';
import { hash32 } from '../exits/select';
import { toClash } from './clash';
import type { Cred, FormatOptions } from './common';
import type { SubFormat } from './detect';
import { buildNodes, type SubNode, type SubUser } from './nodes';
import { toSingbox } from './singbox';
import { nodeUri, toBase64Sub } from './uri';
import { toXray } from './xray';

/** Client-side DNS for full-config formats. Not a Cloudflare address: Workers cannot dial those directly. */
export const CLIENT_DOH = 'https://8.8.8.8/dns-query';

export function parseList(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

export function subUser(row: UserRow, now = Date.now()): SubUser {
  const exits = parseList(row.allowed_exits).map((s) => s.toUpperCase());
  return {
    name: row.name,
    uuid: row.uuid,
    trojanPassword: row.trojan_password,
    allowedExits: exits.length ? exits : ['*'],
    dataLimit: row.data_limit,
    used: row.used_up + row.used_down,
    expireAt: row.expire_at,
    status: deriveStatus(row, now),
    durationDays: row.duration_days,
  };
}

/** Hostnames placed in configs. `*.example.com` becomes a stable per-user random subdomain. */
export function configHosts(general: GeneralSettings, requestHost: string, seed: string): string[] {
  const list = general.domains.length ? general.domains : [requestHost];
  return list.map((h, i) => {
    if (!h.startsWith('*.')) return h;
    const label = hash32(`${seed}:${i}`).toString(36).padStart(6, 'x').slice(0, 8);
    return `${label}${h.slice(1)}`;
  });
}

export interface OperatorChoice {
  operator: Operator | null;
  /** Operator matched from the client's ASN (for display). */
  detected: Operator | null;
  source: 'param' | 'saved' | 'asn' | 'default';
}

/** Order: ?op= → the user's saved choice → the client's ISP (ASN) → "all". `?op=auto` skips the saved choice. */
export function chooseOperator(
  operators: Operator[],
  param: string | null,
  saved: string | null,
  asn: number | null,
): OperatorChoice {
  const enabled = operators.filter((o) => o.enabled);
  const byCode = (c: string | null) => (c ? (enabled.find((o) => o.code === c) ?? null) : null);
  const detected = asn ? (enabled.find((o) => o.asns.includes(asn)) ?? null) : null;
  const fromParam = byCode(param);
  if (fromParam) return { operator: fromParam, detected, source: 'param' };
  const fromSaved = param === 'auto' ? null : byCode(saved);
  if (fromSaved) return { operator: fromSaved, detected, source: 'saved' };
  if (detected) return { operator: detected, detected, source: 'asn' };
  return { operator: byCode('all'), detected, source: 'default' };
}

export interface RenderInput {
  row: UserRow;
  general: GeneralSettings;
  requestHost: string;
  opParam: string | null;
  asn: number | null;
  lang: 'fa' | 'en';
}

export interface Prepared {
  nodes: SubNode[];
  cred: Cred;
  options: FormatOptions;
  choice: OperatorChoice;
  operators: Operator[];
  user: SubUser;
  updateHours: number;
  profileTitle: string;
}

export async function prepare(db: D1Database, i: RenderInput): Promise<Prepared> {
  const [proxy, sub, exits, operators] = await Promise.all([
    getSettings(db, 'proxy'),
    getSettings(db, 'sub'),
    getSettings(db, 'exits'),
    listOperators(db),
  ]);
  const choice = chooseOperator(operators, i.opParam, i.row.operator, i.asn);
  let cleanIps: CleanIp[] = choice.operator ? await cleanIpsFor(db, choice.operator.code) : [];
  if (!cleanIps.length && choice.operator?.code !== 'all') cleanIps = await cleanIpsFor(db, 'all');
  const user = subUser(i.row);
  const nodes = buildNodes({
    user,
    hosts: configHosts(i.general, i.requestHost, i.row.uuid),
    general: i.general,
    proxy,
    sub,
    exits,
    operator: choice.operator,
    cleanIps,
    lang: i.lang,
  });
  const opCfg = choice.operator?.config ?? {};
  const options: FormatOptions = {
    fingerprint: opCfg.fingerprint || proxy.fingerprint,
    alpn: proxy.alpn,
    earlyData: proxy.earlyData,
    fragment: opCfg.fragment ? { ...sub.fragment, ...opCfg.fragment } : sub.fragment,
    rules: sub.rules,
    dns: CLIENT_DOH,
  };
  return {
    nodes,
    cred: { uuid: i.row.uuid, trojanPassword: i.row.trojan_password },
    options,
    choice,
    operators,
    user,
    updateHours: sub.updateIntervalHours,
    profileTitle: sub.profileTitle,
  };
}

export const CONTENT_TYPES: Record<SubFormat, string> = {
  b64: 'text/plain; charset=utf-8',
  links: 'text/plain; charset=utf-8',
  clash: 'text/yaml; charset=utf-8',
  singbox: 'application/json; charset=utf-8',
  xray: 'application/json; charset=utf-8',
};

export function render(p: Prepared, format: SubFormat): string {
  switch (format) {
    case 'clash':
      return toClash(p.nodes, p.cred, p.options);
    case 'singbox':
      return toSingbox(p.nodes, p.cred, p.options);
    case 'xray':
      return toXray(p.nodes, p.cred, p.options);
    case 'links':
      return p.nodes.map((n) => nodeUri(n, p.cred, p.options)).join('\n');
    default:
      return toBase64Sub(p.nodes, p.cred, p.options);
  }
}
