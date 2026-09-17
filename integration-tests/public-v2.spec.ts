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
// Legacy pages (gate off, demo, production gate) still save a star on tap.
async function ratedLegacy(page: Page, n: number) { await star(page, n).click(); await expect(page.locator('.rating-receipt')).toContainText(`${n}/5`); }
// Guest page v2: stars live in the private card and are saved only by Send.
const loaded = (page: Page) => expect(page.locator('main[data-ready]')).toBeVisible();
async function ready(page: Page) { await page.goto('/one'); await loaded(page); }
async function openCard(page: Page) {
  // The button floats on purpose; force skips Playwright's wait for it to stand still.
  if (!await page.locator('#private-card').count()) await page.locator('#private-feedback').click({ force: true });
  await expect(page.locator('#private-card')).toBeVisible();
}
const sendButton = (page: Page) => page.getByRole('button', { name: 'Gửi góp ý', exact: true });
async function thanked(page: Page) {
  await expect(page.locator('[data-thanks]')).toBeVisible();
  await page.locator('[data-thanks] button').click(); await expect(page.locator('#private-card')).toHaveCount(0);
}
async function rated(page: Page, n: number) { await openCard(page); await star(page, n).click(); await sendButton(page).click(); await thanked(page); }
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

test('real page: one initial open, stars and text saved together by Send, reload, Google and VI-EN', async ({ page, db }, info) => {
  const opens: { navigationKind: string; loadKey: string }[] = [];
  const responses: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', r => { if (r.url().endsWith('/api/v2/shops/one/visits')) opens.push(r.postDataJSON()); });
  page.on('response', async r => { if (r.url().includes('/api/v2/')) responses.push(await r.text()); });
  await ready(page);
  expect(opens).toHaveLength(1); expect(opens[0].navigationKind).toBe('load');
  expect(await count(db, 'rating_experiences')).toBe(0);
  await expect(page.locator('main .stars, main .guest-stars')).toHaveCount(0);
  const google = await page.locator('.google-invitation').innerText();
  await openCard(page);
  await expect(sendButton(page)).toBeEnabled();
  // Tapping a star saves nothing; Send does.
  await star(page, 5).click(); await star(page, 2).click();
  await expect(star(page, 2)).toHaveAttribute('aria-pressed', 'true');
  expect(await count(db, 'rating_experiences')).toBe(0);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rating', async route => { const response = await route.fetch(); await held; await route.fulfill({ response }); });
  const privateText = 'Góp ý riêng: chờ hơi lâu 😀';
  await page.getByLabel('Góp ý của bạn', { exact: true }).fill(privateText);
  const request = page.waitForRequest('**/rating');
  await sendButton(page).click(); await request;
  await expect(sendButton(page)).toBeDisabled(); await expect(star(page, 4)).toBeDisabled();
  await expect(page.locator('#message')).toBeDisabled();
  release();
  await thanked(page);
  const saved = (await experience(db))[0]; expect(saved).toMatchObject({ rating: 2, revision: 2, feedback_message: privateText });
  expect(await page.locator('.google-invitation').innerText()).toBe(google);
  await page.reload(); await loaded(page);
  expect(opens).toHaveLength(2); expect(opens[1].navigationKind).toBe('reload');
  expect(opens[1].loadKey).not.toBe(opens[0].loadKey);
  expect(await count(db, 'page_visits')).toBe(2); expect(await count(db, 'visit_sessions')).toBe(1);
  expect((await experience(db))[0]).toEqual(saved);
  await openCard(page); await expect(page.locator('#message')).toHaveValue('');
  await expect(star(page, 2)).toHaveAttribute('aria-pressed', 'false');
  expect(responses.join('')).not.toContain(privateText);
  for (const response of responses) expect(response).not.toMatch(/"(?:feedback|message|topic|feedback_message|feedback_topic)"/);
  await page.keyboard.press('Escape'); await expect(page.locator('#private-card')).toHaveCount(0);
  await page.getByLabel(/Language/).selectOption('en');
  await openCard(page);
  await expect(page.getByRole('button', { name: 'Send feedback', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '1 stars', exact: true }).click();
  await expect(page.locator('.guest-face').first()).toHaveText('😡');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '4 stars', exact: true }).click();
  await expect(page.locator('.guest-face')).toHaveText(['😊', '😊', '😊', '😊']);
  await expect(page.locator('.guest-face').first()).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('Escape');
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('public-v2.png'), fullPage: true });
  expect(errors).toEqual([]); expect(await count(db, 'experiences')).toBe(0);
});

