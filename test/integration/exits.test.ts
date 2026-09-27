import { createServer, type Server, type Socket, connect as tcpConnect } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UserDto } from '../../src/shared/types';
import { type Installed, installAndLogin, startWorker, type TestWorker } from './harness';

function vlessHeader(uuid: string, host: string, port: number): Buffer {
  const u = Buffer.from(uuid.replace(/-/g, ''), 'hex');
  return Buffer.concat([
    Buffer.from([0]),
    u,
    Buffer.from([0, 1, port >> 8, port & 0xff, 1]),
    Buffer.from(host.split('.').map(Number)),
  ]);
}

async function openWs(w: TestWorker, path: string): Promise<WebSocket> {
  const url = new URL(path, w.url);
  url.protocol = 'ws:';
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return ws;
}

function collect(ws: WebSocket, n: number, timeoutMs = 6000): Promise<Buffer> {
  return new Promise((resolve) => {
    const parts: Buffer[] = [];
    let size = 0;
    const t = setTimeout(() => resolve(Buffer.concat(parts)), timeoutMs);
    ws.addEventListener('message', (e: MessageEvent) => {
      const b = Buffer.from(e.data as ArrayBuffer);
      parts.push(b);
      size += b.length;
      if (size >= n) {
        clearTimeout(t);
        resolve(Buffer.concat(parts));
      }
    });
    ws.addEventListener('close', () => {
      clearTimeout(t);
      resolve(Buffer.concat(parts));
    });
  });
}

/** Minimal SOCKS5 server (no auth or user/pass) that always connects to `upstream`. */
function socksServer(upstream: number, log: string[], creds?: { u: string; p: string }): Server {
  return createServer((c) => {
    let stage = 0;
    let buf = Buffer.alloc(0);
    let up: Socket | null = null;
    c.on('error', () => {});
    c.on('data', (d) => {
      if (up) return void up.write(d);
      buf = Buffer.concat([buf, d]);
      if (stage === 0 && buf.length >= 2 + buf[1]!) {
        const methods = [...buf.subarray(2, 2 + buf[1]!)];
        buf = buf.subarray(2 + buf[1]!);
        if (creds) {
          if (!methods.includes(2)) return void c.end(Buffer.from([5, 0xff]));
          c.write(Buffer.from([5, 2]));
          stage = 1;
        } else {
          c.write(Buffer.from([5, 0]));
          stage = 2;
        }
      }
      if (
        stage === 1 &&
        buf.length >= 2 &&
        buf.length >= 3 + buf[1]! &&
        buf.length >= 3 + buf[1]! + buf[2 + buf[1]!]!
      ) {
        const ul = buf[1]!;
        const u = buf.subarray(2, 2 + ul).toString();
        const pl = buf[2 + ul]!;
        const p = buf.subarray(3 + ul, 3 + ul + pl).toString();
        buf = buf.subarray(3 + ul + pl);
        const ok = u === creds!.u && p === creds!.p;
        c.write(Buffer.from([1, ok ? 0 : 1]));
        if (!ok) return void c.end();
        stage = 2;
      }
      if (stage === 2 && buf.length >= 5) {
        const atyp = buf[3];
        const len = atyp === 1 ? 10 : atyp === 4 ? 22 : 7 + buf[4]!;
        if (buf.length < len) return;
        const target =
          atyp === 3 ? buf.subarray(5, 5 + buf[4]!).toString() : [...buf.subarray(4, 8)].join('.');
        log.push(`socks->${target}`);
        const rest = buf.subarray(len);
        up = tcpConnect(upstream, '127.0.0.1', () => {
          c.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          if (rest.length) up!.write(rest);
        });
        up.on('data', (x) => c.write(x));
        up.on('error', () => c.destroy());
        up.on('close', () => c.end());
        stage = 3;
      }
    });
  });
}

