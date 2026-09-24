import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { TEMPLATE_KEYS } from '../../lib/publishing/config';

/**
 * Lát A36: the skin every template wears. These checks read the stylesheets themselves, so a future template cannot
 * break a floor without a test going red -- by construction, not by care (DESIGN.md mục 1, 2, 4; thiet-ke mục 13).
 */
const files = readdirSync('components').filter(name => name.endsWith('.css')).map(name => ({ name, css: readFileSync(`components/${name}`, 'utf8') }));
const skin = readFileSync('components/skin.css', 'utf8');
type Rule = { file: string; selector: string; body: string };
// Innermost `selector { body }` blocks; an @media wrapper is skipped over because its body holds braces.
const rules = (file: string, css: string): Rule[] => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(match => ({ file, selector: match[1].trim(), body: match[2] }));
const all = files.flatMap(({ name, css }) => rules(name, css));
const declarations = (body: string) => new Map([...body.matchAll(/(--c-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));

// DESIGN.md mục 4, plus the two floor tokens of mục 6c and thiet-ke mục 13. A template may not coin a new one.
const TOKENS = ['--c-c1', '--c-c2', '--c-angle', '--c-paper', '--c-ink', '--c-ink-2', '--c-muted', '--c-line', '--c-brand', '--c-on-brand',
  '--c-accent', '--c-fab', '--c-font', '--c-display', '--c-h1', '--c-h1-weight', '--c-h1-track', '--c-h1-case', '--c-body', '--c-radius',
  '--c-btn-radius', '--c-btn-h', '--c-logo', '--c-poster', '--c-density', '--c-sheet-shadow', '--c-btn-shadow', '--c-pill-bg', '--c-pill-ink',
  '--c-pill-radius', '--c-pill-shadow', '--c-floor', '--c-overscroll', '--c-btn-fill'];

test('only token names from DESIGN.md are declared, and every token read has a default in the skin', () => {
  for (const rule of all) for (const name of declarations(rule.body).keys()) expect(TOKENS, `${rule.file}: ${rule.selector}`).toContain(name);
  const defaults = declarations(rules('skin.css', skin).find(rule => rule.selector === '.guest')!.body);
  for (const { name, css } of files) for (const [, used] of css.matchAll(/var\((--c-[a-z0-9-]+)/g)) expect([...defaults.keys()], name).toContain(used);
});

test('a template block names one of the six templates', () => {
  for (const rule of all) for (const [, key] of rule.selector.matchAll(/data-template="([^"]*)"/g)) expect(TEMPLATE_KEYS as readonly string[]).toContain(key);
});

// A2 and the Google rules: the paper plane is one thing everywhere, and nothing makes the Google invitation arrive late.
test('no template touches the private-feedback button or the Google invitation, and nothing animates the invitation', () => {
  const protectedParts = /guest-float|guest-plane|guest-hint|google-/;
  for (const rule of all.filter(rule => /data-template/.test(rule.selector))) expect(rule.selector, rule.file).not.toMatch(protectedParts);
  // What carries meaning -- the invitation, the button, its words, its mark -- never animates at all. Decoration inside
  // the button (khuôn 6's orb, ring and G) may only loop forever: an endless shimmer, never an entrance that arrives late.
  for (const rule of all.filter(rule => /google-/.test(rule.selector)))
    for (const selector of rule.selector.split(',')) {
      const last = selector.trim().split(/\s+/).pop()!;
      if (/\.google-(orb|orb-face|ring|g)(?![\w-])/.test(last)) { if (/animation\s*:/.test(rule.body)) expect(rule.body, `${rule.file}: ${selector}`).toMatch(/animation\s*:\s*none|animation\s*:[^;]*infinite/); }
      else expect(rule.body, `${rule.file}: ${selector}`).not.toMatch(/animation\s*:/);
    }
});

// Floor 2 (DESIGN.md mục 2), computed from the tokens for the default skin and for every template that sets colours.
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('text tokens reach 4.5:1 on their surface, muted text included, in the default skin and every template', () => {
  const base = declarations(rules('skin.css', skin).find(rule => rule.selector === '.guest')!.body);
  const sets = [['default', base] as const, ...all.filter(rule => /^\.guest\[data-template="[^"]+"\]$/.test(rule.selector))
    .map(rule => [rule.selector, new Map([...base, ...declarations(rule.body)])] as const)];
  for (const [name, tokens] of sets) {
    for (const [text, surface] of [['--c-ink', '--c-paper'], ['--c-ink-2', '--c-paper'], ['--c-muted', '--c-paper'], ['--c-on-brand', '--c-brand']]) {
      const [fg, bg] = [tokens.get(text)!, tokens.get(surface)!];
      expect(fg, `${name} ${text}`).toMatch(/^#[0-9a-fA-F]{6}$/); expect(bg, `${name} ${surface}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(contrast(fg, bg), `${name}: ${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
    // The Google button's text is --c-on-brand on a fill mixed from (or standing for) --c-brand: the pair above.
    // Floor 3, the part a token can break: the Google button stays taller than the 46px link buttons around it.
    expect(parseFloat(tokens.get('--c-btn-h')!), `${name} --c-btn-h`).toBeGreaterThanOrEqual(56);
  }
});

// Khuôn 3: text sits on a frosted tint laid over whatever the scene shows. The tint alone must carry 4.5:1 in the two
// worst cases -- pure black behind it and pure white behind it -- so no shop colour can make the text unreadable.
test('glass: text on the frosted tint reaches 4.5:1 whether the scene behind is black or white', () => {
  // The tint's opacity is read from the stylesheet, where it is marked, so lowering it turns this test red.
  const opacity = Number(/opacity:\s*([0-9.]+);\s*\/\* glass-tint/.exec(skin)![1]);
  expect(opacity).toBeGreaterThan(0.5);
  const tokens = new Map([...declarations(rules('skin.css', skin).find(rule => rule.selector === '.guest')!.body),
    ...declarations(all.find(rule => rule.selector === '.guest[data-template="glass"]')!.body)]);
  const over = (paper: string, behind: number) => '#' + [1, 3, 5].map(at => Math.round(parseInt(paper.slice(at, at + 2), 16) * opacity + behind * (1 - opacity)))
    .map(c => c.toString(16).padStart(2, '0')).join('');
  for (const behind of [0, 255]) {
    const surface = over(tokens.get('--c-paper')!, behind);
    for (const text of ['--c-ink', '--c-ink-2', '--c-muted', '--c-pill-ink'])
      expect(contrast(tokens.get(text)!, surface), `${text} on tint over ${behind ? 'white' : 'black'}`).toBeGreaterThanOrEqual(4.5);
  }
});
