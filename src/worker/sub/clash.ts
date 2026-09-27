// Clash Meta / Mihomo configuration (Clash Verge Rev, FlClash, Clash Meta for Android, Stash).
import { type Cred, type FormatOptions, groupsOf, MAIN_GROUP, TEST_URL } from './common';
import type { SubNode } from './nodes';
import { toYaml, type Yaml } from './yaml';

export interface ClashExtras {
  /** Extra proxies (e.g. WARP WireGuard) appended to the main selector. */
  proxies?: Record<string, Yaml>[];
  groupNames?: string[];
}

function proxyFor(n: SubNode, cred: Cred, o: FormatOptions): Record<string, Yaml> {
  const wsOpts: Record<string, Yaml> = { path: n.path, headers: { Host: n.host } };
  if (o.earlyData) {
    wsOpts['max-early-data'] = o.earlyData;
    wsOpts['early-data-header-name'] = 'Sec-WebSocket-Protocol';
  }
  const base: Record<string, Yaml> = {
    name: n.name,
    type: n.proto,
    server: n.address,
    port: n.port,
    udp: true,
  };
  if (n.proto === 'vless') base.uuid = n.info ? '00000000-0000-4000-8000-000000000000' : cred.uuid;
  else base.password = cred.trojanPassword;
  if (n.tls) {
    base.tls = true;
    if (n.proto === 'vless') base.servername = n.host;
    else base.sni = n.host;
    base['client-fingerprint'] = o.fingerprint === 'randomized' ? 'random' : o.fingerprint;
    if (o.alpn) base.alpn = o.alpn.split(',').map((s) => s.trim());
    base['skip-cert-verify'] = false;
  } else if (n.proto === 'vless') {
    base.tls = false;
  }
  base.network = 'ws';
  base['ws-opts'] = wsOpts;
  return base;
}

export function toClash(nodes: SubNode[], cred: Cred, o: FormatOptions, extras: ClashExtras = {}): string {
  const groups = groupsOf(nodes);
  const proxies = [
    ...nodes.filter((n) => !n.info).map((n) => proxyFor(n, cred, o)),
    ...(extras.proxies ?? []),
  ];
  const info = nodes.filter((n) => n.info).map((n) => proxyFor(n, cred, o));
  const groupNames = groups.map((g) => g.label);
  const main: Record<string, Yaml> = {
    name: MAIN_GROUP,
    type: 'select',
    proxies: [...groupNames, ...(extras.groupNames ?? []), 'DIRECT', ...info.map((p) => p.name as string)],
  };
  const proxyGroups: Record<string, Yaml>[] = [
    main,
    ...groups.map((g) => ({
      name: g.label,
      type: 'url-test',
      url: TEST_URL,
      interval: 300,
      tolerance: 80,
      lazy: true,
      proxies: g.nodes.map((n) => n.name),
    })),
  ];
  const rules: string[] = [
    'IP-CIDR,127.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,172.16.0.0/12,DIRECT,no-resolve',
    'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
  ];
  if (o.rules.blockQuic) rules.push('AND,((NETWORK,UDP),(DST-PORT,443)),REJECT');
  if (o.rules.blockAds) rules.push('GEOSITE,category-ads-all,REJECT');
  if (o.rules.blockPorn) rules.push('GEOSITE,category-porn,REJECT');
  if (o.rules.iranDirect)
    rules.push('DOMAIN-SUFFIX,ir,DIRECT', 'GEOSITE,category-ir,DIRECT', 'GEOIP,IR,DIRECT');
  rules.push(`MATCH,${MAIN_GROUP}`);

  return toYaml({
    'mixed-port': 7890,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'warning',
    ipv6: true,
    'unified-delay': true,
    'tcp-concurrent': true,
    'geodata-mode': true,
    'geo-auto-update': true,
    'geo-update-interval': 72,
    profile: { 'store-selected': true, 'store-fake-ip': true },
    sniffer: {
      enable: true,
      'parse-pure-ip': true,
      sniff: { HTTP: { ports: [80, 8080] }, TLS: { ports: [443, 8443] }, QUIC: { ports: [443] } },
    },
    dns: {
      enable: true,
      ipv6: true,
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '198.18.0.1/16',
      'fake-ip-filter': [
        '*.lan',
        '*.local',
        '*.localdomain',
        '+.ir',
        '+.msftconnecttest.com',
        '+.msftncsi.com',
        'time.*.com',
      ],
      'default-nameserver': ['8.8.8.8', '1.1.1.1'],
      // Remote DNS goes through the tunnel (the "#group" suffix); direct DoH is often blocked.
      nameserver: [`${o.dns}#${MAIN_GROUP}`],
      // Resolves the config's own server names without the tunnel.
      'proxy-server-nameserver': ['8.8.8.8', '1.1.1.1'],
    },
    proxies: [...info, ...proxies],
    'proxy-groups': proxyGroups,
    rules,
  });
}
