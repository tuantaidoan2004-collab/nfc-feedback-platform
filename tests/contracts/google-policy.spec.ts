import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { validateConfig, type PageConfig } from '../../lib/publishing/config';
import { assertPublishable, freeTextProblem, googleUrlProblem } from '../../lib/publishing/policy';
import { CANVAS_TEMPLATES, pageFromTemplate } from '../../lib/canvas/templates';
import { FIRST_SCREEN, type El, type GoogleEl, type StackEl } from '../../lib/canvas/doc';
import { walk } from '../../lib/canvas/validate';

/** The guest page as the server sends it, before any script runs (tests/fixtures/render-guest.cjs). */
const render = (config: PageConfig, googleUrl: string | null = 'https://maps.google.com/?cid=42') =>
  execFileSync(process.execPath, ['tests/fixtures/render-guest.cjs'], { input: JSON.stringify({ config, googleUrl }), encoding: 'utf8' });
const googleLink = (html: string) => /<a [^>]*data-google=""[^>]*href="([^"]+)"/.exec(html)?.[1];
const page = (key = 'basic-1') => pageFromTemplate(key, 'Shop fixture');
/** The first element of the page with this id, to change in place. */
const el = <T extends El | object = El>(config: PageConfig, id: string) => [...walk(config.doc)].find(item => item.id === id) as unknown as T;
const googleOf = (config: PageConfig) => [...walk(config.doc)].find(item => item.t === 'google') as GoogleEl & { x?: number; y?: number };

test('every template sends the Google button in the server HTML: the shop\'s link, the platform\'s words, before stars or a working API', () => {
  for (const template of CANVAS_TEMPLATES) {
    const html = render(page(template.key));
    expect(googleLink(html), template.key).toBe('https://maps.google.com/?cid=42');
    expect(html, template.key).toContain('aria-label="Đánh giá trên Google"');
    expect(html, template.key).not.toContain('data-ready=""');
    expect(html, template.key).not.toContain('role="dialog"');
  }
});

test('the button\'s link is the shop\'s and only the shop\'s: no page word reaches it', () => {
  const config = page();
  el<{ words: { vi: string } }>(config, 'loi-moi').words = { vi: 'PRIVATE_SENTINEL' };
  expect(googleLink(render(config))).toBe('https://maps.google.com/?cid=42');
  // Without the shop's link yet, the button is drawn but leads nowhere rather than somewhere else.
  const html = render(config, null);
  expect(googleLink(html)).toBeUndefined();
  expect(html).toContain('aria-label="Đánh giá trên Google"');
});

test('rewards, star prefills, review texts, kiosks and AI features have no place to live in a page', () => {
  const base = page();
  const changes: ((c: Record<string, unknown>) => void)[] = [c => { c.reviewReward = { code: 'GIFT' }; },
    c => { (c.doc as Record<string, unknown>).googleRating = 5; },
    c => { Object.assign(googleOf(c as unknown as PageConfig), { label: { vi: 'Đánh giá 5 sao' } }); },
    c => { Object.assign(googleOf(c as unknown as PageConfig), { link: 'https://g.page/r/X/review' }); },
    c => { Object.assign(googleOf(c as unknown as PageConfig), { stars: 5 }); },
    c => { (c.doc as Record<string, unknown>).kiosk = true; }, c => { (c.doc as Record<string, unknown>).aiGoogleReview = true; }];
  for (const change of changes) {
    const copy = structuredClone(base) as unknown as Record<string, unknown>;
    change(copy);
    expect(() => validateConfig(copy), change.toString()).toThrow('INVALID_CONFIG');
  }
});

