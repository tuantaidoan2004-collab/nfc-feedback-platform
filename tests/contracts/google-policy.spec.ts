import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { defaultConfig, validateConfig } from '../../lib/publishing/config';
import { SERVICE_LABELS, assertPublishable, freeTextProblem } from '../../lib/publishing/policy';
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
