import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { freeTextProblem } from '../../lib/publishing/policy';
import { fold } from '../../lib/text-fold';
import { EVENTS, EVENT_KEYS, eventBlock, eventOrigin, isEventKey } from '../../lib/events/catalog';
import { issueTicket, throughCard, ticketKey } from '../../lib/events/ticket';
import { baseColor, contrast, eventSection } from '../../lib/events/section';
import { CANVAS_TEMPLATES } from '../../lib/canvas/templates';
import type { ButtonEl, TextEl } from '../../lib/canvas/doc';

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
    const words = [e.organizer, e.name, e.title.vi, e.title.en, e.summary.vi, e.summary.en, ...e.items.flatMap(item => [item.label.vi, item.label.en])];
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
  expect(plain.items.map(item => [item.key, item.href])).toEqual([
    ['nhan', 'https://thu.tiembanquyen.site/colap/qs/quanmau'], ['ve-chung-toi', 'https://thu.tiembanquyen.site/colap/ve-chung-toi?shop=quanmau']]);
  expect(plain.title).toEqual(EVENTS[TBQ].title);
  expect(eventBlock(TBQ, 'a/../b?x', null, {}).items[0].href).toBe('https://thu.tiembanquyen.site/colap/qs/a%2F..%2Fb%3Fx');
  const ticketed = eventBlock(TBQ, 'QuanMau', '1.2.a b.c', {});
  expect(ticketed.items.map(item => item.href)).toEqual([
    'https://thu.tiembanquyen.site/colap/qs/quanmau?t=1.2.a%20b.c', 'https://thu.tiembanquyen.site/colap/ve-chung-toi?shop=quanmau']);
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
    const by = texts.find(text => text.id.endsWith('-by'))!;
    for (const value of [by.words.vi, by.words.en!]) expect(freeTextProblem(value), value).toBeNull();
  }
});
