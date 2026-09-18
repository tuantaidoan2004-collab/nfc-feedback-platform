import { randomBytes } from 'node:crypto';
/**
 * Short public codes for shops and cards (Tài, 2026-09-18): five characters to start, six only once five keeps
 * colliding. No 0/o, 1/l/i, so a code read aloud or copied by hand comes out right. 31^5 ≈ 28.6 million codes.
 */
export const CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export function shortCode(length: number, random: (size: number) => Buffer = randomBytes) {
  // 256 is not a multiple of 31: drop bytes from the uneven top so every character is equally likely.
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let code = '';
  while (code.length < length) for (const byte of random(length * 2)) {
    if (byte < limit && code.length < length) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}
const duplicate = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
/**
 * Tries a fresh code until one is free: three tries per length from five up to eight. `insert` must fail with a
 * unique violation on a taken code, which is the only error this retries.
 */
export async function withShortCode<T>(insert: (code: string) => Promise<T>, generate: (length: number) => string = length => shortCode(length)) {
  for (let length = 5; length <= 8; length++) for (let attempt = 0; attempt < 3; attempt++) {
    try { return await insert(generate(length)); } catch (error) { if (!duplicate(error)) throw error; }
  }
  throw new Error('SHORT_CODE_EXHAUSTED');
}
