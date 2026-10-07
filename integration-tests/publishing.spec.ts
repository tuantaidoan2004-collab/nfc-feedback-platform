import { test as base, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';
import { PublishingAdmin, templateVersionRow, type PageRef } from '../lib/publishing/repository';
import type { PageConfig } from '../lib/publishing/config';
import type { PageDoc } from '../lib/canvas/doc';
import { walk } from '../lib/canvas/validate';
import { CANVAS_TEMPLATES, pageFromTemplate } from '../lib/canvas/templates';
import { FACES } from '../lib/faces';
const uri = process.env.NFC_TEST_DATABASE_URL, schema = process.env.NFC_TEST_SCHEMA;
if (uri !== 'postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test' || !/^nfc_ui_test_[a-f0-9]{32}$/.test(schema ?? '')) throw Error('Isolated harness required');
type Fixture = { db: Pool; admin: PublishingAdmin; shop: string; page: PageRef; release: string };
/** The shop's review link: the Google button always takes it (shops.google_url), never anything a page says. */
const GOOGLE = 'https://maps.google.com/?cid=42', SHOP_GOOGLE = 'https://maps.google.com/?cid=66';
/**
 * A page from a template, named `name`; `change` edits its document the way the agent would (scripts/sua-trang.mjs). The name
 * slot shows the shop's name whatever the page (lib/canvas/slots.ts, Tài 06/10), so the page also writes `name` on a line of its
 * own (`loi-moi`, when the template has it): that line tells which release is on screen.
 */
// The fixture basic-1 (tests/fixtures/templates): a page with a picture and buttons, which the start page does not have.
function canvas(name: string, change?: (doc: PageDoc) => void, key = 'basic-1'): PageConfig {
  const config = pageFromTemplate(key, name);
  if ([...walk(config.doc)].some(e => e.id === 'loi-moi')) set(config.doc, 'loi-moi', { words: { vi: name } });
  change?.(config.doc); return config;
}
/** One element of the document by its id, wherever it sits (a stack's child, a button in a row); `undefined` removes a key. */
function set(doc: PageDoc, id: string, patch: Record<string, unknown>) {
  const el = [...walk(doc)].find(e => e.id === id) as Record<string, unknown> | undefined; if (!el) throw Error(`No element ${id}`);
  for (const [key, value] of Object.entries(patch)) if (value === undefined) delete el[key]; else el[key] = value;
}
const test = base.extend<{ fixture: Fixture }>({ fixture: async ({}, provideFixture) => {
  const db = new Pool({ connectionString: uri, options: `-c search_path=${schema}` });
  try {
    await db.query('TRUNCATE shops, template_versions CASCADE');
    const shop = randomUUID();
    await db.query("INSERT INTO shops(id,slug,name,google_url)VALUES($1,'one','Legacy fixture',$2)", [shop, GOOGLE]);
    const admin = new PublishingAdmin(db, async () => ({ actorId: 'local-fixture-only' }));
    const template = await admin.createTemplate('neutral', 1);
    const page = await admin.createPage(shop, template, canvas('Release One'), 'one');
    const published = await admin.publish(page, 1);
    await provideFixture({ db, admin, shop, page, release: published.releaseId });
  } finally { await db.end(); }
} });
const star = (page: Page, n: number) => page.getByRole('button', { name: `${n} sao`, exact: true });
// Stars live in the private card and are saved only by Send.
const loaded = (page: Page) => expect(page.locator('main[data-ready]')).toBeVisible();
async function openCard(page: Page) {
  if (await page.locator('#private-card').count()) return;
  // The plane steps aside while it would lie over the Google button (live.tsx); a guest scrolls on to reach it.
  if (await page.locator('#private-feedback[data-away]').count()) await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('#private-feedback:not([data-away])')).toHaveCount(1);
  // The button floats on purpose; force skips Playwright's wait for it to stand still.
  await page.locator('#private-feedback').click({ force: true });
  await expect(page.locator('#private-card')).toBeVisible();
}
const sendButton = (page: Page) => page.getByRole('button', { name: 'Gửi góp ý', exact: true });
async function thanked(page: Page) {
  await expect(page.locator('[data-thanks]')).toBeVisible();
  await page.locator('[data-thanks] button').click(); await expect(page.locator('#private-card')).toHaveCount(0);
}
async function rated(page: Page, n: number) { await openCard(page); await star(page, n).click(); await sendButton(page).click(); await thanked(page); }
/** The page's name as the page shows it: the template's "Tên quán" spot, filled with the name (lib/canvas/templates.ts). */
const shownName = (page: Page) => page.locator('[data-id="loi-moi"]');
/** Entrance animations done (loops run for ever and are left alone): every box is where the design puts it. */
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations()
  .filter(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => null))));
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
  // Each release writes its name on a line of its own (canvas() above), so that line shows which release is on screen.
  await expect(shownName(page)).toHaveText('Release One');
  await f.admin.saveDraft(f.page, 2, canvas('Release Two'));
  const second = await f.admin.publish(f.page, 3);
  release(); await loaded(page);
  await rated(page, 5);
  const google = await page.locator('[data-google]').evaluate(element => element.outerHTML);
  await page.reload(); await loaded(page);
  await expect(shownName(page)).toHaveText('Release Two');
  expect(await page.locator('[data-google]').evaluate(element => element.outerHTML)).toBe(google);
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
  const tag = await f.admin.createTag(f.page, 'fixture-tag');
  const preview = await f.admin.preview(f.page, { kind: 'draft', revision: 2 }, 900, tag);
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
  await f.admin.setTagState(f.page, tag, 'tested', preview.id); await f.admin.setTagState(f.page, tag, 'active');
  await page.goto('/t/fixture-tag'); await loaded(page);
  expect((await f.db.query("SELECT tag_id,release_id FROM published_visit_contexts WHERE scope='live'")).rows).toEqual([{ tag_id: tag, release_id: f.release }]);
  await f.admin.setTagState(f.page, tag, 'disabled');
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
  const cap = await f.admin.preview(f.page, { kind: 'release', id: f.release });
  expect((await request.post('/preview/exchange', { headers: { Origin: 'https://invalid.example' }, data: { token: cap.token } })).status()).toBe(403);
  await f.admin.setShopState(f.shop, 'suspended');
  const response = page.waitForResponse('**/rating'); await openCard(page); await star(page, 5).click(); await sendButton(page).click();
  expect((await response).status()).toBe(403);
  expect((await f.db.query('SELECT count(*)::int n FROM rating_experiences')).rows[0].n).toBe(0);
});
test('publishing gate off: no page, no write path, nothing recorded', async ({ page, request, fixture: f }) => {
  // Lát A3: nothing falls back to the cookie-era page any more; with the gate off the link does not exist.
  expect((await request.post('http://127.0.0.1:3318/api/v2/pages/visits', { data: {} })).status()).toBe(404);
  expect((await page.goto('http://127.0.0.1:3318/one'))!.status()).toBe(404);
  await expect(page.getByText('Legacy fixture', { exact: true })).toHaveCount(0);
  expect((await f.db.query('SELECT count(*)::int n FROM page_visits')).rows[0].n).toBe(0);
});

