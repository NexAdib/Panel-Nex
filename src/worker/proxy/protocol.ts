// VLESS and Trojan request-header parsing, written from the protocol specs.
//
// VLESS: [ver:1][uuid:16][addonLen:1][addons][cmd:1][port:2][atyp:1][addr][payload…]
//        atyp 1=IPv4 2=domain(len:1) 3=IPv6; cmd 1=TCP 2=UDP 3=MUX; response = [ver, 0]
// Trojan: [hex(sha224(pw)):56][CRLF][cmd:1][atyp:1][addr][port:2][CRLF][payload…]
//        atyp 1=IPv4 3=domain(len:1) 4=IPv6; cmd 1=CONNECT 3=UDP ASSOCIATE
import { bytesToUuid } from '../lib/crypto';

export type Proto = 'vless' | 'trojan';

export interface ParsedRequest {
  proto: Proto;
  /** VLESS: UUID string. Trojan: 56-char lowercase hex hash. */
  credential: string;
  command: 'tcp' | 'udp' | 'mux';
  host: string;
  port: number;
  /** Bytes after the header (first payload). */
  rest: Uint8Array;
  /** VLESS response header to prepend to the first downlink chunk. */
  response: Uint8Array | null;
  hostType: 'ipv4' | 'ipv6' | 'domain';
}

export type ParseResult = { ok: true; req: ParsedRequest } | { ok: false; reason: 'need_more' | 'invalid' };

const NEED_MORE: ParseResult = { ok: false, reason: 'need_more' };
const INVALID: ParseResult = { ok: false, reason: 'invalid' };

function ipv6(b: Uint8Array, off: number): string {
  const parts: string[] = [];
  for (let i = 0; i < 16; i += 2) parts.push(((b[off + i]! << 8) | b[off + i + 1]!).toString(16));
  // compress the longest run of zero groups
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (parts[i] === '0') {
      let j = i;
      while (j < 8 && parts[j] === '0') j++;
      if (j - i > bestLen && j - i > 1) {
        bestStart = i;
        bestLen = j - i;
      }
      i = j;
    } else i++;
  }
  if (bestStart < 0) return parts.join(':');
  const head = parts.slice(0, bestStart).join(':');
  const tail = parts.slice(bestStart + bestLen).join(':');
  return `${head}::${tail}`;
}

function domain(b: Uint8Array, off: number, len: number): string | null {
  const s = new TextDecoder().decode(b.subarray(off, off + len));
  // Reject control characters / spaces: a well-formed client never sends them.
  return /^[\x21-\x7e]+$/.test(s) ? s.toLowerCase() : null;
}

export function parseVless(b: Uint8Array): ParseResult {
  if (b.length < 1 + 16 + 1) return NEED_MORE;
  if (b[0] !== 0) return INVALID;
  const credential = bytesToUuid(b.subarray(1, 17));
  const addonLen = b[17]!;
  let p = 18 + addonLen;
  if (b.length < p + 1 + 2 + 1) return NEED_MORE;
  const cmdByte = b[p++]!;
  const command = cmdByte === 1 ? 'tcp' : cmdByte === 2 ? 'udp' : cmdByte === 3 ? 'mux' : null;
  if (!command) return INVALID;
  const port = (b[p]! << 8) | b[p + 1]!;
  p += 2;
  const atyp = b[p++]!;
  let host: string | null;
  let hostType: ParsedRequest['hostType'];
  if (atyp === 1) {
    if (b.length < p + 4) return NEED_MORE;
    host = `${b[p]}.${b[p + 1]}.${b[p + 2]}.${b[p + 3]}`;
    hostType = 'ipv4';
    p += 4;
  } else if (atyp === 2) {
    if (b.length < p + 1) return NEED_MORE;
    const len = b[p++]!;
    if (len === 0) return INVALID;
    if (b.length < p + len) return NEED_MORE;
    host = domain(b, p, len);
    hostType = 'domain';
    p += len;
  } else if (atyp === 3) {
    if (b.length < p + 16) return NEED_MORE;
    host = ipv6(b, p);
    hostType = 'ipv6';
    p += 16;
  } else return INVALID;
  if (!host || (command !== 'mux' && port === 0)) return INVALID;
  return {
    ok: true,
    req: {
      proto: 'vless',
      credential,
      command,
      host,
      port,
      rest: b.subarray(p),
      response: new Uint8Array([b[0]!, 0]),
      hostType,
    },
  };
}

const HEX = /^[0-9a-f]{56}$/;

export function parseTrojan(b: Uint8Array): ParseResult {
  if (b.length < 56 + 2 + 1 + 1) return NEED_MORE;
  if (b[56] !== 0x0d || b[57] !== 0x0a) return INVALID;
  let credential = '';
  for (let i = 0; i < 56; i++) credential += String.fromCharCode(b[i]!);
  credential = credential.toLowerCase();
  if (!HEX.test(credential)) return INVALID;
  let p = 58;
  const cmdByte = b[p++]!;
  const command = cmdByte === 1 ? 'tcp' : cmdByte === 3 ? 'udp' : null;
  if (!command) return INVALID;
  const atyp = b[p++]!;
  let host: string | null;
  let hostType: ParsedRequest['hostType'];
  if (atyp === 1) {
    if (b.length < p + 4) return NEED_MORE;
    host = `${b[p]}.${b[p + 1]}.${b[p + 2]}.${b[p + 3]}`;
    hostType = 'ipv4';
    p += 4;
  } else if (atyp === 3) {
    if (b.length < p + 1) return NEED_MORE;
    const len = b[p++]!;
    if (len === 0) return INVALID;
    if (b.length < p + len) return NEED_MORE;
    host = domain(b, p, len);
    hostType = 'domain';
    p += len;
  } else if (atyp === 4) {
    if (b.length < p + 16) return NEED_MORE;
    host = ipv6(b, p);
    hostType = 'ipv6';
    p += 16;
  } else return INVALID;
  if (b.length < p + 2 + 2) return NEED_MORE;
  const port = (b[p]! << 8) | b[p + 1]!;
  p += 2;
  if (b[p] !== 0x0d || b[p + 1] !== 0x0a) return INVALID;
  p += 2;
  if (!host || port === 0) return INVALID;
  return {
    ok: true,
    req: { proto: 'trojan', credential, command, host, port, rest: b.subarray(p), response: null, hostType },
  };
}

/** VLESS starts with version byte 0; a Trojan header starts with a hex digit. */
export function parseRequest(b: Uint8Array): ParseResult {
  if (b.length === 0) return NEED_MORE;
  return b[0] === 0 ? parseVless(b) : parseTrojan(b);
}

/** Brackets IPv6 literals for connect(), which joins host and port as "host:port". */
export function socketHost(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}