test('lost feedback response keeps text, explicit retry replays one immutable intent then thanks', async ({ page, db }) => {
  await ready(page); await rated(page, 2);
  const payloads: unknown[] = [];
  await page.route('**/feedback', async route => {
    payloads.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (payloads.length <= 2) await route.abort('failed'); else await route.fulfill({ response });
  });
  await openCard(page);
  await page.locator('#message').fill('Private retry text');
  await sendButton(page).click();
  await expect(page.getByRole('button', { name: 'Thử lại lần gửi', exact: true })).toBeVisible();
  await expect(page.locator('#message')).toHaveValue('Private retry text');
  await expect(page.locator('#message')).toBeDisabled();
  expect((await experience(db))[0]).toMatchObject({ revision: 2, feedback_message: 'Private retry text' });
  await page.getByRole('button', { name: 'Thử lại lần gửi', exact: true }).click();
  await thanked(page);
  await openCard(page); await expect(page.locator('#message')).toHaveValue('');
  expect(payloads).toHaveLength(3); expect(payloads[1]).toEqual(payloads[0]); expect(payloads[2]).toEqual(payloads[0]);
  expect((await db.query("SELECT count(*)::int n FROM rating_intent_receipts WHERE operation='feedback'")).rows[0].n).toBe(1);
});

test('conflict shows the current stars, keeps the draft and never overwrites the other action', async ({ page, db }) => {
  await ready(page); await rated(page, 5);
  await openCard(page); await page.locator('#message').fill('Draft survives conflict');
  let collide = true;
  await page.route('**/rating', async route => {
    if (collide) {
      collide = false;
      const other = await route.fetch({ postData: JSON.stringify({ ...route.request().postDataJSON(), intentId: randomUUID(), score: 4 }) });
      expect(other.status()).toBe(200);
    }
    await route.continue();
  });
  await star(page, 2).click(); await sendButton(page).click();
  await expect(page.getByRole('status')).toContainText('Đánh giá đã thay đổi');
  await expect(star(page, 4)).toHaveAttribute('aria-pressed', 'true');
  expect((await experience(db))[0]).toMatchObject({ rating: 4, revision: 2, feedback_message: null });
  await expect(page.locator('#message')).toHaveValue('Draft survives conflict');
  await sendButton(page).click(); await thanked(page);
  expect((await experience(db))[0]).toMatchObject({ rating: 4, revision: 4, feedback_message: 'Draft survives conflict' });
});

test('SESSION_EXPIRED keeps draft; only a new Send with a star starts a new session', async ({ page, db }) => {
  await ready(page); await rated(page, 2);
  await openCard(page); await page.locator('#message').fill('Do not migrate automatically');
  await db.query("UPDATE visit_sessions SET started_at=now()-interval '20 minutes',last_activity=now()-interval '16 minutes'");
  await sendButton(page).click();
  await expect(page.getByRole('status')).toContainText('Phiên đã hết hạn');
  await expect(page.locator('#message')).toHaveValue('Do not migrate automatically');
  expect(await count(db, 'visit_sessions')).toBe(1);
  expect((await experience(db))[0].feedback_message).toBeNull();
  await star(page, 3).click(); await sendButton(page).click(); await thanked(page);
  expect(await count(db, 'visit_sessions')).toBe(2);
  expect(await count(db, 'page_visits')).toBe(2);
  expect((await experience(db))[0]).toMatchObject({ rating: 3, revision: 2, feedback_message: 'Do not migrate automatically' });
});

