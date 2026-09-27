// Xray JSON configs for v2rayNG / v2rayN "custom config" subscriptions: one
// complete config per node, with optional TLS ClientHello fragmentation.
import type { Cred, FormatOptions } from './common';
import type { SubNode } from './nodes';

type Json = Record<string, unknown>;

export function xrayConfigFor(n: SubNode, cred: Cred, o: FormatOptions): Json {
  const stream: Json = {
    network: 'ws',
    security: n.tls ? 'tls' : 'none',
    wsSettings: {
      path: o.earlyData ? `${n.path}?ed=${o.earlyData}` : n.path,
      host: n.host,
    },
  };
  if (n.tls) {
    stream.tlsSettings = {
      serverName: n.host,
      fingerprint: o.fingerprint,
      allowInsecure: false,
      ...(o.alpn ? { alpn: o.alpn.split(',').map((s) => s.trim()) } : {}),
    };
  }
  const useFragment = o.fragment.enabled && n.tls;
  if (useFragment) stream.sockopt = { dialerProxy: 'fragment', tcpKeepAliveIdle: 100 };

  const proxy: Json =
    n.proto === 'vless'
      ? {
          tag: 'proxy',
          protocol: 'vless',
          settings: {
            vnext: [{ address: n.address, port: n.port, users: [{ id: cred.uuid, encryption: 'none' }] }],
          },
          streamSettings: stream,
        }
      : {
          tag: 'proxy',
          protocol: 'trojan',
          settings: { servers: [{ address: n.address, port: n.port, password: cred.trojanPassword }] },
          streamSettings: stream,
        };

  const outbounds: Json[] = [proxy];
  if (useFragment) {
    outbounds.push({
      tag: 'fragment',
      protocol: 'freedom',
      settings: {
        fragment: { packets: o.fragment.packets, length: o.fragment.length, interval: o.fragment.interval },
      },
      streamSettings: { sockopt: { tcpNoDelay: true, tcpKeepAliveIdle: 100 } },
    });
  }
  outbounds.push({ tag: 'direct', protocol: 'freedom' }, { tag: 'block', protocol: 'blackhole' });

  const rules: Json[] = [];
  if (o.rules.blockQuic) rules.push({ type: 'field', network: 'udp', port: '443', outboundTag: 'block' });
  if (o.rules.blockAds)
    rules.push({ type: 'field', domain: ['geosite:category-ads-all'], outboundTag: 'block' });
  if (o.rules.blockPorn)
    rules.push({ type: 'field', domain: ['geosite:category-porn'], outboundTag: 'block' });
  if (o.rules.iranDirect) {
    rules.push({ type: 'field', domain: ['domain:ir', 'geosite:category-ir'], outboundTag: 'direct' });
    rules.push({ type: 'field', ip: ['geoip:ir'], outboundTag: 'direct' });
  }
  rules.push({ type: 'field', ip: ['geoip:private'], outboundTag: 'direct' });

  return {
    remarks: n.name,
    log: { loglevel: 'warning' },
    dns: { servers: [o.dns, '8.8.8.8'], queryStrategy: 'UseIPv4' },
    inbounds: [
      {
        tag: 'socks',
        port: 10808,
        listen: '127.0.0.1',
        protocol: 'socks',
        settings: { auth: 'noauth', udp: true },
        sniffing: { enabled: true, destOverride: ['http', 'tls'], routeOnly: true },
      },
      { tag: 'http', port: 10809, listen: '127.0.0.1', protocol: 'http' },
    ],
    outbounds,
    routing: { domainStrategy: 'IPIfNonMatch', rules },
  };
}

export function toXray(nodes: SubNode[], cred: Cred, o: FormatOptions): string {
  return JSON.stringify(
    nodes.filter((n) => !n.info).map((n) => xrayConfigFor(n, cred, o)),
    null,
    2,
  );
}
