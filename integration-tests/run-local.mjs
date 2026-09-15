// Local-only harness: positive source allowlist, never reads/copies project env files.
import { mkdtemp, cp, symlink, realpath, readFile, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import pg from 'pg';
const root = process.cwd(), temp = await mkdtemp(join(tmpdir(), 'nfc-3d-'));
const schema = `nfc_ui_test_${randomUUID().replaceAll('-', '')}`;
const local = 'postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
const admin = new pg.Pool({ connectionString: local });
const scoped = new URL(local); scoped.searchParams.set('options', `-c search_path=${schema}`);
const db = new pg.Pool({ connectionString: scoped.href });
const children = [], logs = [];
const owner = process.argv.includes('--owner');
const publishing = owner || process.argv.includes('--publishing');
const signingFixture = randomBytes(32).toString('hex');
const safeEnv = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: temp, TMPDIR: tmpdir(), NEXT_TELEMETRY_DISABLED: '1' };
async function run(args, cwd, env) {
  return new Promise((yes, no) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
    child.on('error', no); child.on('exit', code => code === 0 ? yes() : no(Error(`Command exited ${code}`)));
  });
}
async function copyApp(name) {
  const dest = join(temp, name);
  for (const path of ['app', 'components', 'lib', 'server', 'public', 'scripts', 'package.json', 'tsconfig.json', 'next.config.ts', 'next-env.d.ts']) {
    await cp(join(root, path), join(dest, path), { recursive: true, filter: source => !basename(source).startsWith('.env') });
  }
  await symlink(await realpath(join(root, 'node_modules')), join(dest, 'node_modules'));
  return dest;
}
async function startApp(name, port, flag, builtApp) {
  const cwd = builtApp ?? await copyApp(name), log = await open(join(temp, `${name}.log`), 'w'); logs.push(log);
  // The built app deliberately leaves NFC_ENV unset: the production gate test proves feature flags alone
  // never open v2. Dev apps declare it so the rest of the suite exercises the enabled surfaces.
  const env = { ...safeEnv, NODE_ENV: builtApp ? 'production' : 'development', ...(builtApp ? {} : { NFC_ENV: 'local' }), SERVER_DATA_ENABLED: 'true', DATABASE_URL: scoped.href,
    APP_ORIGIN: `http://127.0.0.1:${port}`, NFC_VISITS_V2_ENABLED: flag, NFC_PUBLISHING_ENABLED: publishing && flag === 'true' ? 'true' : 'false', NFC_RENDER_SIGNING_KEY: signingFixture, NFC_OWNER_V2_ENABLED: owner && flag === 'true' ? 'true' : 'false' };
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...(builtApp ? ['start'] : ['dev', '--webpack']), '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd, env, stdio: ['ignore', log.fd, log.fd] });
  children.push(child);
  for (let n = 0; n < 120; n++) {
    if (child.exitCode !== null) throw Error(`${name} exited`);
    try { if ((await fetch(`${env.APP_ORIGIN}/one`)).ok) return cwd; } catch { /* Wait for local server. */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw Error(`${name} did not start`);
}
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  for (const migration of ['001_core.sql', '002_visit_ratings.sql', ...(publishing ? ['003_publishing.sql'] : []), ...(owner ? ['004_owner_dashboard.sql'] : [])]) await db.query(await readFile(join(root, 'db/migrations', migration), 'utf8'));
  await db.query("INSERT INTO shops(slug,name,google_url) VALUES('one','Local test shop','https://maps.google.com/'),('two','Local test shop two',null)");
  const buildOnly = process.argv.includes('--build-only');
  const app = buildOnly ? await copyApp('build') : await startApp('on', 3317, 'true');
  if (!buildOnly) {
  await startApp('off', 3318, 'false');
  await run(process.argv.includes('--safari') ? ['integration-tests/safari-local.mjs'] : ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.integration.config.ts', '--grep-invert', 'production gate', ...process.argv.slice(2).filter(a => a !== '--build' && a !== '--publishing' && a !== '--owner')], root,
    { ...safeEnv, NFC_TEST_DATABASE_URL: local, NFC_TEST_SCHEMA: schema });
  }
  if (process.argv.includes('--build') || buildOnly) {
    // Standalone tracing needs dependencies inside the copied project, not external symlinks.
    await rm(join(app, 'node_modules'));
    await cp(await realpath(join(root, 'node_modules')), join(app, 'node_modules'), { recursive: true, verbatimSymlinks: true });
    await run(['node_modules/next/dist/bin/next', 'build', '--webpack'], app,
      { ...safeEnv, NODE_ENV: 'production', NFC_VISITS_V2_ENABLED: 'true' });
    await run(['scripts/prepare-standalone.mjs'], app, safeEnv);
    await startApp('production', 3319, 'true', app);
    await run(['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.integration.config.ts', '--grep', 'production gate'], root,
      { ...safeEnv, NFC_TEST_DATABASE_URL: local, NFC_TEST_SCHEMA: schema, NFC_TEST_PRODUCTION: 'true' });
  }
} catch (error) {
  for (const name of ['on', 'off', 'production']) {
    try { console.error((await readFile(join(temp, `${name}.log`), 'utf8')).slice(-4000)); } catch { /* Not started. */ }
  }
  console.error(error.message); process.exitCode = 1;
} finally {
  await Promise.all(children.map(child => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve); child.kill('SIGTERM');
  })));
  await Promise.all(logs.map(log => log.close()));
  await db.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
  await rm(temp, { recursive: true, force: true });
}
