import { test as base, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';
import { PublishingAdmin } from '../lib/publishing/repository';
import { defaultConfig, STEM_BACKGROUND, type PageConfig } from '../lib/publishing/config';
const uri = process.env.NFC_TEST_DATABASE_URL, schema = process.env.NFC_TEST_SCHEMA;
if (uri !== 'postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test' || !/^nfc_ui_test_[a-f0-9]{32}$/.test(schema ?? '')) throw Error('Isolated harness required');
type Fixture = { db: Pool; admin: PublishingAdmin; shop: string; release: string };
const test = base.extend<{ fixture: Fixture }>({ fixture: async ({}, provideFixture) => {
  const db = new Pool({ connectionString: uri, options: `-c search_path=${schema}` });
  try {
    await db.query('TRUNCATE shops, template_versions CASCADE');
    const shop = randomUUID();
    await db.query("INSERT INTO shops(id,slug,name)VALUES($1,'one','Legacy fixture')", [shop]);
    const admin = new PublishingAdmin(db, async () => ({ actorId: 'local-fixture-only' }));
    const template = await admin.createTemplate('neutral', 1);
    await admin.createDraft(shop, template, defaultConfig('Release One'));
    const published = await admin.publish(shop, 1);
    await provideFixture({ db, admin, shop, release: published.releaseId });
  } finally { await db.end(); }
} });
const star = (page: Page, n: number) => page.getByRole('button', { name: `${n} sao`, exact: true });
// Guest page v2: stars live in the private card and are saved only by Send.
const loaded = (page: Page) => expect(page.locator('main[data-ready]')).toBeVisible();
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
const origin = 'http://127.0.0.1:3317';
const openBody = () => ({ loadKey: randomUUID(), navigationKind: 'load' });
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});
test('render R1 → publish R2 → open remains R1; reload shares session and revisions, immutable sources', async ({ page, fixture: f }) => {
  let release!: () => void;
  const latch = new Promise<void>(resolve => { release = resolve; });
  let hold = true;
  await page.route('**/api/v2/pages/visits', async route => { if (hold) { hold = false; await latch; } await route.continue(); });
  const pending = page.waitForRequest('**/api/v2/pages/visits');
  await page.goto('/one'); await pending;
  await expect(page.getByText('Release One', { exact: true }).first()).toBeVisible();
  await f.admin.saveDraft(f.shop, 2, defaultConfig('Release Two'));
  const second = await f.admin.publish(f.shop, 3);
  release(); await loaded(page);
  await rated(page, 5);
  const google = await page.locator('.google-invitation').innerText();
  await page.reload(); await loaded(page);
  await expect(page.getByText('Release Two', { exact: true }).first()).toBeVisible();
  expect(await page.locator('.google-invitation').innerText()).toBe(google);
  const response = page.waitForResponse('**/feedback');
  await openCard(page); await star(page, 2).click();
  await page.locator('#message').fill('Private publishing fixture');
  await sendButton(page).click();
  expect(await (await response).text()).not.toContain('Private publishing fixture');
  await thanked(page);
  expect((await f.db.query('SELECT rating,revision::int FROM rating_experiences')).rows).toEqual([{ rating: 2, revision: 3 }]);
  expect((await f.db.query('SELECT count(*)::int n FROM visit_sessions')).rows[0].n).toBe(1);
  expect((await f.db.query('SELECT c.release_id FROM rating_intent_receipts r JOIN published_visit_contexts c ON c.visit_id=r.visit_id ORDER BY r.applied_revision')).rows.map(r => r.release_id)).toEqual([f.release, second.releaseId, second.releaseId]);
  for (const table of ['session_initial_contexts', 'experience_origin_contexts']) expect((await f.db.query(`SELECT c.release_id FROM ${table} o JOIN published_visit_contexts c ON c.visit_id=o.visit_id`)).rows[0].release_id).toBe(f.release);
  await page.getByLabel(/Language/).selectOption('en');
  await openCard(page);
  await expect(page.getByRole('button', { name: 'Send feedback', exact: true })).toBeVisible();
});
test('preview uses HttpOnly capability, test scope; tag tested→active→disabled blocks existing tab', async ({ page, context, fixture: f }) => {
  const tag = await f.admin.createTag(f.shop, 'fixture-tag');
  const preview = await f.admin.preview(f.shop, { kind: 'draft', revision: 2 }, 900, tag);
  const exchanged = await context.request.post('/preview/exchange', { headers: { Origin: origin }, data: { token: preview.token } });
  expect(exchanged.status()).toBe(204); expect(await exchanged.text()).toBe('');
  expect((await context.cookies()).find(c => c.name === 'nfc_preview')).toMatchObject({ httpOnly: true, sameSite: 'Strict' });
  let proof = '';
  page.on('request', r => { if (r.url().endsWith('/api/v2/pages/visits')) proof = r.headers()['x-nfc-render']; });
  await page.goto('/preview'); await loaded(page);
  expect(await page.evaluate(() => document.cookie)).not.toContain(preview.token);
  expect(await page.content()).not.toContain(preview.token); expect(page.url()).not.toContain(preview.token);
  await rated(page, 5);
  expect((await f.db.query("SELECT count(*)::int n FROM rating_experiences WHERE scope='live'")).rows[0].n).toBe(0);
  // Valid public attribution proof is insufficient without the separate preview capability.
  await context.clearCookies();
  const denied = await context.request.post('/api/v2/pages/visits', { headers: { Origin: origin, Authorization: `Bearer ${randomBytes(32).toString('hex')}`, 'X-NFC-Render': proof }, data: openBody() });
  expect(denied.status()).toBe(403); expect(await denied.json()).toEqual({ error: 'PREVIEW_UNAVAILABLE' });
  await f.admin.setTagState(f.shop, tag, 'tested', preview.id); await f.admin.setTagState(f.shop, tag, 'active');
  await page.goto('/t/fixture-tag'); await loaded(page);
  expect((await f.db.query("SELECT tag_id,release_id FROM published_visit_contexts WHERE scope='live'")).rows).toEqual([{ tag_id: tag, release_id: f.release }]);
  await f.admin.setTagState(f.shop, tag, 'disabled');
  const response = page.waitForResponse('**/rating'); await openCard(page); await star(page, 4).click(); await sendButton(page).click();
  expect((await response).status()).toBe(403);
  expect((await f.db.query("SELECT count(*)::int n FROM rating_experiences WHERE scope='live'")).rows[0].n).toBe(0);
  await page.reload(); await expect(page.getByRole('heading', { name: 'Trang chưa sẵn sàng' })).toBeVisible();
});
test('proof tamper, legacy bypass, suspended shop and cross-origin exchange are denied', async ({ page, request, fixture: f }) => {
  let proof = '';
  page.on('request', r => { if (r.url().endsWith('/api/v2/pages/visits')) proof = r.headers()['x-nfc-render']; });
  await page.goto('/one'); await loaded(page);
  const headers = { Origin: origin, Authorization: `Bearer ${randomBytes(32).toString('hex')}`, 'X-NFC-Render': proof };
  const bad = await request.post('/api/v2/pages/visits', { headers: { ...headers, 'X-NFC-Render': proof + 'x' }, data: openBody() });
  expect(bad.status()).toBe(403); expect(await bad.json()).toEqual({ error: 'INVALID_RENDER_PROOF' });
  for (const url of ['/api/v2/shops/one/visits', '/api/shops/one/experience']) expect((await request.post(url, { headers, data: openBody() })).status()).toBe(404);
  const cap = await f.admin.preview(f.shop, { kind: 'release', id: f.release });
  expect((await request.post('/preview/exchange', { headers: { Origin: 'https://invalid.example' }, data: { token: cap.token } })).status()).toBe(403);
  await f.admin.setShopState(f.shop, 'suspended');
  const response = page.waitForResponse('**/rating'); await openCard(page); await star(page, 5).click(); await sendButton(page).click();
  expect((await response).status()).toBe(403);
  expect((await f.db.query('SELECT count(*)::int n FROM rating_experiences')).rows[0].n).toBe(0);
});
test('publishing gate off and demo retain legacy behavior', async ({ page, request, fixture: f }) => {
  expect((await request.post('http://127.0.0.1:3318/api/v2/pages/visits', { data: {} })).status()).toBe(404);
  await page.goto('http://127.0.0.1:3318/one'); await expect(page.getByText('Legacy fixture', { exact: true }).first()).toBeVisible();
  await page.goto('/t/demo'); await expect(star(page, 5)).toBeEnabled();
  await star(page, 5).click();
  expect((await f.db.query('SELECT count(*)::int n FROM page_visits')).rows[0].n).toBe(0);
});

