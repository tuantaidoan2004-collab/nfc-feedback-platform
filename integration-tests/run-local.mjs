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
// Administration needs migration 004 as well: admin_audit references owner identities for on-behalf-of work.
// The owner dashboard needs 005, 007 and 008 in turn: it shows the shop every administrator session and its own support switch.
const platformAdmin = process.argv.includes('--admin');
const owner = platformAdmin || process.argv.includes('--owner');
const publishing = owner || process.argv.includes('--publishing');
const signingFixture = randomBytes(32).toString('hex');
// The administrator's second factor is sealed with this; without it the app refuses to store a secret at all.
const totpFixture = randomBytes(32).toString('hex');
// Still an allowlist: only these names cross into the children. CI and CHROME_PATH tell Playwright which real
// Chrome to launch (playwright.chrome.ts); without them a GitHub runner would look for Tài's Mac app (lát A4).
// DISPLAY and XAUTHORITY are what `xvfb-run` puts in this process's environment: the one case that opens a headed
// Chrome launches it from the child, and without them that Chrome answers "Missing X server or $DISPLAY" (lát A4).
const passed = Object.fromEntries(['CI', 'CHROME_PATH', 'DISPLAY', 'XAUTHORITY'].filter(name => process.env[name]).map(name => [name, process.env[name]]));
const safeEnv = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: temp, TMPDIR: tmpdir(), NEXT_TELEMETRY_DISABLED: '1', ...passed };
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
/**
 * `next dev` compiles a route the first time it is asked for, and then tells every open page to reload; a test that
 * opens such a page mid-compile loses what it had typed (docs/operations-gotchas.md). Asking for the routes once,
 * before any browser is open, moves that compile out of the test run. It matters most on a slow CI runner, where the
 * admin suite failed on and off (lát A4).
 */
const zero = '00000000-0000-4000-8000-000000000000';
async function warm(origin) {
  const paths = ['/one', '/t/demo', '/owner/login?next=%2FZZZ%2Fone', '/ZZZ/one', '/gov', '/gov/login', '/preview',
    '/api/owner/v2/one', '/api/owner/v2/one/summary', '/api/owner/v2/one/team', '/api/owner/v2/one/activity', '/api/owner/v2/one/cards',
    '/api/owner/v2/one/comments?session=x', '/api/owner/v2/profile', '/api/owner/v2/notifications', '/api/v2/pages/visits', '/gov/api/media',
    // The page list (lát P3): its API, and the route of the pictures it frames.
    '/api/owner/v2/one/pages', '/ZZZ/one/thumb/one', '/gov/api/incidents', `/gov/api/incidents/${zero}`, `/gov/api/pages/${zero}`,
    // The behaviour beacon (lát mục 7). A route compiled on its first call makes `next dev` reload every open
    // page, and a beacon fires while another test has a half-filled login form on screen.
    `/api/v2/pages/visits/${zero}/events`, `/api/v2/shops/one/visits/${zero}/events`];
  await Promise.all(paths.map(path => fetch(`${origin}${path}`).catch(() => null)));
}

async function startApp(name, port, flag, builtApp) {
  const cwd = builtApp ?? await copyApp(name), log = await open(join(temp, `${name}.log`), 'w'); logs.push(log);
  // The built app deliberately leaves NFC_ENV unset: the production gate test proves feature flags alone
  // never open v2. Dev apps declare it so the rest of the suite exercises the enabled surfaces.
  const env = { ...safeEnv, NODE_ENV: builtApp ? 'production' : 'development', ...(builtApp ? {} : { NFC_ENV: 'local' }), SERVER_DATA_ENABLED: 'true', DATABASE_URL: scoped.href,
    APP_ORIGIN: `http://127.0.0.1:${port}`, NFC_VISITS_V2_ENABLED: flag, NFC_PUBLISHING_ENABLED: publishing && flag === 'true' ? 'true' : 'false', NFC_RENDER_SIGNING_KEY: signingFixture, NFC_TOTP_KEY: totpFixture, NFC_OWNER_V2_ENABLED: owner && flag === 'true' ? 'true' : 'false', NFC_ADMIN_ENABLED: platformAdmin && flag === 'true' ? 'true' : 'false' };
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...(builtApp ? ['start'] : ['dev', '--webpack']), '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd, env, stdio: ['ignore', log.fd, log.fd] });
  children.push(child);
  for (let n = 0; n < 120; n++) {
    if (child.exitCode !== null) throw Error(`${name} exited`);
    try { if ((await fetch(`${env.APP_ORIGIN}/one`)).ok) { await warm(env.APP_ORIGIN); return cwd; } } catch { /* Wait for local server. */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw Error(`${name} did not start`);
}
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  for (const migration of ['001_core.sql', '002_visit_ratings.sql', '010_feedback_without_rating.sql', '011_feedback_phone.sql', '018_guest_flood_control.sql', '020_page_events.sql', '021_erase_on_request.sql', ...(publishing ? ['003_publishing.sql', '013_short_card_codes.sql', '022_shop_profile.sql', '009_template_shop.sql', '023_media_review.sql', '024_pages.sql', '025_page_labels.sql', '026_page_lifecycle.sql'] : []), ...(owner ? ['004_owner_dashboard.sql', '005_platform_admin.sql', '006_owner_email_setup.sql', '007_admin_impersonation.sql', '008_shop_support_grants.sql', '012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql','019_admin_two_factor.sql'] : [])]) await db.query(await readFile(join(root, 'db/migrations', migration), 'utf8'));
  await db.query("INSERT INTO shops(slug,name,google_url) VALUES('one','Local test shop','https://maps.google.com/'),('two','Local test shop two',null)");
  const buildOnly = process.argv.includes('--build-only');
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
  await rm(temp, { recursive: true, force: true });
}
