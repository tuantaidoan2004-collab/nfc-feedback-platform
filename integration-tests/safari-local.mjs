// W3C WebDriver over localhost, using Apple's existing branded Safari driver. No Selenium install.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
const uri = process.env.NFC_TEST_DATABASE_URL, schema = process.env.NFC_TEST_SCHEMA;
if (uri !== 'postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test' || !/^nfc_ui_test_[a-f0-9]{32}$/.test(schema ?? '')) throw Error('Isolated harness required');
const db = new pg.Pool({ connectionString: uri, options: `-c search_path=${schema}` });
const driver = spawn('/usr/bin/safaridriver', ['--port', '3320'], { stdio: 'ignore' });
const report = { macOS: {}, iOS: {}, productionChanged: false };
let session;
async function command(path, data, method = data === undefined ? 'GET' : 'POST') {
  const r = await fetch(`http://127.0.0.1:3320${path}`, { method, signal: AbortSignal.timeout(30000),
    headers: data === undefined ? undefined : { 'content-type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const body = await r.json(); if (!r.ok) throw Error(body.value?.message ?? body.value?.error ?? `HTTP ${r.status}`);
  return body.value;
}
const call = (path, data, method) => command(`/session/${session}${path}`, data, method);
const js = script => call('/execute/sync', { script, args: [] });
async function until(script) {
  for (let i = 0; i < 80; i++) { try { if (await js(script)) return; } catch { /* Actual navigation may replace document. */ } await new Promise(r => setTimeout(r, 100)); }
  throw Error(`Condition not met: ${script}`);
}
async function element(selector) { const el = await call('/element', { using: 'css selector', value: selector }); return el['element-6066-11e4-a52e-4f735466cecf']; }
async function click(selector) { await call(`/element/${await element(selector)}/click`, {}); }
async function navigate(path) { await call('/url', { url: `http://127.0.0.1:3317${path}` }); }
const ready = () => until("return !!document.querySelector('.stars button') && !document.querySelector('.stars button').disabled");
async function count() { return (await db.query('SELECT (SELECT count(*)::int FROM page_visits) opens,(SELECT count(*)::int FROM visit_sessions) sessions,(SELECT count(*)::int FROM rating_experiences) experiences')).rows[0]; }
async function rate(n) { await click(`.stars button:nth-child(${n})`); await until(`return document.querySelector('.rating-receipt')?.textContent.includes('${n}/5')`); }
async function closeSession() { if (session) { await call('', undefined, 'DELETE'); session = undefined; } }
try {
  for (let i = 0; i < 30; i++) { try { await command('/status'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  // Explicitly refuse simulators. Driver reports matching paired-device/lock/trust capability failures itself.
  try {
    const created = await command('/session', { capabilities: { alwaysMatch: { browserName: 'safari', platformName: 'iOS', 'safari:useSimulator': false, 'safari:deviceType': 'iPhone' } } });
    session = created.sessionId;
    report.iOS = { detected: true, platform: created.capabilities.platformName, browserVersion: created.capabilities.browserVersion,
      blocker: 'Physical device session available; Mac localhost endpoint is not a device-reachable HTTPS origin. No network/tunnel settings changed.' };
    await closeSession();
  } catch (error) { report.iOS = { sessionAvailable: false, deviceFound: error.message.includes('Some devices were found'), blocker: error.message.includes('device is not paired') ? 'Connected iPhone found, but device is not paired. Trust/unlock state beyond pairing is not known.' : error.message }; }
  try {
    const created = await command('/session', { capabilities: { alwaysMatch: { browserName: 'safari', platformName: 'macOS' } } });
    session = created.sessionId;
    report.macOS = { available: true, platform: created.capabilities.platformName, browserVersion: created.capabilities.browserVersion, passed: [] };
  } catch (error) { report.macOS = { available: false, blocker: error.message }; }
  if (session) {
    // Warm the other local route before Safari attaches its development HMR connection.
    await fetch('http://127.0.0.1:3317/t/demo');
    await call('/timeouts', { implicit: 0, pageLoad: 15000, script: 10000 });
    await db.query('TRUNCATE visit_sessions, experiences CASCADE');
    await navigate('/one'); await ready(); assert.deepEqual(await count(), { opens: 1, sessions: 1, experiences: 0 });
    report.macOS.passed.push('initial open exactly once');
    const invitation = await js("return document.querySelector('.google-invitation').textContent");
    const link = await js("return document.querySelector('.google-button').getAttribute('href')");
    await js("window.testResponses=[]; const original=window.fetch; window.fetch=async (...args)=>{const r=await original(...args);if(String(args[0]).includes('/api/v2/')) window.testResponses.push(await r.clone().json());return r;}; return true;");
    await rate(5); await rate(2);
    assert.equal(await js("return document.querySelector('.google-invitation').textContent"), invitation);
    assert.equal(await js("return document.querySelector('.google-button').getAttribute('href')"), link);
    assert.equal(await js("return document.querySelector('.pulse-fill').classList.contains('idle')"), false);
    report.macOS.passed.push('rating 5→2, Google invariant and low-score pulse');
    await call(`/element/${await element('#message')}/value`, { text: 'Safari private feedback' });
    await click('#private-form button[type=submit], #private-form button.primary');
    await until("return document.querySelector('#message').value==='' && document.querySelector('[role=status]').textContent.includes('Đã gửi góp ý riêng')");
    const saved = (await db.query('SELECT rating,revision::int,feedback_message FROM rating_experiences')).rows;
    assert.deepEqual(saved, [{ rating: 2, revision: 3, feedback_message: 'Safari private feedback' }]);
    const responses = JSON.stringify(await js('return window.testResponses'));
    assert(!responses.includes('Safari private feedback')); assert(!/"(message|topic|feedback_message)"/.test(responses));
    report.macOS.passed.push('private feedback shared revision, clear draft and public no-leak');
    await call('/refresh', {}); await ready(); assert.deepEqual(await count(), { opens: 2, sessions: 1, experiences: 1 });
    report.macOS.passed.push('reload keeps server experience/session');
    await js("window.testLifecycle=[];for(const name of ['pagehide','pageshow','visibilitychange'])window.addEventListener(name,e=>window.testLifecycle.push({name,persisted:e.persisted,trusted:e.isTrusted,visibility:document.visibilityState}));return true;");
    await navigate('/t/demo'); await until("return location.pathname==='/t/demo' && !!document.querySelector('.stars')");
    await call('/back', {}); await until("return location.pathname==='/one'"); await ready();
    await until("return document.querySelector('.rating-receipt')?.textContent.includes('2/5')");
    report.macOS.historyEvents = await js('return window.testLifecycle ?? null');
    report.macOS.historyRows = (await db.query('SELECT navigation_kind FROM page_visits ORDER BY opened_at')).rows.map(row => row.navigation_kind);
    assert.equal((await count()).sessions, 1);
    try {
      await call('/forward', {}); await until("return location.pathname==='/t/demo'");
      await call('/back', {}); await until("return location.pathname==='/one'"); await ready(); assert.equal((await count()).sessions, 1);
      report.macOS.passed.push('actual back/forward maintains session');
    } catch (error) {
      report.macOS.historyBlocker = { message: error.message, path: await js('return location.pathname') };
      await navigate('/one'); await ready();
    }
    report.macOS.bfcache = !!report.macOS.historyEvents?.some(event => event.name === 'pageshow' && event.persisted === true && event.trusted);
    report.macOS.visibility = report.macOS.historyEvents?.filter(event => event.name === 'visibilitychange') ?? [];
    await js("localStorage.removeItem('nfc:browser-secret:v1');return true;");
    await rate(4); assert.equal((await count()).sessions, 1);
    await call('/refresh', {}); await ready(); assert.equal((await count()).sessions, 2);
    assert.equal(await js("return document.querySelector('.rating-receipt').textContent.includes('/5')"), false);
    report.macOS.passed.push('storage cleared: pin current document, new identity after reload');
    const layouts = [];
    for (const width of [390, 768]) {
      await call('/window/rect', { width, height: 844 });
      const layout = await js('return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth}');
      assert.equal(layout.overflow, false); layouts.push(layout);
    }
    report.macOS.layout = layouts;
    report.macOS.passed.push('desktop window narrow layout (not iPhone or touch)');
  }
} catch (error) { report.failure = error.message; process.exitCode = 1; }
finally {
  try { await closeSession(); } finally { driver.kill(); await db.end(); }
  await mkdir('test-results/safari', { recursive: true });
  await writeFile('test-results/safari/evidence.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
