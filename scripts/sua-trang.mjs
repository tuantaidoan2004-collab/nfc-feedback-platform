// "Nhờ admin sửa": the agent edits a shop's page and publishes it (scripts/sua-trang.ts says how). Local by default -- the
// database and picture store scripts/local.mjs runs; `--env <file>` reads DATABASE_URL and the store's R2_*/STORAGE_* names
// from a file Tài writes himself (production, the day he asks for it).
//   node scripts/sua-trang.mjs ds
//   node scripts/sua-trang.mjs lay <mã trang>
//   node scripts/sua-trang.mjs dang <mã trang>
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

process.chdir(new URL('..', import.meta.url).pathname);
const args = process.argv.slice(2), at = args.indexOf('--env');
const key = name => createHash('sha256').update(`nfc-local-only\0${name}`).digest('hex');
// The same values scripts/local.mjs gives the local app.
let env = { DATABASE_URL: 'postgresql://nfc@127.0.0.1:55460/nfc_local', STORAGE_ENDPOINT: 'http://127.0.0.1:3322', STORAGE_REGION: 'auto',
  R2_BUCKET: 'nfc-media', R2_ACCESS_KEY_ID: 'nfc-local', R2_SECRET_ACCESS_KEY: key('store'), MEDIA_PUBLIC_ORIGIN: 'http://127.0.0.1:3322/nfc-media' };
if (at >= 0) {
  const names = /^(DATABASE_URL|STORAGE_ENDPOINT|STORAGE_REGION|MEDIA_PUBLIC_ORIGIN|R2_[A-Z_]+)=(.*)$/;
  env = Object.fromEntries(readFileSync(args[at + 1], 'utf8').split('\n').map(line => line.match(names)).filter(Boolean).map(([, name, value]) => [name, value.trim().replace(/^"(.*)"$/, '$1')]));
  args.splice(at, 2);
}
const run = spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', '--import', './scripts/local/hooks.mjs', 'scripts/sua-trang.ts', ...args],
  { stdio: 'inherit', env: { ...process.env, ...env } });
process.exit(run.status ?? 1);
