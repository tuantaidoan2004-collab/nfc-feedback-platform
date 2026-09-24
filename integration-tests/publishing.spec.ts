import { test as base, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';
import { PublishingAdmin } from '../lib/publishing/repository';
import { defaultConfig, STEM_BACKGROUND, templateConfig, type PageConfig, type TemplateKey } from '../lib/publishing/config';
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
  // Từ migration 022 tên quán thuộc tài khoản, không thuộc bản phát hành, nên nó không còn đổi theo
  // release. Bằng chứng "bản nào đang hiện" chuyển sang `data-layout` — thứ vẫn do bản phát hành quyết.
  await expect(page.locator('main.guest')).toHaveAttribute('data-layout', 'full-bleed');
  await f.admin.saveDraft(f.shop, 2, { ...defaultConfig('Release Two'), layout: 'card' as const });
  const second = await f.admin.publish(f.shop, 3);
  release(); await loaded(page);
  await rated(page, 5);
  const google = await page.locator('.google-invitation').innerText();
  await page.reload(); await loaded(page);
  await expect(page.locator('main.guest')).toHaveAttribute('data-layout', 'card');
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
    { label: { vi: 'Gọi cho quán', en: 'Call us' }, url: 'tel:+84901234567', icon: 'phone' }] }), 2);
  await page.goto('/one'); await loaded(page);
  const video = page.locator('video.guest-bg-media');
  await expect(video).toHaveAttribute('src', STEM_BACKGROUND.video);
  await expect(video).toHaveAttribute('poster', STEM_BACKGROUND.still);
  for (const attribute of ['autoplay', 'loop', 'playsinline']) await expect(video).toHaveAttribute(attribute, '');
  expect(await video.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true);
  await expect(page.locator('img.guest-bg-media')).toHaveAttribute('src', STEM_BACKGROUND.still);
  await expect(page.locator('.guest-watermark-track span').first()).toHaveText('YOUR LOGO');
  await expect(page.locator('.guest-poster-empty')).toHaveText('POSTER SỰ KIỆN');
  // Chữ tắt dựng từ tên quán. Tên quán thuộc tài khoản (022), nhưng `publish()` ghi nội dung xuống hồ sơ
  // trong cùng transaction — nên sau khi phát hành, tên của tài khoản CHÍNH LÀ tên vừa phát hành.
  await expect(page.locator('.guest-logo')).toHaveText('QT');
  const facebook = page.getByRole('link', { name: 'Facebook' }), phone = page.getByRole('link', { name: 'Gọi cho quán' });
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
  // Cửa duyệt ảnh (migration 023): uploaded media is published only once approved.
  for (const url of [uploaded.url, uploaded.still, 'https://media.example/poster.mp4', 'https://media.example/poster.jpg'])
    await f.db.query("INSERT INTO media_assets(shop_id,url,kind,uploaded_by,state,reviewed_at)VALUES($1,$2,$3,'fixture','approved',clock_timestamp())",
      [f.shop, url, url.endsWith('.mp4') ? 'video' : 'image']);
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

/**
 * The behaviour log, end to end through a real browser on the path a real card leads to (lát mục 7). Every other
 * test here proves what the customer gets; this one proves the shop finds out what the customer did.
 */
