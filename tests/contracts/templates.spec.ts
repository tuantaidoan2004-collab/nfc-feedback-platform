import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { manifestProblems } from '../../lib/publishing/template-manifest';
import { TEMPLATE_KEYS, TEMPLATE_NAMES, effectsOf, templateConfig } from '../../lib/publishing/templates';

/**
 * Gói template (lát M1): each template is a folder under templates/, and nothing else in the code lists templates. These
 * checks are what a designer's package has to pass before it reaches a guest.
 */
const folders = readdirSync('templates', { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
const read = (key: string) => JSON.parse(readFileSync(`templates/${key}/manifest.json`, 'utf8'));
const css = (key: string) => readdirSync(`templates/${key}`).filter(name => name.endsWith('.css'));

test('the registry is generated from the packages as they are now', () => {
  execFileSync(process.execPath, ['scripts/templates.mjs', '--check'], { stdio: 'pipe' });
  expect([...TEMPLATE_KEYS].sort()).toEqual([...folders].sort());
});

test('every package is sound: its manifest, one stylesheet per version, and a starting page that validates', () => {
  for (const key of folders) expect(manifestProblems(read(key), key, css(key)), key).toEqual([]);
  // Listed by number, named "<number> · <name>".
  expect(TEMPLATE_KEYS.map(key => read(key).number)).toEqual(TEMPLATE_KEYS.map((_, i) => i + 1));
  expect(TEMPLATE_NAMES['big-button']).toBe('6 · Nút lớn');
});

test('a broken package is named, in words a designer can act on', () => {
  const good = read('minimal');
  const problems = (change: Record<string, unknown>, files = ['v1.css']) => manifestProblems({ ...good, ...change }, 'minimal', files).join('\n');
  expect(problems({ key: 'other' })).toContain('"key" phải trùng tên thư mục');
  expect(problems({ page: { ...good.page, name: 'Quán Thật' } })).toContain('nội dung của trang');
  expect(problems({ page: { ...good.page, links: [{ label: { vi: 'x', en: 'x' }, url: 'https://x.test', icon: 'link' }] } })).toContain('"page.links" chỉ được là []');
  expect(problems({ page: { background: { kind: 'solid', color: 'red' } } })).toContain('không tạo được một trang hợp lệ');
  expect(problems({ effects: { leaveTransitionMs: 900 } })).toContain('từ 1 tới 300');
  expect(problems({ effects: { confetti: true } })).toContain('hiệu ứng lạ');
  expect(problems({ versions: [{ ...good.versions[0], version: 2 }] })).toContain('"version" phải là 1');
  expect(problems({}, [])).toContain('thiếu tệp v1.css');
  expect(problems({}, ['v1.css', 'v2.css'])).toContain('v2.css không thuộc bản nào');
  expect(problems({ price: 5 })).toContain('trường lạ "price"');
});

test('what the packages declare is what the platform reads', () => {
  expect(effectsOf('big-button')).toEqual({ leaveTransitionMs: 300, googleButton: 'orb' });
  expect(effectsOf('glass')).toEqual({ glass: true });
  expect(effectsOf('standard')).toEqual({});
  expect(effectsOf('not-shipped')).toEqual({}); expect(effectsOf(undefined)).toEqual({});
  // A fresh copy each time: a caller changing its page cannot change the template.
  const page = templateConfig('deco'); page.name = 'changed';
  expect(templateConfig('deco').name).toBe('YOUR SHOP');
});
