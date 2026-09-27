import { createServer, type Server } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UserDto } from '../../src/shared/types';
import { sha224Hex } from '../../src/worker/lib/sha224';
import { collect, openWs, trojanHeader, vlessHeader } from './clients';
import { type Installed, installAndLogin, startWorker, type TestWorker } from './harness';

describe('proxy data plane', () => {
  let echo: Server;
  let echoPort = 0;
  let dns: Server;
  let dnsPort = 0;
  let w: TestWorker;
  let inst: Installed;
  let wsPath = '';
  let user: UserDto;

  beforeAll(async () => {
    echo = createServer((sock) => {
      sock.on('data', (d) => sock.write(Buffer.concat([Buffer.from('echo:'), d])));
      sock.on('error', () => {});
    });
    await new Promise<void>((r) => echo.listen(0, '127.0.0.1', r));
    echoPort = (echo.address() as { port: number }).port;
    // DNS-over-TCP stub: answers every [len][query] with [len]["ans:" + query]
    dns = createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 2 && buf.length >= 2 + buf.readUInt16BE(0)) {
          const q = buf.subarray(2, 2 + buf.readUInt16BE(0));
          buf = buf.subarray(2 + q.length);
          const a = Buffer.concat([Buffer.from('ans:'), q]);
          const len = Buffer.alloc(2);
          len.writeUInt16BE(a.length);
          sock.write(Buffer.concat([len, a]));
        }
      });
      sock.on('error', () => {});
    });
    await new Promise<void>((r) => dns.listen(0, '127.0.0.1', r));
    dnsPort = (dns.address() as { port: number }).port;
    w = await startWorker({ USAGE_FLUSH_MS: '0' });
    inst = await installAndLogin(w);
    const g = await inst.api<{ value: { wsPath: string } }>('settings/general');
    wsPath = g.data.value.wsPath;
    user = (await inst.api<UserDto>('users', 'POST', { name: 'tester', dataLimit: 0, days: 30 })).data;
    await inst.api('settings/proxy', 'PUT', { value: { dnsServer: `127.0.0.1:${dnsPort}` } });
  });
  afterAll(async () => {
    await w.dispose();
    echo.close();
    dns.close();
  });

  it('relays VLESS traffic and prefixes the response header', async () => {
    const ws = await openWs(w, `/${wsPath}`);
    const got = collect(ws, 2 + 'echo:ping'.length);
    ws.send(
      new Uint8Array(Buffer.concat([vlessHeader(user.uuid, '127.0.0.1', echoPort), Buffer.from('ping')])),
    );
    const r = await got;
    expect([...r.data.subarray(0, 2)]).toEqual([0, 0]);
    expect(r.data.subarray(2).toString()).toBe('echo:ping');
    ws.close(1000);
  });

  it('accepts early data from Sec-WebSocket-Protocol', async () => {
    const early = Buffer.concat([vlessHeader(user.uuid, '127.0.0.1', echoPort), Buffer.from('early')]);
    const ws = await openWs(w, `/${wsPath}/?ed=2560`, early);
    const r = await collect(ws, 2 + 'echo:early'.length);
    expect(r.data.subarray(2).toString()).toBe('echo:early');
    ws.close(1000);
  });

  it('relays Trojan traffic without a response header', async () => {
    const ws = await openWs(w, `/${wsPath}`);
    const got = collect(ws, 'echo:hi'.length);
    ws.send(
      new Uint8Array(
        Buffer.concat([trojanHeader(user.trojanPassword, '127.0.0.1', echoPort), Buffer.from('hi')]),
      ),
    );
    expect((await got).data.toString()).toBe('echo:hi');
    ws.close(1000);
  });

  it('keeps streaming after the first packet', async () => {
    const ws = await openWs(w, `/${wsPath}`);
    const first = collect(ws, 2 + 'echo:a'.length);
    ws.send(new Uint8Array(Buffer.concat([vlessHeader(user.uuid, '127.0.0.1', echoPort), Buffer.from('a')])));
    await first;
    const second = collect(ws, 'echo:bbbb'.length);
    ws.send(new Uint8Array(Buffer.from('bbbb')));
    expect((await second).data.toString()).toBe('echo:bbbb');
    ws.close(1000);
  });

  it('rejects unknown credentials and disabled users', async () => {
    const ws = await openWs(w, `/${wsPath}`);
    const r = collect(ws, 1);
    ws.send(new Uint8Array(vlessHeader('00000000-0000-4000-8000-000000000000', '127.0.0.1', echoPort)));
    expect(await r).toMatchObject({ closed: true, reason: 'unauthorized' });

    const other = (await inst.api<UserDto>('users', 'POST', { name: 'blocked-user' })).data;
    await inst.api(`users/${other.id}/disable`, 'POST', {});
    const ws2 = await openWs(w, `/${wsPath}`);
    const r2 = collect(ws2, 1);
    ws2.send(new Uint8Array(vlessHeader(other.uuid, '127.0.0.1', echoPort)));
    expect(await r2).toMatchObject({ closed: true, reason: 'disabled' });
  });

  it('enforces allowed exit countries from the path', async () => {
    const limited = (await inst.api<UserDto>('users', 'POST', { name: 'de-only', allowedExits: ['DE'] }))
      .data;
    const ws = await openWs(w, `/${wsPath}/us`);
    const r = collect(ws, 1);
    ws.send(new Uint8Array(vlessHeader(limited.uuid, '127.0.0.1', echoPort)));
    expect(await r).toMatchObject({ closed: true, reason: 'exit_not_allowed' });
  });

  it('activates on-hold users on first connection', async () => {
    const hold = (await inst.api<UserDto>('users', 'POST', { name: 'hold-me', days: 10, onHold: true })).data;
    expect(hold.status).toBe('on_hold');
    const ws = await openWs(w, `/${wsPath}`);
    const r = collect(ws, 2 + 'echo:x'.length);
    ws.send(new Uint8Array(Buffer.concat([vlessHeader(hold.uuid, '127.0.0.1', echoPort), Buffer.from('x')])));
    expect((await r).data.subarray(2).toString()).toBe('echo:x');
    ws.close(1000);
    await new Promise((res) => setTimeout(res, 200));
    const after = (await inst.api<UserDto>(`users/${hold.id}`)).data;
    expect(after.status).toBe('active');
    expect(after.expireAt! - Date.now()).toBeGreaterThan(9 * 86_400_000);
  });

  it('bridges VLESS UDP port 53 to DNS over TCP', async () => {
    const ws = await openWs(w, `/${wsPath}`);
    const frame = Buffer.concat([Buffer.from([0, 3]), Buffer.from('q1?')]);
    const got = collect(ws, 2 + 2 + 'ans:q1?'.length);
    ws.send(new Uint8Array(Buffer.concat([vlessHeader(user.uuid, '8.8.8.8', 53, 2), frame])));
    const r = await got;
    expect([...r.data.subarray(0, 2)]).toEqual([0, 0]);
    expect(r.data.readUInt16BE(2)).toBe('ans:q1?'.length);
    expect(r.data.subarray(4).toString()).toBe('ans:q1?');
    ws.close(1000);
  });

  it('bridges Trojan UDP DNS frames', async () => {
    const ws = await openWs(w, `/${wsPath}`);
    const addr = Buffer.from([1, 8, 8, 8, 8, 0, 53]);
    const header = Buffer.concat([
      Buffer.from(sha224Hex(user.trojanPassword)),
      Buffer.from('\r\n'),
      Buffer.from([3]),
      addr,
      Buffer.from('\r\n'),
    ]);
    const frame = Buffer.concat([addr, Buffer.from([0, 2, 0x0d, 0x0a]), Buffer.from('hi')]);
    const got = collect(ws, 7 + 4 + 'ans:hi'.length);
    ws.send(new Uint8Array(Buffer.concat([header, frame])));
    const r = await got;
    expect([...r.data.subarray(0, 7)]).toEqual([...addr]);
    expect(r.data.readUInt16BE(7)).toBe(6);
    expect(r.data.subarray(11).toString()).toBe('ans:hi');
    ws.close(1000);
  });

  it('journals metered bytes per user', async () => {
    const metered = (await inst.api<UserDto>('users', 'POST', { name: 'metered' })).data;
    const ws = await openWs(w, `/${wsPath}`);
    const payload = Buffer.alloc(3000, 7);
    const got = collect(ws, 2 + 5 + payload.length);
    ws.send(new Uint8Array(Buffer.concat([vlessHeader(metered.uuid, '127.0.0.1', echoPort), payload])));
    await got;
    ws.close(1000);
    await new Promise((res) => setTimeout(res, 300));
    const db = await w.mf.getD1Database('DB');
    const rows = await db.prepare('SELECT data FROM usage_journal').all<{ data: string }>();
    let up = 0;
    let down = 0;
    for (const r of rows.results) {
      for (const [id, u, d] of JSON.parse(r.data).u as [number, number, number][]) {
        if (id === metered.id) {
          up += u;
          down += d;
        }
      }
    }
    expect(up).toBe(3000);
    expect(down).toBe(3005);
  });

  it('ignores websocket upgrades outside the secret path', async () => {
    const res = (await w.mf.dispatchFetch('https://panel.example.com/random', {
      headers: { upgrade: 'websocket' },
    })) as unknown as { status: number };
    expect(res.status).toBe(404);
  });
});
