import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { freeTextProblem } from '../../lib/publishing/policy';
import { fold } from '../../lib/text-fold';
import { EVENTS, EVENT_KEYS, eventBlock, eventOrigin, isEventKey } from '../../lib/events/catalog';
import { issueTicket, throughCard, ticketKey } from '../../lib/events/ticket';
import { baseColor, contrast, eventSection, withOpenEvents } from '../../lib/events/section';
import { validateDoc, walk } from '../../lib/canvas/validate';
import { mediaOf, placeAll } from '../../lib/canvas/layout';
import { assertPublishable } from '../../lib/publishing/policy';
import { pageFromTemplate } from '../../lib/canvas/templates';
import { CANVAS_TEMPLATES } from '../../lib/canvas/templates';
import type { ButtonEl, EventSpotEl, TextEl } from '../../lib/canvas/doc';

/**
 * Khúc B (05/10): an organizer's event in the lower zone of a shop's page. /gov opens it for a shop; the shop's owner does
 * nothing. What the block says, where it links, and the ticket that tells the organizer the guest is in the shop.
 */
const TBQ = 'tbq-cong-cu';
const KEY = 'k'.repeat(64);

test('the catalog names its events with the same pattern as a page event detail, and only those are events', () => {
  expect(EVENT_KEYS.length).toBeGreaterThan(0);
  for (const key of EVENT_KEYS) {
    expect(key).toMatch(/^[a-z][a-z0-9-]{0,31}$/);
    expect(EVENTS[key].key).toBe(key);
    expect(new Set(EVENTS[key].items.map(item => item.key)).size).toBe(EVENTS[key].items.length);
  }
  for (const value of ['', 'TBQ-CONG-CU', 'toString', '__proto__', 'hasOwnProperty', null, 1, {}]) expect(isEventKey(value), String(value)).toBe(false);
});

test('the platform\'s words for an event pass the shop\'s trip-wire and never mention Google, reviews, stars or a gift for one', () => {
  for (const key of EVENT_KEYS) {
    const e = EVENTS[key];
    const both = (w: { vi: string; en?: string }) => [w.vi, w.en ?? ''];
    const words = [e.organizer, e.name, ...both(e.title), ...both(e.summary), ...both(e.note), ...e.rules.flatMap(both), ...e.links.flatMap(link => both(link.label)),
      ...e.items.flatMap(item => [...both(item.label), ...('pop' in item ? item.pop.flatMap(both) : [])])];
    for (const value of words) {
      expect(freeTextProblem(value), value).toBeNull();
      // Stricter than the trip-wire, which only refuses a review tied to something: these words sit on the same page as
      // the Google button, so they say nothing about it at all (google-policy.md luật 4 và 8).
      const padded = ` ${fold(value).replace(/[^a-z0-9]+/g, ' ')} `;
      for (const word of ['google', 'danh gia', 'review', 'sao', 'star', 'stars', 'rating', 'cham diem', 'feedback'])
        expect(padded.includes(` ${word} `), `${value} → ${word}`).toBe(false);
    }
  }
});

test('the block links to the organizer with the shop\'s code, in lower case and escaped; the ticket rides only on the item that takes it', () => {
  const plain = eventBlock(TBQ, 'QuanMau', null, {});
  expect(plain.items.map(item => [item.key, item.href])).toEqual([['nhan', 'https://thu.tiembanquyen.site/colap/qs/quanmau']]);
  // The organizer's policy on its own address; its Zalo as it is.
  expect(plain.links.map(link => link.href)).toEqual(['https://thu.tiembanquyen.site/colap/privacy', 'https://zalo.me/0988428496']);
  expect(plain.title).toEqual(EVENTS[TBQ].title);
  expect(eventBlock(TBQ, 'a/../b?x', null, {}).items[0].href).toBe('https://thu.tiembanquyen.site/colap/qs/a%2F..%2Fb%3Fx');
  const ticketed = eventBlock(TBQ, 'QuanMau', '1.2.a b.c', {});
  expect(ticketed.items.map(item => item.href)).toEqual(['https://thu.tiembanquyen.site/colap/qs/quanmau?t=1.2.a%20b.c']);
});

