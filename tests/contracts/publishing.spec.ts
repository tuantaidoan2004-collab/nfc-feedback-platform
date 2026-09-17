import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { defaultConfig, validateConfig } from '../../lib/publishing/config';
import { canonical, signContext, verifyContext, type RenderContext } from '../../lib/publishing/proof';
const ring = { active: 'fixture', keys: { fixture: 'test-only-key-at-least-thirty-two-bytes' } };
const v1 = () => { const { feedbackButton: _unused, ...rest } = defaultConfig(); void _unused; return { ...rest, schemaVersion: 1 as const, layout: 'full-bleed' as const, links: [] }; };
const link = (icon: string, url: string) => ({ label: { vi: 'Liên hệ', en: 'Contact' }, url, icon });
test('v1 releases stay readable but cannot use v2 layouts or buttons', () => {
  expect(validateConfig(v1())).toEqual(v1());
  for (const patch of [{ layout: 'card' }, { links: [link('facebook', 'https://facebook.com/x')] }, { links: [link('phone', 'tel:0901234567')] },
    { links: [link('tiktok', 'https://www.tiktok.com/@x')] }, { feedbackButton: defaultConfig().feedbackButton }, { schemaVersion: 3 }]) {
    expect(() => validateConfig({ ...v1(), ...patch })).toThrow('INVALID_CONFIG');
  }
});
test('v2 adds the card layout, Facebook and a tel: contact button only', () => {
  expect(defaultConfig().schemaVersion).toBe(2);
  const card = { ...defaultConfig(), layout: 'card', links: [link('facebook', 'https://facebook.com/x'), link('phone', 'tel:+84901234567')] };
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
