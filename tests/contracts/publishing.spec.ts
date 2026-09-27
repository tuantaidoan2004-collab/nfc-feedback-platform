import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { currentConfig, defaultConfig, sectionsOf, shows, validateConfig } from '../../lib/publishing/config';
import { canonical, signContext, verifyContext, type RenderContext } from '../../lib/publishing/proof';
const ring = { active: 'fixture', keys: { fixture: 'test-only-key-at-least-thirty-two-bytes' } };
const v1 = () => { const { feedbackButton: _unused, sections: _none, ...rest } = defaultConfig(); void _unused; void _none; return { ...rest, schemaVersion: 1 as const, layout: 'full-bleed' as const, links: [] }; };
// A page as written before sections (lát M3): version 2, no `sections`.
const v2 = () => { const { sections: _none, ...rest } = defaultConfig(); void _none; return { ...rest, schemaVersion: 2 as const }; };
const link = (icon: string, url: string) => ({ label: { vi: 'Liên hệ', en: 'Contact' }, url, icon });
test('v1 releases stay readable but cannot use v2 layouts or buttons', () => {
  expect(validateConfig(v1())).toEqual(v1());
  for (const patch of [{ layout: 'card' }, { links: [link('facebook', 'https://facebook.com/x')] }, { links: [link('phone', 'tel:0901234567')] },
    { links: [link('tiktok', 'https://www.tiktok.com/@x')] }, { feedbackButton: defaultConfig().feedbackButton }, { schemaVersion: 3 }]) {
    expect(() => validateConfig({ ...v1(), ...patch })).toThrow('INVALID_CONFIG');
  }
});
test('v2 adds the card layout, Facebook and a tel: contact button only', () => {
  expect(validateConfig(v2())).toEqual(v2());
  const card = { ...v2(), layout: 'card', links: [link('facebook', 'https://facebook.com/x'), link('phone', 'tel:+84901234567')] };
  expect(validateConfig(card)).toEqual(card);
  for (const links of [[link('link', 'tel:0901234567')], [link('phone', 'https://example.com')], [link('phone', 'tel:090;ext=1')],
    [link('phone', 'tel:')], [link('phone', 'javascript:alert(1)')], [link('facebook', 'http://facebook.com/x')]]) {
    expect(() => validateConfig({ ...defaultConfig(), links })).toThrow('INVALID_CONFIG');
  }
});
test('v2 ships Instagram, Zalo and TikTok buttons and a configurable feedback button', () => {
  const config = defaultConfig();
  expect(config.links.map(l => [l.icon, l.url])).toEqual([['instagram', 'https://www.instagram.com/quitesensational/'],
    ['zalo', 'https://zalo.me/0961036265'], ['tiktok', 'https://www.tiktok.com/@taidoan450']]);
  expect(config.feedbackButton).toEqual({ icon: 'plane', color: '#229ED9', outline: '#FFFFFF' });
  for (const icon of ['plane', 'chat', 'mail']) expect(validateConfig({ ...config, feedbackButton: { ...config.feedbackButton, icon } }).feedbackButton?.icon).toBe(icon);
  const { feedbackButton: _unused, ...missing } = config; void _unused;
  for (const bad of [missing, { ...config, feedbackButton: { ...config.feedbackButton, icon: 'rocket' } },
    { ...config, feedbackButton: { ...config.feedbackButton, color: 'red' } }, { ...config, feedbackButton: { ...config.feedbackButton, outline: '#fff' } },
    { ...config, feedbackButton: { ...config.feedbackButton, image: 'https://example.com/x.png' } }]) {
    expect(() => validateConfig(bad)).toThrow('INVALID_CONFIG');
  }
});
test('a video may carry its first frame as a still; nothing else may', () => {
  const base = defaultConfig('Quán Thử'), video = { kind: 'video' as const, url: 'https://media.example/v.mp4', still: 'https://media.example/v.jpg' };
  expect(validateConfig({ ...base, poster: video, background: { kind: 'media', media: video, loop: true } }).poster).toEqual(video);
  expect(validateConfig({ ...base, background: { kind: 'media', media: { kind: 'video', url: '/media/stem-background.mp4', still: '/media/stem-background.jpg' }, loop: true } })).toBeTruthy();
  for (const bad of [{ kind: 'image', url: 'https://media.example/a.jpg', still: 'https://media.example/b.jpg' }, { ...video, still: 'http://media.example/v.jpg' },
    { ...video, still: 'javascript:alert(1)' }, { ...video, still: '/etc/passwd' }, { ...video, extra: 1 }])
    expect(() => validateConfig({ ...base, poster: bad })).toThrow('INVALID_CONFIG');
  expect(() => validateConfig({ ...base, logo: { kind: 'image', url: 'https://media.example/l.png', still: 'https://media.example/l.png' } })).toThrow('INVALID_CONFIG');
});
test('allowlist accepts branding and rejects injection, rating gating and unsupported layouts', () => {
  const config = defaultConfig(); expect(validateConfig(config)).toEqual(config);
  for (const patch of [{ html: '<script>x</script>' }, { layout: 'grid' }, { schemaVersion: 0 }, { googleUrl: 'javascript:alert(1)' },
    { name: '<img onerror=x>' }, { watermark: { text: 'OTHER', enabled: true, motion: 'diagonal-linear' } },
    { googleUrl: 'https://user:password@example.com' }, { links: [{ label: {vi:'A',en:'A'},url:'https://example.com',icon:'script',showAboveRating:4}] }]) {
    expect(() => validateConfig({ ...config, ...patch })).toThrow('INVALID_CONFIG');
  }
});
test('signed canonical context pins release, rejects tampering/claims, supports retained verification keys', () => {
  const context: RenderContext = { v:1,shopId:randomUUID(),releaseId:randomUUID(),tagId:null,previewId:null,scope:'live',entryKey:'direct:shop' };
  const proof = signContext(context,ring); expect(verifyContext(proof,ring)).toEqual(context);
  for (const malformed of [proof + '.', proof + '.extra', proof + '=']) expect(() => verifyContext(malformed, ring)).toThrow('INVALID_RENDER_PROOF');
  const parts=proof.split('.'); parts[1]=Buffer.from(JSON.stringify({...context,releaseId:randomUUID()})).toString('base64url');
  expect(()=>verifyContext(parts.join('.'),ring)).toThrow('INVALID_RENDER_PROOF');
  expect(()=>canonical({...context,scope:'test'})).toThrow();
  expect(()=>verifyContext(proof,{active:'new',keys:{new:'another-test-only-key-at-least-32bytes'}})).toThrow();
  expect(verifyContext(proof,{active:'new',keys:{...ring.keys,new:'another-test-only-key-at-least-32bytes'}})).toEqual(context);
});

