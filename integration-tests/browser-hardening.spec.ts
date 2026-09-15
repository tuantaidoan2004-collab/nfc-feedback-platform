import { test as base, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { writeFile } from 'node:fs/promises';
const uri = process.env.NFC_TEST_DATABASE_URL, schema = process.env.NFC_TEST_SCHEMA;
if (uri !== 'postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test' || !/^nfc_ui_test_[a-f0-9]{32}$/.test(schema ?? '')) throw Error('Isolated harness required');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const test = base.extend<{ db: Pool }>({ db: async ({}, provideFixture) => {
  const db = new Pool({ connectionString: uri, options: `-c search_path=${schema}` });
  try { await db.query('TRUNCATE visit_sessions, experiences CASCADE'); await provideFixture(db); } finally { await db.end(); }
} });
test.use({ launchOptions: { executablePath: chrome, ignoreDefaultArgs: ['--disable-back-forward-cache'] } });
const star = (page: Page, n: number) => page.getByRole('button', { name: `${n} sao`, exact: true });
async function ready(page: Page) { await page.goto('/one'); await expect(star(page, 5)).toBeEnabled(); }
async function rate(page: Page, n: number) { await star(page, n).click(); await expect(page.locator('.rating-receipt')).toContainText(`${n}/5`); }
async function counts(db: Pool) {
  return (await db.query(`SELECT (SELECT count(*)::int FROM visit_sessions) sessions,
    (SELECT count(*)::int FROM page_visits) opens, (SELECT count(*)::int FROM rating_experiences) experiences`)).rows[0];
}
async function latest(db: Pool) {
  return (await db.query('SELECT rating,revision::int,feedback_message FROM rating_experiences ORDER BY first_interaction_at DESC LIMIT 1')).rows[0];
}

test('3E real history back/forward: actual BFCache and visibility match every stored event', async ({ page, db }, info) => {
  type Event = { kind: string; persisted?: boolean; path: string; visibility: string; navigation: string; trusted: boolean; at: number };
  const documents = new Map<string, Event[]>(), blocked: unknown[] = [];
  await page.exposeFunction('recordLifecycle', (value: { id: string; events: Event[] }) => documents.set(value.id, value.events));
  await page.addInitScript(() => {
    const id = crypto.randomUUID(), events: unknown[] = [];
    for (const kind of ['pageshow', 'pagehide', 'visibilitychange']) window.addEventListener(kind, event => {
      events.push({ kind, persisted: (event as PageTransitionEvent).persisted, path: location.pathname,
        visibility: document.visibilityState, navigation: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type,
        trusted: event.isTrusted, at: Date.now() });
      // Flush retained history after restore; bindings cannot deliver while the document is frozen.
      if (document.visibilityState === 'visible') (window as unknown as { recordLifecycle: (value: unknown) => void }).recordLifecycle({ id, events });
    });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable'); cdp.on('Page.backForwardCacheNotUsed', event => blocked.push(event));
  await ready(page); await rate(page, 5);
  await page.goto('/t/demo'); await page.goBack({ waitUntil: 'commit' }); await expect(star(page, 5)).toBeEnabled();
  await page.waitForLoadState('networkidle');
  await page.goForward({ waitUntil: 'commit' }); await expect(page.getByRole('button', { name: /Google Maps/ })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.goBack({ waitUntil: 'commit' }); await expect(star(page, 5)).toBeEnabled(); await page.waitForLoadState('networkidle');
  await expect(page.locator('.rating-receipt')).toContainText('5/5');
  const events = [...documents.values()].flat().sort((a, b) => a.at - b.at).filter(event => event.path === '/one');
  const shows = events.filter(event => event.kind === 'pageshow');
  const expected = shows.map(event => event.persisted ? 'resume' : event.navigation === 'navigate' ? 'load' : event.navigation);
  const kinds = (await db.query('SELECT navigation_kind FROM page_visits ORDER BY opened_at')).rows.map(row => row.navigation_kind);
  const evidence = { events, expected, kinds, blocked };
  const path = info.outputPath('history-evidence.json'); await writeFile(path, JSON.stringify(evidence, null, 2));
  await info.attach('history-evidence', { path, contentType: 'application/json' });
  expect(shows.every(event => event.trusted)).toBe(true);
  expect(shows.filter(event => event.persisted).length).toBeGreaterThan(0);
  expect(events.some(event => event.kind === 'visibilitychange' && event.visibility === 'hidden' && event.trusted)).toBe(true);
  expect(events.some(event => event.kind === 'visibilitychange' && event.visibility === 'visible' && event.trusted)).toBe(true);
  expect(kinds).toEqual(expected); expect((await counts(db)).sessions).toBe(1);
});

test('3E two tabs with empty storage share identity, rating/feedback revisions and conflict reconciliation', async ({ page, context, db }) => {
  const other = await context.newPage();
  await Promise.all([ready(page), ready(other)]);
  expect((await db.query('SELECT count(DISTINCT browser_hash)::int n FROM visit_sessions')).rows[0].n).toBe(1);
  expect((await counts(db)).sessions).toBe(1);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let first = true;
  await page.route('**/rating', async route => { const response = await route.fetch(); if (first) { first = false; await held; } await route.fulfill({ response }); });
  const sent = page.waitForRequest('**/rating'); await star(page, 5).click(); await sent; await star(page, 2).click(); release();
  await expect(page.locator('.rating-receipt')).toContainText('2/5');
  await other.reload(); await expect(star(other, 2)).toBeEnabled();
  await other.locator('#private-feedback').click(); await other.locator('#message').fill('Two-tab private text');
  const response = other.waitForResponse('**/feedback'); await other.getByRole('button', { name: 'Gửi góp ý', exact: true }).click();
  const acknowledged = await response; expect(await acknowledged.text()).not.toMatch(/Two-tab private text|"message"|"topic"/);
  await expect(other.locator('#message')).toHaveValue('');
  expect(await latest(db)).toMatchObject({ rating: 2, revision: 3, feedback_message: 'Two-tab private text' });
  await star(page, 4).click(); await expect(page.getByRole('status')).toContainText('Đánh giá đã thay đổi');
  await expect(star(page, 2)).toHaveAttribute('aria-pressed', 'true');
  expect(await latest(db)).toMatchObject({ rating: 2, revision: 3 });
  await rate(page, 4); expect(await latest(db)).toMatchObject({ rating: 4, revision: 4, feedback_message: 'Two-tab private text' });
  expect((await counts(db)).experiences).toBe(1);
});

test('3E deleting storage pins active document identity, reload creates a separate session', async ({ page, db }) => {
  await ready(page); await rate(page, 5);
  await page.evaluate(() => localStorage.removeItem('nfc:browser-secret:v1'));
  await rate(page, 2); expect(await counts(db)).toEqual({ sessions: 1, opens: 1, experiences: 1 });
  await page.reload(); await expect(star(page, 5)).toBeEnabled();
  await expect(page.locator('.rating-receipt')).not.toContainText('/5');
  await rate(page, 4); expect(await counts(db)).toEqual({ sessions: 2, opens: 2, experiences: 2 });
});

test.describe('3E actual browser storage disabled', () => {
  test('memory fallback works within document and does not pretend to survive reload', async ({ playwright, db }) => {
    const browser = await playwright.chromium.launch({ executablePath: chrome, args: ['--disable-local-storage'] });
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3317' }); const page = await context.newPage();
    try {
    await ready(page);
    expect(await page.evaluate(() => { try { localStorage.setItem('test-probe', '1'); localStorage.removeItem('test-probe'); return false; } catch { return true; } })).toBe(true);
    await rate(page, 5); await rate(page, 2); expect((await counts(db)).sessions).toBe(1);
    await page.reload(); await expect(star(page, 5)).toBeEnabled(); expect((await counts(db)).sessions).toBe(2);
    await expect(page.locator('.rating-receipt')).not.toContainText('/5');
    } finally { await browser.close(); }
  });
});

test('3E DB time before/after idle15m: same browser reload reuses then starts a new session', async ({ page, db }, info) => {
  await ready(page); await rate(page, 5);
  // Backdate fixture timestamps, not client clock or production clock function. DB-time evidence checks the actual gap.
  const before = (await db.query("UPDATE visit_sessions SET started_at=clock_timestamp()-interval '20 minutes', last_activity=clock_timestamp()-interval '14 minutes 50 seconds' RETURNING last_activity")).rows[0].last_activity;
  await page.reload(); await expect(star(page, 5)).toBeEnabled();
  const openedBefore = (await db.query('SELECT opened_at FROM page_visits ORDER BY opened_at DESC LIMIT 1')).rows[0].opened_at;
  const deltaBefore = openedBefore.getTime() - before.getTime(); expect(deltaBefore).toBeLessThan(900000); expect(deltaBefore).toBeGreaterThan(889000);
  expect((await counts(db)).sessions).toBe(1); await expect(page.locator('.rating-receipt')).toContainText('5/5');
  const after = (await db.query("UPDATE visit_sessions SET last_activity=clock_timestamp()-interval '15 minutes 10 seconds' RETURNING last_activity")).rows[0].last_activity;
  await page.reload(); await expect(star(page, 5)).toBeEnabled();
  const openedAfter = (await db.query('SELECT opened_at FROM page_visits ORDER BY opened_at DESC LIMIT 1')).rows[0].opened_at;
  const deltaAfter = openedAfter.getTime() - after.getTime(); expect(deltaAfter).toBeGreaterThanOrEqual(900000);
  expect(await counts(db)).toEqual({ sessions: 2, opens: 3, experiences: 1 });
  await expect(page.locator('.rating-receipt')).not.toContainText('/5');
  await info.attach('idle-boundary-evidence', { body: JSON.stringify({ deltaBefore, deltaAfter, threshold: 900000 }), contentType: 'application/json' });
});

test('3E lost rating response after server commit retries original across expired session and new tab', async ({ page, context, db }) => {
  await ready(page);
  const payloads: unknown[] = []; let lost = true;
  await page.route('**/rating', async route => {
    payloads.push(route.request().postDataJSON()); const response = await route.fetch();
    if (lost) await route.abort(); else await route.fulfill({ response });
  });
  await star(page, 5).click(); await expect(page.getByRole('button', { name: 'Thử lại lần gửi', exact: true })).toBeVisible();
  expect(await latest(db)).toMatchObject({ rating: 5, revision: 1 });
  await db.query("UPDATE visit_sessions SET started_at=clock_timestamp()-interval '20 minutes',last_activity=clock_timestamp()-interval '16 minutes'");
  const other = await context.newPage(); await ready(other); expect((await counts(db)).sessions).toBe(2);
  lost = false; await page.getByRole('button', { name: 'Thử lại lần gửi', exact: true }).click();
  await expect(page.locator('.rating-receipt')).toContainText('5/5');
  expect(payloads).toHaveLength(3); expect(payloads[1]).toEqual(payloads[0]); expect(payloads[2]).toEqual(payloads[0]);
  expect((await db.query('SELECT count(*)::int n FROM rating_intent_receipts')).rows[0].n).toBe(1);
  expect((await counts(db)).experiences).toBe(1);
});

test.describe('3E foreground visibility', () => {
  test('actual same-window tab switch creates exactly one resume and preserves session', async ({ playwright, db }, info) => {
    const browser = await playwright.chromium.launch({ executablePath: chrome, headless: false, ignoreDefaultArgs: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3317' }); const page = await context.newPage();
    try {
    await ready(page); await rate(page, 5);
    const states: string[] = [];
    await page.exposeFunction('recordVisibility', (state: string) => states.push(state));
    await page.evaluate(() => document.addEventListener('visibilitychange', () => {
      (window as unknown as { recordVisibility: (state: string) => void }).recordVisibility(document.visibilityState);
    }));
    const cdp = await context.newCDPSession(page), browserCdp = await browser.newBrowserCDPSession();
    const { targetInfo } = await cdp.send('Target.getTargetInfo');
    const added = context.waitForEvent('page');
    const { targetId } = await browserCdp.send('Target.createTarget', { url: 'http://127.0.0.1:3317/t/demo', browserContextId: targetInfo.browserContextId, newWindow: false });
    const other = await added; await browserCdp.send('Target.activateTarget', { targetId });
    const hidden = await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden').then(() => true, () => false);
    if (!hidden) {
      const path = info.outputPath('visibility-unavailable.json');
      await writeFile(path, JSON.stringify({ state: await page.evaluate(() => document.visibilityState), states, reason: 'Automation target activation did not produce a real hidden state; no event synthesized.' }));
      await info.attach('visibility-unavailable', { path, contentType: 'application/json' });
      test.skip(true, 'This desktop automation environment does not produce tab visibility transitions. BFCache visibility is verified separately.');
    }
    await browserCdp.send('Target.activateTarget', { targetId: targetInfo.targetId });
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
    await other.close();
    await expect.poll(async () => (await counts(db)).opens).toBe(2);
    expect((await counts(db)).sessions).toBe(1);
    expect(states).toEqual(['hidden', 'visible']);
    expect((await db.query('SELECT navigation_kind FROM page_visits ORDER BY opened_at')).rows.map(row => row.navigation_kind)).toEqual(['load', 'resume']);
    await info.attach('visibility-evidence', { body: JSON.stringify(states), contentType: 'application/json' });
    } finally { await browser.close(); }
  });
});