// The fixture publishes draft revision 1, so the next save expects revision 2.
async function release(f: Fixture, config: unknown, expected: number) {
  const saved = await f.admin.saveDraft(f.page, expected, config); await f.admin.publish(f.page, saved); return saved + 1;
}
/** A shop with a page made from template `key`, as the Library makes one: the page records the template it came from. */
async function templateShop(f: Fixture, key: string, slug: string, change?: (doc: PageDoc) => void) {
  const shop = randomUUID();
  await f.db.query('INSERT INTO shops(id,slug,name,google_url)VALUES($1,$2,$3,$4)', [shop, slug, `Quán ${slug}`, SHOP_GOOGLE]);
  const page = await f.admin.createPage(shop, await templateVersionRow(f.db, key), canvas(`Quán ${slug}`, change, key), slug);
  await f.admin.publish(page, 1);
  return page;
}

// Luật 0.1 of the script, on every template the Library offers: the Google button is in the first screen of the smallest
// phone, nothing lies over it, it takes the shop's own link, the page asks for nothing before it, and it stays the same
// whatever the guest sends. The private card works under each of them (Tài 24/09: on one template of old the card opened
// and nothing in it could be tapped).
test('every template: Google in the first screen and on top, with the shop\'s link, the same whatever the guest sends', async ({ page, fixture: f }) => {
  // iPhone SE in Safari: the first screen that FIRST_SCREEN stands for (lib/canvas/doc.ts).
  await page.setViewportSize({ width: 375, height: 548 });
  for (const { key } of CANVAS_TEMPLATES) {
    const slug = `pf-${key}`;
    await templateShop(f, key, slug);
    await page.goto(`/${slug}`); await loaded(page); await settled(page);
    await expect(page.getByRole('button', { name: /sao$/ }), key).toHaveCount(0);
    const google = page.locator('[data-google]');
    await expect(google, key).toHaveCount(1);
    await expect(google, key).toHaveAttribute('href', SHOP_GOOGLE);
    await expect(google, key).toHaveAttribute('target', '_blank');
    const box = (await google.boundingBox())!;
    expect(box.y, key).toBeGreaterThanOrEqual(0); expect(box.y + box.height, key).toBeLessThanOrEqual(548);
    // On top: a tap on the middle of the button reaches the button, whatever floats or decorates around it.
    expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-google]'), [box.x + box.width / 2, box.y + box.height / 2]), key).toBe(true);
    const before = await google.evaluate(element => element.outerHTML);
    await openCard(page); await star(page, 4).click();
    await page.locator('#message').fill(`Góp ý thử ở template ${key}`);
    await sendButton(page).click(); await thanked(page);
    expect(await google.evaluate(element => element.outerHTML), key).toBe(before);
    await expect(page.locator('.cv-connection'), key).toHaveCount(0);
  }
  expect((await f.db.query('SELECT count(*)::int n FROM rating_experiences')).rows[0].n).toBe(CANVAS_TEMPLATES.length);
});
test('the plane opens the private card over a dimmed page; faces follow the score; a draft survives closing; thanks stays until closed', async ({ page, fixture: f }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto('/one'); await loaded(page);
  const plane = page.locator('#private-feedback');
  await expect(plane).toBeInViewport({ ratio: 1 });
  // The original plane, on every page (Tài 05/10): blue, edged in white, no disc behind it.
  await expect(plane.locator('path')).toHaveAttribute('fill', '#229ED9');
  await expect(plane.locator('path')).toHaveAttribute('stroke', '#FFFFFF');
  await expect(plane).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await plane.click({ force: true });
  const card = page.getByRole('dialog');
  await expect(card).toContainText('Gửi góp ý riêng cho quản lý');
  await expect(card).toContainText('Bạn cảm thấy thế nào?');
  await expect(page.locator('.guest-modal')).toHaveCSS('backdrop-filter', /blur/);
  await expect(page.locator('.cv-page')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
  for (const score of [1, 2, 3, 4, 5, 2]) {
    await star(page, score).click();
    await expect(page.locator('.guest-face')).toHaveText(Array(score).fill(FACES[score - 1]));
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
test('the card takes an optional call-back number that needs a few words with it', async ({ page, fixture: f }) => {
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
// The original plane's invitation (Tài 05/10: kept as it was): it appears only two seconds after the visitor reaches the bottom.
test('the plane\'s invitation appears only two seconds after the visitor reaches the bottom, and opens the card', async ({ page }) => {
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
// A1 (Tài 23/09), kept with the plane: every page is taller than the phone, so reaching the bottom is something the visitor
// does; a page that fit the screen counted as "already at the bottom" on arrival and invited feedback unasked.
test('every template still scrolls, so the plane\'s invitation never shows on arrival', async ({ page, fixture: f }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const { key } of CANVAS_TEMPLATES) {
    await templateShop(f, key, `a1-${key}`);
    await page.goto(`/a1-${key}`); await loaded(page);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), key).toBeGreaterThanOrEqual(104);
  }
  await page.waitForTimeout(2600);
  await expect(page.locator('[data-hint]')).toHaveCount(0);
});
// A2: the plane and its invitation are one thing on every page, dark or light; the press sinks the plane to 70%.
test('the plane and its invitation look the same on a dark and a light page, and a press sinks the plane to 70%', async ({ page, fixture: f }) => {
  await templateShop(f, 'hair-styling', 'toi'); await templateShop(f, 'nen-ca-phe', 'sang');
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
  expect(await look('toi')).toEqual(await look('sang'));
  const box = (await page.locator('#private-feedback').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.waitForTimeout(250);
  const scale = () => page.locator('#private-feedback').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a);
  expect(await scale()).toBeCloseTo(0.7, 2);
  await page.mouse.move(0, 0); await page.mouse.up();
  await page.waitForTimeout(900);
  expect(await scale()).toBeCloseTo(1, 2);
});
// Mẫu Illustrate (`fx.hint`): after its time without a scroll an arrow says there is more below, and the first scroll takes it away.
test('the scroll hint comes only after its time without a scroll, and leaves at the first scroll', async ({ page, fixture: f }) => {
  await templateShop(f, 'illustrate-nha-khoa', 'rang');
  await page.goto('/rang'); await loaded(page);
  const hint = page.locator('.cv-hint');
  // The template waits three seconds; the clock started when the page came alive, a moment before it was ready.
  await page.waitForTimeout(1500);
  await expect(hint).toHaveCount(0);
  await expect(hint).toBeVisible({ timeout: 3000 });
  await expect(hint).toContainText('Kéo xuống để khám phá thêm');
  await hint.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(12);
  await expect(hint).toHaveCount(0);
  // A guest who scrolls before the time never sees it.
  await page.goto('/rang'); await loaded(page);
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(3500);
  await expect(hint).toHaveCount(0);
});
test('the page draws what its document says: links and their tabs, the plane\'s look, hidden elements; a press sinks a button', async ({ page, fixture: f }) => {
  // Written into the page itself, these two buttons are no longer the shop's places (`slot` gone, lib/canvas/slots.ts).
  await release(f, canvas('Quán Thử', doc => {
    set(doc, 'instagram', { label: { vi: 'Facebook' }, icon: 'facebook', link: 'https://facebook.com/quanthu', slot: undefined });
    set(doc, 'zalo', { label: { vi: 'Gọi cho quán', en: 'Call us' }, icon: 'phone', link: 'tel:+84901234567', slot: undefined });
    set(doc, 'tiktok', { hide: true });
    set(doc, 'anh-chinh', { hide: true });
    set(doc, 'gop-y', { icon: 'chat', color: '#FF5500', edge: '#000000' });
  }), 2);
  await page.goto('/one'); await loaded(page);
  const facebook = page.getByRole('link', { name: 'Facebook' }), phone = page.getByRole('link', { name: 'Gọi cho quán' });
  await expect(facebook).toHaveAttribute('href', 'https://facebook.com/quanthu'); await expect(facebook).toHaveAttribute('target', '_blank');
  await expect(phone).toHaveAttribute('href', 'tel:+84901234567'); expect(await phone.getAttribute('target')).toBeNull();
  // What the owner hid is not on the page at all, not merely invisible.
  await expect(page.locator('[data-id="tiktok"], [data-id="anh-chinh"]')).toHaveCount(0);
  const plane = page.locator('#private-feedback');
  await expect(plane.locator('path')).toHaveAttribute('fill', '#FF5500');
  await expect(plane.locator('path')).toHaveAttribute('stroke', '#000000');
  await settled(page);
  const box = (await facebook.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.waitForTimeout(250);
  expect(await facebook.evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a)).toBeCloseTo(0.96, 2);
  await page.mouse.move(0, 0); await page.mouse.up();
});
// Cửa duyệt ảnh: a picture the shop uploaded reaches the guest page only once approved, and a page whose next picture waits
// stays up as it was. Pictures only: a page never carries a video (Tài 26/09; the canvas has no video element).
test('an uploaded picture is published only once approved; while one waits the live page keeps running', async ({ page, fixture: f }) => {
  const waiting = 'https://media.example/waiting.jpg', approved = 'https://media.example/approved.jpg';
  await f.db.query("INSERT INTO media_assets(shop_id,url,kind,uploaded_by)VALUES($1,$2,'image','fixture')", [f.shop, waiting]);
  await f.db.query("INSERT INTO media_assets(shop_id,url,kind,uploaded_by,state,reviewed_at)VALUES($1,$2,'image','fixture','approved',clock_timestamp())", [f.shop, approved]);
  const saved = await f.admin.saveDraft(f.page, 2, canvas('Quán Thử', doc => set(doc, 'anh-chinh', { src: waiting })));
  await expect(f.admin.publish(f.page, saved)).rejects.toThrow('MEDIA_PENDING');
  await page.goto('/one'); await loaded(page);
  await expect(page.locator(`img[src="${waiting}"]`)).toHaveCount(0);
  await expect(shownName(page)).toHaveText('Release One');
  await expect(page.locator('[data-google]')).toBeVisible();
  await release(f, canvas('Quán Thử', doc => set(doc, 'anh-chinh', { src: approved })), saved);
  await page.reload(); await loaded(page);
  await expect(page.locator(`img[src="${approved}"]`)).toHaveCount(1);
  await expect(page.locator('video')).toHaveCount(0);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px`).toBe(true);
  }
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
  // Google opens in its own tab (no thanks on this page); the tap is queued like the rest, and this page stays.
  await page.context().route('https://maps.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>stub</title>' }));
  const tab = page.waitForEvent('popup');
  await page.locator('[data-google]').click();
  await (await tab).close();

  // Leaving is what flushes whatever is still queued.
  await page.evaluate(() => document.dispatchEvent(new Event('pagehide')));
  await expect.poll(async () => (await rows()).map(r => r.name).join(),
    { timeout: 10_000 }).toContain('google_tapped');

  const logged = await rows();
  // Five taps, a handful of requests at most: a beacon per tap would be a request on the hot path.
  expect(beacons).toBeLessThanOrEqual(2);
  expect(logged.map(r => r.name).slice(0, 5)).toEqual(['page_opened', 'card_opened', 'star_chosen', 'feedback_sent', 'google_tapped']);
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

// Lát M2 (Tài 27/09), now a page's own setting (`fx.thanks`, the editor's "Lời cảm ơn trước khi mở Google"): a tap on Google
// shows the platform's thanks, hearts burst, the count runs the full time, then Google opens in a NEW tab and this page
// stays as it was, for the guest to come back to.
const googleTab = (page: Page) => page.context().route('https://maps.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>stub</title>' }));
test('with thanks before Google: a tap thanks the guest, the count runs out, Google opens in a new tab and this page stays', async ({ page, fixture: f }) => {
  const shop = await templateShop(f, 'basic-1', 'hai', doc => { doc.fx = { thanks: 4 }; }); await googleTab(page);
  await page.goto('/hai'); await loaded(page);
  const google = page.locator('[data-google]');
  // The count opens the tab itself, so the link does not ask the browser for one.
  expect(await google.getAttribute('target')).toBeNull();
  const tab = page.waitForEvent('popup', { timeout: 10_000 });
  const started = Date.now();
  await google.click();
  const card = page.locator('[data-thanks-countdown]');
  await expect(card).toHaveAttribute('data-thanks-countdown', '4');
  await expect(card.getByRole('dialog')).toContainText('Cảm ơn quý khách đã ghé!');
  await expect(card.getByRole('dialog')).toContainText('Merci beaucoup!');
  await expect(card.locator('.thanks-hearts span')).toHaveCount(14);
  await expect(card).toHaveAttribute('data-thanks-countdown', '2', { timeout: 4_000 });
  const opened = await tab;
  expect(Date.now() - started).toBeGreaterThanOrEqual(3_900);
  await opened.waitForURL(SHOP_GOOGLE);
  // This page never left: same address, the card gone, the button where it was.
  expect(new URL(page.url()).pathname).toBe('/hai');
  await expect(card).toHaveCount(0);
  await expect(google).toBeInViewport();
  await expect.poll(async () => (await f.db.query(`SELECT e.name FROM page_events e JOIN page_visits v ON v.id=e.visit_id
    WHERE v.shop_id=$1 AND e.name='google_tapped'`, [shop.shopId])).rowCount).toBe(1);
});
test('with thanks before Google: a held-back tab gets one tap on "Mở Google"; reduced motion keeps the thanks without the hearts', async ({ page, fixture: f }) => {
  await templateShop(f, 'party', 'bon', doc => { doc.fx = { thanks: 2 }; });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // A browser that refuses the delayed tab answers window.open with null.
  await page.addInitScript(() => { window.open = () => null; });
  await page.goto('/bon'); await loaded(page);
  await page.locator('[data-google]').click();
  const card = page.locator('[data-thanks-countdown]');
  await expect(card.getByRole('dialog')).toContainText('Cảm ơn quý khách đã ghé!');
  await expect(card.locator('.thanks-hearts')).toHaveCount(0);
  await expect(card).toHaveAttribute('data-thanks-countdown', 'blocked', { timeout: 4_000 });
  const open = card.locator('[data-thanks-open]');
  await expect(open).toHaveText('Mở Google');
  await expect(open).toHaveAttribute('href', SHOP_GOOGLE);
  await expect(open).toHaveAttribute('target', '_blank');
  expect(new URL(page.url()).pathname).toBe('/bon');
});

// Tài báo 24/09 (shop Googy, Chrome trên iPhone): sau khi shop phát hành lại, khách tải lại trang trong vòng một lượt ghé
// thì "Chưa kết nối được" và không bấm được gì trong thẻ góp ý. The browser resumes its visit, which was opened under the
// previous release; a republish must not lock a guest out of the page they are holding.
test('a guest who reloads after the shop republishes can still send feedback', async ({ page, fixture: f }) => {
  await page.goto('/one'); await loaded(page);
  await openCard(page); await star(page, 5).click(); await page.keyboard.press('Escape');
  await release(f, canvas('Quán Sau Khi Sửa'), 2);
  await page.reload(); await loaded(page);
  await expect(shownName(page)).toHaveText('Quán Sau Khi Sửa');
  await expect(page.locator('.cv-connection')).toHaveCount(0);
  await openCard(page); await star(page, 3).click();
  await page.locator('#message').fill('Vẫn gửi được sau khi quán sửa trang');
  await sendButton(page).click();
  await expect(page.locator('[data-thanks]')).toBeVisible();
});

// Lát S0 (audit A1): the tab carries the page's own name -- it used to read "NFC Feedback · Bản thử" on every shop -- and a
// guest page is never indexed, while the platform's front page is.
test('a guest page is titled with its own name and never indexed; the front page can be', async ({ page, fixture: f }) => {
  const live = (await f.db.query('SELECT r.config_snapshot->>\'name\' AS name FROM pages p JOIN page_releases r ON r.id=p.active_release_id WHERE p.id=$1', [f.page.pageId])).rows[0];
  await page.goto('/one'); await loaded(page);
  await expect(page).toHaveTitle(live.name);
  expect(live.name).toBe('Release One');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await page.goto('/');
  expect(await page.title()).not.toMatch(/Bản thử/);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

// Lát P4: a paused page says so, with nothing of the page behind it; a closed page's link no longer exists.
test('a paused page tells the guest it is paused; a closed page answers 404, for its link and its cards alike', async ({ page, fixture: f }) => {
  const shop = await templateShop(f, 'basic-1', 'dung');
  const tag = await f.admin.createTag(shop, 'dung-card'); await f.admin.setTagState(shop, tag, 'active');
  await f.admin.pausePage(shop, 'admin');
  for (const path of ['/dung', '/t/dung-card']) {
    const response = await page.goto(path);
    expect(response!.status(), path).toBe(200);
    await expect(page.locator('[data-page-paused] h1'), path).toHaveText('Trang tạm ngừng');
    await expect(page.locator('[data-google]'), path).toHaveCount(0);
  }
  await f.admin.resumePage(shop, ['admin']);
  await page.goto('/dung'); await loaded(page);
  await f.admin.closePage(shop);
  for (const path of ['/dung', '/t/dung-card']) expect((await page.goto(path))!.status(), path).toBe(404);
});
