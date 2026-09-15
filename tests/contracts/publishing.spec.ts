import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { defaultConfig, validateConfig } from '../../lib/publishing/config';
import { canonical, signContext, verifyContext, type RenderContext } from '../../lib/publishing/proof';
const ring = { active: 'fixture', keys: { fixture: 'test-only-key-at-least-thirty-two-bytes' } };
test('v1 allowlist accepts branding and rejects injection, rating gating and unsupported layouts', () => {
  const config = defaultConfig(); expect(validateConfig(config)).toEqual(config);
  for (const patch of [{ html: '<script>x</script>' }, { layout: 'card' }, { schemaVersion: 2 }, { googleUrl: 'javascript:alert(1)' },
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
