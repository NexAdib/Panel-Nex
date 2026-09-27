import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Installed, installAndLogin, startWorker, type TestWorker } from './harness';

describe('install and auth', () => {
  let w: TestWorker;
  let inst: Installed;

  beforeAll(async () => {
    w = await startWorker();
  });
  afterAll(async () => {
    await w.dispose();
  });

  it('serves the decoy and install status before setup', async () => {
    expect((await w.fetch('/')).status).toBe(200);
    expect(await (await w.fetch('/')).text()).toContain('nginx');
    const s = await (await w.fetch('/api/install/status')).json();
    expect(s).toMatchObject({ installed: false, needsToken: false });
  });

  it('rejects install without the CSRF header', async () => {
    const res = await w.fetch('/api/install', {
      method: 'GET',
    });
    expect(res.status).toBe(404);
  });

  it('installs once and hides /install afterwards', async () => {
    inst = await installAndLogin(w);
    expect(inst.panel).toMatch(/^\/[a-z0-9]{14}\/$/);
    const again = await w.fetch('/api/install', {
      method: 'POST',
      body: JSON.stringify({ username: 'evil', password: 'another-pass-1' }),
    });
    expect(again.status).toBe(404);
    expect((await w.fetch('/install')).status).toBe(404);
  });

  it('requires a session for private APIs', async () => {
    const res = await w.fetch(`${inst.panel}api/auth/me`);
    expect(res.status).toBe(401);
    const me = await inst.api('auth/me');
    expect(me.status).toBe(200);
    expect(me.data).toMatchObject({ username: 'owner', totpEnabled: false });
  });

  it('blocks mutations without the CSRF header', async () => {
    const res = await w.mf.dispatchFetch(`https://panel.example.com${inst.panel}api/auth/logout`, {
      method: 'POST',
      headers: { cookie: `nx_s=${inst.cookie}` },
    });
    expect(res.status).toBe(403);
  });

  it('locks out after repeated failures', async () => {
    const bad = () =>
      w.fetch(`${inst.panel}api/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
        headers: { 'cf-connecting-ip': '198.51.100.9' },
      });
    for (let i = 0; i < 5; i++) expect((await bad()).status).toBe(401);
    const locked = await bad();
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('logs in and out', async () => {
    const res = await w.fetch(`${inst.panel}api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username: 'OWNER', password: 'correct-horse-9' }),
      headers: { 'cf-connecting-ip': '192.0.2.44' },
    });
    expect(res.status).toBe(200);
    const cookie = /nx_s=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
    expect(res.headers.get('set-cookie')).toContain(`Path=${inst.panel.slice(0, -1)}`);
    expect(res.headers.get('set-cookie')).toContain('SameSite=Strict');
    const out = await w.fetch(`${inst.panel}api/auth/logout`, { method: 'POST', cookie });
    expect(out.status).toBe(200);
    expect((await w.fetch(`${inst.panel}api/auth/me`, { cookie })).status).toBe(401);
  });

  it('unknown paths look like nginx', async () => {
    const res = await w.fetch('/wp-admin');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('nginx');
  });
});
