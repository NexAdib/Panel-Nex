// One proxied connection: read the VLESS/Trojan header from the WebSocket,
// authenticate, apply limits, choose a route, and pump bytes both ways while
// metering them. All state lives in this closure — nothing is shared across
// requests except the per-isolate caches and counters.

import type { Env } from '../env';
import { concatBytes } from '../lib/bytes';
import { type Hop, openFirst, type Target } from './dial';
import { addBytes, localIps, maybeFlush, noteBlocked, noteConnection, pendingBytes } from './meter';
import { type ParsedRequest, parseRequest } from './protocol';
import { sniffHost } from './sniff';
import { checkAccess, findUser, onHoldExpiry, type ProxyUser, patchCachedUser } from './users';
import { safeClose, WsSource, wsSend } from './ws';

export interface WaitUntil {
  waitUntil(p: Promise<unknown>): void;
}

/** What the routing policy decides for a connection. */
export interface RouteDecision {
  /** Close the connection (e.g. blocked site). */
  block?: boolean;
  hops: Hop[];
}

export interface RouteInput {
  req: ParsedRequest;
  user: ProxyUser;
  /** Destination hostname if known (from the header or sniffed from the first bytes). */
  domain: string | null;
  exit: string | null;
}

export interface SessionOptions {
  ip: string;
  exit: string | null;
  connectTimeoutMs: number;
  dnsServer: string;
  route: (input: RouteInput) => Promise<RouteDecision>;
}

const HEADER_TIMEOUT_MS = 15_000;
const RECHECK_MS = 30_000;
const MAX_REPLAY = 64 * 1024;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

async function readHeader(src: WsSource): Promise<ParsedRequest | null> {
  let buf: Uint8Array = new Uint8Array(0);
  const deadline = Date.now() + HEADER_TIMEOUT_MS;
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0) return null;
    const chunk = await withTimeout(src.read(), left);
    if (!chunk) return null;
    buf = buf.byteLength ? concatBytes(buf, chunk) : chunk;
    const r = parseRequest(buf);
    if (r.ok) return r.req;
    if (r.reason === 'invalid' || buf.byteLength > 8192) return null;
  }
}

/** Re-validates the user periodically so disabling or running out of data cuts live connections. */
class Guard {
  private last = Date.now();
  constructor(
    private readonly env: Env,
    private readonly ctx: WaitUntil,
    private readonly req: ParsedRequest,
    private readonly ip: string,
    private readonly abort: (reason: string) => void,
  ) {}

  tick(): void {
    const now = Date.now();
    if (now - this.last < RECHECK_MS) return;
    this.last = now;
    maybeFlush(this.env, this.ctx);
    findUser(this.env.DB, this.req.proto, this.req.credential)
      .then((u) => {
        if (!u) return this.abort('gone');
        const denial = checkAccess(u, {
          now,
          pendingBytes: pendingBytes(u.id),
          exit: null,
          ip: this.ip,
          localIps: [],
        });
        if (denial && denial !== 'devices' && denial !== 'exit_not_allowed') this.abort(denial);
      })
      .catch(() => {});
  }
}

