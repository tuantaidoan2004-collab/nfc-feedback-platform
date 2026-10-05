// One command for the local app: `node scripts/local.mjs`.
// Starts a PostgreSQL that lives in ~/.nfc-local (Postgres.app's binaries, port 55460, separate from the test cluster on
// 55439), builds the database from db/schema.sql — again from scratch whenever that file changes (Tài 05/10: no
// migrations while the frame is rebuilt) — seeds the owner and the Google Maps tool's shop, and runs `next dev` on http://127.0.0.1:3321 with every
// surface open.
//   node scripts/local.mjs code     the administrator's current six-digit code
//   node scripts/local.mjs --reset  the database from scratch even if the schema did not change
//   node scripts/local.mjs --no-app the database only
//   node scripts/local.mjs --lan    reachable from a phone on the same Wi-Fi (prints the address)
// Nothing here reads the project's .env files. The only private files read are rieng/google.env (Google sign-in keys Tài
// writes himself — rieng/google-api.md), only the names listed in GOOGLE_NAMES, and the `api_key` of the Google Maps
// review tool in its own ~/MAps/config.json (read, never written; see mapsTool).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import pg from 'pg';

// Always the project this script lives in, whichever folder launched it.
process.chdir(new URL('..', import.meta.url).pathname);
const bin = process.env.PG_BIN ?? '/Applications/Postgres.app/Contents/Versions/latest/bin';
const data = join(homedir(), '.nfc-local', 'pg'), port = 55460, database = 'nfc_local';
const url = `postgresql://nfc@127.0.0.1:${port}/${database}`;
const LOCAL = { admin: 'tai', adminPassword: 'local-admin-password', owner: 'chuquan', ownerPassword: 'local-owner-password',
  totp: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' };
const lan = process.argv.includes('--lan');
const lanAddress = () => Object.values(networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address;
const host = lan ? (lanAddress() ?? '127.0.0.1') : '127.0.0.1', origin = `http://${host}:3321`;

// Fixed, local-only keys: a restart keeps sessions, draft links and the sealed second factor valid.
const key = name => createHash('sha256').update(`nfc-local-only\0${name}`).digest('hex');
const GOOGLE_NAMES = ['NFC_GOOGLE_CLIENT_ID', 'NFC_GOOGLE_CLIENT_SECRET'];
function privateGoogle() {
  if (!existsSync('rieng/google.env')) return {};
  const pairs = readFileSync('rieng/google.env', 'utf8').split('\n').map(line => line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean);
  return Object.fromEntries(pairs.filter(([, name]) => GOOGLE_NAMES.includes(name)).map(([, name, value]) => [name, value.trim()]));
}
// The Google Maps review tool on this machine (Tài 05/10: its real reviews replace the sample ones). The app's server asks it
// at 127.0.0.1:8000 with its key; the seed makes the shop it follows (MAPS_SHOP), the only shop of the local app.
const MAPS_SHOP = 'quan-google-maps';
function mapsTool() {
  const file = join(process.env.NFC_MAPS_DIR ?? join(homedir(), 'MAps'), 'config.json');
  if (!existsSync(file)) return {};
  let key; try { key = JSON.parse(readFileSync(file, 'utf8')).api_key; } catch { return {}; }
  return typeof key === 'string' && key ? { NFC_MAPS_URL: process.env.NFC_MAPS_URL || 'http://127.0.0.1:8000', NFC_MAPS_KEY: key, NFC_MAPS_SHOP: MAPS_SHOP } : {};
}
const env = { ...process.env, NFC_ENV: 'local', SERVER_DATA_ENABLED: 'true', DATABASE_URL: url, APP_ORIGIN: origin,
  NFC_VISITS_V2_ENABLED: 'true', NFC_OWNER_V2_ENABLED: 'true', NFC_ADMIN_ENABLED: 'true', NFC_PUBLISHING_ENABLED: 'true',
  NFC_RENDER_SIGNING_KEY: key('render'), NFC_TOTP_KEY: key('totp'), NFC_GOOGLE_TOKEN_KEY: key('google-token'), NEXT_TELEMETRY_DISABLED: '1',
  // Next never lets a .env file override a variable already set, so these blanks keep any old .env.local (one from
  // 10/09 holds a remote DATABASE_URL and media origin) out of the local app. Empty reads as unset everywhere.
  DATABASE_URL_DIRECT: '', DATABASE_URL_UNPOOLED: '', MEDIA_PUBLIC_ORIGIN: '', STORAGE_ENDPOINT: '',
  R2_ACCOUNT_ID: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '', R2_BUCKET: '',
  NFC_GOOGLE_CLIENT_ID: '', NFC_GOOGLE_CLIENT_SECRET: '', ...privateGoogle(), NFC_MAPS_KEY: '', NFC_MAPS_SHOP: '', ...mapsTool() };
// Pictures shops upload go to a small store on this machine (scripts/local/store.ts), as they go to R2 in production. Not with
// --lan: a phone cannot reach 127.0.0.1, and the app accepts a plain-http store only on this machine.
const store = { port: 3322, dir: join(homedir(), '.nfc-local', 'media') };
if (!lan) Object.assign(env, { STORAGE_ENDPOINT: `http://127.0.0.1:${store.port}`, STORAGE_REGION: 'auto', R2_BUCKET: 'nfc-media',
  R2_ACCESS_KEY_ID: 'nfc-local', R2_SECRET_ACCESS_KEY: key('store'), MEDIA_PUBLIC_ORIGIN: `http://127.0.0.1:${store.port}/nfc-media`,
  NFC_LOCAL_MEDIA_DIR: store.dir });

const sh = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', env, ...options });
  if (result.status !== 0 && !options.allowFail) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
  return result.status;
};

function totp() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = ''; for (const c of LOCAL.totp) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const secret = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', secret).update(counter).digest(), o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
if (process.argv[2] === 'code') { console.log(totp()); process.exit(0); }

// The cluster: made once, started when it is not running.
if (!existsSync(join(data, 'PG_VERSION'))) {
  mkdirSync(data, { recursive: true });
  sh(join(bin, 'initdb'), ['-D', data, '-U', 'nfc', '--auth=trust', '-E', 'UTF8', '--locale=en_US.UTF-8'], { stdio: 'ignore' });
}
if (sh(join(bin, 'pg_isready'), ['-h', '127.0.0.1', '-p', String(port)], { allowFail: true, stdio: 'ignore' }) !== 0) {
  sh(join(bin, 'pg_ctl'), ['-D', data, '-o', `-p ${port} -c unix_socket_directories= -c listen_addresses=127.0.0.1`, '-l', join(data, 'log'), '-w', 'start'], { stdio: 'ignore' });
}

// The database: rebuilt from db/schema.sql when the file changed since it was built, or on --reset.
const schema = readFileSync('db/schema.sql', 'utf8'), hash = createHash('sha256').update(schema).digest('hex').slice(0, 16);
const server = new pg.Client({ connectionString: `postgresql://nfc@127.0.0.1:${port}/postgres` });
await server.connect();
const exists = (await server.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount > 0;
let built = null;
if (exists) {
  const db = new pg.Client({ connectionString: url }); await db.connect();
  built = (await db.query("SELECT to_regclass('local_schema') IS NOT NULL present")).rows[0].present
    ? (await db.query('SELECT hash FROM local_schema')).rows[0]?.hash ?? null : null;
  await db.end();
}
if (!exists || built !== hash || process.argv.includes('--reset')) {
  // FORCE: a running dev server holds connections; it reconnects on its next query.
  if (exists) await server.query(`DROP DATABASE ${database} WITH (FORCE)`);
  await server.query(`CREATE DATABASE ${database}`);
  const db = new pg.Client({ connectionString: url }); await db.connect();
  await db.query(schema);
  await db.query('CREATE TABLE local_schema(hash text NOT NULL)'); await db.query('INSERT INTO local_schema VALUES($1)', [hash]);
  await db.end();
  console.log(exists ? 'Database: lược đồ đổi, đã làm lại từ db/schema.sql.' : 'Database: đã dựng từ db/schema.sql.');
} else console.log('Database: đúng lược đồ hiện tại.');
await server.end();

sh(process.execPath, ['scripts/bootstrap-admin.mjs', LOCAL.admin], { allowFail: true, stdio: 'ignore', env: { ...env, NFC_ADMIN_PASSWORD: LOCAL.adminPassword } });
sh(process.execPath, ['--experimental-transform-types', '--no-warnings', '--import', './scripts/local/hooks.mjs', 'scripts/local/seed.ts']);

console.log(`
  Trang chính     ${origin}/
  Bắt đầu         ${origin}/bat-dau
  Giao diện chính ${origin}/app            ${LOCAL.owner} / ${LOCAL.ownerPassword}
  Quản trị /gov   ${origin}/gov            ${LOCAL.admin} / ${LOCAL.adminPassword} · mã 6 số: node scripts/local.mjs code
${env.NFC_MAPS_SHOP ? `  Quán (tool)     ${origin}/app/${MAPS_SHOP}/data   đánh giá thật từ tool Google Maps ở ${env.NFC_MAPS_URL}\n`
  : '  Không có tool Google Maps (~/MAps): chủ quán chưa có quán, /app mở onboarding.\n'}`);
if (process.argv.includes('--no-app')) process.exit(0);
const helpers = lan ? [] : [spawn(process.execPath, ['--experimental-transform-types', '--no-warnings', '--import', './scripts/local/hooks.mjs', 'scripts/local/store.ts'], { stdio: 'inherit', env })];
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', lan ? '0.0.0.0' : '127.0.0.1', '--port', '3321'], { stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const child of [app, ...helpers]) child.kill(signal); });
app.on('exit', code => { for (const child of helpers) child.kill('SIGTERM'); process.exit(code ?? 0); });
