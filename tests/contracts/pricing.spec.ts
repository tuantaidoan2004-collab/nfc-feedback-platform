import { test, expect } from '@playwright/test';
import { FREE_PAGES, priceSheet } from '../../lib/publishing/pricing';
import { TEMPLATE_PRICES, TEMPLATE_KEYS } from '../../lib/publishing/templates';

/**
 * Lát P5 (lib/publishing/pricing.ts, docs/goi-va-trang.md mục 4): what a shop would pay each month. Nothing is charged
 * yet (Tài, 26/09); these are the rules the numbers on the dashboard and in /gov follow.
 */
const page = (slug: string, templateKey: string, state = 'active', day = 1) => ({ slug, templateKey, state, createdAt: `2026-09-${String(day).padStart(2, '0')}T00:00:00Z` });
const charged = (sheet: ReturnType<typeof priceSheet>) => Object.fromEntries(sheet.pages.map(p => [p.slug, [p.monthly, p.free]]));

test('every template has a price; khuôn 6 is free; two free places per shop', () => {
  expect(Object.keys(TEMPLATE_PRICES).sort()).toEqual([...TEMPLATE_KEYS].sort());
  expect(TEMPLATE_PRICES['big-button']).toBe(0);
  for (const key of TEMPLATE_KEYS.filter(key => key !== 'big-button')) expect(TEMPLATE_PRICES[key], key).toBe(10000);
  expect(FREE_PAGES).toBe(2);
});

test('the two oldest running paid pages are free, khuôn 6 takes no place, the third paid page is charged', () => {
  const sheet = priceSheet([page('a', 'standard', 'active', 1), page('six', 'big-button', 'active', 2), page('b', 'glass', 'active', 3), page('c', 'minimal', 'active', 4)]);
  expect(charged(sheet)).toEqual({ a: [0, 'slot'], six: [0, 'template'], b: [0, 'slot'], c: [10000, null] });
  expect(sheet.monthly).toBe(10000);
  // Five khuôn 6 pages and two others still cost nothing.
  expect(priceSheet([...['1', '2', '3', '4', '5'].map((n, i) => page(`six${n}`, 'big-button', 'active', i + 1)), page('x', 'deco', 'active', 9), page('y', 'spotlight', 'active', 10)]).monthly).toBe(0);
});

test('only running pages are charged: a draft, a paused page and a closed page cost nothing and hold no free place', () => {
  const sheet = priceSheet([page('draft', 'glass', 'draft', 1), page('stopped', 'glass', 'paused', 2), page('gone', 'glass', 'closed', 3),
    page('a', 'glass', 'active', 4), page('b', 'glass', 'active', 5), page('c', 'glass', 'active', 6)]);
  expect(charged(sheet)).toEqual({ draft: [0, null], stopped: [0, null], gone: [0, null], a: [0, 'slot'], b: [0, 'slot'], c: [10000, null] });
  expect(sheet.pages.find(p => p.slug === 'draft')).toMatchObject({ list: 10000, billable: false });
});

test('closing a free page hands its place to the next oldest paid page', () => {
  const before = priceSheet([page('a', 'glass', 'active', 1), page('b', 'glass', 'active', 2), page('c', 'glass', 'active', 3)]);
  const after = priceSheet([page('a', 'glass', 'closed', 1), page('b', 'glass', 'active', 2), page('c', 'glass', 'active', 3)]);
  expect([before.monthly, after.monthly]).toEqual([10000, 0]);
  expect(charged(after).c).toEqual([0, 'slot']);
});
