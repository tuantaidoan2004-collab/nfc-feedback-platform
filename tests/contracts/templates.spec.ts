import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { CANVAS_TEMPLATES, DEFAULT_TEMPLATE, TEMPLATE_GROUPS, canvasTemplate, pageFromTemplate, templateCards } from '../../lib/canvas/templates';
import { validateDoc, walk } from '../../lib/canvas/validate';
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

test('a new page carries the shop name where the template says, keeps capitals, and shrinks a long name to its frame', () => {
  const page = pageFromTemplate('basic-1', 'Quán Mẫu');
  expect(page.name).toBe('Quán Mẫu');
  expect(text(page.doc, 'ten-quan')?.words).toEqual({ vi: 'Quán Mẫu' });
  expect(text(pageFromTemplate('hien-dai', 'Quán Mẫu').doc, 'ten-quan')?.words.vi).toBe('QUÁN MẪU');
  // The avatar initial of mẫu Party, and a second place for the name (a signature) in mẫu Không gian thật.
  expect(text(pageFromTemplate('party', 'ốc Đảo').doc, 'chu-dau')?.words.vi).toBe('Ố');
  expect(text(pageFromTemplate('khong-gian-that', 'Quán Mẫu').doc, 'ten-quan-ky')?.words.vi).toBe('Quán Mẫu');
  // Short names keep the template's size; a long one gets smaller letters, never larger, never below 45 %.
  const size = (key: string, name: string) => text(pageFromTemplate(key, name).doc, 'ten-quan')!.size;
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
  expect(text(pageFromTemplate('basic-1', 'Quán B').doc, 'ten-quan')?.words.vi).toBe('Quán B');
  expect(text(canvasTemplate('basic-1')!.doc, 'ten-quan')?.words.vi).toBe('Tên Quán');
  for (const card of templateCards()) expect(Object.keys(card).sort()).toEqual(['about', 'groups', 'key', 'name', 'number']);
  expect(() => pageFromTemplate('not-a-template', 'Quán')).toThrow('INVALID_TEMPLATE');
});
