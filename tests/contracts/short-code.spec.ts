import { test, expect } from '@playwright/test';
import { CODE_ALPHABET, shortCode, withShortCode } from '../../lib/short-code';
import { cardMonthlyFee } from '../../lib/owner/cards';
test('short codes use only unambiguous characters, evenly', () => {
  expect(CODE_ALPHABET).not.toMatch(/[01ilo]/);
  const seen = new Map<string, number>();
  for (let i = 0; i < 2000; i++) { const code = shortCode(5); expect(code).toMatch(/^[2-9a-hjkmnp-z]{5}$/); for (const c of code) seen.set(c, (seen.get(c) ?? 0) + 1); }
  expect(seen.size).toBe(CODE_ALPHABET.length);
  // Bytes from the uneven top of the range are dropped instead of folded onto the first characters.
  expect(shortCode(3, size => Buffer.from(Array.from({ length: size }, (_, i) => i % 2 ? 255 : 0)))).toBe('222');
});
test('a taken code is tried again, three times per length, growing from five to six and beyond', async () => {
  const lengths: number[] = [];
  const taken = Object.assign(new Error('duplicate'), { code: '23505' });
  const code = await withShortCode(async candidate => { lengths.push(candidate.length); if (candidate.length < 6) throw taken; return candidate; }, length => 'x'.repeat(length));
  expect(code).toBe('xxxxxx'); expect(lengths).toEqual([5, 5, 5, 6]);
  await expect(withShortCode(async () => { throw new Error('other'); })).rejects.toThrow('other');
  await expect(withShortCode(async () => { throw taken; })).rejects.toThrow('SHORT_CODE_EXHAUSTED');
});
test('a code that spells an account route is never handed out (migration 014)', async () => {
  const tried: string[] = [];
  const code = await withShortCode(async candidate => { tried.push(candidate); return candidate; }, (() => { const queue = ['setup', 'abcde']; return () => queue.shift()!; })());
  expect(code).toBe('abcde'); expect(tried).toEqual(['abcde']);
});
test('card fee follows the price list: five included, 8k to twenty, 5k after', () => {
  expect([0, 5, 6, 20, 21, 25].map(cardMonthlyFee)).toEqual([0, 0, 8000, 120000, 125000, 145000]);
});
