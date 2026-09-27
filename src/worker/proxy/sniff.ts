// Recovers the destination hostname from the first client bytes when the client
// sent an IP address: the SNI of a TLS ClientHello or the Host header of HTTP/1.x.

export function sniffSni(b: Uint8Array): string | null {
  // TLS record header + handshake header
  if (b.length < 5 + 4 || b[0] !== 0x16 || b[1] !== 0x03) return null;
  let p = 5;
  if (b[p] !== 0x01) return null; // ClientHello
  p += 4; // handshake type + length
  p += 2 + 32; // client_version + random
  if (p >= b.length) return null;
  p += 1 + b[p]!; // session id
  if (p + 2 > b.length) return null;
  p += 2 + ((b[p]! << 8) | b[p + 1]!); // cipher suites
  if (p >= b.length) return null;
  p += 1 + b[p]!; // compression methods
  if (p + 2 > b.length) return null;
  const extEnd = Math.min(b.length, p + 2 + ((b[p]! << 8) | b[p + 1]!));
  p += 2;
  while (p + 4 <= extEnd) {
    const type = (b[p]! << 8) | b[p + 1]!;
    const len = (b[p + 2]! << 8) | b[p + 3]!;
    p += 4;
    if (type === 0x0000 && p + 5 <= extEnd) {
      // server_name_list: [len:2][type:1][name_len:2][name]
      const nameType = b[p + 2];
      const nameLen = (b[p + 3]! << 8) | b[p + 4]!;
      if (nameType !== 0 || p + 5 + nameLen > extEnd) return null;
      const name = new TextDecoder().decode(b.subarray(p + 5, p + 5 + nameLen));
      return /^[a-z0-9.-]{1,253}$/i.test(name) ? name.toLowerCase() : null;
    }
    p += len;
  }
  return null;
}

const METHODS = ['GET ', 'POST', 'PUT ', 'HEAD', 'DELE', 'OPTI', 'PATC', 'CONN'];

export function sniffHttpHost(b: Uint8Array): string | null {
  if (b.length < 16) return null;
  const head = String.fromCharCode(...b.subarray(0, 4));
  if (!METHODS.includes(head)) return null;
  const text = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 4096)));
  const m = /\r\nhost:[ \t]*([^\r\n:]+)/i.exec(text);
  const host = m?.[1]?.trim().toLowerCase();
  return host && /^[a-z0-9.-]{1,253}$/.test(host) ? host : null;
}

export function sniffHost(first: Uint8Array): string | null {
  return sniffSni(first) ?? sniffHttpHost(first);
}
