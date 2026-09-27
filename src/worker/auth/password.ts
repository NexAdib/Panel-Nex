import { fromHex, toHex } from '../lib/bytes';
import { pbkdf2, randomBytes, timingSafeEqual } from '../lib/crypto';

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordHash {
  hash: string;
  salt: string;
  iters: number;
}

export async function hashPassword(password: string, iters: number): Promise<PasswordHash> {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, iters);
  return { hash: toHex(hash), salt: toHex(salt), iters };
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const hash = await pbkdf2(password, fromHex(stored.salt), stored.iters);
  return timingSafeEqual(hash, fromHex(stored.hash));
}

/** Basic strength rules; the UI shows the same hints. */
export function passwordProblems(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too_short';
  if (password.length > 256) return 'too_long';
  if (/^(.)\1+$/.test(password)) return 'too_weak';
  return null;
}