test('the organizer\'s address can move only to https, or to plain http on this machine when the app runs locally', () => {
  const env = (value: string, local = false) => ({ NFC_EVENT_TBQ_ORIGIN: value, ...(local ? { NFC_ENV: 'local' } : {}) });
  expect(eventOrigin(TBQ, env('https://thu.example.vn/some/path'))).toBe('https://thu.example.vn/some/path');
  expect(eventOrigin(TBQ, env('https://thu.example.vn/colap/'))).toBe('https://thu.example.vn/colap');
  expect(eventOrigin(TBQ, env('https://thu.example.vn'))).toBe('https://thu.example.vn');
  expect(eventOrigin(TBQ, env('http://localhost:3919/colap', true))).toBe('http://localhost:3919/colap');
  expect(eventOrigin(TBQ, env('http://localhost:3917', true))).toBe('http://localhost:3917');
  expect(eventOrigin(TBQ, env('http://127.0.0.1:3917', true))).toBe('http://127.0.0.1:3917');
  for (const value of ['http://localhost:3917', 'http://evil.example', 'javascript:alert(1)', 'not a url', 'https://user:pw@evil.example', 'ftp://x.example'])
    expect(eventOrigin(TBQ, env(value)), value).toBe(EVENTS[TBQ].origin);
  expect(eventOrigin(TBQ, env('http://evil.example', true))).toBe(EVENTS[TBQ].origin);
  expect(eventOrigin(TBQ, {})).toBe(EVENTS[TBQ].origin);
  expect(eventOrigin(TBQ, env('https://thu.example.vn/colap?x=1'))).toBe(EVENTS[TBQ].origin);
  expect(EVENTS[TBQ].origin).toBe('https://thu.tiembanquyen.site/colap');
});

test('a ticket is signed for one shop and one moment with the shared key, and there is none without a key', () => {
  const env = { NFC_EVENT_TBQ_KEY: KEY };
  const now = Date.UTC(2026, 9, 5, 12, 0, 0);
  const ticket = issueTicket(TBQ, 'QuanMau', now, env, 'nonce-0123456789')!;
  const [version, issued, nonce, signature] = ticket.split('.');
  expect([version, issued, nonce]).toEqual(['1', String(now / 1000), 'nonce-0123456789']);
  // The organizer's side computes exactly this (TBQ src/domain/ticket.js); the shop is lower case, as on the link.
  expect(signature).toBe(createHmac('sha256', KEY).update(`tbq-ticket|1|quanmau|${now / 1000}|nonce-0123456789`).digest('base64url').slice(0, 32));
  expect(ticket).toMatch(/^1\.\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{32}$/);
  // A fresh nonce every time: two guests never hold the same ticket.
  expect(issueTicket(TBQ, 'quanmau', now, env)).not.toBe(issueTicket(TBQ, 'quanmau', now, env));
  for (const bad of [{}, { NFC_EVENT_TBQ_KEY: '' }, { NFC_EVENT_TBQ_KEY: 'short' }]) {
    expect(ticketKey(TBQ, bad)).toBeNull();
    expect(issueTicket(TBQ, 'quanmau', now, bad)).toBeNull();
  }
});

test('only a live page opened through the shop\'s card earns a ticket: not its plain link, not a preview', () => {
  expect(throughCard({ scope: 'live', entryKey: 'tag:3f1c' })).toBe(true);
  expect(throughCard({ scope: 'live', entryKey: 'page:abc' })).toBe(false);
  expect(throughCard({ scope: 'test', entryKey: 'tag:3f1c' })).toBe(false);
  expect(throughCard({ scope: 'test', entryKey: 'preview:x' })).toBe(false);
  expect(throughCard({ scope: 'live', entryKey: null })).toBe(false);
});

test('khúc B on every template: its own section, a rule above it, legible words, the organizer\'s links and nothing of Google', () => {
  expect(CANVAS_TEMPLATES.length).toBeGreaterThan(0);
  for (const template of CANVAS_TEMPLATES) {
    const block = eventBlock(TBQ, 'quanmau', 'ticket', {});
    const section = eventSection(template.doc, block), base = baseColor(template.doc), at = template.key;
    expect(section.bg?.fill, at).toBe(base);
    expect(section.els.some(el => el.t === 'google' || el.t === 'feedback'), at).toBe(false);
    expect(section.els[0], at).toMatchObject({ t: 'shape', shape: 'rect' });
    const texts = section.els.filter((el): el is TextEl => el.t === 'text');
    for (const text of texts) expect(contrast(text.color, base), `${at} ${text.id}`).toBeGreaterThanOrEqual(4.5);
    const buttons = section.els.filter((el): el is ButtonEl => el.t === 'button');
    expect(buttons.map(b => b.link), at).toEqual(block.items.map(item => item.href));
    // A pill of the page's own ink on the page's own colour, when the template has no button that carries its surface.
    for (const b of buttons) if (b.look === 'pill' && typeof b.bg === 'string' && b.fg) expect(contrast(b.bg, b.fg), at).toBeGreaterThanOrEqual(4.5);
    // Everything stays inside the section and the artboard.
    for (const el of section.els) if ('x' in el) {
      expect(el.x, `${at} ${el.id}`).toBeGreaterThanOrEqual(0);
      expect(el.x + el.w, `${at} ${el.id}`).toBeLessThanOrEqual(390);
      expect(el.y + el.h, `${at} ${el.id}`).toBeLessThanOrEqual(section.h);
    }
    // No title or summary (Tài 08/10): the collab is told in the first section, by its sign. What the guest gets, the organizer's
    // rules and links, and the line saying who runs it.
    expect(texts.map(text => text.id), at).toEqual([`${TBQ}-note`, `${TBQ}-rules-title`, ...block.rules.map((_, i) => `${TBQ}-rule-${i}`),
      ...block.links.map(link => `${TBQ}-link-${link.key}`), `${TBQ}-by`]);
    expect(texts.filter(text => text.link).map(text => text.link), at).toEqual(block.links.map(link => link.href));
    const by = texts.find(text => text.id.endsWith('-by'))!;
    for (const value of [by.words.vi, by.words.en!]) expect(freeTextProblem(value), value).toBeNull();
  }
});