test('what the customer did reaches the log, through the published page, without holding anything up', async ({ page, fixture: f }) => {
  // Scoped to this test's own visit. Beacons are fire-and-forget, so one from an earlier test can still be in
  // flight; a test that assumed an empty table would be reading someone else's page.
  const rows = async () => (await f.db.query(
    'SELECT e.name,e.since_open_ms,e.detail FROM page_events e JOIN page_visits v ON v.id=e.visit_id WHERE v.shop_id=$1 ORDER BY e.id',
    [f.shop])).rows;
  // Counting the calls, not guessing when they happen: the promise is that measurement is batched, not that it
  // flushes at one particular moment. An earlier version asserted "nothing sent yet" and was testing timing.
  let beacons = 0;
  page.on('request', request => { if (request.url().includes('/events')) beacons++; });
  await page.goto('/one'); await loaded(page);
  await openCard(page);
  await star(page, 4).click();
  await sendButton(page).click();
  await thanked(page);

  // Leaving is what flushes whatever is still queued.
  await page.evaluate(() => document.dispatchEvent(new Event('pagehide')));
  await expect.poll(async () => (await rows()).map(r => r.name).join(),
    { timeout: 10_000 }).toContain('feedback_sent');

  const logged = await rows();
  // Four taps, a handful of requests at most: a beacon per tap would be a request on the hot path.
  expect(beacons).toBeLessThanOrEqual(2);
  expect(logged.map(r => r.name).slice(0, 4)).toEqual(['page_opened', 'card_opened', 'star_chosen', 'feedback_sent']);
  // The intervals are the QoE signal, and they only mean anything if they actually move.
  expect(logged[0].since_open_ms).toBe(0);
  expect(logged.at(-1)!.since_open_ms).toBeGreaterThan(0);
  expect(logged.map(r => r.since_open_ms)).toEqual([...logged.map(r => r.since_open_ms)].sort((a, b) => a - b));
  // Shape, never content: the stars are there, the words the customer typed are not, anywhere in the log.
  expect(logged[2].detail).toMatchObject({ stars: 4 });
  expect(logged[3].detail).toMatchObject({ stars: 4, words: false, calledBack: false });
  expect(JSON.stringify(logged)).not.toContain('Private publishing fixture');
  // Recorded against the visit the server knows about, not one the browser claimed.
  const visits = (await f.db.query('SELECT DISTINCT e.visit_id FROM page_events e JOIN page_visits v ON v.id=e.visit_id WHERE v.shop_id=$1', [f.shop])).rows;
  expect(visits).toHaveLength(1);
  expect((await f.db.query('SELECT 1 FROM page_visits WHERE id=$1', [visits[0].visit_id])).rowCount).toBe(1);
});

// A36 · lớp da. A1: the page is always taller than the phone, so reaching the bottom is something the visitor does.
// A page shorter than the screen used to count as "already at the bottom" on arrival and invite feedback unasked.
test('A36: a short page still scrolls, so the private-feedback invitation never shows on arrival', async ({ page, fixture: f }) => {
  let revision = 2;
  for (const layout of ['full-bleed', 'card'] as const) {
    revision = await release(f, b2({ layout, links: [] }), revision);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/one'); await loaded(page);
    await expect(page.locator('main')).toHaveAttribute('data-template', 'neutral');
    const room = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(room, layout).toBeGreaterThanOrEqual(128);
    await page.waitForTimeout(2600);
    await expect(page.locator('[data-hint]'), layout).toHaveCount(0);
    await expect(page.locator('[data-google]')).toBeInViewport();
  }
});

// A36 · số link: each count has its own arrangement, and a round button keeps its name for a screen reader.
test('A36: one to six links each get their designed arrangement, and icon-only links keep their names', async ({ page, fixture: f }) => {
  const all = [
    { label: { vi: 'Instagram', en: 'Instagram' }, url: 'https://instagram.com/quanthu', icon: 'instagram' as const },
    { label: { vi: 'Zalo', en: 'Zalo' }, url: 'https://zalo.me/0900000000', icon: 'zalo' as const },
    { label: { vi: 'TikTok', en: 'TikTok' }, url: 'https://tiktok.com/@quanthu', icon: 'tiktok' as const },
    { label: { vi: 'Facebook', en: 'Facebook' }, url: 'https://facebook.com/quanthu', icon: 'facebook' as const },
    { label: { vi: 'Website', en: 'Website' }, url: 'https://quanthu.example', icon: 'link' as const },
    { label: { vi: 'Gọi cho quán', en: 'Call us' }, url: 'tel:+84901234567', icon: 'phone' as const },
  ];
  // How many of the links show as a round, icon-only button at each count.
  const round = [0, 0, 0, 1, 2, 5, 6];
  await page.setViewportSize({ width: 390, height: 844 });
  let revision = 2;
  for (let n = 1; n <= 6; n++) {
    revision = await release(f, b2({ links: all.slice(0, n) }), revision);
    await page.goto('/one'); await loaded(page);
    const widths = await page.locator('.guest-links a').evaluateAll(links => links.map(link => Math.round(link.getBoundingClientRect().width)));
    expect(widths.filter(width => width === 46), `${n} links`).toHaveLength(round[n]);
    for (const link of all.slice(0, n)) await expect(page.getByRole('link', { name: link.label.vi, exact: true })).toHaveCount(1);
    if (n === 1) expect(widths[0]).toBeGreaterThan(300);
    if (n === 2) expect(Math.abs(widths[0] - widths[1])).toBeLessThanOrEqual(1);
  }
});

