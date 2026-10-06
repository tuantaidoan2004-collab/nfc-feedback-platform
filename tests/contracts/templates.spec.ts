import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { CANVAS_TEMPLATES, DEFAULT_TEMPLATE, TEMPLATE_GROUPS, canvasTemplate, pageFromTemplate, templateCards } from '../../lib/canvas/templates';
import { validateDoc, walk } from '../../lib/canvas/validate';
import { bindShop, placeholderLinks, slotReport } from '../../lib/canvas/slots';
import { parseProfile } from '../../lib/shop/profile';
import { googleProblems } from '../../lib/canvas/layout';
import { assertPublishable } from '../../lib/publishing/policy';
import type { TextEl } from '../../lib/canvas/doc';

/**
 * Template canvas (đợt ②, 05/10): each template is `templates/<key>/template.json`, and nothing else in the code lists
 * templates. These checks are what a template has to pass before a shop can start a page from it.
 */
const folders = readdirSync('templates', { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
const text = (doc: ReturnType<typeof pageFromTemplate>['doc'], id: string) => [...walk(doc)].find(el => el.id === id) as TextEl | undefined;

test('the list is generated from the folders as they are now, ordered by number', () => {
  execFileSync(process.execPath, ['scripts/templates.mjs', '--check'], { stdio: 'pipe' });
  expect(CANVAS_TEMPLATES.map(t => t.key).sort()).toEqual([...folders].sort());
  expect(CANVAS_TEMPLATES.map(t => t.number)).toEqual([...CANVAS_TEMPLATES.map(t => t.number)].sort((a, b) => a - b));
  expect(new Set(CANVAS_TEMPLATES.map(t => t.number)).size).toBe(CANVAS_TEMPLATES.length);
  expect(canvasTemplate(DEFAULT_TEMPLATE)).not.toBeNull();
});

test('every template is a page the platform accepts: valid, within the Google rules, publishable under any shop name', () => {
  for (const template of CANVAS_TEMPLATES) {
    expect(() => validateDoc(template.doc), template.key).not.toThrow();
    expect(googleProblems(template.doc), template.key).toBeNull();
    for (const name of ['Quán Mẫu', 'Cà Phê Ban Mai Sài Gòn Chi Nhánh Hai', 'Mộc'])
      expect(() => assertPublishable(pageFromTemplate(template.key, name)), `${template.key} · ${name}`).not.toThrow();
    // A Google button sits in every template: it is the platform's recommended element (kịch bản luật 0.1).
    expect([...walk(template.doc)].filter(el => el.t === 'google'), template.key).toHaveLength(1);
    expect(template.groups.length, template.key).toBeGreaterThan(0);
    for (const group of template.groups) expect(TEMPLATE_GROUPS).toContain(group);
  }
});

test('the shop\'s name goes where the template marks it, keeps capitals, and shrinks a long name to its frame', () => {
  const shop = (name: string) => ({ name, profile: { links: {} } });
  const named = (key: string, name: string) => bindShop(pageFromTemplate(key, name).doc, shop(name), 'sample');
  const page = pageFromTemplate('basic-1', 'Quán Mẫu');
  expect(page.name).toBe('Quán Mẫu');
  // The stored page keeps the template's sample: the name goes in each time the page is shown (lib/canvas/slots.ts).
  expect(text(page.doc, 'ten-quan')?.words).toEqual({ vi: 'Tên Quán' });
  expect(text(named('basic-1', 'Quán Mẫu'), 'ten-quan')?.words).toEqual({ vi: 'Quán Mẫu' });
  expect(text(named('hien-dai', 'Quán Mẫu'), 'ten-quan')?.words.vi).toBe('QUÁN MẪU');
  // The avatar initial of mẫu Party, and a second place for the name (a signature) in mẫu Không gian thật.
  expect(text(named('party', 'ốc Đảo'), 'chu-dau')?.words.vi).toBe('Ố');
  expect(text(named('khong-gian-that', 'Quán Mẫu'), 'ten-quan-ky')?.words.vi).toBe('Quán Mẫu');
  // Short names keep the template's size; a long one gets smaller letters, never larger, never below 45 %.
  const size = (key: string, name: string) => text(named(key, name), 'ten-quan')!.size;
  const original = (key: string) => (text(canvasTemplate(key)!.doc, 'ten-quan') as TextEl).size;
  for (const key of ['basic-1', 'nut-don', 'party', 'hair-styling']) {
    expect(size(key, 'Mộc'), key).toBe(original(key));
    const long = size(key, 'Cà Phê Ban Mai Sài Gòn Chi Nhánh Hai');
    expect(long, key).toBeLessThan(original(key)); expect(long, key).toBeGreaterThanOrEqual(original(key) * .45 - .1);
  }
});

test('a page is a copy: changing it never changes the template, and the Library sees no documents', () => {
  const page = pageFromTemplate('basic-1', 'Quán A');
  text(page.doc, 'ten-quan')!.words = { vi: 'changed' };
  expect(text(pageFromTemplate('basic-1', 'Quán B').doc, 'ten-quan')?.words.vi).toBe('Tên Quán');
  expect(text(canvasTemplate('basic-1')!.doc, 'ten-quan')?.words.vi).toBe('Tên Quán');
  for (const card of templateCards()) expect(Object.keys(card).sort()).toEqual(['about', 'groups', 'key', 'name', 'number']);
  expect(() => pageFromTemplate('not-a-template', 'Quán')).toThrow('INVALID_TEMPLATE');
});

test('every template keeps its samples in the shop\'s places: shown for a shop with nothing, no sample link is left; with everything, every place is filled', () => {
  const full = parseProfile({ links: { zalo: '0912345678', facebook: 'https://facebook.com/nhetenh', instagram: '@nhetenh', tiktok: '@nhetenh',
    youtube: 'https://youtube.com/@nhetenh', website: 'nhetenh.vn', menu: 'https://nhetenh.vn/menu', booking: 'https://nhetenh.vn/dat-lich',
    phone: '0912345678', maps: 'https://maps.app.goo.gl/nhetenh' }, handle: 'nhetenh', hours: 'Mở cửa 7:00 – 22:00', address: '12 Lý Tự Trọng', wifi: { name: 'NheTenh', pass: '12345678' } });
  for (const template of CANVAS_TEMPLATES) {
    // A template leads nowhere real until a shop's data is in: every sample link sits in a slot (templates/README.md).
    const samples = placeholderLinks(template.doc), slotted = new Set([...walk(template.doc)].filter(el => 'slot' in el && el.slot).map(el => el.id));
    for (const id of samples) expect(slotted.has(id) || id.includes('.'), `${template.key} #${id}`).toBe(true);
    for (const profile of [{ links: {} }, full]) {
      const shown = bindShop(template.doc, { name: 'Nhẹ Tênh Tea', profile });
      expect(placeholderLinks(shown), template.key).toEqual([]);
      expect(() => validateDoc(shown), template.key).not.toThrow();
      expect(googleProblems(shown), template.key).toBeNull();
      expect(() => assertPublishable({ schemaVersion: 4, name: 'Nhẹ Tênh Tea', doc: shown }), template.key).not.toThrow();
    }
    expect(slotReport(template.doc, { name: 'Nhẹ Tênh Tea', profile: full }).filter(item => !item.filled), template.key).toEqual([]);
  }
});