/** Minimal HTTP CONNECT proxy that always connects to `upstream`. */
function httpProxy(upstream: number, log: string[]): Server {
  return createServer((c) => {
    let buf = Buffer.alloc(0);
    let up: Socket | null = null;
    c.on('error', () => {});
    c.on('data', (d) => {
      if (up) return void up.write(d);
      buf = Buffer.concat([buf, d]);
      const end = buf.indexOf('\r\n\r\n');
      if (end < 0) return;
      log.push(buf.subarray(0, buf.indexOf('\r\n')).toString());
      const rest = buf.subarray(end + 4);
      up = tcpConnect(upstream, '127.0.0.1', () => {
        c.write('HTTP/1.1 200 Connection established\r\n\r\n');
        if (rest.length) up!.write(rest);
      });
      up.on('data', (x) => c.write(x));
      up.on('close', () => c.end());
      up.on('error', () => c.destroy());
    });
  });
}

const listen = (s: Server) =>
  new Promise<number>((r) => s.listen(0, '127.0.0.1', () => r((s.address() as { port: number }).port)));

describe('fixed-IP exits', () => {
  const servers: Server[] = [];
  const log: string[] = [];
  let echoPort = 0;
  let refuserPort = 0;
  let socksPort = 0;
  let authSocksPort = 0;
  let httpPort = 0;
  let w: TestWorker;
  let inst: Installed;
  let wsPath = '';

  const markHealthy = async () => {
    const db = await w.mf.getD1Database('DB');
    await db.prepare(`UPDATE exits SET healthy = 1, scope = 'all' WHERE type != 'proxyip'`).run();
    await db.prepare(`UPDATE exits SET enabled = 0 WHERE type = 'proxyip'`).run();
  };

  beforeAll(async () => {
    const echo = createServer((s) => {
      s.on('data', (d) => s.write(Buffer.concat([Buffer.from('echo:'), d])));
      s.on('error', () => {});
    });
    // Closes immediately without sending anything, like a Cloudflare-hosted site refusing a Worker.
    const refuser = createServer((s) => s.destroy());
    servers.push(echo, refuser);
    echoPort = await listen(echo);
    refuserPort = await listen(refuser);
    const socks = socksServer(echoPort, log);
    const authSocks = socksServer(echoPort, log, { u: 'nex', p: 'adib' });
    const http = httpProxy(echoPort, log);
    servers.push(socks, authSocks, http);
    socksPort = await listen(socks);
    authSocksPort = await listen(authSocks);
    httpPort = await listen(http);

    w = await startWorker();
    inst = await installAndLogin(w);
    wsPath = (await inst.api<{ value: { wsPath: string } }>('settings/general')).data.value.wsPath;
  });

  afterAll(async () => {
    await w.dispose();
    for (const s of servers) s.close();
  });

  it('adds exits through the API (probes fail offline but rows are stored)', async () => {
    const socks = await inst.api<{ id: number; healthy: boolean; lastError: string }>('exits', 'POST', {
      country: 'DE',
      type: 'socks5',
      address: '127.0.0.1',
      port: socksPort,
      label: 'local socks',
    });
    expect(socks.status).toBe(201);
    expect(socks.data.healthy).toBe(false);
    const auth = await inst.api('exits', 'POST', {
      country: 'FI',
      type: 'socks5',
      address: '127.0.0.1',
      port: authSocksPort,
      username: 'nex',
      password: 'adib',
    });
    expect(auth.status).toBe(201);
    const http = await inst.api('exits', 'POST', {
      country: 'US',
      type: 'http',
      address: '127.0.0.1',
      port: httpPort,
    });
    expect(http.status).toBe(201);
    const list = await inst.api<{ items: { type: string; hasPassword: boolean }[] }>('exits');
    expect(list.data.items.filter((e) => e.type !== 'proxyip')).toHaveLength(3);
    expect(list.data.items.some((e) => e.hasPassword)).toBe(true);
    await markHealthy();
  });

  it('sends a forced country config through that country exit', async () => {
    const u = (await inst.api<UserDto>('users', 'POST', { name: 'de-user', forceExit: true })).data;
    log.length = 0;
    const ws = await openWs(w, `/${wsPath}/de`);
    const got = collect(ws, 2 + 'echo:via-de'.length);
    // The target is the refuser; only the SOCKS exit (which dials the echo server) can answer.
    ws.send(
      new Uint8Array(Buffer.concat([vlessHeader(u.uuid, '127.0.0.1', refuserPort), Buffer.from('via-de')])),
    );
    const r = await got;
    expect(r.subarray(2).toString()).toBe('echo:via-de');
    expect(log).toContain('socks->127.0.0.1');
    ws.close();
  });

  it('authenticates to SOCKS5 with username/password', async () => {
    const u = (await inst.api<UserDto>('users', 'POST', { name: 'fi-user', forceExit: true })).data;
    const ws = await openWs(w, `/${wsPath}/fi`);
    const got = collect(ws, 2 + 'echo:auth'.length);
    ws.send(
      new Uint8Array(Buffer.concat([vlessHeader(u.uuid, '127.0.0.1', refuserPort), Buffer.from('auth')])),
    );
    expect((await got).subarray(2).toString()).toBe('echo:auth');
    ws.close();
  });

  it('tunnels through HTTP CONNECT exits', async () => {
    const u = (await inst.api<UserDto>('users', 'POST', { name: 'us-user', forceExit: true })).data;
    log.length = 0;
    const ws = await openWs(w, `/${wsPath}/us`);
    const got = collect(ws, 2 + 'echo:http'.length);
    ws.send(
      new Uint8Array(Buffer.concat([vlessHeader(u.uuid, '127.0.0.1', refuserPort), Buffer.from('http')])),
    );
    expect((await got).subarray(2).toString()).toBe('echo:http');
    expect(log.some((l) => l.startsWith('CONNECT 127.0.0.1:'))).toBe(true);
    ws.close();
  });

  it('Auto configs go direct and fall back to an exit when a site refuses', async () => {
    const u = (await inst.api<UserDto>('users', 'POST', { name: 'auto-user' })).data;
    // direct works → echo answers directly
    const ws1 = await openWs(w, `/${wsPath}`);
    const g1 = collect(ws1, 2 + 'echo:direct'.length);
    ws1.send(
      new Uint8Array(Buffer.concat([vlessHeader(u.uuid, '127.0.0.1', echoPort), Buffer.from('direct')])),
    );
    expect((await g1).subarray(2).toString()).toBe('echo:direct');
    ws1.close();
    // direct refuses without data → the first bytes are replayed through an exit
    const ws2 = await openWs(w, `/${wsPath}`);
    const g2 = collect(ws2, 2 + 'echo:retried'.length);
    ws2.send(
      new Uint8Array(Buffer.concat([vlessHeader(u.uuid, '127.0.0.1', refuserPort), Buffer.from('retried')])),
    );
    const r2 = await g2;
    expect([...r2.subarray(0, 2)]).toEqual([0, 0]);
    expect(r2.subarray(2).toString()).toBe('echo:retried');
    ws2.close();
  });

  it('is sticky: the same user keeps the same exit', async () => {
    await inst.api('exits', 'POST', {
      country: 'DE',
      type: 'socks5',
      address: '127.0.0.1',
      port: authSocksPort,
      username: 'nex',
      password: 'adib',
    });
    await markHealthy();
    const u = (await inst.api<UserDto>('users', 'POST', { name: 'sticky', forceExit: true })).data;
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const ws = await openWs(w, `/${wsPath}/de`);
      const g = collect(ws, 2 + 'echo:s'.length);
      ws.send(
        new Uint8Array(Buffer.concat([vlessHeader(u.uuid, '127.0.0.1', refuserPort), Buffer.from('s')])),
      );
      expect((await g).subarray(2).toString()).toBe('echo:s');
      ws.close();
    }
    const exits = await inst.api<{ items: { id: number; country: string }[] }>('exits');
    seen.add(String(exits.data.items.filter((e) => e.country === 'DE').length));
    expect(seen.size).toBe(1);
  });

  it('imports lists and reports invalid lines', async () => {
    const res = await inst.api<{ added: number; invalid: string[]; items: { country: string }[] }>(
      'exits-import',
      'POST',
      {
        text: '192.0.2.10\n192.0.2.11:443 #x\nnot-valid\nsocks5://a:b@192.0.2.12:1080',
        country: 'auto',
      },
    );
    expect(res.status).toBe(200);
    expect(res.data.added).toBe(3);
    expect(res.data.invalid).toEqual(['not-valid']);
    // Unreachable endpoints stay unclassified until a probe succeeds.
    expect(res.data.items.filter((e) => e.country === 'ZZ')).toHaveLength(3);
  });
});