// A shop on a given template, because a draft keeps the template it was made on (thiet-ke-va-khuon.md mục 12).
async function templateShop(f: Fixture, key: TemplateKey, slug: string, patch: Partial<PageConfig> = {}) {
  const shop = randomUUID();
  await f.db.query('INSERT INTO shops(id,slug,name)VALUES($1,$2,$3)', [shop, slug, `Quán ${slug}`]);
  const template = await f.admin.createTemplate(key, 1);
  await f.admin.createDraft(shop, template, { ...templateConfig(key), name: `Quán ${slug}`, googleUrl: 'https://maps.google.com/?cid=66', ...patch });
  await f.admin.publish(shop, 1);
  return shop;
}
const bigButtonShop = (f: Fixture) => templateShop(f, 'big-button', 'six');
const googleStub = (page: Page) => page.route('https://maps.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>stub</title>' }));

test('khuôn 6: one giant Google button in the middle of the phone, the same in every other respect', async ({ page, fixture: f }) => {
  await bigButtonShop(f);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/six'); await loaded(page);
  await expect(page.locator('main')).toHaveAttribute('data-template', 'big-button');
  const google = page.locator('[data-google]');
  await expect(google).toBeInViewport();
  const box = (await google.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(110);
  // Its centre sits in the middle third of the screen: the page is the button.
  expect(box.y + box.height / 2).toBeGreaterThan(844 / 3); expect(box.y + box.height / 2).toBeLessThan(844 * 2 / 3);
  // Same tab, so the delayed navigation is not blocked as a popup; other templates still open a new tab.
  expect(await google.getAttribute('target')).toBeNull();
  const plane = (await page.locator('#private-feedback').boundingBox())!;
  expect(box.height).toBeGreaterThan(plane.height);
  // Tài, 24/09: the button is one raised orb holding Google's "G", its words running round it, and the words stay the
  // link's name -- a visitor with a screen reader hears exactly what every other template says.
  await expect(page.locator('main')).toHaveAttribute('data-button', 'orb');
  await expect(page.getByRole('link', { name: 'Đánh giá trên Google', exact: true })).toHaveCount(1);
  await expect(google.locator('.google-ring textPath')).toContainText('ĐÁNH GIÁ TRÊN GOOGLE');
  const face = (await google.locator('.google-orb-face').boundingBox())!;
  expect(Math.round(face.width)).toBe(Math.round(face.height));
  expect(await google.locator('.google-g').evaluate(g => getComputedStyle(g).maskImage || getComputedStyle(g).getPropertyValue('-webkit-mask-image'))).toContain('svg');
  await page.goto('/one'); await loaded(page);
  await expect(page.locator('[data-google]')).toHaveAttribute('target', '_blank');
});

test('khuôn 6: a tap covers the page for 300 ms, then the same tab goes to Google, with the tap recorded', async ({ page, fixture: f }) => {
  const shop = await bigButtonShop(f); await googleStub(page);
  await page.goto('/six'); await loaded(page);
  const started = Date.now();
  await page.locator('[data-google]').click();
  await expect(page.locator('main[data-leaving]')).toHaveCount(1);
  // Still on our own page, and the cover is drawn: the page Google sends back is never under it.
  expect(await page.evaluate(() => [location.hostname, getComputedStyle(document.querySelector('main')!, '::after').content])).toEqual(['127.0.0.1', '""']);
  await page.waitForURL('https://maps.google.com/?cid=66');
  expect(Date.now() - started).toBeGreaterThanOrEqual(280);
  // The tap was queued before leaving and flushed on pagehide, so the same-tab exit does not lose it.
  await expect.poll(async () => (await f.db.query(`SELECT e.name FROM page_events e JOIN page_visits v ON v.id=e.visit_id
    WHERE v.shop_id=$1 AND e.name='google_tapped'`, [shop])).rowCount).toBe(1);
  // Back on the page, with or without the back-forward cache, the cover is gone.
  await page.goBack(); await loaded(page);
  await expect(page.locator('main[data-leaving]')).toHaveCount(0);
});

test('khuôn 6: with reduced motion the tap goes straight to Google, no cover', async ({ page, fixture: f }) => {
  await bigButtonShop(f); await googleStub(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The cover would last only 300 ms, so watch for it rather than look for it afterwards.
  let covered = false; await page.exposeFunction('coverSeen', () => { covered = true; });
  await page.addInitScript(() => new MutationObserver(() => { if (document.querySelector('main[data-leaving]')) (window as unknown as { coverSeen: () => void }).coverSeen(); })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-leaving'] }));
  await page.goto('/six'); await loaded(page);
  await page.locator('[data-google]').click();
  await page.waitForURL('https://maps.google.com/?cid=66');
  expect(covered).toBe(false);
});

// Khuôn 5 · Ánh sáng tụ: a dark page where light gathers on the Google button and the pattern blurs with distance.
const luminance = (rgb: string) => { const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map(n => Number(n) / 255)
  .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('khuôn 5: light gathers on the Google button, and every text stays readable on the dark page', async ({ page, fixture: f }) => {
  await templateShop(f, 'spotlight', 'five', { links: [
    { label: { vi: 'Instagram', en: 'Instagram' }, url: 'https://instagram.com/quanthu', icon: 'instagram' },
    { label: { vi: 'Zalo', en: 'Zalo' }, url: 'https://zalo.me/0900000000', icon: 'zalo' }] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/five'); await loaded(page);
  await expect(page.locator('main')).toHaveAttribute('data-template', 'spotlight');
  const google = page.locator('[data-google]');
  await expect(google).toBeInViewport();
  // The glow is the button's own shadow, so it follows the button wherever the name pushes it.
  expect(await google.evaluate(element => getComputedStyle(element).boxShadow)).toContain('rgba(245, 185, 74');
  // Near is sharp, far is blurred: the decoration, never the text.
  const layers = await page.locator('.guest-body').evaluate(body => [getComputedStyle(body, '::before').filter, getComputedStyle(body, '::after').filter]);
  expect(layers).toEqual(['none', 'blur(2.5px)']);
  expect(await page.locator('.guest h1').evaluate(element => getComputedStyle(element).filter)).toBe('none');
  // Links are dark pills with light ink, not light ink on the default white pill.
  // Measured against the pill's own painted background (the first stop of its gradient), never against an assumed one.
  const [ink, paint] = await page.locator('.guest-links a').first().evaluate(link => [getComputedStyle(link).color, getComputedStyle(link).backgroundImage]);
  expect(contrast(ink, paint.match(/rgba?\([^)]*\)/)![0])).toBeGreaterThanOrEqual(4.5);
  // Inside the private card the fields take the template's paper and ink.
  await openCard(page);
  const field = await page.locator('#message').evaluate(element => [getComputedStyle(element).color, getComputedStyle(element).backgroundColor]);
  expect(contrast(field[0], field[1])).toBeGreaterThanOrEqual(4.5);
});

// A2: the paper plane and its invitation are one thing under every template, dark or light.
test('the private-feedback button and its invitation look the same under a dark and a light template', async ({ page, fixture: f }) => {
  await templateShop(f, 'spotlight', 'five'); await bigButtonShop(f);
  await page.setViewportSize({ width: 390, height: 600 });
  const look = async (slug: string) => {
    await page.goto(`/${slug}`); await loaded(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-hint]')).toBeVisible({ timeout: 6000 });
    // The invitation springs in (0.55 s, with overshoot): measured mid-flight its width differs by a pixel run to run.
    await page.locator('[data-hint]').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    return page.evaluate(() => [...document.querySelectorAll('.guest-plane, .guest-hint')].map(element => {
      const style = getComputedStyle(element); const box = element.getBoundingClientRect();
      return [style.color, style.backgroundColor, style.boxShadow, style.fontSize, Math.round(box.width), Math.round(box.height), Math.round(box.left)];
    }));
  };
  expect(await look('five')).toEqual(await look('six'));
});

// Khuôn 3 · Kính (thiet-ke-va-khuon.md mục 15): every pane carries a copy of the scene shifted by exactly where it sits,
// refracted by a filter every engine runs; the scene scrolls with the page so the filter never has to run again.
const glassPlacement = (page: Page) => page.evaluate(() => {
  const main = document.querySelector('main')!, m = main.getBoundingClientRect();
  return Math.max(...[...document.querySelectorAll<HTMLElement>('.guest-body, .guest-links a')].flatMap(pane => {
    const box = pane.getBoundingClientRect();
    return [Math.abs(parseFloat(pane.style.getPropertyValue('--gx')) - (box.left - m.left)), Math.abs(parseFloat(pane.style.getPropertyValue('--gy')) - (box.top - m.top))];
  }));
});
test('khuôn 3: glass panes carry an aligned, refracted copy of the scene, and the Google button stays solid', async ({ page, fixture: f }) => {
  await templateShop(f, 'glass', 'three', { links: [
    { label: { vi: 'Instagram', en: 'Instagram' }, url: 'https://instagram.com/quanthu', icon: 'instagram' },
    { label: { vi: 'Zalo', en: 'Zalo' }, url: 'https://zalo.me/0900000000', icon: 'zalo' },
    { label: { vi: 'Thực đơn', en: 'Menu' }, url: 'https://quanthu.example/menu', icon: 'link' }] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/three'); await loaded(page);
  await expect(page.locator('main[data-glass]')).toHaveCount(1);
  expect(await glassPlacement(page)).toBeLessThan(1);
  const filters = await page.evaluate(() => [getComputedStyle(document.querySelector('.guest-body')!, '::before').filter,
    getComputedStyle(document.querySelector('.guest-links a')!, '::before').filter, getComputedStyle(document.querySelector('.guest-bg')!).position]);
  expect(filters[0]).toContain('nfc-glass-lg'); expect(filters[1]).toContain('nfc-glass-sm');
  // The scene scrolls with the page: glass and scene never slide past each other.
  expect(filters[2]).toBe('absolute');
  await expect(page.locator('video')).toHaveCount(0);
  const google = page.locator('[data-google]');
  await expect(google).toBeInViewport();
  expect(await google.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('gradient');
  // A language switch rewraps the lines above the links: the panes move without changing size, and the copies follow.
  await page.locator('#language').selectOption('en');
  await expect.poll(() => glassPlacement(page)).toBeLessThan(1);
});

// Khuôn 4 · Chồng thẻ (ảnh Tài gửi 24/09): a tilted card over a second card that is the shop's poster slot.
test('khuôn 4: a tilted card over the poster card, links as rows, and nothing covers the Google button', async ({ page, fixture: f }) => {
  // Six links: the tallest card a shop can make, so the tilt's reach to the right is measured at its worst.
  await templateShop(f, 'deco', 'four', { links: [
    { label: { vi: 'Instagram', en: 'Instagram' }, url: 'https://instagram.com/quanthu', icon: 'instagram' },
    { label: { vi: 'Zalo', en: 'Zalo' }, url: 'https://zalo.me/0900000000', icon: 'zalo' },
    { label: { vi: 'TikTok', en: 'TikTok' }, url: 'https://tiktok.com/@quanthu', icon: 'tiktok' },
    { label: { vi: 'Facebook', en: 'Facebook' }, url: 'https://facebook.com/quanthu', icon: 'facebook' },
    { label: { vi: 'Website', en: 'Website' }, url: 'https://quanthu.example', icon: 'link' },
    { label: { vi: 'Gọi cho quán', en: 'Call us' }, url: 'tel:+84901234567', icon: 'phone' }] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/four'); await loaded(page);
  await expect(page.locator('main')).toHaveAttribute('data-template', 'deco');
  const google = page.locator('[data-google]');
  await expect(google).toBeInViewport();
  // The card is tilted, and the Google button is what a tap on its centre reaches: no card of the stack lies over it.
  expect(await page.locator('.guest-body').evaluate(body => getComputedStyle(body).transform)).not.toBe('none');
  const box = (await google.boundingBox())!;
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-google]'), [box.x + box.width / 2, box.y + box.height / 2])).toBe(true);
  expect(box.y + box.height).toBeLessThan(640);
  // Links are full-width rows of one width, each still named.
  const widths = await page.locator('.guest-links a').evaluateAll(links => links.map(link => Math.round(link.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1); expect(widths[0]).toBeGreaterThan(250);
  for (const name of ['Instagram', 'Zalo', 'TikTok', 'Facebook', 'Website', 'Gọi cho quán']) await expect(page.getByRole('link', { name, exact: true })).toHaveCount(1);
  const [ink, paint] = await page.locator('.guest-links a').first().evaluate(link => [getComputedStyle(link).color, getComputedStyle(link).backgroundColor]);
  expect(contrast(ink, paint)).toBeGreaterThanOrEqual(4.5);
  // The Google button is light here, so its label must be dark.
  const label = await google.evaluate(element => getComputedStyle(element).color);
  expect(contrast(label, 'rgb(255, 255, 255)')).toBeGreaterThanOrEqual(4.5);
  // The tilted card stays on the screen: its far corner does not run off the right edge of a 390px phone.
  expect(await page.locator('.guest-body').evaluate(body => body.getBoundingClientRect().right)).toBeLessThanOrEqual(390);
});

// Khuôn 2 · Tối giản (ảnh "Minimal Dark Card" Tài gửi 24/09): one dark card with a blurred glow around it, links as tiles.
test('khuôn 2: a dark card with a glow around it, and links laid out as even tiles for every count', async ({ page, fixture: f }) => {
  const all = [
    { label: { vi: 'Instagram', en: 'Instagram' }, url: 'https://instagram.com/quanthu', icon: 'instagram' as const },
    { label: { vi: 'Zalo', en: 'Zalo' }, url: 'https://zalo.me/0900000000', icon: 'zalo' as const },
    { label: { vi: 'TikTok', en: 'TikTok' }, url: 'https://tiktok.com/@quanthu', icon: 'tiktok' as const },
    { label: { vi: 'Facebook', en: 'Facebook' }, url: 'https://facebook.com/quanthu', icon: 'facebook' as const },
    { label: { vi: 'Website', en: 'Website' }, url: 'https://quanthu.example', icon: 'link' as const },
    { label: { vi: 'Gọi cho quán', en: 'Call us' }, url: 'tel:+84901234567', icon: 'phone' as const },
  ];
  const shop = await templateShop(f, 'minimal', 'two', { links: all.slice(0, 1) });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/two'); await loaded(page);
  await expect(page.locator('main')).toHaveAttribute('data-template', 'minimal');
  await expect(page.locator('[data-google]')).toBeInViewport();
  // The glow is a blurred layer behind the card, drawn once: a static filter, never a backdrop filter.
  const glow = await page.locator('.guest-body').evaluate(body => [getComputedStyle(body, '::before').filter, getComputedStyle(body).backdropFilter]);
  expect(glow[0]).toContain('blur'); expect(glow[1]).toBe('none');
  // An empty poster slot is not shown; a shop's poster would be.
  await expect(page.locator('.guest-poster-empty')).toBeHidden();
  // Rows of tiles, as [row, width] per link: every row fills the card, and tiles in a row are equal.
  const rows = [[[1]], [[2]], [[3]], [[2], [2]], [[3], [2]], [[3], [3]]];
  let revision = 2;
  for (let n = 1; n <= 6; n++) {
    if (n > 1) { const saved = await f.admin.saveDraft(shop, revision, { ...templateConfig('minimal'), name: 'Quán two', googleUrl: 'https://maps.google.com/?cid=66', links: all.slice(0, n) });
      await f.admin.publish(shop, saved); revision = saved + 1; await page.goto('/two'); await loaded(page); }
    const boxes = await page.locator('.guest-links a').evaluateAll(links => links.map(link => { const b = link.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.width)]; }));
    const byRow = [...new Set(boxes.map(([top]) => top))].map(top => boxes.filter(([t]) => t === top).map(([, w]) => w));
    expect(byRow.map(row => [row.length]), `${n} links`).toEqual(rows[n - 1]);
    for (const row of byRow) expect(Math.max(...row) - Math.min(...row), `${n} links`).toBeLessThanOrEqual(1);
    for (const link of all.slice(0, n)) await expect(page.getByRole('link', { name: link.label.vi, exact: true })).toHaveCount(1);
  }
});

// Khuôn 1 · Bản gốc, thẻ trôi (Tài chốt 24/09, ý 1 + 2): the background stays put, only the card scrolls; the card's top
// edge fades from clear to paper over a blurred band, and the background eases in and darkens as the page scrolls.
test('khuôn 1: a floating card whose top fades into the background, text only on solid paper, and a background that breathes', async ({ page, fixture: f }) => {
  await templateShop(f, 'standard', 'one-std', { links: [
    { label: { vi: 'Instagram', en: 'Instagram' }, url: 'https://instagram.com/quanthu', icon: 'instagram' },
    { label: { vi: 'Zalo', en: 'Zalo' }, url: 'https://zalo.me/0900000000', icon: 'zalo' },
    { label: { vi: 'TikTok', en: 'TikTok' }, url: 'https://tiktok.com/@quanthu', icon: 'tiktok' }] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/one-std'); await loaded(page);
  await expect(page.locator('main')).toHaveAttribute('data-template', 'standard');
  await expect(page.locator('[data-google]')).toBeInViewport();
  const card = await page.evaluate(() => {
    const body = document.querySelector('.guest-body')!, box = body.getBoundingClientRect(), h1 = document.querySelector('.guest h1')!.getBoundingClientRect();
    const paper = getComputedStyle(body, '::after'), band = getComputedStyle(body, '::before');
    return { mask: paper.maskImage || paper.getPropertyValue('-webkit-mask-image'), blur: band.backdropFilter || band.getPropertyValue('-webkit-backdrop-filter'),
      textStartsAt: h1.top - box.top, sides: [box.left, window.innerWidth - box.right], bg: getComputedStyle(document.querySelector('.guest-bg')!).position };
  });
  expect(card.mask).toContain('gradient'); expect(card.blur).toContain('blur');
  // The card floats: margins on both sides, and the background never scrolls.
  expect(Math.min(...card.sides)).toBeGreaterThanOrEqual(10); expect(card.bg).toBe('fixed');
  // Text begins below the fade, so it never sits on half-clear paper over a moving background.
  const fadeEnd = await page.locator('.guest-body').evaluate(body => { const probe = document.createElement('div');
    probe.style.height = 'var(--fade)'; body.appendChild(probe); const h = probe.getBoundingClientRect().height; probe.remove(); return h; });
  expect(fadeEnd).toBeGreaterThan(40); expect(card.textStartsAt).toBeGreaterThanOrEqual(fadeEnd);
  // Links are three even tiles in one row.
  const tiles = await page.locator('.guest-links a').evaluateAll(links => links.map(link => { const b = link.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.width)]; }));
  expect(new Set(tiles.map(([top]) => top)).size).toBe(1); expect(Math.max(...tiles.map(([, w]) => w)) - Math.min(...tiles.map(([, w]) => w))).toBeLessThanOrEqual(1);
  // Idea 2, where the browser has scroll-driven animations: the background grows and dims as the page scrolls.
  if (await page.evaluate(() => CSS.supports('animation-timeline: scroll()'))) {
    const look = () => page.evaluate(() => { const bg = document.querySelector('.guest-bg')!;
      return [new DOMMatrix(getComputedStyle(bg).transform).a, Number(getComputedStyle(bg, '::after').opacity)]; });
    expect(await look()).toEqual([1, 0]);
    // Measured over the page's whole scroll, so even a short page reaches the full effect at its foot.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(async () => (await look()).map(n => Math.round(n * 100) / 100)).toEqual([1.08, 0.35]);
  }
});

// Cửa duyệt ảnh (migration 023): a picture waiting for review never reaches the guest page, and the page stays up.
test('an uploaded picture that is still waiting for review cannot be published; the live page keeps running', async ({ page, fixture: f }) => {
  const poster = 'https://media.example/waiting.jpg';
  await f.db.query("INSERT INTO media_assets(shop_id,url,kind,uploaded_by)VALUES($1,$2,'image','fixture')", [f.shop, poster]);
  const saved = await f.admin.saveDraft(f.shop, 2, b2({ poster: { kind: 'image', url: poster } }));
  await expect(f.admin.publish(f.shop, saved)).rejects.toThrow('MEDIA_PENDING');
  await page.goto('/one'); await loaded(page);
  await expect(page.locator(`img[src="${poster}"]`)).toHaveCount(0);
  await expect(page.locator('[data-google]')).toBeVisible();
});

// Tài báo 24/09: trên shop khuôn 6 thật, thẻ góp ý mở được nhưng không bấm được gì, kèm "Chưa kết nối được".
// The private card has to work under every template: open it, pick a star, write, send, see the thanks.
test('private feedback works end to end under every one of the six templates', async ({ page, fixture: f }) => {
  const { TEMPLATE_KEYS } = await import('../lib/publishing/config');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const key of TEMPLATE_KEYS) {
    const slug = `pf-${key}`;
    await templateShop(f, key, slug);
    await page.goto(`/${slug}`); await loaded(page);
    await expect(page.locator('.guest-connection'), key).toHaveCount(0);
    await openCard(page);
    await star(page, 4).click();
    await page.locator('#message').fill(`Góp ý thử ở khuôn ${key}`);
    await sendButton(page).click();
    await expect(page.locator('[data-thanks]'), key).toBeVisible();
  }
});

// Tài báo 24/09 (shop Googy, Chrome trên iPhone): sau khi shop phát hành lại, khách tải lại trang trong vòng một lượt ghé
// thì "Chưa kết nối được" và không bấm được gì trong thẻ góp ý. The browser resumes its visit, which was opened under the
// previous release; a republish must not lock a guest out of the page they are holding.
test('a guest who reloads after the shop republishes can still send feedback', async ({ page, fixture: f }) => {
  await page.goto('/one'); await loaded(page);
  await openCard(page); await star(page, 5).click(); await page.keyboard.press('Escape');
  await release(f, b2({ name: 'Quán Sau Khi Sửa' }), 2);
  await page.reload(); await loaded(page);
  await expect(page.locator('.guest-connection')).toHaveCount(0);
  await openCard(page); await star(page, 3).click();
  await page.locator('#message').fill('Vẫn gửi được sau khi quán sửa trang');
  await sendButton(page).click();
  await expect(page.locator('[data-thanks]')).toBeVisible();
});

// Khuôn 6: on Android tilting the phone moves the light on the orb; iPhone asks permission for the sensor, so there the
// page never listens -- a guest page never asks a visitor for anything.
test('khuôn 6: the light on the orb follows the tilt of the phone, and the visitor is never asked for the sensor', async ({ page, fixture: f }) => {
  await bigButtonShop(f);
  // Record any attempt to ask for the motion sensor: a guest page must never make one.
  await page.addInitScript(() => { (window as unknown as { asked: number }).asked = 0;
    (window.DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission = () => { (window as unknown as { asked: number }).asked++; return Promise.resolve('granted'); }; });
  await page.goto('/six'); await loaded(page);
  const tilt = () => page.evaluate(() => [document.querySelector('main')!.style.getPropertyValue('--tilt-x'), document.querySelector('main')!.style.getPropertyValue('--tilt-y')]);
  expect(await tilt()).toEqual(['', '']);
  await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 75, gamma: -30 })));
  await expect.poll(tilt).toEqual(['-14.0%', '14.0%']);
  await page.locator('[data-google]').hover();
  expect(await page.evaluate(() => (window as unknown as { asked: number }).asked)).toBe(0);
  // Reduced motion: the light stays where it is.
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload(); await loaded(page);
  await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 75, gamma: -30 })));
  await page.waitForTimeout(200);
  expect(await tilt()).toEqual(['', '']);
});
