// Name resolution over Cloudflare's DoH JSON API (fetch to Cloudflare is allowed
// from Workers, unlike TCP connect). Results are cached per isolate.
import { TtlLru } from '../lib/lru';

const cache = new TtlLru<string, string[]>(2000, 5 * 60_000);
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export const isIpv4 = (s: string): boolean => IPV4.test(s);
export const isIp = (s: string): boolean => IPV4.test(s) || s.includes(':');

export async function resolve(
  name: string,
  type: 'A' | 'AAAA' = 'A',
  doh = 'https://cloudflare-dns.com/dns-query',
): Promise<string[]> {
  if (isIp(name)) return [name];
  const key = `${type}:${name}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const res = await fetch(`${doh}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: 'application/dns-json' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { Answer?: { type: number; data: string }[] };
    const want = type === 'A' ? 1 : 28;
    const out = (data.Answer ?? []).filter((a) => a.type === want).map((a) => a.data.trim());
    cache.set(key, out, out.length ? 5 * 60_000 : 60_000);
    return out;
  } catch {
    return [];
  }
}

/** Embeds an IPv4 address into a /96 NAT64 prefix, e.g. 64:ff9b::/96 + 1.2.3.4 → 64:ff9b::102:304. */
export function nat64Address(prefix: string, ipv4: string): string {
  const [a = 0, b = 0, c = 0, d = 0] = ipv4.split('.').map(Number);
  const hi = ((a << 8) | b).toString(16);
  const lo = ((c << 8) | d).toString(16);
  const p = prefix
    .replace(/\/\d+$/, '')
    .replace(/::$/, ':')
    .replace(/:$/, '');
  return `${p}::${hi}:${lo}`;
}
