// Restores a sealed backup (docs/sao-luu.md) into a database, then prints how many rows each table has so the result
// can be compared with the source.
//
//   node scripts/restore-backup.mjs <file.dump.enc | r2:production/<name>.dump.enc>
//
// Needs BACKUP_PASSPHRASE and RESTORE_URL. RESTORE_URL must be a local database (localhost / 127.0.0.1): restoring over
// a real one is a decision for a person at a console, not for this script. `r2:` reads the file from the backup bucket
// with the same R2_BACKUP_* variables as backup.mjs. PG_RESTORE names the pg_restore binary (default `pg_restore`).
import { spawn } from 'node:child_process';
import { readFile, rm, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { presignUrl } from '../lib/media/sigv4.ts';
import { storageHost, storageSettings } from '../lib/media/storage-settings.ts';
import { open, pgEnvironment } from './backup-crypto.mjs';

const need = name => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/restore-backup.mjs <file.dump.enc | r2:production/<name>.dump.enc>');
const target = need('RESTORE_URL');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(target).hostname)) throw new Error('RESTORE_URL must be a local database');

let sealed;
if (source.startsWith('r2:')) {
  const store = storageSettings(process.env, 'R2_BACKUP');
  if (!store) throw new Error('R2_BACKUP_* settings are incomplete');
  const url = presignUrl({ method: 'GET', ...storageHost(store), path: `/${store.bucket}/${source.slice(3)}`, region: store.region, service: 's3',
    accessKeyId: store.accessKeyId, secretAccessKey: store.secretAccessKey, date: new Date(), expiresSeconds: 600 });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`R2 refused the download: ${response.status}`);
  sealed = Buffer.from(await response.arrayBuffer());
} else sealed = await readFile(source);

const started = Date.now(), dir = await mkdtemp(join(tmpdir(), 'nfc-restore-')), file = join(dir, 'backup.dump');
try {
  await writeFile(file, open(sealed, need('BACKUP_PASSPHRASE')), { mode: 0o600 });
  await new Promise((resolve, reject) => {
    // --dbname names only the database; host, user and password come from the environment (pgEnvironment).
    const env = pgEnvironment(target);
    const child = spawn(process.env.PG_RESTORE ?? 'pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', '--dbname', env.PGDATABASE, file],
      { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, ...env } });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`pg_restore exited ${code}`)));
  });
} finally { await rm(dir, { recursive: true, force: true }); }

const client = new pg.Client({ connectionString: target }); await client.connect();
try {
  const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1")).rows;
  for (const { table_name } of tables) console.log(`${table_name}\t${(await client.query(`SELECT count(*)::int n FROM "${table_name}"`)).rows[0].n}`);
} finally { await client.end(); }
console.log(`Restored in ${((Date.now() - started) / 1000).toFixed(1)}s`);
