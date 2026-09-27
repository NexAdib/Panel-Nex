import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/shared/settings';
import type { Operator } from '../../src/worker/db/operators';
import { fromBase64, fromUtf8 } from '../../src/worker/lib/bytes';
import { toClash } from '../../src/worker/sub/clash';
import { type Cred, type FormatOptions, MAIN_GROUP } from '../../src/worker/sub/common';
import { formatFromParam, formatFromUa, isBrowser } from '../../src/worker/sub/detect';
import { subHeaders, subscriptionUserinfo } from '../../src/worker/sub/headers';
import { buildNodes, infoNames, type NodeContext, type SubUser } from '../../src/worker/sub/nodes';
import { CLIENT_DOH, chooseOperator, configHosts } from '../../src/worker/sub/service';
import { toSingbox } from '../../src/worker/sub/singbox';
import { nodeUri, toBase64Sub } from '../../src/worker/sub/uri';
import { toXray } from '../../src/worker/sub/xray';
import { toYaml } from '../../src/worker/sub/yaml';

const cred: Cred = { uuid: '2f7c6a1e-6c1b-4c5e-9a53-0f6f6f1d2b3c', trojanPassword: 'p@ss:w/rd#1 ?' };

function user(over: Partial<SubUser> = {}): SubUser {
  return {
    name: 'ali',
    uuid: cred.uuid,
    trojanPassword: cred.trojanPassword,
    allowedExits: ['*'],
    dataLimit: 50 * 1024 ** 3,
    used: 12.5 * 1024 ** 3,
    expireAt: Date.now() + 23.5 * 86_400_000,
    status: 'active',
    durationDays: 30,
    ...over,
  };
}

function ctx(over: Partial<NodeContext> = {}): NodeContext {
  const s = defaultSettings();
  s.general.wsPath = 'wspath123';
  return {
    user: user(),
    hosts: ['a.example.com'],
    general: s.general,
    proxy: s.proxy,
    sub: s.sub,
    exits: s.exits,
    operator: null,
    cleanIps: [],
    lang: 'fa',
    ...over,
  };
}

function opts(over: Partial<FormatOptions> = {}): FormatOptions {
  const s = defaultSettings();
  return {
    fingerprint: 'chrome',
    alpn: 'http/1.1',
    earlyData: 2560,
    fragment: s.sub.fragment,
    rules: { iranDirect: true, blockQuic: true, blockAds: true, blockPorn: true },
    dns: CLIENT_DOH,
    ...over,
  };
}

const op = (code: string, asns: number[], enabled = true): Operator => ({
  code,
  nameFa: code,
  nameEn: code,
  asns,
  enabled,
  sort: 0,
  config: {},
});