test('unknown initial open retries same event and enables stars only after confirmation', async ({ page, db }) => {
  const payloads: unknown[] = [];
  await page.route('**/api/v2/shops/one/visits', async route => {
    payloads.push(route.request().postDataJSON()); const response = await route.fetch();
    if (payloads.length <= 2) await route.abort('failed'); else await route.fulfill({ response });
  });
  await page.goto('/one');
  await expect(page.getByRole('button', { name: 'Thử kết nối lại', exact: true })).toBeVisible();
  await openCard(page);
  await expect(star(page, 5)).toBeDisabled(); await expect(sendButton(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Thử kết nối lại', exact: true }).click();
  await expect(star(page, 5)).toBeEnabled();
  expect(payloads).toHaveLength(3); expect(payloads[2]).toEqual(payloads[0]);
  expect(await count(db, 'page_visits')).toBe(1);
});

test('gate off retains legacy and v2 endpoint returns 404', async ({ page, request, db }) => {
  const v2: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/v2/')) v2.push(r.url()); });
  await page.goto('http://127.0.0.1:3318/one');
  await expect(star(page, 5)).toBeEnabled(); await ratedLegacy(page, 5);
  expect(v2).toEqual([]); expect(await count(db, 'visit_sessions')).toBe(0);
  expect(await count(db, 'experiences')).toBeGreaterThan(0);
  // The owner surfaces on the production build are asserted by 'production gate stays closed even with flag
  // true', which the harness runs after it builds and starts that app. Asserting them here could never pass:
  // this phase runs before the build exists.
  const off = await request.post('http://127.0.0.1:3318/api/v2/shops/one/visits', { data: {} });
  expect(off.status()).toBe(404);
});

test('demo remains browser-only with development gate on', async ({ page, db }) => {
  const api: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/')) api.push(r.url()); });
  await page.goto('/t/demo'); await ratedLegacy(page, 2);
  await page.locator('#message').fill('Browser demo text');
  await page.getByRole('button', { name: 'Gửi góp ý', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('bản thử');
  expect(api).toEqual([]);
  for (const table of ['visit_sessions', 'rating_experiences', 'experiences', 'page_visits'] as const) expect(await count(db, table)).toBe(0);
});

test('Next HTTP saves private feedback without a rating and never echoes text', async ({ request, db }) => {
  const headers = { origin: 'http://127.0.0.1:3317', authorization: `Bearer ${randomBytes(32).toString('hex')}` };
  const opened = await request.post('/api/v2/shops/one/visits', { headers, data: { loadKey: randomUUID(), navigationKind: 'load' } });
  expect(opened.status()).toBe(200); const visit = (await opened.json()).visit;
  const response = await request.post(`/api/v2/shops/one/visits/${visit.id}/feedback`, { headers,
    data: { intentId: randomUUID(), expectedRevision: 0, topic: 'other', message: 'PRIVATE_NO_RATING' } });
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(JSON.parse(body)).toMatchObject({ outcome: 'applied', experience: { rating: null, revision: 1 } });
  expect(body).not.toContain('PRIVATE_NO_RATING');
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(await experience(db)).toEqual([expect.objectContaining({ rating: null, revision: 1, feedback_message: 'PRIVATE_NO_RATING' })]);
});

test('real page sends private feedback without a star, then a star joins the same experience', async ({ page, db }) => {
  await ready(page);
  await openCard(page);
  await sendButton(page).click();
  await expect(page.getByRole('status')).toContainText('Hãy chọn sao hoặc viết vài dòng');
  expect(await count(db, 'rating_experiences')).toBe(0);
  await page.locator('#message').fill('Chưa chấm sao nhưng muốn góp ý');
  await sendButton(page).click(); await thanked(page);
  expect(await experience(db)).toEqual([expect.objectContaining({ rating: null, revision: 1, feedback_message: 'Chưa chấm sao nhưng muốn góp ý' })]);
  await rated(page, 4);
  expect(await experience(db)).toEqual([expect.objectContaining({ rating: 4, revision: 2, feedback_message: 'Chưa chấm sao nhưng muốn góp ý' })]);
});

test('synthetic resume drops stale UI error, records a new open; draft is not automatically sent', async ({ page, db }) => {
  await ready(page); await rated(page, 2);
  await openCard(page); await page.locator('#message').fill('Keep this draft');
  await db.query("UPDATE visit_sessions SET started_at=now()-interval '20 minutes',last_activity=now()-interval '16 minutes'");
  await sendButton(page).click();
  await expect(page.getByRole('status')).toContainText('Phiên đã hết hạn');
  // Synthetic pagehide/pageshow tests the resume integration, NOT actual BFCache eligibility.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page.getByRole('status')).toContainText('Chọn sao, viết góp ý, hoặc cả hai');
  expect(await count(db, 'visit_sessions')).toBe(2); expect(await count(db, 'page_visits')).toBe(2);
  await expect(page.locator('#message')).toHaveValue('Keep this draft');
  // Sending needs the customer to press Send again; nothing moves on its own.
  await expect(sendButton(page)).toBeEnabled();
  expect((await experience(db))[0].feedback_message).toBeNull();
});

test('production gate stays closed even with flag true', async ({ page, request, db }) => {
  test.skip(process.env.NFC_TEST_PRODUCTION !== 'true', 'Requires harness production build');
  const v2: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/v2/')) v2.push(r.url()); });
  await page.goto('http://127.0.0.1:3319/one');
  await expect(star(page, 5)).toBeEnabled(); await ratedLegacy(page, 5);
  expect(v2).toEqual([]); expect(await count(db, 'visit_sessions')).toBe(0);
  const ownerShell=await request.get('http://127.0.0.1:3319/ZZZ/one');expect(ownerShell.headers()['cache-control']).toContain('no-store');
  for(const path of ['/api/owner/v2/one','/api/owner/v2/one/export','/owner/login?next=%2FZZZ%2Fone'])expect((await request.get(`http://127.0.0.1:3319${path}`)).status()).toBe(404);
  expect((await request.post('http://127.0.0.1:3319/api/owner/v2/login',{data:{}})).status()).toBe(404);
  expect(await count(db, 'experiences')).toBeGreaterThan(0);
  for (const path of ['/api/v2/shops/one/visits', '/api/v2/pages/visits', '/preview/exchange']) expect((await request.post(`http://127.0.0.1:3319${path}`, { data: {} })).status()).toBe(404);
});
