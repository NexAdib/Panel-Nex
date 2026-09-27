// sing-box 1.12+ configuration (SFA, SFI, SFM and other sing-box clients).
import { type Cred, type FormatOptions, groupsOf, MAIN_GROUP, TEST_URL } from './common';
import type { SubNode } from './nodes';

type Json = Record<string, unknown>;

const RULE_SETS: Record<string, string> = {
  'geoip-ir': 'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-ir.srs',
  'geosite-ir': 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ir.srs',
  'geosite-ads':
    'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ads-all.srs',
  'geosite-porn':
    'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-porn.srs',
};

export interface SingboxExtras {
  endpoints?: Json[];
  /** Tags of extra endpoints/outbounds to list in the main selector. */
  tags?: string[];
}

function outboundFor(n: SubNode, cred: Cred, o: FormatOptions): Json {
  const out: Json = {
    type: n.proto,
    tag: n.name,
    server: n.address,
    server_port: n.port,
  };
  if (n.proto === 'vless') out.uuid = cred.uuid;
  else out.password = cred.trojanPassword;
  if (n.tls) {
    out.tls = {
      enabled: true,
      server_name: n.host,
      insecure: false,
      utls: { enabled: true, fingerprint: o.fingerprint === 'randomized' ? 'random' : o.fingerprint },
      ...(o.alpn ? { alpn: o.alpn.split(',').map((s) => s.trim()) } : {}),
    };
  }
  out.transport = {
    type: 'ws',
    path: n.path,
    headers: { Host: n.host },
    ...(o.earlyData ? { max_early_data: o.earlyData, early_data_header_name: 'Sec-WebSocket-Protocol' } : {}),
  };
  return out;
}

export function toSingbox(
  nodes: SubNode[],
  cred: Cred,
  o: FormatOptions,
  extras: SingboxExtras = {},
): string {
  const groups = groupsOf(nodes);
  const real = nodes.filter((n) => !n.info);
  const groupOutbounds: Json[] = groups.map((g) => ({
    type: 'urltest',
    tag: g.label,
    outbounds: g.nodes.map((n) => n.name),
    url: TEST_URL,
    interval: '5m',
    tolerance: 80,
    idle_timeout: '30m',
  }));
  const selectorTargets = [...groups.map((g) => g.label), ...(extras.tags ?? [])];
  const ruleSets: Json[] = [];
  const rules: Json[] = [
    { action: 'sniff' },
    { protocol: 'dns', action: 'hijack-dns' },
    { ip_is_private: true, outbound: 'direct' },
  ];
  const useSet = (tag: string) => {
    ruleSets.push({
      type: 'remote',
      tag,
      format: 'binary',
      url: RULE_SETS[tag],
      download_detour: MAIN_GROUP,
    });
    return tag;
  };
  if (o.rules.blockQuic) rules.push({ network: 'udp', port: 443, action: 'reject' });
  if (o.rules.blockAds) rules.push({ rule_set: [useSet('geosite-ads')], action: 'reject' });
  if (o.rules.blockPorn) rules.push({ rule_set: [useSet('geosite-porn')], action: 'reject' });
  if (o.rules.iranDirect) {
    rules.push({ domain_suffix: ['.ir'], outbound: 'direct' });
    rules.push({ rule_set: [useSet('geosite-ir'), useSet('geoip-ir')], outbound: 'direct' });
  }

  const config: Json = {
    log: { level: 'warn', timestamp: true },
    dns: {
      servers: [
        {
          type: 'https',
          tag: 'dns-remote',
          server: o.dns.replace(/^https:\/\//, '').replace(/\/dns-query$/, ''),
          detour: MAIN_GROUP,
        },
        { type: 'local', tag: 'dns-local' },
      ],
      rules: o.rules.iranDirect ? [{ domain_suffix: ['.ir'], server: 'dns-local' }] : [],
      final: 'dns-remote',
      strategy: 'prefer_ipv4',
    },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        address: ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'],
        auto_route: true,
        strict_route: true,
      },
      { type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 2080 },
    ],
    outbounds: [
      { type: 'selector', tag: MAIN_GROUP, outbounds: selectorTargets, default: selectorTargets[0] },
      ...groupOutbounds,
      ...real.map((n) => outboundFor(n, cred, o)),
      { type: 'direct', tag: 'direct' },
    ],
    ...(extras.endpoints?.length ? { endpoints: extras.endpoints } : {}),
    route: {
      rules,
      rule_set: ruleSets,
      final: MAIN_GROUP,
      auto_detect_interface: true,
      default_domain_resolver: { server: 'dns-local' },
    },
    experimental: { cache_file: { enabled: true } },
  };
  return JSON.stringify(config, null, 2);
}
