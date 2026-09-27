// Byte and text encoding helpers. Everything here is allocation-conscious because
// parts of it run on the proxy data path.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = (s: string): Uint8Array => encoder.encode(s);
export const fromUtf8 = (b: Uint8Array): string => decoder.decode(b);

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.byteLength;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

export function toHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.byteLength; i++) s += HEX[b[i]!];
  return s;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const v = Number.parseInt(clean.substr(i * 2, 2), 16);
    if (Number.isNaN(v)) throw new Error('invalid hex');
    out[i] = v;
  }
  return out;
}

export function toBase64(b: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < b.byteLength; i += CHUNK) {
    s += String.fromCharCode(...b.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const toBase64Url = (b: Uint8Array): string =>
  toBase64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function fromBase64Url(s: string): Uint8Array {
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  return fromBase64(b);
}

/** Base64 of a UTF-8 string (btoa alone only handles Latin-1). */
export const b64Utf8 = (s: string): string => toBase64(utf8(s));
