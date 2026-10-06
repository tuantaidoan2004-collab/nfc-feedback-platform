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
// `--owner` opens the owners' side of the app, `--admin` the administrators' too (they act on owners' shops).
const platformAdmin = process.argv.includes('--admin');
const owner = platformAdmin || process.argv.includes('--owner');
// `--publishing` is still accepted (CI passes it) but changes nothing: every mode publishes since lát A3b.
const signingFixture = randomBytes(32).toString('hex');
// The administrator's second factor is sealed with this; without it the app refuses to store a secret at all.
const totpFixture = randomBytes(32).toString('hex');
// Google sign-in (lát D4c) against a stand-in for Google that admin-http.spec.ts runs on 3329. The browser meets it at
// `localhost`, another site than the app's 127.0.0.1, as Google is on production: a SameSite=Strict cookie then stays
// behind on the way back, exactly as it does there (a stand-in on 127.0.0.1 hid that, 28/09). The two addresses move only
// because the dev apps declare NFC_ENV=local (lib/owner/google.ts); the built app keeps Google's own.
const googleFixture = { NFC_GOOGLE_CLIENT_ID: 'harness-client.apps.googleusercontent.com', NFC_GOOGLE_CLIENT_SECRET: 'harness-google-secret',
  NFC_GOOGLE_AUTH_URL: 'http://localhost:3329/auth', NFC_GOOGLE_TOKEN_URL: 'http://127.0.0.1:3329/token' };
// Still an allowlist: only these names cross into the children. CI and CHROME_PATH tell Playwright which real
// Chrome to launch (playwright.chrome.ts); without them a GitHub runner would look for Tài's Mac app (lát A4).
// DISPLAY and XAUTHORITY are what `xvfb-run` puts in this process's environment: the one case that opens a headed
// Chrome launches it from the child, and without them that Chrome answers "Missing X server or $DISPLAY" (lát A4).
const passed = Object.fromEntries(['CI', 'CHROME_PATH', 'DISPLAY', 'XAUTHORITY'].filter(name => process.env[name]).map(name => [name, process.env[name]]));
// The picture store the dev apps upload into: the local app's own (scripts/local/store.ts), on 3328, files in the temp copy.
const storeFixture = { STORAGE_ENDPOINT: 'http://127.0.0.1:3328', STORAGE_REGION: 'auto', R2_BUCKET: 'nfc-media', R2_ACCESS_KEY_ID: 'harness',
  R2_SECRET_ACCESS_KEY: randomBytes(32).toString('hex'), MEDIA_PUBLIC_ORIGIN: 'http://127.0.0.1:3328/nfc-media' };
const safeEnv = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: temp, TMPDIR: tmpdir(), NEXT_TELEMETRY_DISABLED: '1', ...passed };
async function run(args, cwd, env) {
  return new Promise((yes, no) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
    child.on('error', no); child.on('exit', code => code === 0 ? yes() : no(Error(`Command exited ${code}`)));
  });
}
async function copyApp(name) {
  const dest = join(temp, name);
  for (const path of ['app', 'components', 'lib', 'templates', 'server', 'public', 'scripts', 'package.json', 'tsconfig.json', 'next.config.ts', 'next-env.d.ts', 'proxy.ts']) {
    await cp(join(root, path), join(dest, path), { recursive: true, filter: source => !basename(source).startsWith('.env') });
  }
  await symlink(await realpath(join(root, 'node_modules')), join(dest, 'node_modules'));
  return dest;
}
/**
 * `next dev` compiles a route the first time it is asked for, and then tells every open page to reload; a test that
 * opens such a page mid-compile loses what it had typed (docs/operations-gotchas.md). Asking for the routes once,
 * before any browser is open, moves that compile out of the test run. It matters most on a slow CI runner, where the
 * admin suite failed on and off (lát A4).
 */
