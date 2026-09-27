import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fromBase64Url, fromHex, toBase64Url, toHex, utf8 } from '../../src/worker/lib/bytes';
import { bytesToUuid, randomString, timingSafeEqual, uuidToBytes } from '../../src/worker/lib/crypto';
import { sha224, sha224Hex } from '../../src/worker/lib/sha224';

describe('sha224', () => {
  it('matches FIPS test vectors', () => {
    expect(sha224Hex('')).toBe('d14a028c2a3a2bc9476102bb288234c415a2b01f828ea62ac5b3e42f');
    expect(sha224Hex('abc')).toBe('23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7');
    expect(sha224Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '75388b16512776cc5dba5da1fd890150b0c6455cb4f58b1952522525',
    );
  });

  it('matches node:crypto for many lengths', () => {
    for (let len = 0; len < 300; len += 7) {
      const data = new Uint8Array(len).map((_, i) => (i * 31 + len) & 0xff);
      const expected = createHash('sha224').update(data).digest('hex');
      expect(toHex(sha224(data))).toBe(expected);
    }
  });
});

describe('bytes', () => {
  it('round-trips hex and base64url', () => {
    const b = utf8('NexAdib ✓ نکس‌ادیب');
    expect(fromHex(toHex(b))).toEqual(b);
    expect(fromBase64Url(toBase64Url(b))).toEqual(b);
  });

  it('round-trips uuids', () => {
    const u = '8f14e45f-ceea-467a-9575-a6b0f2d3c1e9';
    expect(bytesToUuid(uuidToBytes(u))).toBe(u);
  });
});

describe('crypto', () => {
  it('generates strings from the alphabet only', () => {
    const s = randomString(200, 'abc');
    expect(s).toHaveLength(200);
    expect(/^[abc]+$/.test(s)).toBe(true);
  });

  it('compares in constant time semantics', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });
});