export async function runSession(
  ws: WebSocket,
  early: Uint8Array | null,
  env: Env,
  ctx: WaitUntil,
  opts: SessionOptions,
): Promise<void> {
  const src = new WsSource(ws, early, 16 * 1024 * 1024, () => safeClose(ws, 1009, 'overflow'));
  const req = await readHeader(src);
  if (!req) {
    safeClose(ws, 1002, 'bad_request');
    return;
  }
  const user = await findUser(env.DB, req.proto, req.credential).catch(() => null);
  if (!user) {
    safeClose(ws, 1008, 'unauthorized');
    return;
  }
  const now = Date.now();
  const denial = checkAccess(user, {
    now,
    pendingBytes: pendingBytes(user.id),
    exit: opts.exit,
    ip: opts.ip,
    localIps: localIps(user.id),
  });
  if (denial) {
    safeClose(ws, 1008, denial);
    return;
  }
  if (user.status === 'on_hold') {
    const expireAt = onHoldExpiry(user, now);
    patchCachedUser(req.proto, req.credential, { status: 'active', expireAt });
    ctx.waitUntil(
      env.DB.prepare(
        `UPDATE users SET status = 'active', expire_at = ?2, first_used_at = ?3, rev = rev + 1, updated_at = ?3
         WHERE id = ?1 AND status = 'on_hold'`,
      )
        .bind(user.id, expireAt, now)
        .run()
        .catch(() => {}),
    );
  }
  noteConnection(user.id, opts.ip);

  if (req.command === 'mux') {
    safeClose(ws, 1003, 'mux_unsupported');
    return;
  }

  let closed = false;
  let socket: Socket | null = null;
  const abort = (reason: string) => {
    if (closed) return;
    closed = true;
    src.end();
    safeClose(ws, 1000, reason);
    socket?.close().catch(() => {});
  };
  const guard = new Guard(env, ctx, req, opts.ip, abort);

  try {
    if (req.command === 'udp') {
      if (req.port !== 53) return abort('udp_unsupported');
      const [dnsHost = '8.8.4.4', dnsPort = '53'] = opts.dnsServer.split(':');
      const dns: Target = { host: dnsHost, port: Number(dnsPort) || 53 };
      if (req.proto === 'vless') {
        // VLESS UDP frames ([len:2][payload]) are byte-identical to DNS over TCP.
        await pipeTcp({
          ws,
          src,
          hops: [{ kind: 'direct' }],
          target: dns,
          req,
          userId: user.id,
          guard,
          opts,
          onSocket: (s) => (socket = s),
          abort,
        });
      } else {
        await pipeTrojanDns({
          ws,
          src,
          target: dns,
          req,
          userId: user.id,
          guard,
          opts,
          onSocket: (s) => (socket = s),
          abort,
        });
      }
      return;
    }

    const domain = req.hostType === 'domain' ? req.host : sniffHost(req.rest);
    const decision = await opts.route({ req, user, domain, exit: opts.exit });
    if (decision.block) {
      noteBlocked();
      return abort('blocked');
    }
    await pipeTcp({
      ws,
      src,
      hops: decision.hops,
      target: { host: req.host, port: req.port },
      req,
      userId: user.id,
      guard,
      opts,
      onSocket: (s) => (socket = s),
      abort,
    });
  } finally {
    abort('done');
    maybeFlush(env, ctx);
  }
}

interface PipeArgs {
  ws: WebSocket;
  src: WsSource;
  hops: Hop[];
  target: Target;
  req: ParsedRequest;
  userId: number;
  guard: Guard;
  opts: SessionOptions;
  onSocket: (s: Socket) => void;
  abort: (reason: string) => void;
}

/**
 * Bidirectional TCP pump. Until the destination answers, uplink bytes are kept
 * (up to 64 KiB) so that if the destination closes without sending anything —
 * the signature of a Cloudflare-hosted site refusing a Worker — the same bytes
 * can be replayed through the next hop exactly once.
 */
async function pipeTcp(a: PipeArgs): Promise<void> {
  const opened = await openFirst(a.hops, a.target, a.opts.connectTimeoutMs);
  if (!opened) return a.abort('connect_failed');
  let socket = opened.socket;
  let hopIndex = opened.index;
  a.onSocket(socket);
  let writer = socket.writable.getWriter();
  const replay: Uint8Array[] = [];
  let replayBytes = 0;
  let canReplay = true;
  let gotDown = false;
  let retried = false;
  let switching: Promise<boolean> | null = null;

  async function switchHop(): Promise<boolean> {
    const next = await openFirst(a.hops, a.target, a.opts.connectTimeoutMs, hopIndex + 1);
    if (!next) return false;
    try {
      writer.releaseLock();
    } catch {}
    socket.close().catch(() => {});
    socket = next.socket;
    hopIndex = next.index;
    a.onSocket(socket);
    writer = socket.writable.getWriter();
    for (const chunk of replay) await writer.write(chunk);
    return true;
  }

  async function writeUp(chunk: Uint8Array): Promise<void> {
    if (switching && !(await switching)) throw new Error('switch_failed');
    const inReplay = !gotDown && canReplay;
    if (inReplay) {
      replay.push(chunk);
      replayBytes += chunk.byteLength;
      if (replayBytes > MAX_REPLAY) canReplay = false;
    }
    const w = writer;
    try {
      await w.write(chunk);
    } catch (err) {
      // The chunk was replayed onto the new hop if a switch interrupted this write.
      if (switching && (await switching) && inReplay && canReplay) return;
      throw err;
    }
  }

  const uplink = (async () => {
    try {
      if (a.req.rest.byteLength) {
        addBytes(a.userId, a.req.rest.byteLength, 0);
        await writeUp(a.req.rest);
      }
      for (;;) {
        const chunk = await a.src.read();
        if (!chunk) break;
        addBytes(a.userId, chunk.byteLength, 0);
        a.guard.tick();
        await writeUp(chunk);
      }
    } catch {
      // write failed: destination gone
    }
    a.abort('uplink_end');
  })();

  const downlink = (async () => {
    let header = a.req.response;
    for (;;) {
      const reader = socket.readable.getReader();
      let sawData = false;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value || value.byteLength === 0) continue;
          sawData = true;
          gotDown = true;
          addBytes(a.userId, 0, value.byteLength);
          a.guard.tick();
          const out = header ? concatBytes(header, value) : value;
          header = null;
          if (!wsSend(a.ws, out)) return a.abort('client_gone');
        }
      } catch {
        // socket reset
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }
      if (
        !sawData &&
        !gotDown &&
        !retried &&
        canReplay &&
        hopIndex + 1 < a.hops.length &&
        a.ws.readyState === 1
      ) {
        retried = true;
        switching = switchHop();
        const ok = await switching;
        switching = null;
        if (ok) continue;
      }
      break;
    }
    a.abort('downlink_end');
  })();

  await Promise.allSettled([uplink, downlink]);
}

