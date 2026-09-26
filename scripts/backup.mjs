// Nightly backup of the production database (docs/sao-luu.md). Runs in GitHub Actions; can run by hand too.
//
//   pg_dump (read-only role) → seal (backup-crypto.mjs) → PUT to the private R2 backup bucket → GET it back and compare
//
// Needs: NEON_BACKUP_URL (the read-only role's connection string), BACKUP_PASSPHRASE, and R2_BACKUP_ACCOUNT_ID,
// R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY, R2_BACKUP_BUCKET. PG_DUMP names the pg_dump binary (default
// `pg_dump`); it must be at least the server's major version. With BACKUP_OUT set, the sealed file is written there
// instead of uploaded -- for trying the chain on a local database. Nothing secret is ever printed.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { presignUrl } from '../lib/media/sigv4.ts';
import { checkPassphrase, open, pgEnvironment, seal } from './backup-crypto.mjs';

const need = name => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const sha = data => createHash('sha256').update(data).digest('hex');

function dump(url) {
  return new Promise((resolve, reject) => {
    // The connection string goes in through the environment, never on the command line or into a log.
    const child = spawn(process.env.PG_DUMP ?? 'pg_dump', ['--format=custom', '--no-owner', '--no-privileges'],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...pgEnvironment(url) } });
    const out = [], err = [];
    child.stdout.on('data', chunk => out.push(chunk)); child.stderr.on('data', chunk => err.push(chunk));
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(Buffer.concat(out))
      // pg_dump's own message, which names tables and versions, never the password.
      : reject(new Error(`pg_dump exited ${code}: ${Buffer.concat(err).toString().replace(/postgres(ql)?:\/\/\S+/g, '<url>').trim()}`)));
  });
}

const passphrase = need('BACKUP_PASSPHRASE'); checkPassphrase(passphrase);
const plain = await dump(need('NEON_BACKUP_URL'));
// A custom-format dump starts with this signature; anything else means pg_dump wrote something we cannot restore.
if (plain.subarray(0, 5).toString() !== 'PGDMP') throw new Error('pg_dump did not produce a custom-format dump');
const sealed = seal(plain, passphrase);
// Proven before it leaves: the sealed file opens with the same passphrase back to the same bytes.
if (sha(open(sealed, passphrase)) !== sha(plain)) throw new Error('Sealed backup does not open back to the dump');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const name = `production/${stamp}.dump.enc`;

if (process.env.BACKUP_OUT) {
  await writeFile(process.env.BACKUP_OUT, sealed);
  console.log(`Wrote ${process.env.BACKUP_OUT}: dump ${plain.length} bytes, sealed ${sealed.length} bytes, sha256 ${sha(sealed)}`);
} else {
  const account = need('R2_BACKUP_ACCOUNT_ID'), bucket = need('R2_BACKUP_BUCKET');
  const signed = (method, headers) => presignUrl({ method, host: `${account}.r2.cloudflarestorage.com`, path: `/${bucket}/${name}`, region: 'auto',
    service: 's3', accessKeyId: need('R2_BACKUP_ACCESS_KEY_ID'), secretAccessKey: need('R2_BACKUP_SECRET_ACCESS_KEY'), date: new Date(),
    expiresSeconds: 600, headers });
  const put = await fetch(signed('PUT', { 'content-type': 'application/octet-stream', 'content-length': String(sealed.length) }),
    { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: sealed });
  if (!put.ok) throw new Error(`R2 refused the upload: ${put.status}`);
  const back = Buffer.from(await (await fetch(signed('GET'))).arrayBuffer());
  if (sha(back) !== sha(sealed)) throw new Error('The copy on R2 differs from what was uploaded');
  console.log(`Uploaded ${name}: dump ${plain.length} bytes, sealed ${sealed.length} bytes, sha256 ${sha(sealed)}, read back and matched`);
}
