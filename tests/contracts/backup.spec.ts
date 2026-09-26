import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
// A plain .mjs module, shared with scripts/backup.mjs and scripts/restore-backup.mjs.
import { open, pgEnvironment, seal } from '../../scripts/backup-crypto.mjs';

/**
 * Sao lưu (docs/sao-luu.md): a dump carries every guest's words and phone numbers, so it is sealed before it leaves the
 * machine, and a sealed file that was changed, cut short or opened with the wrong passphrase must refuse to open.
 */
const passphrase = 'a-passphrase-long-enough-to-pass';
const plain = Buffer.from(`PGDMP ${'Bí mật của quán: 0901234567 '.repeat(200)}`);

test('a sealed backup opens back to exactly the dump, and carries none of it in the clear', () => {
  const sealed = seal(plain, passphrase);
  expect(sealed.subarray(0, 6).toString()).toBe('NFCBK1');
  expect(open(sealed, passphrase).equals(plain)).toBe(true);
  expect(sealed.includes(Buffer.from('0901234567'))).toBe(false);
  expect(sealed.includes(Buffer.from('Bí mật'))).toBe(false);
  // A fresh salt and iv each time: the same dump never seals to the same bytes.
  expect(seal(plain, passphrase).equals(sealed)).toBe(false);
});

test('a wrong passphrase, a changed byte, a cut file or a short passphrase is refused', () => {
  const sealed: Buffer = seal(plain, passphrase);
  expect(() => open(sealed, 'another-passphrase-long-enough')).toThrow('Wrong passphrase');
  const flipped = Buffer.from(sealed); flipped[100] ^= 1;
  expect(() => open(flipped, passphrase)).toThrow('Wrong passphrase');
  expect(() => open(sealed.subarray(0, sealed.length - 1), passphrase)).toThrow('Wrong passphrase');
  expect(() => open(randomBytes(200), passphrase)).toThrow('Not an NFC backup file');
  expect(() => seal(plain, 'short')).toThrow('at least 20');
});

test("a connection string becomes libpq's environment, so no password sits on a command line", () => {
  expect(pgEnvironment('postgresql://reader:p%40ss%2Fw@ep-x.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require')).toEqual({
    PGHOST: 'ep-x.ap-southeast-1.aws.neon.tech', PGPORT: '5432', PGUSER: 'reader', PGPASSWORD: 'p@ss/w', PGDATABASE: 'neondb',
    PGSSLMODE: 'require', PGCHANNELBINDING: 'require' });
  expect(() => pgEnvironment('mysql://x@y/z')).toThrow('Not a PostgreSQL');
  // The scripts pass the database name only; nothing that could hold a password goes on the command line.
  for (const file of ['scripts/backup.mjs', 'scripts/restore-backup.mjs']) expect(readFileSync(file, 'utf8'), file).not.toMatch(/'--dbname', (url|target)\b/);
});
