import { connect } from 'cloudflare:sockets';
import { socketHost } from './protocol';

export interface Target {
  host: string;
  port: number;
}

/** One way of reaching the destination. Exits (M5) add proxyip/socks5/http/nat64 hops. */
export type Hop =
  | { kind: 'direct' }
  | { kind: 'proxyip'; host: string; port: number | null; exitId?: number; key?: string }
  | { kind: 'nat64'; prefix: string }
  | { kind: 'socks5'; host: string; port: number; username?: string; password?: string; exitId?: number }
  | { kind: 'http'; host: string; port: number; username?: string; password?: string; exitId?: number };

export class DialError extends Error {}

/** connect() with a deadline on the TCP handshake. */
export async function openSocket(host: string, port: number, timeoutMs: number): Promise<Socket> {
  const socket = connect({ hostname: socketHost(host), port }, { allowHalfOpen: false });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      socket.opened,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new DialError('connect_timeout')), timeoutMs);
      }),
    ]);
    return socket;
  } catch (err) {
    socket.close().catch(() => {});
    throw err instanceof DialError
      ? err
      : new DialError(err instanceof Error ? err.message : 'connect_failed');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export type HopOpener = (hop: Hop, target: Target, timeoutMs: number) => Promise<Socket>;

/** Direct dialing. Other hop kinds are registered by the exits module. */
const openers: Partial<Record<Hop['kind'], HopOpener>> = {
  direct: (_hop, target, timeoutMs) => openSocket(target.host, target.port, timeoutMs),
};

export function registerHop(kind: Hop['kind'], opener: HopOpener): void {
  openers[kind] = opener;
}

export async function openHop(hop: Hop, target: Target, timeoutMs: number): Promise<Socket> {
  const opener = openers[hop.kind];
  if (!opener) throw new DialError(`no_opener_${hop.kind}`);
  return opener(hop, target, timeoutMs);
}

/** Tries hops in order until one opens. Returns the socket and the index of the hop used. */
export async function openFirst(
  hops: Hop[],
  target: Target,
  timeoutMs: number,
  from = 0,
): Promise<{ socket: Socket; index: number } | null> {
  for (let i = from; i < hops.length; i++) {
    try {
      return { socket: await openHop(hops[i]!, target, timeoutMs), index: i };
    } catch {
      // try the next hop
    }
  }
  return null;
}
