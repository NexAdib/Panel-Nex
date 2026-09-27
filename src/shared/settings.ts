// Settings shapes shared by the worker (validation, storage) and the UI (forms).
import {
  type AmneziaPreset,
  DEFAULT_AI_DOMAINS,
  DEFAULT_EXIT_COUNTRIES,
  TLS_PORTS,
  WARP_DEFAULT_ENDPOINT,
} from './constants';

export interface GeneralSettings {
  /** Secret path segments (no slashes). */
  panelPath: string;
  subPath: string;
  wsPath: string;
  /** Hostnames used in configs (SNI/Host). The request host is always included. */
  domains: string[];
  /** Preferred host for subscription links; empty = the host the request came in on. */
  subHost: string;
  brandTitle: string;
  supportUrl: string;
  announcement: string;
  timezone: string;
  language: 'fa' | 'en';
}

export interface ProxySettings {
  vless: boolean;
  trojan: boolean;
  tlsPorts: number[];
  /** Plain (non-TLS) ports expose the UUID on the wire; disabled by default. */
  plainPorts: number[];
  fingerprint: string;
  alpn: string;
  earlyData: number;
  /** DNS server (IPv4, TCP:53) used for DNS queries tunnelled over UDP. */
  dnsServer: string;
  /** NAT64 prefixes like "2602:fc59:b0:64::" — reachability fallback only. */
  nat64Prefixes: string[];
  connectTimeoutMs: number;
  /** Exit country used when an "Auto" connection hits a Cloudflare-hosted site. Empty = any healthy exit. */
  cfFallbackCountry: string;
}

export interface FragmentSettings {
  enabled: boolean;
  packets: string;
  length: string;
  interval: string;
}

export interface SubSettings {
  updateIntervalHours: number;
  profileTitle: string;
  /** Placeholders: {flag} {country} {op} {ip} {port} {proto} {user} {n} */
  nameTemplate: string;
  infoNodes: boolean;
  maxNodes: number;
  ipsPerOperator: number;
  includeAuto: boolean;
  includeCountries: boolean;
  fragment: FragmentSettings;
  rules: { iranDirect: boolean; blockQuic: boolean; blockAds: boolean; blockPorn: boolean };
}

export interface ExitSettings {
  /** Enabled exit countries, in display order. */
  countries: string[];
  aiEnabled: boolean;
  aiCountry: string;
  aiDomains: string[];
  /** Default for new users: send all traffic of country configs through the exit. */
  forceAllDefault: boolean;
}

export interface FilterSettings {
  adult: boolean;
  malware: boolean;
  ads: boolean;
  gambling: boolean;
  customDomains: string[];
  customKeywords: string[];
}

export interface WarpSettings {
  enabled: boolean;
  /** host:port candidates; the first is the default. */
  endpoints: string[];
  amnezia: AmneziaPreset;
  custom: { jc: number; jmin: number; jmax: number };
  mtu: number;
  keepalive: number;
  dns: string;
  wow: boolean;
  license: string;
}

export interface SecuritySettings {
  sessionHours: number;
  idleMinutes: number;
  loginMaxFails: number;
  lockMinutes: number;
  pbkdf2Iterations: number;
  decoy: 'blank' | 'nginx' | 'site';
}

export interface SettingsMap {
  general: GeneralSettings;
  proxy: ProxySettings;
  sub: SubSettings;
  exits: ExitSettings;
  filter: FilterSettings;
  warp: WarpSettings;
  security: SecuritySettings;
}

export type SettingsGroup = keyof SettingsMap;
export const SETTINGS_GROUPS: SettingsGroup[] = [
  'general',
  'proxy',
  'sub',
  'exits',
  'filter',
  'warp',
  'security',
];

export function defaultSettings(): SettingsMap {
  return {
    general: {
      panelPath: '',
      subPath: '',
      wsPath: '',
      domains: [],
      subHost: '',
      brandTitle: 'NexAdib',
      supportUrl: '',
      announcement: '',
      timezone: 'Asia/Tehran',
      language: 'fa',
    },
    proxy: {
      vless: true,
      trojan: true,
      tlsPorts: [...TLS_PORTS],
      plainPorts: [],
      fingerprint: 'chrome',
      alpn: 'http/1.1',
      earlyData: 2560,
      dnsServer: '8.8.4.4',
      nat64Prefixes: [],
      connectTimeoutMs: 8000,
      cfFallbackCountry: '',
    },
    sub: {
      updateIntervalHours: 12,
      profileTitle: 'NexAdib',
      nameTemplate: '{flag} {country} | {op} | {port}',
      infoNodes: true,
      maxNodes: 60,
      ipsPerOperator: 3,
      includeAuto: true,
      includeCountries: true,
      fragment: { enabled: false, packets: 'tlshello', length: '10-30', interval: '10-20' },
      rules: { iranDirect: true, blockQuic: true, blockAds: false, blockPorn: false },
    },
    exits: {
      countries: DEFAULT_EXIT_COUNTRIES.map((c) => c.code),
      aiEnabled: true,
      aiCountry: 'US',
      aiDomains: [...DEFAULT_AI_DOMAINS],
      forceAllDefault: false,
    },
    filter: {
      adult: false,
      malware: true,
      ads: false,
      gambling: false,
      customDomains: [],
      customKeywords: [],
    },
    warp: {
      enabled: true,
      endpoints: [WARP_DEFAULT_ENDPOINT],
      amnezia: 'medium',
      custom: { jc: 4, jmin: 40, jmax: 70 },
      mtu: 1280,
      keepalive: 25,
      dns: '1.1.1.1',
      wow: false,
      license: '',
    },
    security: {
      sessionHours: 168,
      idleMinutes: 720,
      loginMaxFails: 5,
      lockMinutes: 15,
      pbkdf2Iterations: 60_000,
      decoy: 'nginx',
    },
  };
}
