import { createServer } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { describe, expect, it } from 'vitest';
import { sha224Hex } from '../../src/worker/lib/sha224';
import { exitFromPath } from '../../src/worker/proxy/handler';
import { parseRequest, parseTrojan, parseVless, socketHost } from '../../src/worker/proxy/protocol';
import { parseTrojanUdpFrame } from '../../src/worker/proxy/session';
import { sniffHost, sniffHttpHost, sniffSni } from '../../src/worker/proxy/sniff';
import { checkAccess, deviceKey, type ProxyUser } from '../../src/worker/proxy/users';

const UUID = '8f14e45f-ceea-467a-9575-a6b0f2d3c1e9';
const uuidBytes = Buffer.from(UUID.replace(/-/g, ''), 'hex');

function vless(
  cmd: number,
  port: number,
  atyp: number,
  addr: Buffer,
  payload = Buffer.alloc(0),
  addons = Buffer.alloc(0),
) {
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0]),
      uuidBytes,
      Buffer.from([addons.length]),
      addons,
      Buffer.from([cmd, port >> 8, port & 0xff, atyp]),
      addr,
      payload,
    ]),
  );
}

function trojan(
  pw: string,
  cmd: number,
  atyp: number,
  addr: Buffer,
  port: number,
  payload = Buffer.alloc(0),
) {
  return new Uint8Array(
    Buffer.concat([
      Buffer.from(sha224Hex(pw)),
      Buffer.from('\r\n'),
      Buffer.from([cmd, atyp]),
      addr,
      Buffer.from([port >> 8, port & 0xff]),
      Buffer.from('\r\n'),
      payload,
    ]),
  );
}

const domainAddr = (d: string) => Buffer.concat([Buffer.from([d.length]), Buffer.from(d)]);

