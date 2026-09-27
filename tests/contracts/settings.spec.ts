import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { defaultConfig, validateConfig } from '../../lib/publishing/config';

import { SETTING_KEY, fits, type SettingField } from '../../lib/publishing/settings';
import { TEMPLATE_KEYS, TEMPLATE_RELEASES } from '../../lib/publishing/templates';

/**
 * Lát P2 (lib/publishing/settings.ts): the table each template version publishes of what an owner may adjust, and the
 * two ends that must agree with it — the stylesheet that reads the values and the guest page that writes them.
 */
const own = (fields: readonly SettingField[]) => fields.filter((field): field is Extract<SettingField, { key: string }> => 'key' in field);

test('every shipped version has a well-formed table: known kinds, unique keys, defaults that fit', () => {
  const kinds = ['layout', 'background', 'watermark', 'feedbackButton', 'color', 'range', 'choice', 'toggle'];
  for (const key of TEMPLATE_KEYS) for (const release of TEMPLATE_RELEASES[key]) {
    const where = `${key} v${release.version}`, fields = release.settings;
    for (const field of fields) expect(kinds, where).toContain(field.kind);
    expect(new Set(fields.map(field => 'key' in field ? `own:${field.key}` : field.kind)).size, `${where}: each field once`).toBe(fields.length);
    for (const field of fields) if (field.kind === 'background') expect(field.allow.length, where).toBeGreaterThan(0);
    for (const field of own(fields)) {
      expect(field.key, where).toMatch(SETTING_KEY);
      expect(field.label.trim().length, where).toBeGreaterThan(0);
      if (field.kind === 'range') { expect(field.min, where).toBeLessThan(field.max); expect(field.step, where).toBeGreaterThan(0); }
      if (field.kind === 'choice') expect(new Set(field.options.map(option => option.value)).size, where).toBe(field.options.length);
      expect(fits(field, field.default), `${where}: ${field.key} default`).toBe(true);
    }
    expect(own(fields).length, `${where}: validateConfig stores at most 16`).toBeLessThanOrEqual(16);
  }
  // Tài, 25/09: template 6 is the cheapest pack and has nothing to adjust.
  for (const release of TEMPLATE_RELEASES['big-button']) expect(release.settings).toEqual([]);
});

test("a version's stylesheet reads only fields its own table declares, always with a fallback; the platform reads none", () => {
  for (const key of readdirSync('templates', { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)) for (const file of readdirSync(`templates/${key}`).filter(file => file.endsWith('.css'))) {
    const version = /^v(\d+)\.css$/.exec(file)![1], name = `${key}/${file}`;
    const css = readFileSync(`templates/${name}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const fields = own(TEMPLATE_RELEASES[key as keyof typeof TEMPLATE_RELEASES].find(release => release.version === Number(version))!.settings);
    const kind = (k: string) => fields.find(field => field.key === k)?.kind;
    for (const [, k] of css.matchAll(/--s-([a-z][a-z0-9-]*)/g)) expect(['color', 'range'], `${name}: --s-${k}`).toContain(kind(k));
    for (const match of css.matchAll(/var\(--s-[a-z0-9-]+\s*\)/g)) throw new Error(`${name}: ${match[0]} has no fallback`);
    for (const [, k] of css.matchAll(/data-s-([a-z][a-z0-9-]*)/g)) expect(['choice', 'toggle'], `${name}: data-s-${k}`).toContain(kind(k));
  }
  for (const name of readdirSync('components').filter(file => file.endsWith('.css')))
    expect(readFileSync(`components/${name}`, 'utf8'), name).not.toMatch(/--s-[a-z]|data-s-[a-z]/);
});

const render = (config: unknown) => execFileSync(process.execPath, ['tests/fixtures/render-guest.cjs'], {
  input: JSON.stringify(config), encoding: 'utf8', env: { ...process.env, NFC_FIXTURE_TEMPLATE: 'big-button' } });
test('the guest page carries a version\'s own values on the page element, and nothing else changes', () => {
  const base = validateConfig({ ...defaultConfig('Shop fixture'), googleUrl: 'https://maps.google.com/?cid=42' });
  const html = render(validateConfig({ ...base, settings: { glow: '#00AAFF', blur: 20, mood: 'bright', sparkle: true, quiet: false } }));
  const main = /<main [^>]*>/.exec(html)![0];
  expect(main).toContain('--s-glow:#00AAFF');
  expect(main).toContain('--s-blur:20');
  expect(main).toContain('data-s-mood="bright"');
  expect(main).toContain('data-s-sparkle=""');
  expect(main).not.toContain('data-s-quiet');
  const invitation = (page: string) => /<section class="google-invitation">[\s\S]*?<\/section>/.exec(page)![0];
  expect(invitation(html)).toBe(invitation(render(base)));
});

test('only safe tokens can be stored: no settings on schema 1, short keys, colours, numbers, switches and plain ids', () => {
  const base = { ...defaultConfig('Shop fixture'), googleUrl: 'https://maps.google.com/?cid=42' };
  expect(validateConfig({ ...base, settings: { a: 1, 'b-c': '#ABCDEF', d: true, e: 'calm-2' } }).settings).toEqual({ a: 1, 'b-c': '#ABCDEF', d: true, e: 'calm-2' });
  const refused = [
    { ...base, schemaVersion: 1, feedbackButton: undefined, settings: { a: 1 } },
    { ...base, settings: { A: 1 } }, { ...base, settings: { a: 'red;background:url(x)' } }, { ...base, settings: { a: '#FFF' } },
    { ...base, settings: { a: { b: 1 } } }, { ...base, settings: { a: null } }, { ...base, settings: { a: Number.POSITIVE_INFINITY } }, { ...base, settings: [] },
    { ...base, settings: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, i])) },
  ];
  for (const config of refused) expect(() => validateConfig(JSON.parse(JSON.stringify(config))), JSON.stringify(config.settings)).toThrow('INVALID_CONFIG');
});