/** A page with an event's sign (doc.ts EventSpotEl) where `at` says, in its first section. */
function withSign(at: { x: number; y: number; w: number; h: number }, event = TBQ) {
  const config = pageFromTemplate(CANVAS_TEMPLATES[0].key, 'Shop fixture');
  const sign: EventSpotEl = { id: 'collab', t: 'event', event, src: 'https://media.example/collab.png', ...at };
  config.doc.sections[0].els.push(sign);
  return config;
}
const googleRect = (config: ReturnType<typeof withSign>) => {
  const id = [...walk(config.doc)].find(el => el.t === 'google')!.id;
  return placeAll(config.doc).find(p => p.id === id)!.rect;
};

test('an event\'s sign in the first section: a known event and a picture, kept off the Google button, its picture an upload to review', () => {
  const probe = withSign({ x: 0, y: 0, w: 10, h: 10 }), g = googleRect(probe);
  // Clear of the button by more than the gap: publishable, and its picture goes through the image review like any other.
  const far = withSign({ x: 20, y: g.y + g.h + 48, w: 300, h: 90 });
  expect(validateDoc(far.doc)).toBeTruthy();
  expect(() => assertPublishable(far)).not.toThrow();
  expect(mediaOf(far.doc)).toContain('https://media.example/collab.png');
  // On the button, or right against it, as if the two went together: refused (google-policy.md luật 8).
  for (const near of [{ ...g }, { x: g.x, y: g.y + g.h + 8, w: g.w, h: 60 }, { x: g.x, y: g.y - 70, w: g.w, h: 60 }])
    expect(() => assertPublishable(withSign(near)), JSON.stringify(near)).toThrow('POLICY_GOOGLE_EVENT_NEAR');
  // An event the catalog does not know, or a sign without its picture, is not a page.
  expect(() => validateDoc(withSign({ x: 20, y: 600, w: 300, h: 90 }, 'khong-co').doc)).toThrow();
  const bare = withSign({ x: 20, y: 600, w: 300, h: 90 }) as unknown as { doc: { sections: { els: Record<string, unknown>[] }[] } };
  delete bare.doc.sections[0].els.at(-1)!.src;
  expect(() => validateDoc(bare.doc)).toThrow();
});

test('the sign shows only while /gov has its event open for the shop; closing it takes the sign off with nothing republished', () => {
  const config = withSign({ x: 20, y: 600, w: 300, h: 90 });
  const signs = (doc: typeof config.doc) => [...walk(doc)].filter(el => el.t === 'event').length;
  expect(signs(withOpenEvents(config.doc, [TBQ]))).toBe(1);
  expect(signs(withOpenEvents(config.doc, []))).toBe(0);
  // The page as stored is not touched.
  expect(signs(config.doc)).toBe(1);
  const plain = pageFromTemplate(CANVAS_TEMPLATES[0].key, 'Shop fixture');
  expect(withOpenEvents(plain.doc, [])).toBe(plain.doc);
  // The sign may name the shop's regulars: the block is then for them, otherwise for every guest of the shop.
  const by = (doc: typeof config.doc) => (eventSection(doc, eventBlock(TBQ, 'quanmau', null, {})).els.find(el => el.id === `${TBQ}-by`) as TextEl).words.vi;
  expect(by(plain.doc)).toBe('Do Tiệm Bản Quyền tổ chức · dành cho mọi khách của quán');
  (config.doc.sections[0].els.at(-1) as EventSpotEl).fans = "Bamos'er";
  expect(by(config.doc)).toBe("Do Tiệm Bản Quyền tổ chức · dành cho Bamos'er");
  expect(validateDoc(config.doc)).toBeTruthy();
});
