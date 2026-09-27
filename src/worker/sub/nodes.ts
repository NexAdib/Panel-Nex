// Builds the list of configs ("nodes") a user's subscription contains:
// ⚡ Auto plus one group per allowed fixed-IP country, each spread over the
// operator's clean Cloudflare IPs, ports and enabled protocols.
import { DEFAULT_EXIT_COUNTRIES, flagEmoji, type UserStatus } from '../../shared/constants';
import type { ExitSettings, GeneralSettings, ProxySettings, SubSettings } from '../../shared/settings';
import { renderName } from '../../shared/template';
import type { CleanIp, Operator } from '../db/operators';

export interface SubUser {
  name: string;
  uuid: string;
  trojanPassword: string;
  allowedExits: string[];
  dataLimit: number;
  used: number;
  expireAt: number | null;
  status: UserStatus;
  durationDays: number | null;
}

export interface SubNode {
  name: string;
  proto: 'vless' | 'trojan';
  address: string;
  port: number;
  host: string;
  /** WebSocket path without the early-data query. */
  path: string;
  tls: boolean;
  /** Country code for fixed-IP groups; null for Auto. */
  country: string | null;
  group: string;
  info?: boolean;
}

export interface NodeContext {
  user: SubUser;
  hosts: string[];
  general: GeneralSettings;
  proxy: ProxySettings;
  sub: SubSettings;
  exits: ExitSettings;
  operator: Operator | null;
  cleanIps: CleanIp[];
  lang: 'fa' | 'en';
}

export function countryLabel(code: string, lang: 'fa' | 'en'): string {
  const preset = DEFAULT_EXIT_COUNTRIES.find((c) => c.code === code);
  if (preset) return lang === 'fa' ? preset.fa : preset.en;
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function autoLabel(lang: 'fa' | 'en'): string {
  return lang === 'fa' ? '⚡ خودکار' : '⚡ Auto';
}

export function groupLabel(country: string | null, lang: 'fa' | 'en'): string {
  return country ? `${flagEmoji(country)} ${countryLabel(country, lang)}` : autoLabel(lang);
}

function fmtGb(bytes: number, lang: 'fa' | 'en'): string {
  const gb = bytes / 1024 ** 3;
  const n = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', {
    maximumFractionDigits: gb < 10 ? 2 : 1,
  }).format(Math.max(0, gb));
  return lang === 'fa' ? `${n} گیگ` : `${n} GB`;
}

const STATUS_LINE: Partial<Record<UserStatus, { fa: string; en: string }>> = {
  disabled: { fa: '⛔ اشتراک غیرفعال است', en: '⛔ Subscription disabled' },
  expired: { fa: '⌛ اشتراک منقضی شده', en: '⌛ Subscription expired' },
  limited: { fa: '🚫 حجم تمام شده', en: '🚫 Data limit reached' },
};

export function infoNames(u: SubUser, lang: 'fa' | 'en', now = Date.now()): string[] {
  const fa = lang === 'fa';
  const status = STATUS_LINE[u.status];
  const data =
    u.dataLimit > 0
      ? `📊 ${fmtGb(u.dataLimit - u.used, lang)} ${fa ? 'باقی‌مانده' : 'left'}`
      : `📊 ${fa ? 'حجم نامحدود' : 'Unlimited data'}`;
  let time: string;
  if (u.status === 'on_hold')
    time = `⏳ ${fa ? `${u.durationDays ?? 0} روز از اولین اتصال` : `${u.durationDays ?? 0} days from first use`}`;
  else if (u.expireAt === null) time = `⏳ ${fa ? 'بدون انقضا' : 'No expiry'}`;
  else {
    const days = Math.max(0, Math.ceil((u.expireAt - now) / 86_400_000));
    const n = new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(days);
    time = `⏳ ${fa ? `${n} روز مانده` : `${n} days left`}`;
  }
  return status ? [status[lang], data, time] : [data, time];
}

export function buildNodes(ctx: NodeContext): SubNode[] {
  const { user, proxy, sub, exits, general, lang } = ctx;
  const protos: SubNode['proto'][] = [];
  if (proxy.vless) protos.push('vless');
  if (proxy.trojan) protos.push('trojan');
  if (!protos.length || !ctx.hosts.length) return [];

  const opPorts = ctx.operator?.config.ports?.filter(
    (p) => proxy.tlsPorts.includes(p) || proxy.plainPorts.includes(p),
  );
  const ports = opPorts?.length ? opPorts : [...proxy.tlsPorts, ...proxy.plainPorts];
  if (!ports.length) return [];
  const plain = new Set(proxy.plainPorts);

  const ips = ctx.cleanIps.slice(0, sub.ipsPerOperator);
  const addresses: { address: string; port: number }[] = ips.length
    ? ips
    : ctx.hosts
        .slice(0, Math.max(1, Math.min(ctx.hosts.length, sub.ipsPerOperator)))
        .map((h) => ({ address: h, port: 0 }));

  const allowAll = user.allowedExits.includes('*');
  const countries = sub.includeCountries
    ? exits.countries.filter((c) => allowAll || user.allowedExits.includes(c))
    : [];
  const groups: (string | null)[] = [
    ...(sub.includeAuto || countries.length === 0 ? [null] : []),
    ...countries,
  ];

  const opName =
    ctx.operator && ctx.operator.code !== 'all'
      ? lang === 'fa'
        ? ctx.operator.nameFa
        : ctx.operator.nameEn
      : '';
  const nodes: SubNode[] = [];
  const used = new Set<string>();

  // At least one config per enabled protocol, so a single-host setup still gets a Trojan fallback.
  const perGroup = Math.max(addresses.length, protos.length);
  for (const country of groups) {
    const group = groupLabel(country, lang);
    for (let i = 0; i < perGroup; i++) {
      const a = addresses[i % addresses.length]!;
      const proto = protos[i % protos.length]!;
      const port = a.port || ports[i % ports.length]!;
      const host = ctx.hosts[i % ctx.hosts.length]!;
      const path = `/${general.wsPath}${country ? `/${country.toLowerCase()}` : ''}`;
      let name = renderName(sub.nameTemplate, {
        flag: country ? flagEmoji(country) : '⚡',
        country: country ? countryLabel(country, lang) : lang === 'fa' ? 'خودکار' : 'Auto',
        op: opName,
        ip: a.address,
        port: String(port),
        proto: proto.toUpperCase(),
        user: user.name,
        n: String(i + 1),
      });
      if (!name) name = `${group} ${i + 1}`;
      let unique = name;
      for (let k = 2; used.has(unique); k++) unique = `${name} ${k}`;
      used.add(unique);
      nodes.push({
        name: unique,
        proto,
        address: a.address,
        port,
        host,
        path,
        tls: !plain.has(port),
        country,
        group,
      });
    }
  }

  const capped = nodes.slice(0, Math.max(1, sub.maxNodes));
  if (sub.infoNodes) {
    const info = infoNames(user, lang).map<SubNode>((name) => ({
      name,
      proto: 'vless',
      address: '127.0.0.1',
      port: 1,
      host: ctx.hosts[0]!,
      path: '/',
      tls: false,
      country: null,
      group: '',
      info: true,
    }));
    return [...info, ...capped];
  }
  return capped;
}