const zero = '00000000-0000-4000-8000-000000000000';
async function warm(origin) {
  const paths = ['/one', '/', '/dieu-khoan', '/huong-dan-google', '/t/zzzzz', '/owner/login?next=%2FZZZ%2Fone', '/ZZZ/one', '/gov', '/gov/login', '/preview',
    '/api/owner/v2/one', '/api/owner/v2/one/summary', '/api/owner/v2/one/team', '/api/owner/v2/one/activity', '/api/owner/v2/one/cards',
    '/api/owner/v2/one/comments?session=x', '/api/owner/v2/profile', '/api/owner/v2/notifications', '/api/v2/pages/visits', '/gov/api/media',
    // The page list (lát P3): its API, and the route of the pictures it frames.
    '/api/owner/v2/one/pages', '/ZZZ/one/thumb/one', '/gov/api/incidents', `/gov/api/incidents/${zero}`, `/gov/api/pages/${zero}`,
    // The behaviour beacon (lát mục 7). A route compiled on its first call makes `next dev` reload every open
    // page, and a beacon fires while another test has a half-filled login form on screen.
    `/api/v2/pages/visits/${zero}/events`,
    // Sign-up and onboarding (đợt ①), the Library and My Card, the templates, and the crawler files.
    '/bat-dau', '/api/start/signup', '/app/one', '/app/one/library', '/app/one/my-card', '/templates', '/templates/basic-1',
    '/app/one/dashboard', '/app/one/data', '/app/one/my-card', '/app/one/quan-ly', '/app/one/cai-dat', '/api/owner/v2/one/overview', '/api/owner/v2/one/pulse',
    '/api/owner/v2/one/google-business', '/api/owner/v2/one/onboarding', '/api/owner/v2/one/edit-requests', '/api/owner/v2/logout', '/owner/setup/' + '0'.repeat(64),
    // A page waiting for Tài to build it (06/10): the template /gov shows, and the steps he marks.
    `/gov/xem/${zero}`, `/gov/api/edit-requests/${zero}`,
    '/robots.txt', '/sitemap.xml',
    // Google sign-in (lát D4c).
    '/api/owner/v2/google/start', '/api/owner/v2/google/callback'];
  await Promise.all(paths.map(path => fetch(`${origin}${path}`).catch(() => null)));
}

async function startApp(name, port, flag, builtApp) {
  const cwd = builtApp ?? await copyApp(name), log = await open(join(temp, `${name}.log`), 'w'); logs.push(log);
  // The built app deliberately leaves NFC_ENV unset: the production gate test proves feature flags alone
  // never open v2. Dev apps declare it so the rest of the suite exercises the enabled surfaces.
  const env = { ...safeEnv, NODE_ENV: builtApp ? 'production' : 'development', ...(builtApp ? {} : { NFC_ENV: 'local' }), SERVER_DATA_ENABLED: 'true', DATABASE_URL: scoped.href,
    APP_ORIGIN: `http://127.0.0.1:${port}`, ...(builtApp ? {} : storeFixture), NFC_VISITS_V2_ENABLED: flag, NFC_PUBLISHING_ENABLED: flag, NFC_RENDER_SIGNING_KEY: signingFixture, NFC_TOTP_KEY: totpFixture, ...googleFixture, NFC_OWNER_V2_ENABLED: owner && flag === 'true' ? 'true' : 'false', NFC_ADMIN_ENABLED: platformAdmin && flag === 'true' ? 'true' : 'false' };
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...(builtApp ? ['start'] : ['dev', '--webpack']), '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd, env, stdio: ['ignore', log.fd, log.fd] });
  children.push(child);
  for (let n = 0; n < 120; n++) {
    if (child.exitCode !== null) throw Error(`${name} exited`);
    // A static page: with the gates closed `/one` is a 404 by design (lát A3), so it cannot tell "up" from "not yet".
    try { if ((await fetch(`${env.APP_ORIGIN}/dieu-khoan`)).ok) { await warm(env.APP_ORIGIN); return cwd; } } catch { /* Wait for local server. */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw Error(`${name} did not start`);
}
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  // The whole database in one step (Tài 05/10: no migrations while the frame is rebuilt): db/schema.sql, as the app and the
  // repository suite use it, so the harness never runs on a schema the app does not have.
  await db.query(await readFile(join(root, 'db/schema.sql'), 'utf8'));
  await db.query("INSERT INTO shops(slug,name,google_url) VALUES('one','Local test shop','https://maps.google.com/'),('two','Local test shop two',null)");
  const buildOnly = process.argv.includes('--build-only');
  if (owner && !buildOnly) children.push(spawn(process.execPath, ['--experimental-transform-types', '--no-warnings', '--import', './scripts/local/hooks.mjs', 'scripts/local/store.ts'],
    { cwd: root, env: { ...safeEnv, ...storeFixture, NFC_LOCAL_MEDIA_DIR: join(temp, 'media'), APP_ORIGIN: 'http://127.0.0.1:3317' }, stdio: 'ignore' }));
  const app = buildOnly ? await copyApp('build') : await startApp('on', 3317, 'true');
  if (!buildOnly) {
  await startApp('off', 3318, 'false');
  await run(process.argv.includes('--safari') ? ['integration-tests/safari-local.mjs'] : ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.integration.config.ts', '--grep-invert', 'production gate', ...process.argv.slice(2).filter(a => a !== '--build' && a !== '--publishing' && a !== '--owner' && a !== '--admin')], root,
    { ...safeEnv, NFC_TOTP_KEY: totpFixture, NFC_TEST_DATABASE_URL: local, NFC_TEST_SCHEMA: schema });
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
      { ...safeEnv, NFC_TOTP_KEY: totpFixture, NFC_TEST_DATABASE_URL: local, NFC_TEST_SCHEMA: schema, NFC_TEST_PRODUCTION: 'true' });
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
  // `next` leaves worker processes that can still be writing into the copy for a moment after it exits; without retries the
  // delete then fails with ENOTEMPTY and turns a green run red (admin harness, 05/10).
  await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
