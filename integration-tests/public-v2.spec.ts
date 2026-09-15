import { test as base, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
const uri = process.env.NFC_TEST_DATABASE_URL;
const schema = process.env.NFC_TEST_SCHEMA;
if (uri !== 'postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test' || !/^nfc_ui_test_[a-f0-9]{32}$/.test(schema ?? '')) throw Error('Isolated harness required');
const test = base.extend<{ db: Pool }>({
  db: async ({}, provideFixture) => {
    const db = new Pool({ connectionString: uri, options: `-c search_path=${schema}` });
    try {
      await db.query('TRUNCATE visit_sessions, experiences CASCADE');
      await provideFixture(db);
    } finally { await db.end(); }
  },
});
const star = (page: Page, n: number) => page.getByRole('button', { name: `${n} sao`, exact: true });
async function ready(page: Page) { await page.goto('/one'); await expect(star(page, 5)).toBeEnabled(); }
async function rated(page: Page, n: number) { await star(page, n).click(); await expect(page.locator('.rating-receipt')).toContainText(`${n}/5`); }
async function count(db: Pool, table: 'page_visits' | 'visit_sessions' | 'rating_experiences' | 'experiences') {
  return (await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;
}
async function experience(db: Pool) {
  return (await db.query('SELECT rating, revision::int, feedback_message, session_id FROM rating_experiences ORDER BY first_interaction_at DESC')).rows;
}
test.beforeEach(async ({ page }) => {
  // Fresh browser context, local sources only. Never use a signed-in browser profile.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
});

test('real page: initial once, rapid 5→2, shared feedback revision, reload, Google/VI-EN/pulse', async ({ page, db }, info) => {
  const opens: { navigationKind: string; loadKey: string }[] = [];
  const responses: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', r => { if (r.url().endsWith('/api/v2/shops/one/visits')) opens.push(r.postDataJSON()); });
  page.on('response', async r => { if (r.url().includes('/api/v2/')) responses.push(await r.text()); });
  await ready(page);
  expect(opens).toHaveLength(1); expect(opens[0].navigationKind).toBe('load');
  expect(await count(db, 'rating_experiences')).toBe(0);
  await page.locator('#private-feedback').click();
  await expect(page.getByRole('button', { name: 'Gửi góp ý', exact: true })).toBeDisabled();
  const google = await page.locator('.google-invitation').innerText();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let first = true;
  await page.route('**/rating', async route => {
    const response = await route.fetch();
    if (first) { first = false; await held; }
    await route.fulfill({ response });
  });
  const request = page.waitForRequest('**/rating');
  await star(page, 5).click(); await request;
  await star(page, 2).click();
  await expect(star(page, 2)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Gửi góp ý', exact: true })).toBeDisabled();
  release();
  await expect(page.locator('.rating-receipt')).toContainText('2/5');
  await expect(page.getByRole('button', { name: 'Gửi góp ý', exact: true })).toBeEnabled();
  expect(await page.locator('.google-invitation').innerText()).toBe(google);
  await expect(page.locator('.pulse-fill')).toHaveCSS('animation-name', 'feedback-breathe');
  expect(await experience(db)).toEqual([expect.objectContaining({ rating: 2, revision: 2, feedback_message: null })]);
  const privateText = 'Góp ý riêng: chờ hơi lâu 😀';
  await page.getByLabel('Góp ý của bạn', { exact: true }).fill(privateText);
  await page.getByRole('button', { name: 'Gửi góp ý', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã gửi góp ý riêng');
  await expect(page.locator('#message')).toHaveValue('');
  const saved = (await experience(db))[0]; expect(saved).toMatchObject({ rating: 2, revision: 3, feedback_message: privateText });
  await page.reload(); await expect(star(page, 5)).toBeEnabled();
  expect(opens).toHaveLength(2); expect(opens[1].navigationKind).toBe('reload');
  expect(opens[1].loadKey).not.toBe(opens[0].loadKey);
  expect(await count(db, 'page_visits')).toBe(2); expect(await count(db, 'visit_sessions')).toBe(1);
  expect((await experience(db))[0]).toEqual(saved);
  await page.locator('#private-feedback').click(); await expect(page.locator('#message')).toHaveValue('');
  expect(responses.join('')).not.toContain(privateText);
  for (const response of responses) expect(response).not.toMatch(/"(?:feedback|message|topic|feedback_message|feedback_topic)"/);
  await page.getByLabel(/Language/).selectOption('en');
  await expect(page.getByRole('button', { name: 'Send feedback', exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '1 stars', exact: true }).click();
  await expect(page.locator('.pulse-fill')).toHaveCSS('animation-name', 'none');
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('public-v2.png'), fullPage: true });
  expect(errors).toEqual([]); expect(await count(db, 'experiences')).toBe(0);
});

test('lost feedback response keeps text, explicit retry replays one immutable intent then clears text', async ({ page, db }) => {
  await ready(page); await rated(page, 2);
  const payloads: unknown[] = [];
  await page.route('**/feedback', async route => {
    payloads.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (payloads.length <= 2) await route.abort('failed'); else await route.fulfill({ response });
  });
  await page.locator('#message').fill('Private retry text');
  await page.getByRole('button', { name: 'Gửi góp ý', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Thử lại lần gửi', exact: true })).toBeVisible();
  await expect(page.locator('#message')).toHaveValue('Private retry text');
  await expect(page.locator('#message')).toBeDisabled();
  expect((await experience(db))[0]).toMatchObject({ revision: 2, feedback_message: 'Private retry text' });
  await page.getByRole('button', { name: 'Thử lại lần gửi', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã gửi góp ý riêng');
  await expect(page.locator('#message')).toHaveValue('');
  expect(payloads).toHaveLength(3); expect(payloads[1]).toEqual(payloads[0]); expect(payloads[2]).toEqual(payloads[0]);
  expect((await db.query("SELECT count(*)::int n FROM rating_intent_receipts WHERE operation='feedback'")).rows[0].n).toBe(1);
});

test('conflict refreshes stars, retains draft, does not overwrite another action', async ({ page, db }) => {
  await ready(page); await rated(page, 5);
  await page.locator('#private-feedback').click(); await page.locator('#message').fill('Draft survives conflict');
  let collide = true;
  await page.route('**/rating', async route => {
    if (collide) {
      collide = false;
      const other = await route.fetch({ postData: JSON.stringify({ ...route.request().postDataJSON(), intentId: randomUUID(), score: 4 }) });
      expect(other.status()).toBe(200);
    }
    await route.continue();
  });
  await star(page, 2).click();
  await expect(page.getByRole('status')).toContainText('Đánh giá đã thay đổi');
  await expect(star(page, 4)).toHaveAttribute('aria-pressed', 'true');
  expect((await experience(db))[0]).toMatchObject({ rating: 4, revision: 2 });
  await expect(page.locator('#message')).toHaveValue('Draft survives conflict');
  await page.getByRole('button', { name: 'Gửi góp ý', exact: true }).click();
  await expect(page.locator('#message')).toHaveValue('');
  expect((await experience(db))[0]).toMatchObject({ rating: 4, revision: 3, feedback_message: 'Draft survives conflict' });
});

test('SESSION_EXPIRED keeps draft; only fresh star action starts a new session', async ({ page, db }) => {
  await ready(page); await rated(page, 2);
  await page.locator('#message').fill('Do not migrate automatically');
  await db.query("UPDATE visit_sessions SET started_at=now()-interval '20 minutes',last_activity=now()-interval '16 minutes'");
  await page.getByRole('button', { name: 'Gửi góp ý', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Phiên đã hết hạn');
  await expect(page.locator('#message')).toHaveValue('Do not migrate automatically');
  expect(await count(db, 'visit_sessions')).toBe(1);
  expect((await experience(db))[0].feedback_message).toBeNull();
  await rated(page, 3);
  expect(await count(db, 'visit_sessions')).toBe(2);
  expect(await count(db, 'page_visits')).toBe(2);
  expect((await experience(db))[0]).toMatchObject({ rating: 3, revision: 1, feedback_message: null });
  await page.getByRole('button', { name: 'Gửi góp ý', exact: true }).click();
  await expect(page.locator('#message')).toHaveValue('');
  expect((await experience(db))[0]).toMatchObject({ revision: 2, feedback_message: 'Do not migrate automatically' });
});

test('unknown initial open retries same event and enables stars only after confirmation', async ({ page, db }) => {
  const payloads: unknown[] = [];
  await page.route('**/api/v2/shops/one/visits', async route => {
    payloads.push(route.request().postDataJSON()); const response = await route.fetch();
    if (payloads.length <= 2) await route.abort('failed'); else await route.fulfill({ response });
  });
  await page.goto('/one');
  await expect(page.getByRole('button', { name: 'Thử kết nối lại', exact: true })).toBeVisible();
  await expect(star(page, 5)).toBeDisabled();
  await page.getByRole('button', { name: 'Thử kết nối lại', exact: true }).click();
  await expect(star(page, 5)).toBeEnabled();
  expect(payloads).toHaveLength(3); expect(payloads[2]).toEqual(payloads[0]);
  expect(await count(db, 'page_visits')).toBe(1);
});

test('gate off retains legacy and v2 endpoint returns 404', async ({ page, request, db }) => {
  const v2: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/v2/')) v2.push(r.url()); });
  await page.goto('http://127.0.0.1:3318/one');
  await expect(star(page, 5)).toBeEnabled(); await rated(page, 5);
  expect(v2).toEqual([]); expect(await count(db, 'visit_sessions')).toBe(0);
  const ownerShell=await request.get('http://127.0.0.1:3319/ZZZ/one');expect(ownerShell.headers()['cache-control']).toContain('no-store');
  for(const path of ['/api/owner/v2/one','/api/owner/v2/one/export','/owner/login?next=%2FZZZ%2Fone'])expect((await request.get(`http://127.0.0.1:3319${path}`)).status()).toBe(404);
  expect((await request.post('http://127.0.0.1:3319/api/owner/v2/login',{data:{}})).status()).toBe(404);
  expect(await count(db, 'experiences')).toBeGreaterThan(0);
  const off = await request.post('http://127.0.0.1:3318/api/v2/shops/one/visits', { data: {} });
  expect(off.status()).toBe(404);
});

test('demo remains browser-only with development gate on', async ({ page, db }) => {
  const api: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/')) api.push(r.url()); });
  await page.goto('/t/demo'); await rated(page, 2);
  await page.locator('#message').fill('Browser demo text');
  await page.getByRole('button', { name: 'Gửi góp ý', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('bản thử');
  expect(api).toEqual([]);
  for (const table of ['visit_sessions', 'rating_experiences', 'experiences', 'page_visits'] as const) expect(await count(db, table)).toBe(0);
});

test('Next HTTP rejects private feedback without a rating and never echoes text', async ({ request, db }) => {
  const headers = { origin: 'http://127.0.0.1:3317', authorization: `Bearer ${randomBytes(32).toString('hex')}` };
  const opened = await request.post('/api/v2/shops/one/visits', { headers, data: { loadKey: randomUUID(), navigationKind: 'load' } });
  expect(opened.status()).toBe(200); const visit = (await opened.json()).visit;
  const response = await request.post(`/api/v2/shops/one/visits/${visit.id}/feedback`, { headers,
    data: { intentId: randomUUID(), expectedRevision: 0, topic: 'other', message: 'PRIVATE_NO_RATING' } });
  expect(response.status()).toBe(409); expect(await response.json()).toEqual({ error: 'RATING_REQUIRED' });
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(await count(db, 'rating_experiences')).toBe(0);
});

test('synthetic resume drops stale UI error, records a new open; draft is not automatically sent', async ({ page, db }) => {
  await ready(page); await rated(page, 2);
  await page.locator('#message').fill('Keep this draft');
  await db.query("UPDATE visit_sessions SET started_at=now()-interval '20 minutes',last_activity=now()-interval '16 minutes'");
  await page.getByRole('button', { name: 'Gửi góp ý', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Phiên đã hết hạn');
  // Synthetic pagehide/pageshow tests the resume integration, NOT actual BFCache eligibility.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page.getByRole('status')).toContainText('Bạn có thể chọn sao');
  expect(await count(db, 'visit_sessions')).toBe(2); expect(await count(db, 'page_visits')).toBe(2);
  await expect(page.locator('#message')).toHaveValue('Keep this draft');
  await expect(page.getByRole('button', { name: 'Gửi góp ý', exact: true })).toBeDisabled();
  expect((await experience(db))[0].feedback_message).toBeNull();
});

test('production gate stays closed even with flag true', async ({ page, request, db }) => {
  test.skip(process.env.NFC_TEST_PRODUCTION !== 'true', 'Requires harness production build');
  const v2: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/v2/')) v2.push(r.url()); });
  await page.goto('http://127.0.0.1:3319/one');
  await expect(star(page, 5)).toBeEnabled(); await rated(page, 5);
  expect(v2).toEqual([]); expect(await count(db, 'visit_sessions')).toBe(0);
  const ownerShell=await request.get('http://127.0.0.1:3319/ZZZ/one');expect(ownerShell.headers()['cache-control']).toContain('no-store');
  for(const path of ['/api/owner/v2/one','/api/owner/v2/one/export','/owner/login?next=%2FZZZ%2Fone'])expect((await request.get(`http://127.0.0.1:3319${path}`)).status()).toBe(404);
  expect((await request.post('http://127.0.0.1:3319/api/owner/v2/login',{data:{}})).status()).toBe(404);
  expect(await count(db, 'experiences')).toBeGreaterThan(0);
  for (const path of ['/api/v2/shops/one/visits', '/api/v2/pages/visits', '/preview/exchange']) expect((await request.post(`http://127.0.0.1:3319${path}`, { data: {} })).status()).toBe(404);
});
