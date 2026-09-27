import { createServer, type Server } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OverviewDto, UserDto, UserUsageDto } from '../../src/shared/types';
import { collect, openWs, vlessHeader } from './clients';
import { type Installed, installAndLogin, startWorker, type TestWorker } from './harness';

const DAY = 86_400_000;

interface Maint {
  ran: boolean;
  journalRows: number;
  limited: number;
  expired: number;
  resets: number;
}

describe('usage aggregation and limits', () => {
  let echo: Server;
  let echoPort = 0;
  let w: TestWorker;
  let inst: Installed;
  let wsPath = '';
  let db: D1Database;

  /** Runs maintenance, retrying while a lazy run holds the lock. */
  async function maintain(): Promise<Maint> {
    for (let i = 0; i < 20; i++) {
      const { data } = await inst.api<Maint>('system/maintenance', 'POST');
      if (data.ran) return data;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('maintenance lock never freed');
  }

  async function send(user: UserDto, bytes: number): Promise<{ closed: boolean; reason?: string }> {
    const ws = await openWs(w, `/${wsPath}`);
    const payload = Buffer.alloc(bytes, 1);
    const got = collect(ws, 2 + 5 + bytes, 3000);
    ws.send(new Uint8Array(Buffer.concat([vlessHeader(user.uuid, '127.0.0.1', echoPort), payload])));
    const r = await got;
    ws.close(1000);
    await new Promise((res) => setTimeout(res, 250));
    return r;
  }

  const row = (id: number) =>
    db
      .prepare(
        'SELECT status, used_up, used_down, lifetime_used, last_online_at, last_reset_at FROM users WHERE id = ?1',
      )
      .bind(id)
      .first<{
        status: string;
        used_up: number;
        used_down: number;
        lifetime_used: number;
        last_online_at: number | null;
        last_reset_at: number;
      }>();

  beforeAll(async () => {
    echo = createServer((sock) => {
      sock.on('data', (d) => sock.write(Buffer.concat([Buffer.from('echo:'), d])));
      sock.on('error', () => {});
    });
    await new Promise<void>((r) => echo.listen(0, '127.0.0.1', r));
    echoPort = (echo.address() as { port: number }).port;
    w = await startWorker({ USAGE_FLUSH_MS: '0' });
    inst = await installAndLogin(w);
    wsPath = (await inst.api<{ value: { wsPath: string } }>('settings/general')).data.value.wsPath;
    db = (await w.mf.getD1Database('DB')) as unknown as D1Database;
  });
  afterAll(async () => {
    await w.dispose();
    echo.close();
  });

  it('folds journaled bytes into users, daily stats and IPs exactly once', async () => {
    const u = (await inst.api<UserDto>('users', 'POST', { name: 'counted', dataLimit: 0, days: 30 })).data;
    await send(u, 3000);
    await send(u, 1000);
    const pending = await db.prepare('SELECT COUNT(*) AS n FROM usage_journal').first<{ n: number }>();
    expect(pending!.n).toBeGreaterThan(0);

    // Concurrent runs: the lease lock and run token must not double count.
    const runs = await Promise.all([0, 1, 2].map(() => inst.api<Maint>('system/maintenance', 'POST')));
    expect(runs.filter((r) => r.data.ran).length).toBeGreaterThanOrEqual(1);
    await maintain();

    const r = (await row(u.id))!;
    expect(r.used_up).toBe(4000);
    expect(r.used_down).toBe(4010);
    expect(r.lifetime_used).toBe(8010);
    expect(r.last_online_at).toBeGreaterThan(Date.now() - 60_000);
    const left = await db.prepare('SELECT COUNT(*) AS n FROM usage_journal').first<{ n: number }>();
    expect(left!.n).toBe(0);

    const usage = (await inst.api<UserUsageDto>(`users/${u.id}/usage`)).data;
    expect(usage.daily).toHaveLength(30);
    expect(usage.daily.at(-1)).toMatchObject({ up: 4000, down: 4010 });
    expect(usage.ips.map((i) => i.ip)).toContain('127.0.0.1');

    // Editing the user afterwards keeps the aggregated counters.
    await inst.api(`users/${u.id}`, 'PATCH', { note: 'vip' });
    expect((await row(u.id))!.used_up).toBe(4000);
  });

  it('ignores journal rows that another runner already applied', async () => {
    const u = (await inst.api<UserDto>('users', 'POST', { name: 'racer', dataLimit: 0 })).data;
    const payload = JSON.stringify({ v: 1, c: 1, b: 0, u: [[u.id, 100, 200, []]] });
    await db
      .prepare('INSERT INTO usage_journal (created_at, data) VALUES (?1, ?2)')
      .bind(Date.now(), payload)
      .run();
    await maintain();
    // A stale runner that read the same rows would now find them gone; replaying
    // its batch guard shows no token gets recorded.
    const guard = await db
      .prepare(
        `INSERT INTO meta (k, v) SELECT 'agg_token', 'stale'
         WHERE (SELECT COUNT(*) FROM usage_journal WHERE id <= 999999) = 1
         ON CONFLICT(k) DO UPDATE SET v = excluded.v`,
      )
      .run();
    expect(guard.meta.changes).toBe(0);
    const r = (await row(u.id))!;
    expect([r.used_up, r.used_down]).toEqual([100, 200]);
  });

  it('marks users limited once their quota is used and cuts new connections', async () => {
    const u = (await inst.api<UserDto>('users', 'POST', { name: 'capped', dataLimit: 5000, days: 30 })).data;
    const first = await send(u, 3000);
    expect(first.closed).toBe(false);
    const m = await maintain();
    expect(m.limited).toBeGreaterThanOrEqual(1);
    expect((await row(u.id))!.status).toBe('limited');
    const log = await db
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user_limited' AND target = ?1`)
      .bind(`user:${u.id}`)
      .first<{ n: number }>();
    expect(log!.n).toBe(1);
    const again = await send(u, 10);
    expect(again.closed).toBe(true);
    expect(again.reason).toBe('limited');
  });

  it('expires users and applies periodic resets', async () => {
    const now = Date.now();
    const mk = async (name: string, reset: string) =>
      (await inst.api<UserDto>('users', 'POST', { name, dataLimit: 10_000, days: 30, resetStrategy: reset }))
        .data;
    const exp = await mk('expiring', 'none');
    const daily = await mk('daily', 'daily');
    const weekly = await mk('weekly', 'weekly');
    const monthly = await mk('monthly', 'monthly');
    await db.batch([
      db.prepare('UPDATE users SET expire_at = ?2 WHERE id = ?1').bind(exp.id, now - 1000),
      db
        .prepare('UPDATE users SET used_up = 500, used_down = 500, last_reset_at = ?2 WHERE id = ?1')
        .bind(daily.id, now - 2 * DAY),
      db
        .prepare('UPDATE users SET used_up = 500, used_down = 500, last_reset_at = ?2 WHERE id = ?1')
        .bind(weekly.id, now - 8 * DAY),
      db
        .prepare(
          `UPDATE users SET used_up = 9000, used_down = 2000, status = 'limited', last_reset_at = ?2 WHERE id = ?1`,
        )
        .bind(monthly.id, now - 31 * DAY),
    ]);
    const m = await maintain();
    expect(m.expired).toBeGreaterThanOrEqual(1);
    expect(m.resets).toBeGreaterThanOrEqual(3);
    expect((await row(exp.id))!.status).toBe('expired');
    const d = (await row(daily.id))!;
    expect([d.used_up, d.used_down]).toEqual([0, 0]);
    expect(d.last_reset_at).toBeGreaterThan(now - 5000);
    const wk = (await row(weekly.id))!;
    expect(wk.used_up).toBe(0);
    // rolling periods keep their phase: one week after the previous reset
    expect(Math.abs(wk.last_reset_at - (now - DAY))).toBeLessThan(5000);
    const mo = (await row(monthly.id))!;
    expect(mo).toMatchObject({ status: 'active', used_up: 0 });

    // A second run changes nothing.
    const again = await maintain();
    expect([again.expired, again.resets]).toEqual([0, 0]);
  });

  it('serves dashboard numbers', async () => {
    const { data } = await inst.api<OverviewDto>('stats/overview');
    expect(data.users.all).toBeGreaterThanOrEqual(7);
    expect(data.users.expired).toBeGreaterThanOrEqual(1);
    expect(data.users.limited).toBeGreaterThanOrEqual(1);
    expect(data.users.online).toBeGreaterThanOrEqual(1);
    expect(data.daily).toHaveLength(30);
    expect(data.today.up).toBeGreaterThanOrEqual(7000);
    expect(data.today.conns).toBeGreaterThanOrEqual(3);
    expect(data.top[0]!.name).toBe('counted');
    expect(data.recent.length).toBeGreaterThan(0);
    expect(data.maintenanceAt).toBeGreaterThan(Date.now() - 60_000);
  });
});
