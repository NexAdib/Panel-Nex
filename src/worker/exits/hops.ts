// Openers for exit hops. Imported once for its side effect of registering them.
import { DialError, type Hop, openSocket, registerHop, type Target } from '../proxy/dial';
import { httpConnectHandshake, socks5Handshake, withLeftover } from './net';
import { isIp, isIpv4, nat64Address, resolve } from './resolve';
import { hrwOrder } from './select';

async function deadline<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout();
          reject(new DialError('handshake_timeout'));
        }, ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ProxyIP: a relay that forwards our bytes to the real destination, so the
// destination sees the relay's IP. Domains with many A records are resolved and
// ordered per user so each user keeps the same relay IP.
registerHop('proxyip', async (hop, target, timeoutMs) => {
  if (hop.kind !== 'proxyip') throw new DialError('bad_hop');
  const port = hop.port ?? target.port;
  const ips = isIp(hop.host) ? [hop.host] : await resolve(hop.host, 'A');
  const ordered = hop.key ? hrwOrder(ips, hop.key, (ip) => ip) : ips;
  const tries = (ordered.length ? ordered : [hop.host]).slice(0, 2);
  let last: unknown;
  for (const ip of tries) {
    try {
      return await openSocket(ip, port, timeoutMs);
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new DialError('proxyip_failed');
});

registerHop('socks5', async (hop, target, timeoutMs) => {
  if (hop.kind !== 'socks5') throw new DialError('bad_hop');
  const socket = await openSocket(hop.host, hop.port, timeoutMs);
  const { reader, leftover } = await deadline(
    socks5Handshake(socket, target, { username: hop.username, password: hop.password }),
    timeoutMs,
    () => socket.close().catch(() => {}),
  );
  return withLeftover(socket, reader, leftover);
});

registerHop('http', async (hop, target, timeoutMs) => {
  if (hop.kind !== 'http') throw new DialError('bad_hop');
  const socket = await openSocket(hop.host, hop.port, timeoutMs);
  const { reader, leftover } = await deadline(
    httpConnectHandshake(socket, target, { username: hop.username, password: hop.password }),
    timeoutMs,
    () => socket.close().catch(() => {}),
  );
  return withLeftover(socket, reader, leftover);
});

// NAT64 restores reachability to IPv4-only destinations over IPv6. It does not
// change the egress country.
registerHop('nat64', async (hop, target: Target, timeoutMs) => {
  if (hop.kind !== 'nat64') throw new DialError('bad_hop');
  if (target.host.includes(':')) throw new DialError('nat64_ipv6_target');
  const v4 = isIpv4(target.host) ? target.host : (await resolve(target.host, 'A'))[0];
  if (!v4) throw new DialError('nat64_no_a_record');
  return openSocket(nat64Address(hop.prefix, v4), target.port, timeoutMs);
});

export type { Hop };
