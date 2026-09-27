// Cryptographic helpers built on WebCrypto. No Math.random anywhere.
import { fromHex, toBase64Url, toHex, utf8 } from './bytes';

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const LOWER_ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Unbiased random string from an alphabet (rejection sampling). */
export function randomString(length: number, alphabet = ALNUM): string {
  const max = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    const buf = randomBytes(Math.max(16, length * 2));
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const v = buf[i]!;
      if (v < max) out += alphabet[v % alphabet.length];
    }
  }
  return out;
}

/** 22 base62 chars ≈ 131 bits. Used for subscription tokens. */
export const newSubToken = (): string => randomString(22);
/** Lowercase path segment for secret panel/sub/ws paths. */
export const newPathSegment = (len = 14): string => randomString(len, LOWER_ALNUM);
/** URL-safe opaque secret (256 bits by default). */
export const newSecret = (bytes = 32): string => toBase64Url(randomBytes(bytes));

export const newUuid = (): string => crypto.randomUUID();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string): boolean => UUID_RE.test(s);

export function uuidToBytes(uuid: string): Uint8Array {
  return fromHex(uuid.replace(/-/g, ''));
}

export function bytesToUuid(b: Uint8Array): string {
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  const buf = typeof data === 'string' ? utf8(data) : data;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
}

export const sha256Hex = async (data: Uint8Array | string): Promise<string> => toHex(await sha256(data));

export async function hmacSha256(key: Uint8Array | string, data: Uint8Array | string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? utf8(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, typeof data === 'string' ? utf8(data) : data));
}

export async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

/** Constant-time comparison for equal-length secrets. */
export function timingSafeEqual(a: Uint8Array | string, b: Uint8Array | string): boolean {
  const x = typeof a === 'string' ? utf8(a) : a;
  const y = typeof b === 'string' ? utf8(b) : b;
  let diff = x.byteLength ^ y.byteLength;
  const n = Math.max(x.byteLength, y.byteLength);
  for (let i = 0; i < n; i++) diff |= (x[i % x.byteLength] ?? 0) ^ (y[i % y.byteLength] ?? 0);
  return diff === 0;
}