describe('node builder', () => {
  it('builds Auto plus one group per allowed country with info nodes first', () => {
    const nodes = buildNodes(ctx({ user: user({ allowedExits: ['DE', 'TR'] }) }));
    const info = nodes.filter((n) => n.info);
    expect(info).toHaveLength(2);
    expect(nodes[0]!.info).toBe(true);
    const groups = [...new Set(nodes.filter((n) => !n.info).map((n) => n.group))];
    expect(groups).toEqual(['⚡ خودکار', '🇹🇷 ترکیه', '🇩🇪 آلمان']);
    const de = nodes.find((n) => n.country === 'DE')!;
    expect(de.path).toBe('/wspath123/de');
    expect(nodes.find((n) => !n.info && !n.country)!.path).toBe('/wspath123');
    expect(new Set(nodes.map((n) => n.name)).size).toBe(nodes.length);
  });

  it('spreads clean IPs, rotates protocols and honours operator ports and caps', () => {
    const c = ctx({
      cleanIps: [
        { address: '104.16.1.1', port: 0 },
        { address: '2606:4700::1', port: 2053 },
        { address: '104.16.3.3', port: 0 },
        { address: '104.16.4.4', port: 0 },
      ],
      operator: { ...op('mci', [197207]), config: { ports: [8443, 9999] } },
    });
    c.sub.ipsPerOperator = 3;
    c.sub.includeCountries = false;
    const nodes = buildNodes(c).filter((n) => !n.info);
    expect(nodes.map((n) => n.address)).toEqual(['104.16.1.1', '2606:4700::1', '104.16.3.3']);
    expect(nodes.map((n) => n.port)).toEqual([8443, 2053, 8443]);
    expect(nodes.map((n) => n.proto)).toEqual(['vless', 'trojan', 'vless']);
    c.sub.maxNodes = 2;
    expect(buildNodes(c).filter((n) => !n.info)).toHaveLength(2);
  });

  it('returns nothing without a protocol or host', () => {
    const c = ctx();
    c.proxy.vless = false;
    c.proxy.trojan = false;
    expect(buildNodes(c)).toEqual([]);
    expect(buildNodes(ctx({ hosts: [] }))).toEqual([]);
  });

  it('describes usage and status in info names', () => {
    const [data, time] = infoNames(user(), 'en');
    expect(data).toMatch(/^📊 37\.5 GB left$/);
    expect(time).toMatch(/^⏳ 24 days left$/);
    expect(infoNames(user({ dataLimit: 0, expireAt: null }), 'en')).toEqual([
      '📊 Unlimited data',
      '⏳ No expiry',
    ]);
    expect(infoNames(user({ status: 'limited' }), 'fa')[0]).toContain('حجم تمام شده');
    expect(infoNames(user({ status: 'on_hold', expireAt: null }), 'en')[1]).toBe('⏳ 30 days from first use');
  });
});

