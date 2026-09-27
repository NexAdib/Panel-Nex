import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, totpAt, verifyTotp } from '../../src/worker/auth/totp';
import { utf8 } from '../../src/worker/lib/bytes';

// RFC 6238 appendix B, SHA-1 seed "12345678901234567890" (6-digit truncation of the 8-digit values).
const SECRET = base32Encode(utf8('12345678901234567890'));

describe('totp', () => {
  it('round-trips base32', () => {
    expect(SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(new TextDecoder().decode(base32Decode(SECRET))).toBe('12345678901234567890');
  });

  it('matches RFC 6238 vectors', async () => {
    expect(await totpAt(SECRET, 59_000)).toBe('287082');
    expect(await totpAt(SECRET, 1111111109_000)).toBe('081804');
    expect(await totpAt(SECRET, 1234567890_000)).toBe('005924');
    expect(await totpAt(SECRET, 2000000000_000)).toBe('279037');
  });

  it('accepts the adjacent window and rejects others', async () => {
    const t = 1234567890_000;
    const code = await totpAt(SECRET, t);
    expect(await verifyTotp(SECRET, code, t + 30_000)).toBe(Math.floor(t / 30_000));
    expect(await verifyTotp(SECRET, code, t + 90_000)).toBeNull();
    expect(await verifyTotp(SECRET, '12345', t)).toBeNull();
  });
});