// Lát B2–B3: guest page v2. The fixture publishes draft revision 1, so the next save expects revision 2.
const b2 = (patch: Partial<PageConfig> = {}): PageConfig => ({ ...defaultConfig('Quán Thử'), googleUrl: 'https://maps.google.com/?cid=42',
  background: { kind: 'media', media: { kind: 'video', url: STEM_BACKGROUND.video }, loop: true }, ...patch });
const v1 = (name: string) => { const { feedbackButton: _unused, ...rest } = defaultConfig(name); void _unused; return { ...rest, schemaVersion: 1, links: [] }; };
async function release(f: Fixture, config: unknown, expected: number) {
  const saved = await f.admin.saveDraft(f.shop, expected, config); await f.admin.publish(f.shop, saved); return saved + 1;
}
const scale = (page: Page, selector: string) => page.locator(selector).first().evaluate(element => {
  const matrix = getComputedStyle(element).transform; return matrix === 'none' ? 1 : Number(matrix.slice(7).split(',')[0]);
});
test('v2: the page asks for nothing before Google, and the Google button is the same whatever was sent', async ({ page, fixture: f }) => {
  let revision = 2;
  for (const layout of ['full-bleed', 'card'] as const) {
    revision = await release(f, b2({ layout }), revision);
    await page.goto('/one'); await loaded(page);
    await expect(page.locator('main')).toHaveAttribute('data-layout', layout);
    await expect(page.getByRole('button', { name: /sao$/ })).toHaveCount(0);
    const google = page.locator('[data-google]');
    await expect(google).toBeInViewport();
    await expect(google).toHaveAttribute('href', 'https://maps.google.com/?cid=42');
    const before = await google.evaluate(element => element.outerHTML);
    for (const score of [1, 5]) {
      await rated(page, score);
      expect(await google.evaluate(element => element.outerHTML)).toBe(before);
    }
  }
});
test('v2: the plane opens a spotlight card; faces follow the chosen score; thanks stays until closed', async ({ page, fixture: f }) => {
  await release(f, b2(), 2);
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto('/one'); await loaded(page);
  const plane = page.locator('#private-feedback');
  await expect(plane).toBeInViewport({ ratio: 1 });
  await expect(plane.locator('path')).toHaveAttribute('fill', '#229ED9');
  await expect(plane).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await plane.click({ force: true });
  const card = page.getByRole('dialog');
  await expect(card).toContainText('Gửi góp ý riêng cho quản lý');
  await expect(card).toContainText('Bạn cảm thấy thế nào?');
  await expect(page.locator('.guest-modal')).toHaveCSS('backdrop-filter', /blur/);
  await expect(page.locator('.guest-sheet')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
  const faces = ['😡', '😤', '😕', '😊', '🤩'];
  for (const score of [1, 2, 3, 4, 5, 2]) {
    await star(page, score).click();
    await expect(page.locator('.guest-face')).toHaveText(Array(score).fill(faces[score - 1]));
    await expect(page.locator('.guest-star')).toHaveCount(5 - score);
  }
  // A tap on the dimmed page closes the card and keeps the unsent choice and text.
  await page.locator('#message').fill('Nháp còn đó');
  await page.mouse.click(5, 5);
  await expect(page.locator('#private-card')).toHaveCount(0);
  await openCard(page);
  await expect(page.locator('#message')).toHaveValue('Nháp còn đó'); await expect(star(page, 2)).toHaveAttribute('aria-pressed', 'true');
  expect(await f.db.query('SELECT count(*)::int n FROM rating_experiences').then(r => r.rows[0].n)).toBe(0);
  await sendButton(page).click();
  await expect(page.locator('[data-thanks]')).toHaveText(/Cảm ơn bạn nhé, chúng tôi biết ơn vì đóng góp từ phản hồi của bạn/);
  await expect(page.locator('.guest-modal canvas[data-confetti]')).toHaveCount(1);
  expect((await f.db.query('SELECT rating,feedback_message FROM rating_experiences')).rows).toEqual([{ rating: 2, feedback_message: 'Nháp còn đó' }]);
  await page.waitForTimeout(3500);
  await expect(page.locator('[data-thanks]')).toBeVisible();
  await page.locator('[data-thanks] button').click();
  await expect(page.locator('#private-card')).toHaveCount(0);
  await expect(plane).toBeFocused();
  await expect(plane.locator('path')).toHaveAttribute('fill', '#229ED9');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCard(page); await page.locator('#message').fill('Lần hai'); await sendButton(page).click();
  await expect(page.locator('[data-thanks]')).toBeVisible();
  await expect(page.locator('canvas[data-confetti]')).toHaveCount(0);
  await expect(page.locator('.guest-card')).toHaveCSS('animation-name', 'none');
});
test('v2: the card takes an optional call-back number that needs a few words with it', async ({ page, fixture: f }) => {
  await release(f, b2(), 2);
  await page.goto('/one'); await loaded(page); await openCard(page);
  const phone = page.getByLabel('Số điện thoại, nếu muốn quản lý gọi lại');
  await expect(phone).toHaveAttribute('placeholder', 'Chỉ người của quán được cấp quyền mới thấy số này');
  await expect(phone).toHaveAttribute('type', 'tel');
  await phone.fill('0961 036 265'); await sendButton(page).click();
  await expect(page.getByRole('status')).toContainText('Hãy viết vài dòng để quản lý biết cần gọi lại');
  await page.locator('#message').fill('Gọi giúp tôi'); await phone.fill('0961'); await sendButton(page).click();
  await expect(page.getByRole('status')).toContainText('Số điện thoại cần 8 đến 15 chữ số');
  expect((await f.db.query('SELECT count(*)::int n FROM rating_experiences')).rows[0].n).toBe(0);
  await phone.fill('0961 036 265'); await star(page, 1).click();
  const response = page.waitForResponse('**/feedback'); await sendButton(page).click();
  expect(await (await response).text()).not.toContain('0961036265');
  await thanked(page);
  expect((await f.db.query('SELECT rating,feedback_message,feedback_phone FROM rating_experiences')).rows)
    .toEqual([{ rating: 1, feedback_message: 'Gọi giúp tôi', feedback_phone: '0961036265' }]);
  await openCard(page); await expect(page.getByLabel('Số điện thoại, nếu muốn quản lý gọi lại')).toHaveValue('');
});
test('v2: the hint appears only two seconds after the visitor reaches the bottom', async ({ page, fixture: f }) => {
  await release(f, b2(), 2);
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('/one'); await loaded(page);
  await page.waitForTimeout(2600);
  await expect(page.locator('[data-hint]')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1200);
  await expect(page.locator('[data-hint]')).toHaveCount(0);
  await expect(page.locator('[data-hint]')).toHaveText('Có điều gì muốn nhắn riêng cho quán?');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('[data-hint]')).toBeVisible();
  await page.locator('[data-hint]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
test('v2: pressing sinks links to 96% and the plane to 70%; buttons and plane follow the configuration', async ({ page, fixture: f }) => {
  await release(f, b2({ feedbackButton: { icon: 'chat', color: '#FF5500', outline: '#000000' } }), 2);
  await page.goto('/one'); await loaded(page);
  const links = page.locator('.guest-links a');
  await expect(links.locator('> span')).toHaveText(['Instagram', 'Zalo', 'TikTok']);
  for (const name of ['Instagram', 'Zalo', 'TikTok']) await expect(page.getByRole('link', { name, exact: true })).toHaveCount(1);
  await expect(links.nth(0)).toHaveAttribute('href', 'https://www.instagram.com/quitesensational/');
  await expect(links.nth(1)).toHaveAttribute('href', 'https://zalo.me/0961036265');
  await expect(links.nth(2)).toHaveAttribute('href', 'https://www.tiktok.com/@taidoan450');
  await expect(links.locator('svg.brand-mark')).toHaveCount(3);
  const plane = page.locator('#private-feedback');
  await expect(plane).toHaveAttribute('data-icon', 'chat');
  await expect(plane.locator('path')).toHaveAttribute('fill', '#FF5500');
  await expect(plane.locator('path')).toHaveAttribute('stroke', '#000000');
  const press = async (selector: string) => {
    const box = (await page.locator(selector).first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.waitForTimeout(250); const pressed = await scale(page, selector);
    await page.mouse.move(0, 0); await page.mouse.up(); return pressed;
  };
  expect(await press('.guest-links a')).toBeCloseTo(0.96, 2);
  expect(await press('#private-feedback')).toBeCloseTo(0.7, 2);
  await page.waitForTimeout(900);
  expect(await scale(page, '#private-feedback')).toBeCloseTo(1, 2);
});
test('v2: background video, still, watermark, poster frame and logo come from the configuration; v1 still renders', async ({ page, fixture: f }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const revision = await release(f, b2({ links: [{ label: { vi: 'Facebook', en: 'Facebook' }, url: 'https://facebook.com/quanthu', icon: 'facebook' },
    { label: { vi: 'Gọi quán', en: 'Call us' }, url: 'tel:+84901234567', icon: 'phone' }] }), 2);
  await page.goto('/one'); await loaded(page);
  const video = page.locator('video.guest-bg-media');
  await expect(video).toHaveAttribute('src', STEM_BACKGROUND.video);
  await expect(video).toHaveAttribute('poster', STEM_BACKGROUND.still);
  for (const attribute of ['autoplay', 'loop', 'playsinline']) await expect(video).toHaveAttribute(attribute, '');
  expect(await video.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true);
  await expect(page.locator('img.guest-bg-media')).toHaveAttribute('src', STEM_BACKGROUND.still);
  await expect(page.locator('.guest-watermark-track span').first()).toHaveText('YOUR LOGO');
  await expect(page.locator('.guest-poster-empty')).toHaveText('POSTER SỰ KIỆN');
  await expect(page.locator('.guest-logo')).toHaveText('QT');
  const facebook = page.getByRole('link', { name: 'Facebook' }), phone = page.getByRole('link', { name: 'Gọi quán' });
  await expect(facebook).toHaveAttribute('href', 'https://facebook.com/quanthu'); await expect(facebook).toHaveAttribute('target', '_blank');
  await expect(phone).toHaveAttribute('href', 'tel:+84901234567'); expect(await phone.getAttribute('target')).toBeNull();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload(); await loaded(page);
  await expect(video).toHaveCount(0);
  await expect(page.locator('img.guest-bg-media')).toBeVisible();
  await expect(page.locator('.guest-watermark-track')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#private-feedback')).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // A phone that refuses to play (iPhone Low Power Mode, Android Battery or Data Saver): the video goes, the still stays,
  // and an uploaded video shows the first frame the editor captured (lát F5).
  await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Low Power Mode', 'NotAllowedError')); });
  await page.reload(); await loaded(page);
  await expect(page.locator('video.guest-bg-media')).toHaveCount(0);
  await expect(page.locator('img.guest-bg-media')).toHaveAttribute('src', STEM_BACKGROUND.still);
  await expect(page.locator('[data-video-blocked]')).toHaveCount(1);
  const uploaded = { kind: 'video' as const, url: 'https://media.example/bg.mp4', still: 'https://media.example/bg.jpg' };
  const next = await release(f, b2({ background: { kind: 'media', media: uploaded, loop: true },
    poster: { kind: 'video', url: 'https://media.example/poster.mp4', still: 'https://media.example/poster.jpg' } }), revision);
  await page.reload(); await loaded(page);
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.locator('img.guest-bg-media')).toHaveAttribute('src', 'https://media.example/bg.jpg');
  await expect(page.locator('img[data-poster-still]')).toHaveAttribute('src', 'https://media.example/poster.jpg');
  await release(f, v1('Bản cũ'), next);
  await page.reload(); await loaded(page);
  await expect(page.locator('main')).toHaveAttribute('data-schema', '1');
  await expect(page.getByRole('heading', { name: 'Bản cũ' })).toBeVisible();
  await expect(page.locator('#private-feedback')).toHaveAttribute('data-icon', 'plane');
  expect(errors).toEqual([]);
});
