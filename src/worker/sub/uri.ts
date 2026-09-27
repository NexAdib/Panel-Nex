// v2rayN-style share links, base64-encoded as a subscription body.
import { b64Utf8 } from '../lib/bytes';
import type { Cred, FormatOptions } from './common';
import type { SubNode } from './nodes';

const INFO_UUID = '00000000-0000-4000-8000-000000000000';

export function nodeUri(n: SubNode, cred: Cred, o: FormatOptions): string {
  const q = new URLSearchParams();
  if (n.proto === 'vless') q.set('encryption', 'none');
  q.set('security', n.tls ? 'tls' : 'none');
  if (n.tls) {
    q.set('sni', n.host);
    q.set('fp', o.fingerprint);
    if (o.alpn) q.set('alpn', o.alpn);
  }
  q.set('type', 'ws');
  q.set('host', n.host);
  q.set('path', o.earlyData ? `${n.path}?ed=${o.earlyData}` : n.path);
  const addr = n.address.includes(':') ? `[${n.address}]` : n.address;
  const secret = n.info
    ? INFO_UUID
    : n.proto === 'vless'
      ? cred.uuid
      : encodeURIComponent(cred.trojanPassword);
  return `${n.proto}://${secret}@${addr}:${n.port}?${q.toString().replace(/\+/g, '%20')}#${encodeURIComponent(n.name)}`;
}

export function toBase64Sub(nodes: SubNode[], cred: Cred, o: FormatOptions): string {
  return b64Utf8(nodes.map((n) => nodeUri(n, cred, o)).join('\n'));
}
