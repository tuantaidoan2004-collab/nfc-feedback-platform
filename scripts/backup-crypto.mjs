// The sealed format of a database backup (docs/sao-luu.md). A dump holds every guest's words and phone number, so it
// never leaves the machine that made it unencrypted.
//
//   "NFCBK1" | salt (16) | iv (12) | AES-256-GCM ciphertext | tag (16)
//
// The key comes from the passphrase through scrypt (N=2^17, r=8, p=1: the same cost the app uses for passwords). GCM's
// tag makes a changed byte, a truncated file or a wrong passphrase fail loudly instead of restoring garbage.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const MAGIC = Buffer.from('NFCBK1');
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const key = (passphrase, salt) => scryptSync(passphrase, salt, 32, SCRYPT);

export function checkPassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 20) throw new Error('BACKUP_PASSPHRASE must be at least 20 characters');
}

export function seal(plain, passphrase) {
  checkPassphrase(passphrase);
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, body, cipher.getAuthTag()]);
}

export function open(sealed, passphrase) {
  checkPassphrase(passphrase);
  if (sealed.length < MAGIC.length + 16 + 12 + 16 || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not an NFC backup file');
  const salt = sealed.subarray(6, 22), iv = sealed.subarray(22, 34), tag = sealed.subarray(sealed.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try { return Buffer.concat([decipher.update(sealed.subarray(34, sealed.length - 16)), decipher.final()]); }
  catch { throw new Error('Wrong passphrase, or the file was changed or cut short'); }
}

/**
 * A connection string as libpq's own environment variables, so a password never sits on a command line (where any
 * process list shows it) or in a log. Query parameters such as sslmode become PGSSLMODE and so on.
 */
export function pgEnvironment(url) {
  const u = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(u.protocol)) throw new Error('Not a PostgreSQL connection string');
  const env = { PGHOST: u.hostname, PGPORT: u.port || '5432', PGUSER: decodeURIComponent(u.username), PGDATABASE: decodeURIComponent(u.pathname.slice(1)) };
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  for (const [name, value] of u.searchParams) if (/^[a-z_]+$/.test(name)) env[`PG${name.replace(/_/g, '').toUpperCase()}`] = value;
  return env;
}
