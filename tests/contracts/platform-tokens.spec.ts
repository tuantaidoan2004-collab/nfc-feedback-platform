import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Lát S1: the platform's own look (components/platform/platform.css) -- dashboard, /gov and the sign-in pages. These
 * checks read the stylesheet itself, so a token edited later cannot quietly drop below the floor.
 */
const css = readFileSync('components/platform/platform.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const block = (selector: RegExp) => {
  const match = selector.exec(css); expect(match, String(selector)).not.toBeNull();
  const open = css.indexOf('{', match!.index), close = css.indexOf('}', open);
  return new Map([...css.slice(open + 1, close).matchAll(/(--p-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
};
const dark = block(/\.platform\s*\{/);
const light = block(/\.platform\[data-theme="light"\]\s*\{/);
const system = block(/@media \(prefers-color-scheme: light\)\s*\{\s*\.platform\[data-theme="system"\]\s*\{/);

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('the daylight theme is one set of values: chosen by hand or by the phone, never two that drift apart', () => {
  expect(Object.fromEntries(system)).toEqual(Object.fromEntries(light));
  // Every colour the dark theme defines, daylight defines too (sizes and the font are shared).
  const colours = [...dark.keys()].filter(key => !/^--p-(radius|font)/.test(key));
  expect([...light.keys()].sort()).toEqual(colours.sort());
});

test('every text pair reaches 4.5:1 in both themes', () => {
  const pairs = [['--p-ink', '--p-bg'], ['--p-ink', '--p-surface'], ['--p-ink-2', '--p-surface'], ['--p-ink-2', '--p-surface-2'],
    ['--p-muted', '--p-bg'], ['--p-muted', '--p-surface'], ['--p-muted', '--p-surface-2'], ['--p-muted', '--p-sunken'],
    ['--p-accent-text', '--p-bg'], ['--p-accent-text', '--p-surface'], ['--p-accent-text', '--p-surface-2'],
    ['--p-accent-ink', '--p-accent'], ['--p-accent-ink', '--p-accent-2'], ['--p-danger-ink', '--p-danger'],
    ['--p-danger-text', '--p-surface'], ['--p-success-text', '--p-surface'], ['--p-warn-text', '--p-surface']];
  for (const [name, tokens] of [['dark', dark], ['light', light]] as const)
    for (const [text, ground] of pairs) {
      const [fg, bg] = [tokens.get(text)!, tokens.get(ground)!];
      expect(fg, `${name} ${text}`).toMatch(/^#[0-9a-f]{6}$/i); expect(bg, `${name} ${ground}`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast(fg, bg), `${name}: ${text} on ${ground}`).toBeGreaterThanOrEqual(4.5);
    }
});

test('platform stylesheets take their colours from the tokens, and read only tokens that exist', () => {
  // The only literal colours left are neutral shadows, a white switch knob, and the admin tick's own violet glow.
  const allowed = new Set(['#00000080', '#0003', '#fff', '#ffffff26', '#a855f766', '#c084fcb3']);
  for (const file of ['components/owner-app.module.css', 'components/admin.module.css', 'components/platform/ui.module.css', 'components/start/builder.module.css', 'components/start/landing.module.css']) {
    const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [literal] of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) expect(allowed, `${file}: ${literal}`).toContain(literal);
    for (const [, token] of source.matchAll(/var\((--p-[a-z0-9-]+)/g)) expect(dark.has(token), `${file}: ${token}`).toBe(true);
  }
});