/** Trojan UDP carries [atyp][addr][port][len:2][CRLF][payload] frames; bridge DNS over TCP. */
async function pipeTrojanDns(a: Omit<PipeArgs, 'hops'>): Promise<void> {
  const opened = await openFirst([{ kind: 'direct' }], a.target, a.opts.connectTimeoutMs);
  if (!opened) return a.abort('connect_failed');
  const socket = opened.socket;
  a.onSocket(socket);
  const writer = socket.writable.getWriter();
  let replyAddr: Uint8Array = new Uint8Array([1, 8, 8, 4, 4, 0, 53]);

  const uplink = (async () => {
    let buf = a.req.rest;
    try {
      for (;;) {
        // parse as many complete frames as possible
        for (;;) {
          const frame = parseTrojanUdpFrame(buf);
          if (!frame) break;
          replyAddr = frame.addr;
          buf = buf.subarray(frame.consumed);
          addBytes(a.userId, frame.payload.byteLength, 0);
          const out = new Uint8Array(2 + frame.payload.byteLength);
          out[0] = frame.payload.byteLength >> 8;
          out[1] = frame.payload.byteLength & 0xff;
          out.set(frame.payload, 2);
          await writer.write(out);
        }
        if (buf.byteLength > 65_600) break;
        const chunk = await a.src.read();
        if (!chunk) break;
        buf = buf.byteLength ? concatBytes(buf, chunk) : chunk;
      }
    } catch {}
    a.abort('uplink_end');
  })();

  const downlink = (async () => {
    const reader = socket.readable.getReader();
    let buf: Uint8Array = new Uint8Array(0);
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf = buf.byteLength ? concatBytes(buf, value) : value;
        while (buf.byteLength >= 2) {
          const len = (buf[0]! << 8) | buf[1]!;
          if (buf.byteLength < 2 + len) break;
          const msg = buf.subarray(2, 2 + len);
          buf = buf.subarray(2 + len);
          addBytes(a.userId, 0, len);
          const frame = concatBytes(replyAddr, new Uint8Array([len >> 8, len & 0xff, 0x0d, 0x0a]), msg);
          if (!wsSend(a.ws, frame)) return a.abort('client_gone');
        }
      }
    } catch {}
    a.abort('downlink_end');
  })();

  await Promise.allSettled([uplink, downlink]);
}

export function parseTrojanUdpFrame(
  b: Uint8Array,
): { addr: Uint8Array; payload: Uint8Array; consumed: number } | null {
  if (b.byteLength < 1) return null;
  let p = 1;
  const atyp = b[0];
  if (atyp === 1) p += 4;
  else if (atyp === 4) p += 16;
  else if (atyp === 3) {
    if (b.byteLength < 2) return null;
    p += 1 + b[1]!;
  } else return null;
  p += 2; // port
  if (b.byteLength < p + 4) return null;
  const addr = b.subarray(0, p);
  const len = (b[p]! << 8) | b[p + 1]!;
  if (b[p + 2] !== 0x0d || b[p + 3] !== 0x0a) return null;
  const start = p + 4;
  if (b.byteLength < start + len) return null;
  return { addr, payload: b.subarray(start, start + len), consumed: start + len };
}
