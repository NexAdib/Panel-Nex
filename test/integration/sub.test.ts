import yaml from 'js-yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OperatorDto, UserDto } from '../../src/shared/types';
import { fromBase64, fromUtf8 } from '../../src/worker/lib/bytes';
import { type Installed, installAndLogin, startWorker, type TestWorker } from './harness';

const GB = 1024 ** 3;

describe('subscription endpoint', () => {
  let w: TestWorker;
  let inst: Installed;
  let user: UserDto;
  let path: string;

  const get = (p: string, headers: Record<string, string> = {}, cf?: Record<string, unknown>) =>
    w.fetch(p, { headers, ...(cf ? { cf } : {}) } as RequestInit);

  beforeAll(async () => {
    w = await startWorker();
    inst = await installAndLogin(w);
    const res = await inst.api<UserDto>('users', 'POST', { name: 'reza', dataLimit: 20 * GB, days: 30 });
    user = res.data;
    path = `/${inst.subPath}/${user.subToken}`;
  });
  afterAll(async () => {
    await w.dispose();
  });

  it('serves base64 links with subscription headers to v2rayNG', async () => {
    const res = await get(path, { 'user-agent': 'v2rayNG/1.9.46' });
    expect(res.status).toBe(200);
    expect(res.headers.get('subscription-userinfo')).toMatch(
      new RegExp(`^upload=0; download=0; total=${20 * GB}; expire=\\d{10}$`),
    );
    expect(res.headers.get('profile-update-interval')).toBe('12');
    expect(fromUtf8(fromBase64(res.headers.get('profile-title')!.slice(7)))).toBe('NexAdib | reza');
    expect(res.headers.get('profile-web-page-url')).toBe(`https://panel.example.com${path}`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const lines = fromUtf8(fromBase64(await res.text())).split('\n');
    expect(lines[0]).toMatch(/^vless:\/\/00000000-0000-4000-8000-000000000000@127\.0\.0\.1:1\?/);
    const real = lines.filter((l) => !l.includes('@127.0.0.1:1'));
    expect(real.length).toBeGreaterThanOrEqual(2);
    expect(real.some((l) => l.startsWith(`vless://${user.uuid}@panel.example.com:443?`))).toBe(true);
    expect(real.some((l) => l.startsWith(`trojan://${user.trojanPassword}@`))).toBe(true);
  });

  it('picks Clash, sing-box and Xray by user agent or ?f=', async () => {
    const clash = await get(path, { 'user-agent': 'clash-verge/v2.2.3' });
    expect(clash.headers.get('content-type')).toContain('yaml');
    const doc = yaml.load(await clash.text()) as { proxies: unknown[]; rules: string[] };
    expect(doc.proxies.length).toBeGreaterThan(2);
    const sb = await get(path, { 'user-agent': 'SFA/1.12.4' });
    const cfg = (await sb.json()) as { outbounds: { type: string }[] };
    expect(cfg.outbounds.some((o) => o.type === 'vless')).toBe(true);
    const xray = await get(`${path}?f=xray`, { 'user-agent': 'v2rayNG/1.9.46' });
    expect(Array.isArray(await xray.json())).toBe(true);
    const links = await get(`${path}?f=links&lang=en`, { 'user-agent': 'curl/8' });
    expect((await links.text()).split('\n')[0]).toContain(encodeURIComponent('📊 20 GB left'));
  });

  it('records the last client update', async () => {
    const { data } = await inst.api<UserDto>(`users/${user.id}`);
    expect(data.subUpdatedAt).toBeGreaterThan(Date.now() - 60_000);
    expect(data.subLastUa).toBe('v2rayNG/1.9.46');
  });

  it('shows the portal to browsers and hides unknown tokens behind the decoy', async () => {
    const browser = { 'user-agent': 'Mozilla/5.0 (Linux; Android 14)', accept: 'text/html,*/*' };
    const page = await get(path, browser);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'self'");
    const slash = await w.fetch(`${path}/`, { headers: browser, redirect: 'manual' });
    expect(slash.status).toBe(301);
    expect(slash.headers.get('location')).toBe(path);
    const decoy = await (await get('/definitely-not-here', browser)).text();
    for (const p of [`/${inst.subPath}/AAAAAAAAAAAAAAAAAAAAAA`, `/${inst.subPath}/`, `${path}/nope`]) {
      const r = await get(p, browser);
      expect(await r.text()).toBe(decoy);
    }
  });

  it('returns portal data and lets the subscriber pick an operator', async () => {
    const info = await get(`${path}/info`);
    const data = (await info.json()) as {
      user: { name: string; dataLimit: number };
      configs: { uri: string }[];
      operator: { current: string; list: { code: string }[]; saved: string | null };
      countries: { code: string }[];
    };
    expect(data.user).toMatchObject({ name: 'reza', dataLimit: 20 * GB });
    expect(data.configs.length).toBeGreaterThan(0);
    expect(data.operator.current).toBe('all');
    expect(data.operator.list.map((o) => o.code)).toContain('mci');
    expect(data.countries.map((c) => c.code)).toContain('DE');

    const noCsrf = await w.mf.dispatchFetch(`https://panel.example.com${path}/op`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'mci' }),
    });
    expect(noCsrf.status).toBe(403);
    const bad = await w.fetch(`${path}/op`, { method: 'POST', body: JSON.stringify({ op: 'nope' }) });
    expect(bad.status).toBe(400);
    const ok = await w.fetch(`${path}/op`, { method: 'POST', body: JSON.stringify({ op: 'mci' }) });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as typeof data).operator).toMatchObject({ current: 'mci', saved: 'mci' });
  });

  it('uses the operator clean IPs and detects the ISP from the ASN', async () => {
    const add = await inst.api<{ added: number; errors: string[] }>('operators/irancell/ips', 'POST', {
      text: '104.16.10.10 #fast\n[2606:4700::10]:2053, bogus!!\n104.16.10.10',
    });
    expect(add.data).toMatchObject({ added: 2, errors: ['bogus!!'] });
    const ops = await inst.api<{ items: OperatorDto[] }>('operators');
    expect(ops.data.items.find((o) => o.code === 'irancell')!.ips).toEqual({
      total: 2,
      enabled: 2,
      healthy: 2,
    });

    // saved choice (mci, no IPs → "all" list → host) wins over the ASN
    const saved = await get(`${path}?f=links`, { 'user-agent': 'x' }, { asn: 44244 });
    expect(await saved.text()).not.toContain('104.16.10.10');
    // ?op=auto ignores the saved choice and detects Irancell from AS44244
    const detected = await get(`${path}?f=links&op=auto`, { 'user-agent': 'x' }, { asn: 44244 });
    const text = await detected.text();
    expect(text).toContain('@104.16.10.10:');
    expect(text).toContain('@[2606:4700::10]:2053?');
    const info = (await (await get(`${path}/info?op=auto`, {}, { asn: 44244 })).json()) as {
      operator: { current: string; detected: string; source: string };
    };
    expect(info.operator).toMatchObject({ current: 'irancell', detected: 'irancell', source: 'asn' });
  });

  it('marks inactive subscriptions in the info nodes', async () => {
    await inst.api(`users/${user.id}/disable`, 'POST', {});
    const res = await get(`${path}?f=links&lang=en`, { 'user-agent': 'x' });
    expect(decodeURIComponent((await res.text()).split('\n')[0]!)).toContain('⛔ Subscription disabled');
  });
});