describe('share links', () => {
  const [node] = buildNodes(ctx({ cleanIps: [{ address: '2606:4700::1', port: 0 }] })).filter((n) => !n.info);

  it('builds a valid VLESS URI', () => {
    const uri = nodeUri({ ...node!, proto: 'vless' }, cred, opts());
    const u = new URL(uri);
    expect(u.protocol).toBe('vless:');
    expect(u.username).toBe(cred.uuid);
    expect(u.hostname).toBe('[2606:4700::1]');
    expect(u.port).toBe('443');
    expect(u.searchParams.get('encryption')).toBe('none');
    expect(u.searchParams.get('security')).toBe('tls');
    expect(u.searchParams.get('sni')).toBe('a.example.com');
    expect(u.searchParams.get('host')).toBe('a.example.com');
    expect(u.searchParams.get('type')).toBe('ws');
    expect(u.searchParams.get('fp')).toBe('chrome');
    expect(u.searchParams.get('path')).toBe('/wspath123?ed=2560');
    expect(decodeURIComponent(u.hash.slice(1))).toBe(node!.name);
  });

  it('escapes Trojan passwords and plain-port nodes drop TLS params', () => {
    const uri = nodeUri({ ...node!, proto: 'trojan', tls: false, port: 80 }, cred, opts());
    const u = new URL(uri);
    expect(decodeURIComponent(u.username)).toBe(cred.trojanPassword);
    expect(u.searchParams.get('security')).toBe('none');
    expect(u.searchParams.has('sni')).toBe(false);
    expect(u.searchParams.has('encryption')).toBe(false);
  });

  it('base64 body decodes to one link per node', () => {
    const nodes = buildNodes(ctx());
    const lines = fromUtf8(fromBase64(toBase64Sub(nodes, cred, opts()))).split('\n');
    expect(lines).toHaveLength(nodes.length);
    expect(lines.every((l) => /^(vless|trojan):\/\//.test(l))).toBe(true);
    // info nodes never carry the real credential
    expect(lines[0]).toContain('127.0.0.1:1');
    expect(lines[0]).not.toContain(cred.uuid);
  });
});

describe('yaml emitter', () => {
  it('round-trips awkward strings and shapes', () => {
    const doc = {
      plain: 'yes',
      tricky: ['null', '123', '- dash', 'a: b', '#hash', "it's", 'line\nbreak', '🇩🇪 آلمان | 443', ''],
      'weird key: x': true,
      nested: { list: [{ a: 1, b: [1, 2], c: { d: 'e' } }, { a: 2 }], empty: [] as string[] },
      num: 7890,
      nothing: null,
      skipped: undefined,
    };
    const parsed = yaml.load(toYaml(doc)) as Record<string, unknown>;
    const { skipped: _, ...expected } = doc;
    expect(parsed).toEqual(expected);
  });
});

describe('clash / mihomo', () => {
  it('produces a consistent config', () => {
    const nodes = buildNodes(ctx({ user: user({ name: 'x"y: z #1' }) }));
    const doc = yaml.load(toClash(nodes, cred, opts())) as {
      proxies: {
        name: string;
        type: string;
        uuid?: string;
        password?: string;
        'ws-opts': { path: string };
      }[];
      'proxy-groups': { name: string; type: string; proxies: string[] }[];
      rules: string[];
      dns: { nameserver: string[] };
    };
    const names = new Set(doc.proxies.map((p) => p.name));
    const groupNames = new Set(doc['proxy-groups'].map((g) => g.name));
    for (const g of doc['proxy-groups']) {
      for (const p of g.proxies) expect(names.has(p) || groupNames.has(p) || p === 'DIRECT').toBe(true);
    }
    expect(doc['proxy-groups'][0]!.name).toBe(MAIN_GROUP);
    expect(doc.rules.at(-1)).toBe(`MATCH,${MAIN_GROUP}`);
    expect(doc.rules).toContain('AND,((NETWORK,UDP),(DST-PORT,443)),REJECT');
    expect(doc.dns.nameserver[0]).toBe(`${CLIENT_DOH}#${MAIN_GROUP}`);
    const real = doc.proxies.find((p) => p.type === 'vless' && p.uuid === cred.uuid)!;
    expect(real['ws-opts'].path.startsWith('/wspath123')).toBe(true);
    expect(doc.proxies.find((p) => p.type === 'trojan')!.password).toBe(cred.trojanPassword);
  });
});

describe('sing-box', () => {
  it('references only defined outbounds and rule sets', () => {
    const nodes = buildNodes(ctx());
    const cfg = JSON.parse(toSingbox(nodes, cred, opts())) as {
      outbounds: { tag: string; type: string; outbounds?: string[] }[];
      route: {
        rules: { rule_set?: string[]; outbound?: string }[];
        rule_set: { tag: string }[];
        final: string;
      };
      dns: { servers: { tag: string; detour?: string }[]; final: string };
    };
    const tags = new Set(cfg.outbounds.map((o) => o.tag));
    expect(tags.size).toBe(cfg.outbounds.length);
    for (const o of cfg.outbounds) for (const t of o.outbounds ?? []) expect(tags.has(t)).toBe(true);
    const sets = new Set(cfg.route.rule_set.map((r) => r.tag));
    for (const r of cfg.route.rules) {
      for (const t of r.rule_set ?? []) expect(sets.has(t)).toBe(true);
      if (r.outbound) expect(tags.has(r.outbound)).toBe(true);
    }
    expect(tags.has(cfg.route.final)).toBe(true);
    for (const s of cfg.dns.servers) if (s.detour) expect(tags.has(s.detour)).toBe(true);
    expect(cfg.outbounds.some((o) => o.tag.startsWith('📊'))).toBe(false);
  });
});

describe('xray', () => {
  it('emits one full config per real node, with fragment when enabled', () => {
    const nodes = buildNodes(ctx());
    const frag = { enabled: true, packets: 'tlshello', length: '10-30', interval: '10-20' };
    const list = JSON.parse(toXray(nodes, cred, opts({ fragment: frag }))) as {
      remarks: string;
      outbounds: { tag: string; protocol: string; streamSettings?: { sockopt?: { dialerProxy?: string } } }[];
    }[];
    expect(list).toHaveLength(nodes.filter((n) => !n.info).length);
    const first = list[0]!;
    expect(first.outbounds[0]!.tag).toBe('proxy');
    expect(first.outbounds[0]!.streamSettings!.sockopt!.dialerProxy).toBe('fragment');
    expect(first.outbounds.some((o) => o.tag === 'fragment' && o.protocol === 'freedom')).toBe(true);
    const plain = JSON.parse(toXray(nodes, cred, opts())) as typeof list;
    expect(plain[0]!.outbounds.some((o) => o.tag === 'fragment')).toBe(false);
  });
});

describe('format detection', () => {
  it.each([
    ['clash-verge/v2.2.3', 'clash'],
    ['FlClash/v0.8.80 clash-verge Platform/android', 'clash'],
    ['ClashMetaForAndroid/2.11.5.Meta', 'clash'],
    ['mihomo/1.19.0', 'clash'],
    ['Stash/2.4.7 Clash/1.9.0', 'clash'],
    ['SFA/1.12.4 (Android 14; sing-box 1.12.4)', 'singbox'],
    ['SFI/1.12.0', 'singbox'],
    ['HiddifyNext/2.5.7 (android) like ClashMeta v2ray sing-box', 'b64'],
    ['v2rayNG/1.9.46', 'b64'],
    ['v2rayN/7.13.2', 'b64'],
    ['Shadowrocket/2070 CFNetwork/1410.0.3 Darwin/22.6.0', 'b64'],
    ['Happ/1.5.2', 'b64'],
    ['', 'b64'],
  ])('%s → %s', (ua, want) => {
    expect(formatFromUa(ua)).toBe(want);
  });

  it('honours ?f= aliases and detects browsers', () => {
    expect(formatFromParam('sing-box')).toBe('singbox');
    expect(formatFromParam('YAML')).toBe('clash');
    expect(formatFromParam('nope')).toBeNull();
    const browser = new Request('https://x/', {
      headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14)', accept: 'text/html,*/*' },
    });
    const app = new Request('https://x/', {
      headers: { 'user-agent': 'Mozilla/5.0 v2rayNG/1.9', accept: 'text/html' },
    });
    expect(isBrowser(browser)).toBe(true);
    expect(isBrowser(app)).toBe(false);
  });
});

describe('headers and operator choice', () => {
  it('formats userinfo and profile headers', () => {
    expect(subscriptionUserinfo({ up: 1, down: 2, total: 0, expireAt: null })).toBe(
      'upload=1; download=2; total=0; expire=0',
    );
    const h = subHeaders(
      {
        up: 0,
        down: 5,
        total: 10,
        expireAt: 1_800_000_000_500,
        title: 'NexAdib | علی',
        updateHours: 12,
        supportUrl: 'https://t.me/support',
        pageUrl: 'https://s.example.com/sub/tok',
        filename: 'NexAdib-علی',
      },
      'text/plain',
    );
    expect(h.get('subscription-userinfo')).toBe('upload=0; download=5; total=10; expire=1800000000');
    expect(fromUtf8(fromBase64(h.get('profile-title')!.slice(7)))).toBe('NexAdib | علی');
    expect(h.get('content-disposition')).toContain("filename*=UTF-8''NexAdib-%D8%B9%D9%84%DB%8C");
    expect(h.get('support-url')).toBe('https://t.me/support');
  });

  it('chooses operators in the documented order', () => {
    const ops = [op('all', []), op('mci', [197207]), op('irancell', [44244]), op('off', [1], false)];
    expect(chooseOperator(ops, 'irancell', 'mci', 197207).operator?.code).toBe('irancell');
    expect(chooseOperator(ops, null, 'mci', 44244)).toMatchObject({
      source: 'saved',
      detected: { code: 'irancell' },
    });
    expect(chooseOperator(ops, 'auto', 'mci', 44244).source).toBe('asn');
    expect(chooseOperator(ops, 'off', null, 1).operator?.code).toBe('all');
    expect(chooseOperator([], null, null, null).operator).toBeNull();
  });

  it('expands wildcard hosts deterministically', () => {
    const g = defaultSettings().general;
    g.domains = ['*.example.com', 'b.example.org'];
    const a = configHosts(g, 'req.host', 'seed');
    expect(a[0]).toMatch(/^[a-z0-9]{6,8}\.example\.com$/);
    expect(a[1]).toBe('b.example.org');
    expect(configHosts(g, 'req.host', 'seed')).toEqual(a);
    expect(configHosts(defaultSettings().general, 'req.host', 'seed')).toEqual(['req.host']);
  });
});