describe('vless', () => {
  it('parses domain, ipv4 and ipv6 targets', () => {
    const r = parseVless(vless(1, 443, 2, domainAddr('Example.COM'), Buffer.from('hello')));
    expect(r.ok && r.req).toMatchObject({
      proto: 'vless',
      credential: UUID,
      command: 'tcp',
      host: 'example.com',
      port: 443,
    });
    expect(r.ok && Buffer.from(r.req.rest).toString()).toBe('hello');
    expect(r.ok && [...r.req.response!]).toEqual([0, 0]);

    const v4 = parseVless(vless(1, 80, 1, Buffer.from([93, 184, 216, 34])));
    expect(v4.ok && v4.req.host).toBe('93.184.216.34');

    const v6 = parseVless(vless(1, 443, 3, Buffer.from('20010db8000000000000000000000001', 'hex')));
    expect(v6.ok && v6.req.host).toBe('2001:db8::1');
    expect(socketHost('2001:db8::1')).toBe('[2001:db8::1]');
    expect(socketHost('example.com')).toBe('example.com');
  });

  it('skips addons and understands udp', () => {
    const r = parseVless(vless(2, 53, 1, Buffer.from([8, 8, 8, 8]), Buffer.alloc(0), Buffer.from([1, 2, 3])));
    expect(r.ok && r.req).toMatchObject({ command: 'udp', port: 53, host: '8.8.8.8' });
  });

  it('asks for more data on partial headers and rejects garbage', () => {
    const full = vless(1, 443, 2, domainAddr('example.com'));
    for (let n = 1; n < full.length; n++) {
      const r = parseVless(full.subarray(0, n));
      expect(r.ok).toBe(false);
      expect(!r.ok && r.reason).toBe('need_more');
    }
    const badCmd = vless(9, 443, 2, domainAddr('example.com'));
    expect(parseVless(badCmd)).toEqual({ ok: false, reason: 'invalid' });
    const badAtyp = vless(1, 443, 7, Buffer.from([1, 2, 3, 4]));
    expect(parseVless(badAtyp)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('trojan', () => {
  it('parses connect requests', () => {
    const r = parseTrojan(trojan('s3cret', 1, 3, domainAddr('chatgpt.com'), 443, Buffer.from('tls')));
    expect(r.ok && r.req).toMatchObject({
      proto: 'trojan',
      credential: sha224Hex('s3cret'),
      command: 'tcp',
      host: 'chatgpt.com',
      port: 443,
      response: null,
    });
    const v6 = parseTrojan(trojan('x', 1, 4, Buffer.from('20010db8000000000000000000000001', 'hex'), 443));
    expect(v6.ok && v6.req.host).toBe('2001:db8::1');
  });

  it('detects protocol by first byte', () => {
    expect(parseRequest(trojan('pw', 1, 1, Buffer.from([1, 1, 1, 1]), 80)).ok && 'trojan').toBe('trojan');
    const r = parseRequest(vless(1, 80, 1, Buffer.from([1, 1, 1, 1])));
    expect(r.ok && r.req.proto).toBe('vless');
  });

  it('rejects malformed headers', () => {
    const b = trojan('pw', 1, 1, Buffer.from([1, 1, 1, 1]), 80);
    b[56] = 0x41;
    expect(parseTrojan(b)).toEqual({ ok: false, reason: 'invalid' });
    const nonHex = trojan('pw', 1, 1, Buffer.from([1, 1, 1, 1]), 80);
    nonHex[0] = 0x7a; // 'z'
    expect(parseTrojan(nonHex)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('parses udp frames', () => {
    const frame = Buffer.concat([
      Buffer.from([1, 8, 8, 8, 8, 0, 53, 0, 3, 0x0d, 0x0a]),
      Buffer.from('abc'),
      Buffer.from([1]),
    ]);
    const f = parseTrojanUdpFrame(new Uint8Array(frame));
    expect(f && Buffer.from(f.payload).toString()).toBe('abc');
    expect(f?.consumed).toBe(frame.length - 1);
    expect(parseTrojanUdpFrame(new Uint8Array(frame.subarray(0, 12)))).toBeNull();
  });
});

describe('sniff', () => {
  it('extracts SNI from a real ClientHello', async () => {
    const hello = await new Promise<Buffer>((resolve, reject) => {
      const server = createServer((sock) => {
        sock.once('data', (d) => {
          resolve(d);
          sock.destroy();
          server.close();
        });
      });
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as { port: number }).port;
        const c = tlsConnect({
          host: '127.0.0.1',
          port,
          servername: 'gemini.google.com',
          rejectUnauthorized: false,
        });
        c.on('error', () => {});
      });
      server.on('error', reject);
    });
    expect(sniffSni(new Uint8Array(hello))).toBe('gemini.google.com');
    expect(sniffHost(new Uint8Array(hello))).toBe('gemini.google.com');
  });

  it('extracts the HTTP Host header', () => {
    const req = new TextEncoder().encode('GET / HTTP/1.1\r\nUser-Agent: x\r\nHost: Example.org:8080\r\n\r\n');
    expect(sniffHttpHost(req)).toBe('example.org');
    expect(sniffSni(req)).toBeNull();
    expect(sniffHost(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('routing helpers', () => {
  it('reads the exit country from the ws path', () => {
    expect(exitFromPath('/abcdef12', 'abcdef12')).toBeNull();
    expect(exitFromPath('/abcdef12/de', 'abcdef12')).toBe('DE');
    expect(exitFromPath('/abcdef12/de/x', 'abcdef12')).toBe('DE');
    expect(exitFromPath('/abcdef12/deu', 'abcdef12')).toBeNull();
  });
});

describe('access checks', () => {
  const base: ProxyUser = {
    id: 1,
    status: 'active',
    dataLimit: 1000,
    used: 100,
    expireAt: null,
    durationDays: null,
    deviceLimit: 0,
    allowedExits: ['*'],
    forceExit: false,
    filterExempt: false,
    operator: null,
    recentIps: [],
  };
  const opts = { now: 1_000, pendingBytes: 0, exit: null, ip: '1.1.1.1', localIps: [] as string[] };

  it('allows healthy users and rejects expired/limited/disabled', () => {
    expect(checkAccess(base, opts)).toBeNull();
    expect(checkAccess({ ...base, status: 'disabled' }, opts)).toBe('disabled');
    expect(checkAccess({ ...base, expireAt: 500 }, opts)).toBe('expired');
    expect(checkAccess(base, { ...opts, pendingBytes: 900 })).toBe('limited');
    expect(checkAccess({ ...base, dataLimit: 0, used: 1e12 }, opts)).toBeNull();
  });

  it('enforces allowed exits', () => {
    expect(checkAccess({ ...base, allowedExits: ['DE'] }, { ...opts, exit: 'DE' })).toBeNull();
    expect(checkAccess({ ...base, allowedExits: ['DE'] }, { ...opts, exit: 'US' })).toBe('exit_not_allowed');
  });

  it('counts devices, grouping IPv6 by /64', () => {
    const u = { ...base, deviceLimit: 2, recentIps: ['2.2.2.2'] };
    expect(checkAccess(u, { ...opts, localIps: ['3.3.3.3'] })).toBe('devices');
    expect(checkAccess(u, { ...opts, ip: '2.2.2.2', localIps: ['3.3.3.3'] })).toBeNull();
    expect(deviceKey('2001:db8:1:2:aaaa::1')).toBe(deviceKey('2001:db8:1:2:bbbb::9'));
  });
});
