import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { defaultConfig, validateConfig } from '../../lib/publishing/config';
import { SERVICE_LABELS, assertPublishable, freeTextProblem, googleUrlProblem } from '../../lib/publishing/policy';
import { TEMPLATE_KEYS, templateConfig } from '../../lib/publishing/templates';
const render = (config = defaultConfig('Shop fixture')) => execFileSync(process.execPath, ['tests/fixtures/render-guest.cjs'], {
  input: JSON.stringify(config), encoding: 'utf8',
});

test('Google invitation is already present before hydration, stars or a working API', () => {
  for (const layout of ['card', 'full-bleed'] as const) {
    const config = validateConfig({ ...defaultConfig('Shop fixture'), layout, googleUrl: 'https://maps.google.com/?cid=42' });
    const html = render(config);
    expect(html).toContain('data-google="true" href="https://maps.google.com/?cid=42"');
    expect(html).toContain('Đánh giá trên Google');
    expect(html).not.toContain('data-ready=""');
    expect(html).not.toContain('role="dialog"');
  }
});

// A33: the six templates only dress the skeleton. Each one, rendered with a template hook, keeps the Google
// invitation in the server HTML, identical, before hydration -- the contract every future skin inherits.
test('every template keeps the Google invitation in the server HTML', () => {
  for (const key of TEMPLATE_KEYS) {
    const config = validateConfig({ ...templateConfig(key), name: 'Shop fixture', googleUrl: 'https://maps.google.com/?cid=42' });
    const html = execFileSync(process.execPath, ['tests/fixtures/render-guest.cjs'], { input: JSON.stringify(config), encoding: 'utf8',
      env: { ...process.env, NFC_FIXTURE_TEMPLATE: key } });
    expect(html).toContain(`data-template="${key}"`);
    expect(html).toContain('data-google="true" href="https://maps.google.com/?cid=42"');
    expect(html).toContain('Đánh giá trên Google');
    expect(html).not.toContain('data-ready=""');
  }
});

// Khuôn 3's one exception to "a template adds no DOM node": an invisible <svg> holding the glass filters. It must be
// the last thing on the page, hidden from assistive technology, never display:none, and it must leave the Google
// invitation byte for byte as every other template renders it.
test('the glass filters are the page\'s last node and change nothing about the Google invitation', () => {
  const config = validateConfig({ ...templateConfig('glass'), name: 'Shop fixture', googleUrl: 'https://maps.google.com/?cid=42' });
  const renderAs = (key: string) => execFileSync(process.execPath, ['tests/fixtures/render-guest.cjs'], { input: JSON.stringify(config), encoding: 'utf8',
    env: { ...process.env, NFC_FIXTURE_TEMPLATE: key } });
  const invitation = (html: string) => /<section class="google-invitation">[\s\S]*?<\/section>/.exec(html)![0];
  const glass = renderAs('glass'), plain = renderAs('minimal');
  expect(invitation(glass)).toBe(invitation(plain));
  expect(glass).toMatch(/<svg class="guest-glass-filters" width="0" height="0" aria-hidden="true" focusable="false">[\s\S]*<\/svg><\/main>$/);
  expect(glass).not.toContain('display:none');
  expect(plain).not.toContain('guest-glass-filters');
});

test('internal review wording is never added to the outbound Google URL', () => {
  const base = defaultConfig('Shop fixture');
  const html = render(validateConfig({ ...base, googleUrl: 'https://maps.google.com/?cid=42', text: { question: { vi: 'PRIVATE_SENTINEL', en: 'PRIVATE_SENTINEL' } } }));
  expect(html.match(/data-google="true" href="([^"]+)"/)?.[1]).toBe('https://maps.google.com/?cid=42');
});

test('unsupported Google incentives, kiosk, targets and AI features are refused by the publish contract', () => {
  for (const patch of [{ reviewReward: { code: 'GIFT' } }, { googleRating: 5 }, { googleReviewText: 'Great staff' },
    { employeeGoogleTarget: 10 }, { kiosk: true }, { aiGoogleReview: true }, { marketingRequiresGoogleClick: true }]) {
    expect(() => validateConfig({ ...defaultConfig('Shop fixture'), ...patch })).toThrow('INVALID_CONFIG');
  }
});

/**
 * F-013 (Astra, 20/09): a service link's label was free text, so a shop could publish "Đánh giá Google 5 sao để
 * nhận quà" and the platform would serve it -- against product rules 4, 5, 7 and 8, with the penalty landing on
 * the shop's own Google listing. Two answers, because only one of the two problems can be closed properly.
 */