test('one Google button at most, wholly in the first screen of the first section, nothing private above it', () => {
  expect(() => assertPublishable(page('party'))).not.toThrow();
  // Moved below the first screen's line.
  const low = page('party'); el<StackEl>(low, 'the-bai').y = FIRST_SCREEN;
  expect(() => assertPublishable(low)).toThrow('POLICY_GOOGLE_NOT_FIRST_SCREEN');
  // Pushed down by what stands above it inside its stack: the layout is computed, not trusted.
  const pushed = page('basic-1'), name = el<{ h: number }>(pushed, 'ten-quan'); name.h = 700;
  expect(() => assertPublishable(pushed)).toThrow('POLICY_GOOGLE_NOT_FIRST_SCREEN');
  // Twice.
  const twice = page('nut-don'); const google = googleOf(twice) as GoogleEl;
  twice.doc.sections[0].els.push({ ...structuredClone(google), id: 'google-2', x: 10, y: 10, w: 100, h: 40 } as El);
  expect(() => assertPublishable(twice)).toThrow('POLICY_GOOGLE_TWICE');
  // Only in the first section.
  const later = page('chuyen-dong'); const holder = later.doc.sections[0].els.find(item => [...walk({ ...later.doc, sections: [{ ...later.doc.sections[0], els: [item] }] })]
    .some(k => k.t === 'google'))!;
  later.doc.sections[0].els = later.doc.sections[0].els.filter(item => item !== holder);
  later.doc.sections.push({ id: 'khuc-sau', h: 700, els: [holder] });
  expect(() => assertPublishable(later)).toThrow('POLICY_GOOGLE_NOT_FIRST_SCREEN');
  // The paper plane is the original one (Tài 05/10): it floats over the guest's screen whatever its box says, and steps aside
  // from the button there (live.tsx), so its box never stands above the button. A document cannot ask for another kind.
  const plane = page('basic-1'); plane.doc.sections[0].els = plane.doc.sections[0].els.map(item => item.t === 'feedback' ? { ...item, x: 10, y: 2 } : item);
  expect(() => assertPublishable(plane)).not.toThrow();
  const placed = page('basic-1'); placed.doc.sections[0].els = placed.doc.sections[0].els.map(item => item.t === 'feedback' ? { ...item, float: false } as El : item);
  expect(() => validateConfig(placed)).toThrow('INVALID_CONFIG');
  // A page without the button is allowed: it is recommended, not required (kịch bản luật 0.1).
  const none = page('basic-1'); none.doc.sections[0].els = none.doc.sections[0].els.map(item => item.t === 'stack' ? { ...item, kids: item.kids.filter(k => k.t !== 'google') } : item);
  expect(() => assertPublishable(none)).not.toThrow();
});

test('only the platform\'s button leads to writing a Google review; other links may not, nor carry stars', () => {
  for (const url of ['https://search.google.com/local/writereview?placeid=ChIJ123', 'https://g.page/r/CQuanMot/review', 'https://example.com/?rating=5']) {
    const config = page(); el<{ link?: string }>(config, 'ten-quan').link = url;
    expect(() => assertPublishable(validateConfig(config)), url).toThrow('POLICY_GOOGLE_LINK');
  }
  const ok = page(); el<{ link?: string }>(ok, 'ten-quan').link = 'https://www.google.com/maps/place/Quan';
  expect(() => assertPublishable(validateConfig(ok))).not.toThrow();
});

/**
 * F-013 (Astra, 20/09): free words could trade a review for something. On a canvas page every word is free text, so every
 * word -- a button's label, a text, a deck card, the page's name, in both languages -- goes through the trip-wire.
 */
