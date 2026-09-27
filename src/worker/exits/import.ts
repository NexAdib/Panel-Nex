import type { ExitType } from '../db/exits';

export interface ParsedExit {
  type: ExitType;
  address: string;
  port: number;
  username: string | null;
  password: string | null;
  label: string;
}

const HOST =
  /^(\d{1,3}(\.\d{1,3}){3}|[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+)$/i;

function splitHostPort(s: string): { host: string; port: number } | null {
  const v6 = /^\[([0-9a-f:]+)\](?::(\d{1,5}))?$/i.exec(s);
  if (v6) return { host: v6[1]!.toLowerCase(), port: v6[2] ? Number(v6[2]) : 0 };
  if (/^[0-9a-f:]+$/i.test(s) && s.split(':').length > 2) return { host: s.toLowerCase(), port: 0 };
  const m = /^([^:]+)(?::(\d{1,5}))?$/.exec(s);
  if (!m || !HOST.test(m[1]!)) return null;
  const port = m[2] ? Number(m[2]) : 0;
  if (port > 65535) return null;
  return { host: m[1]!.toLowerCase(), port };
}

/**
 * One endpoint per line:
 *   1.2.3.4 · 1.2.3.4:443 · relay.example.com · [2001:db8::1]:443
 *   socks5://user:pass@host:1080 · http://user:pass@host:8080
 * An optional "#label" suffix names the endpoint. Invalid lines are returned in `errors`.
 */
export function parseExitList(text: string): { items: ParsedExit[]; errors: string[] } {
  const items: ParsedExit[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    const hashAt = line.indexOf('#');
    const label =
      hashAt >= 0
        ? line
            .slice(hashAt + 1)
            .trim()
            .slice(0, 60)
        : '';
    const body = (hashAt >= 0 ? line.slice(0, hashAt) : line).trim();
    let item: ParsedExit | null = null;
    const scheme = /^(socks5h?|socks|http):\/\/(.+)$/i.exec(body);
    if (scheme) {
      const type: ExitType = scheme[1]!.toLowerCase().startsWith('socks') ? 'socks5' : 'http';
      let rest = scheme[2]!.replace(/\/.*$/, '');
      let username: string | null = null;
      let password: string | null = null;
      const at = rest.lastIndexOf('@');
      if (at >= 0) {
        const cred = rest.slice(0, at);
        rest = rest.slice(at + 1);
        const colon = cred.indexOf(':');
        username = decodeURIComponent(colon >= 0 ? cred.slice(0, colon) : cred);
        password = colon >= 0 ? decodeURIComponent(cred.slice(colon + 1)) : null;
      }
      const hp = splitHostPort(rest);
      if (hp?.port) item = { type, address: hp.host, port: hp.port, username, password, label };
    } else {
      const hp = splitHostPort(body);
      if (hp)
        item = { type: 'proxyip', address: hp.host, port: hp.port, username: null, password: null, label };
    }
    if (!item) {
      errors.push(line.slice(0, 80));
      continue;
    }
    const key = `${item.type}|${item.address}|${item.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return { items, errors };
}