test('F-013: the two labels Astra published are refused, and a chosen one is accepted', () => {
  const link = (label: { vi: string; en: string }) => ({ ...defaultConfig('Shop fixture'),
    links: [{ icon: 'link' as const, url: 'https://maps.google.com/?cid=42', label }] });
  for (const label of [
    { vi: 'Đánh giá Google 5 sao để nhận quà', en: 'Leave a 5-star Google review to get a gift' },
    { vi: 'Khi đánh giá Google hãy nhắc tên nhân viên An', en: 'Mention employee An in your Google review' },
  ]) expect(() => assertPublishable(validateConfig(link(label)))).toThrow('POLICY_LINK_LABEL');
  // A label from the list passes, so the fence does not simply stop shops having buttons.
  expect(() => assertPublishable(validateConfig(link(SERVICE_LABELS[0])))).not.toThrow();
  expect(() => assertPublishable(validateConfig(defaultConfig('Shop fixture')))).not.toThrow();
  // Every label the platform offers is itself neutral, or the list would be the hole.
  for (const label of SERVICE_LABELS) for (const side of [label.vi, label.en]) expect(freeTextProblem(side)).toBeNull();
});

test('F-013: a page already published keeps rendering, because the rule is checked where a shop writes', () => {
  const bad = { ...defaultConfig('Shop fixture'),
    links: [{ icon: 'link' as const, url: 'https://maps.google.com/?cid=42', label: { vi: 'Đánh giá 5 sao nhận quà', en: 'Five stars for a gift' } }] };
  // validateConfig is what the live and preview paths call on a stored snapshot. If the new rule lived there, a
  // rule added today would take a page published yesterday off the air.
  expect(() => validateConfig(bad)).not.toThrow();
  expect(() => assertPublishable(validateConfig(bad))).toThrow('POLICY_LINK_LABEL');
});

test('F-013: free text refuses a review traded for something, in either language and without accents', () => {
  for (const text of [
    'Đánh giá 5 sao nhận quà', 'danh gia 5 sao nhan qua', 'DANH GIA GOOGLE TANG NUOC',
    'Review us for a free coffee', 'Nhận xét tốt được giảm giá', 'Đánh giá xong nhớ nhắc tên nhân viên',
    'Mention our staff in your review',
  ]) expect(freeTextProblem(text), text).not.toBeNull();
  // A neutral invitation, the shop's own name, and words that only look alarming apart must all pass.
  for (const text of [
    'Cảm nhận của bạn giúp quán tốt hơn', 'Quán Cà Phê Ban Mai', 'Tell us how we did',
    'Tặng bạn một ly nước khi trời nóng', 'Đánh giá của bạn rất quan trọng với quán',
  ]) expect(freeTextProblem(text), text).toBeNull();
});

test('F-013: the shop name and the question go through the same check as the labels', () => {
  const base = defaultConfig('Shop fixture');
  expect(() => assertPublishable(validateConfig({ ...base, name: 'Quán 5 sao tặng quà' }))).toThrow('POLICY_GOOGLE_EXCHANGE');
  expect(() => assertPublishable(validateConfig({ ...base,
    text: { question: { vi: 'Đánh giá Google để nhận voucher', en: 'How was it?' } } }))).toThrow('POLICY_GOOGLE_EXCHANGE');
  expect(() => assertPublishable(validateConfig({ ...base,
    text: { question: { vi: 'Hôm nay quán thế nào?', en: 'Review us and get a discount' } } }))).toThrow('POLICY_GOOGLE_EXCHANGE');
});

/** A7 (26/09): where the Google button may lead (policy.ts GOOGLE_HOSTS). Real link shapes a shop copies from Google. */
test('the Google button takes the links Google hands a shop, and nothing that could lead elsewhere or prefill a review', () => {
  for (const ok of ['https://maps.google.com/', 'https://maps.google.com/?cid=42', 'https://g.page/r/CQuanMot/review', 'https://maps.app.goo.gl/AbC123',
    'https://search.google.com/local/writereview?placeid=ChIJ123', 'https://www.google.com/maps/place/Qu%C3%A1n+M%E1%BB%99t/@10.7,106.7,17z',
    'https://www.google.com/search?q=quan+mot#lrd=0x1:0x2,3', 'https://www.google.com.vn/maps/place/Quan', 'https://goo.gl/maps/AbC', 'https://g.co/kgs/AbC'])
    expect(googleUrlProblem(ok), ok).toBeNull();
  for (const [bad, why] of [['http://maps.google.com/', 'host'], ['https://quan-mot.example/danh-gia', 'host'], ['https://sites.google.com/view/quan', 'host'],
    ['https://www.google.com/url?q=https://quan-mot.example', 'host'], ['https://maps.google.com.evil.example/', 'host'], ['https://goo.gl/AbC', 'host'],
    ['https://user:pw@maps.google.com/', 'host'], ['not a url', 'host'],
    ['https://g.page/r/CQuanMot/review?rating=5', 'prefill'], ['https://maps.google.com/?cid=42&Stars=5', 'prefill'], ['https://g.page/r/X/review?text=Nh%C3%A2n+vi%C3%AAn+An+t%E1%BB%91t', 'prefill']] as const)
    expect(googleUrlProblem(bad), bad).toBe(why);
  expect(() => assertPublishable(validateConfig({ ...defaultConfig('Shop fixture'), googleUrl: 'https://sites.google.com/view/quan' }))).toThrow('POLICY_GOOGLE_URL');
  // Every page the platform itself starts a shop with passes.
  for (const key of TEMPLATE_KEYS) expect(() => assertPublishable(validateConfig(templateConfig(key)))).not.toThrow();
});
