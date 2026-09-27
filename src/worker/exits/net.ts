// Upstream proxy handshakes (SOCKS5, HTTP CONNECT) over Workers TCP sockets.
import { concatBytes, fromUtf8, utf8 } from '../lib/bytes';

export class HandshakeError extends Error {}

type Reader = ReadableStreamDefaultReader<Uint8Array>;

/**
 * Reads until `need(buf)` returns a length the buffer satisfies; returns that
 * header and whatever arrived after it.
 */
export async function readHeader(
  reader: Reader,
  need: (buf: Uint8Array) => number | null,
  initial: Uint8Array = new Uint8Array(0),
  max = 16 * 1024,
): Promise<{ header: Uint8Array; leftover: Uint8Array }> {
  let buf = initial;
  for (;;) {
    const n = need(buf);
    if (n !== null && n > 0 && buf.byteLength >= n)
      return { header: buf.subarray(0, n), leftover: buf.subarray(n) };
    if (buf.byteLength > max) throw new HandshakeError('header_too_large');
    const { value, done } = await reader.read();
    if (done) throw new HandshakeError('closed_during_handshake');
    buf = buf.byteLength ? concatBytes(buf, value) : value;
  }
}

/**
 * Re-wraps a socket whose reader was used for a handshake so the proxy pipe can
 * read from the start, including bytes that arrived right after the handshake.
 */
export function withLeftover(socket: Socket, reader: Reader, leftover: Uint8Array): Socket {
  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      if (leftover.byteLength) c.enqueue(leftover);
    },
    async pull(c) {
      try {
        const { value, done } = await reader.read();
        if (done) c.close();
        else c.enqueue(value);
      } catch (err) {
        c.error(err);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new Proxy(socket, {
    get(target, prop) {
      if (prop === 'readable') return readable;
      const v = Reflect.get(target, prop, target);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

/** SOCKS5 destination address block: [atyp][addr]. */
export function addressBlock(host: string): Uint8Array {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return new Uint8Array([1, ...host.split('.').map(Number)]);
  if (host.includes(':')) {
    const clean = host.replace(/^\[|\]$/g, '');
    const [head = '', tail = ''] = clean.split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const groups = clean.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
    const out = new Uint8Array(17);
    out[0] = 4;
    groups.forEach((g, i) => {
      const v = Number.parseInt(g || '0', 16);
      out[1 + i * 2] = v >> 8;
      out[2 + i * 2] = v & 0xff;
    });
    return out;
  }
  const name = utf8(host);
  if (name.byteLength > 255) throw new HandshakeError('host_too_long');
  return concatBytes(new Uint8Array([3, name.byteLength]), name);
}

export interface Auth {
  username?: string | null;
  password?: string | null;
}

/**
 * RFC 1928 CONNECT (with RFC 1929 username/password when given). Leaves the
 * reader locked and returns it with any bytes received after the reply.
 */
export async function socks5Handshake(
  socket: Socket,
  target: { host: string; port: number },
  auth?: Auth,
): Promise<{ reader: Reader; leftover: Uint8Array }> {
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  try {
    const hasAuth = !!auth?.username;
    await writer.write(new Uint8Array(hasAuth ? [5, 2, 0, 2] : [5, 1, 0]));
    const greet = await readHeader(reader, (b) => (b.byteLength >= 2 ? 2 : null));
    if (greet.header[0] !== 5) throw new HandshakeError('socks_bad_version');
    let rest = greet.leftover;
    if (greet.header[1] === 2) {
      if (!hasAuth) throw new HandshakeError('socks_auth_required');
      const u = utf8(auth!.username ?? '');
      const p = utf8(auth!.password ?? '');
      await writer.write(
        concatBytes(new Uint8Array([1, u.byteLength]), u, new Uint8Array([p.byteLength]), p),
      );
      const res = await readHeader(reader, (b) => (b.byteLength >= 2 ? 2 : null), rest);
      if (res.header[1] !== 0) throw new HandshakeError('socks_auth_failed');
      rest = res.leftover;
    } else if (greet.header[1] !== 0) {
      throw new HandshakeError('socks_no_acceptable_method');
    }
    await writer.write(
      concatBytes(
        new Uint8Array([5, 1, 0]),
        addressBlock(target.host),
        new Uint8Array([target.port >> 8, target.port & 0xff]),
      ),
    );
    const reply = await readHeader(
      reader,
      (b) => {
        if (b.byteLength < 5) return null;
        const atyp = b[3];
        if (atyp === 1) return 10;
        if (atyp === 4) return 22;
        if (atyp === 3) return 7 + b[4]!;
        return 5;
      },
      rest,
    );
    if (reply.header[1] !== 0) throw new HandshakeError(`socks_connect_failed_${reply.header[1]}`);
    return { reader, leftover: reply.leftover };
  } finally {
    writer.releaseLock();
  }
}

/** HTTP/1.1 CONNECT tunnel with optional basic auth. Leaves the reader locked. */
export async function httpConnectHandshake(
  socket: Socket,
  target: { host: string; port: number },
  auth?: Auth,
): Promise<{ reader: Reader; leftover: Uint8Array }> {
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  try {
    const hostPort = `${target.host.includes(':') ? `[${target.host}]` : target.host}:${target.port}`;
    let req = `CONNECT ${hostPort} HTTP/1.1\r\nHost: ${hostPort}\r\nProxy-Connection: keep-alive\r\n`;
    if (auth?.username)
      req += `Proxy-Authorization: Basic ${btoa(`${auth.username}:${auth.password ?? ''}`)}\r\n`;
    await writer.write(utf8(`${req}\r\n`));
    const res = await readHeader(reader, (b) => {
      for (let i = 3; i < b.byteLength; i++) {
        if (b[i - 3] === 13 && b[i - 2] === 10 && b[i - 1] === 13 && b[i] === 10) return i + 1;
      }
      return null;
    });
    const status = /^HTTP\/1\.[01] (\d{3})/.exec(fromUtf8(res.header.subarray(0, 32)));
    if (status?.[1] !== '200') throw new HandshakeError(`http_connect_${status?.[1] ?? 'bad'}`);
    return { reader, leftover: res.leftover };
  } finally {
    writer.releaseLock();
  }
}
