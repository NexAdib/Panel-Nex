import { describe, expect, it } from 'vitest';
import { parseTrace } from '../../src/worker/exits/health';
import { parseExitList } from '../../src/worker/exits/import';
import { addressBlock } from '../../src/worker/exits/net';
import { nat64Address } from '../../src/worker/exits/resolve';
import { hash32, hrwOrder } from '../../src/worker/exits/select';
import { DomainSet } from '../../src/worker/policy/domains';

describe('rendezvous hashing', () => {
  const endpoints = Array.from({ length: 6 }, (_, i) => `e${i}`);
  const users = Array.from({ length: 600 }, (_, i) => `u${i}`);

  it('is deterministic and spreads users', () => {
    const pick = (u: string, list: string[]) => hrwOrder(list, u, (x) => x)[0];
    expect(pick('u1', endpoints)).toBe(pick('u1', [...endpoints].reverse()));
    const counts = new Map<string, number>();
    for (const u of users) counts.set(pick(u, endpoints)!, (counts.get(pick(u, endpoints)!) ?? 0) + 1);
    for (const n of counts.values()) expect(n).toBeGreaterThan(50);
  });

  it('only moves users of a removed endpoint', () => {
    const pick = (u: string, list: string[]) => hrwOrder(list, u, (x) => x)[0];
    const without = endpoints.filter((e) => e !== 'e3');
    let moved = 0;
    for (const u of users) {
      const before = pick(u, endpoints);
      const after = pick(u, without);
      if (before !== 'e3') expect(after).toBe(before);
      else moved++;
    }
    expect(moved).toBeGreaterThan(0);
    expect(hash32('a')).not.toBe(hash32('b'));
  });
});

describe('exit list import', () => {
  it('parses every supported form', () => {
    const { items, errors } = parseExitList(`
      1.2.3.4
      5.6.7.8:443 #Frankfurt
      relay.Example.com
      [2001:db8::1]:8443
      socks5://bob:p%40ss@10.0.0.1:1080 #home
      http://proxy.example.net:3128
      socks5://nopass@10.0.0.2:1080
      not a host
      1.2.3.4
    `);
    expect(errors).toEqual(['not a host']);
    expect(items).toHaveLength(7);
    expect(items[0]).toMatchObject({ type: 'proxyip', address: '1.2.3.4', port: 0 });
    expect(items[1]).toMatchObject({ port: 443, label: 'Frankfurt' });
    expect(items[2]).toMatchObject({ address: 'relay.example.com' });
    expect(items[3]).toMatchObject({ address: '2001:db8::1', port: 8443 });
    expect(items[4]).toMatchObject({
      type: 'socks5',
      username: 'bob',
      password: 'p@ss',
      port: 1080,
      label: 'home',
    });
    expect(items[5]).toMatchObject({
      type: 'http',
      address: 'proxy.example.net',
      port: 3128,
      username: null,
    });
    expect(items[6]).toMatchObject({ username: 'nopass', password: null });
  });
});

describe('helpers', () => {
  it('parses cdn-cgi/trace bodies', () => {
    expect(parseTrace('fl=1\nh=www.cloudflare.com\nip=203.0.113.9\nts=1\nloc=de\ncolo=FRA\n')).toEqual({
      ip: '203.0.113.9',
      loc: 'DE',
    });
  });

  it('maps IPv4 into NAT64 prefixes', () => {
    expect(nat64Address('64:ff9b::', '1.2.3.4')).toBe('64:ff9b::102:304');
    expect(nat64Address('2602:fc59:b0:64::/96', '192.0.2.33')).toBe('2602:fc59:b0:64::c000:221');
  });

  it('matches domain suffixes', () => {
    const s = new DomainSet(['openai.com', '*.claude.ai', 'labs.google']);
    expect(s.has('chat.openai.com')).toBe(true);
    expect(s.has('openai.com')).toBe(true);
    expect(s.has('notopenai.com')).toBe(false);
    expect(s.has('api.claude.ai')).toBe(true);
    expect(s.has('labs.google')).toBe(true);
    expect(s.has('google')).toBe(false);
  });

  it('builds SOCKS5 address blocks', () => {
    expect([...addressBlock('1.2.3.4')]).toEqual([1, 1, 2, 3, 4]);
    expect([...addressBlock('ab.c')]).toEqual([3, 4, 97, 98, 46, 99]);
    const v6 = addressBlock('2001:db8::1');
    expect(v6[0]).toBe(4);
    expect(v6.length).toBe(17);
    expect([...v6.slice(1, 5)]).toEqual([0x20, 0x01, 0x0d, 0xb8]);
    expect(v6[16]).toBe(1);
  });
});