test('F-013: words that trade a review are refused wherever they stand, in either language', () => {
  const traded = { vi: 'Đánh giá Google 5 sao để nhận quà', en: 'Leave a 5-star Google review to get a gift' };
  const placed: [string, (config: PageConfig) => void][] = [
    ['text', config => { el<{ words: unknown }>(config, 'ten-quan').words = traded; }],
    ['text en', config => { el<{ words: unknown }>(config, 'ten-quan').words = { vi: 'Quán', en: 'Review us for a free coffee' }; }],
    ['button', config => { const button = [...walk(config.doc)].find(item => item.t === 'button') as { label: unknown }; button.label = { vi: 'Khi đánh giá Google hãy nhắc tên nhân viên An' }; }],
    ['deck card', config => { const deck = config.doc.sections[0].els.find(item => item.t === 'deck'); if (deck?.t === 'deck') deck.cards[0].label = { vi: 'Đánh giá 5 sao nhận quà' }; }],
    ['name', config => { config.name = 'Quán 5 sao tặng quà'; }],
  ];
  for (const [where, change] of placed) {
    const config = page(where === 'deck card' ? 'party' : 'basic-1'); change(config);
    expect(() => assertPublishable(validateConfig(config)), where).toThrow('POLICY_GOOGLE_EXCHANGE');
  }
});

test('F-013: a page already published keeps rendering, because the rule is checked where a shop writes', () => {
  const bad = page(); el<{ words: unknown }>(bad, 'ten-quan').words = { vi: 'Đánh giá 5 sao nhận quà' };
  // validateConfig is what the live and preview paths call on a stored snapshot. If the rule lived there, a rule added
  // today would take a page published yesterday off the air.
  expect(() => validateConfig(bad)).not.toThrow();
  expect(() => assertPublishable(validateConfig(bad))).toThrow('POLICY_GOOGLE_EXCHANGE');
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
  // Every word the templates ship passes, or a new page could not be published as it comes.
  for (const template of CANVAS_TEMPLATES) expect(() => assertPublishable(page(template.key)), template.key).not.toThrow();
});

/** A7 (26/09): where the shop's Google link may lead (policy.ts), checked where the Place ID becomes the link. */
test('the shop\'s Google link is one Google hands a shop, and nothing that could lead elsewhere or prefill a review', () => {
  for (const ok of ['https://maps.google.com/', 'https://maps.google.com/?cid=42', 'https://g.page/r/CQuanMot/review', 'https://maps.app.goo.gl/AbC123',
    'https://search.google.com/local/writereview?placeid=ChIJ123', 'https://www.google.com/maps/place/Qu%C3%A1n+M%E1%BB%99t/@10.7,106.7,17z',
    'https://www.google.com/search?q=quan+mot#lrd=0x1:0x2,3', 'https://www.google.com.vn/maps/place/Quan', 'https://goo.gl/maps/AbC', 'https://g.co/kgs/AbC'])
    expect(googleUrlProblem(ok), ok).toBeNull();
  for (const [bad, why] of [['http://maps.google.com/', 'host'], ['https://quan-mot.example/danh-gia', 'host'], ['https://sites.google.com/view/quan', 'host'],
    ['https://www.google.com/url?q=https://quan-mot.example', 'host'], ['https://maps.google.com.evil.example/', 'host'], ['https://goo.gl/AbC', 'host'],
    ['https://user:pw@maps.google.com/', 'host'], ['not a url', 'host'],
    ['https://g.page/r/CQuanMot/review?rating=5', 'prefill'], ['https://maps.google.com/?cid=42&Stars=5', 'prefill'], ['https://g.page/r/X/review?text=Nh%C3%A2n+vi%C3%AAn+An+t%E1%BB%91t', 'prefill']] as const)
    expect(googleUrlProblem(bad), bad).toBe(why);
});

// Lát M2 (Tài 27/09): the thanks shown before Google is the platform's, never a nudge: no stars, no gift, one text for everyone.
test('the thanks before Google asks for nothing: no stars, no gift, no content, one text for everyone', async () => {
  const { THANKS_COPY } = await import('../../components/effects/thanks');
  for (const [lang, copy] of Object.entries(THANKS_COPY)) for (const [part, text] of Object.entries(copy)) {
    expect(freeTextProblem(text), `${lang}.${part}`).toBeNull();
    expect(text, `${lang}.${part}`).not.toMatch(/sao|star|★|⭐|5\s*\/\s*5|quà|gift|giảm giá|discount|voucher/i);
  }
});
