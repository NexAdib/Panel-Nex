// Parses pasted clean-IP lists: one entry per line or separated by commas/spaces.
//   104.16.1.1   104.16.1.1:2053   [2606:4700::1]:443   2606:4700::1   cdn.example.com:8443   … #label
export interface ParsedIp {
  address: string;
  port: number;
  label: string;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function isIpv6(s: string): boolean {
  if (!/^[0-9a-f:.]+$/i.test(s) || !s.includes(':')) return false;
  const parts = s.split('::');
  if (parts.length > 2) return false;
  const groups = s.split(':').filter((g) => g !== '');
  return groups.length <= 8 && groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g) || IPV4.test(g));
}

function parseToken(tok: string): { address: string; port: number } | null {
  let address = tok;
  let port = 0;
  const bracket = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(tok);
  if (bracket) {
    address = bracket[1]!;
    port = bracket[2] ? Number(bracket[2]) : 0;
    if (!isIpv6(address)) return null;
  } else if (isIpv6(tok)) {
    address = tok;
  } else {
    const m = /^([^:]+)(?::(\d{1,5}))?$/.exec(tok);
    if (!m) return null;
    address = m[1]!;
    port = m[2] ? Number(m[2]) : 0;
    if (!IPV4.test(address) && !HOST.test(address)) return null;
  }
  if (port < 0 || port > 65535) return null;
  return { address: address.toLowerCase(), port };
}

export function parseIpList(text: string, max = 500): { items: ParsedIp[]; errors: string[] } {
  const items: ParsedIp[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const [body = '', ...rest] = raw.split('#');
    const label = rest.join('#').trim().slice(0, 60);
    for (const tok of body.split(/[\s,;]+/).filter(Boolean)) {
      const p = parseToken(tok.trim());
      if (!p) {
        if (errors.length < 20) errors.push(tok.slice(0, 60));
        continue;
      }
      const key = `${p.address}|${p.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ ...p, label });
      if (items.length >= max) return { items, errors };
    }
  }
  return { items, errors };
}