// Lát M3: sections. A new page is version 3; pages written before stay readable and show exactly what they showed.
test('v3 arranges the blocks: only the poster stands above the Google invitation, each block once, nothing unknown', () => {
  expect(defaultConfig().schemaVersion).toBe(3);
  expect(defaultConfig().sections).toEqual([{ kind: 'poster' }, { kind: 'links' }]);
  const base = defaultConfig();
  for (const sections of [[{ kind: 'links' }], [{ kind: 'links', hidden: true }], [{ kind: 'poster', hidden: true }, { kind: 'links' }]])
    expect(validateConfig({ ...base, sections }).sections).toEqual(sections);
  for (const sections of [[], [{ kind: 'links' }, { kind: 'poster' }], [{ kind: 'links' }, { kind: 'links' }], [{ kind: 'events' }],
    [{ kind: 'links', hidden: 'yes' }], [{ kind: 'links', extra: 1 }], 'poster', [{ kind: 'poster' }, { kind: 'links' }, { kind: 'poster' }]])
    expect(() => validateConfig({ ...base, sections }), JSON.stringify(sections)).toThrow('INVALID_CONFIG');
  // Version 3 cannot drop its sections, and versions 1 and 2 cannot carry them.
  expect(() => validateConfig({ ...v2(), schemaVersion: 3 })).toThrow('INVALID_CONFIG');
  expect(() => validateConfig({ ...v2(), sections: base.sections })).toThrow('INVALID_CONFIG');
});
test('an older page reads as the blocks it always had, and is brought to version 3 without changing what shows', () => {
  for (const old of [v1(), v2()]) {
    expect(sectionsOf(old)).toEqual([{ kind: 'poster' }, { kind: 'links' }]);
    const now = validateConfig(currentConfig(old));
    expect(now.schemaVersion).toBe(3);
    expect(shows(now, 'poster')).toBe(true); expect(shows(now, 'links')).toBe(true);
    expect({ ...now, schemaVersion: old.schemaVersion, sections: undefined, feedbackButton: undefined })
      .toEqual({ ...old, sections: undefined, feedbackButton: undefined });
  }
  expect(shows({ ...defaultConfig(), sections: [{ kind: 'poster', hidden: true }, { kind: 'links' }] }, 'poster')).toBe(false);
});
