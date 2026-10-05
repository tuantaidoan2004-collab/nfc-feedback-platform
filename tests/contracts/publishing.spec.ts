import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { validateConfig } from '../../lib/publishing/config';
import { pageFromTemplate } from '../../lib/canvas/templates';
import { MAX_SECTIONS } from '../../lib/canvas/doc';
import { canonical, signContext, verifyContext, type RenderContext } from '../../lib/publishing/proof';
const ring = { active: 'fixture', keys: { fixture: 'test-only-key-at-least-thirty-two-bytes' } };

/**
 * A page is a canvas document (đợt ②; lib/canvas/doc.ts, lib/canvas/validate.ts). What a shop writes reaches every guest, so
 * the document is a closed list: known keys only, numbers in range, colours and links in their one shape, no markup anywhere.
 */
const page = () => pageFromTemplate('basic-1', 'Quán Thử');
/** The page with one change in its first section's first element (a language switch in basic-1) or in the element `id`. */
function withElement(change: (el: Record<string, unknown>) => void, id?: string) {
  const config = structuredClone(page()) as unknown as { doc: { sections: { els: Record<string, unknown>[] }[] } };
  const els = config.doc.sections[0].els, all = els.flatMap(el => [el, ...((el.kids as Record<string, unknown>[] | undefined) ?? [])]);
  change(id ? all.find(el => el.id === id)! : els[0]);
  return config;
}

test('a page is its name and its document; anything else, or an older shape, is refused', () => {
  expect(validateConfig(page())).toEqual(page());
  for (const bad of [{ ...page(), schemaVersion: 3 }, { ...page(), extra: 1 }, { ...page(), name: '' }, { ...page(), name: '<b>Quán</b>' },
    { ...page(), name: 'x'.repeat(101) }, { schemaVersion: 4, name: 'Quán' }, { ...page(), doc: { v: 2, sections: page().doc.sections } }, null, [], 'page'])
    expect(() => validateConfig(bad), JSON.stringify(bad)?.slice(0, 80)).toThrow('INVALID_CONFIG');
});

type Change = (el: Record<string, unknown>) => void;
test('every element is checked to its box: id, place, size, turn, fade and motion, not only its keys', () => {
  const changes: Change[] = [el => { el.id = 'Bad Id'; }, el => { el.id = 'x'.repeat(40); }, el => { el.x = '10'; },
    el => { el.y = 5000; }, el => { el.w = 0; }, el => { el.h = -1; }, el => { el.r = 720; }, el => { el.o = 2; }, el => { el.hide = 'yes'; },
    el => { el.motion = { in: 'explode' }; }, el => { el.motion = { at: -5 }; }, el => { el.name = '<script>'; }, el => { el.extra = true; }];
  for (const change of changes) expect(() => validateConfig(withElement(change)), change.toString()).toThrow('INVALID_CONFIG');
  // Inside a stack a child has no place of its own: x and y are the stack's to decide.
  expect(() => validateConfig(withElement(el => { el.x = 10; }, 'ten-quan'))).toThrow('INVALID_CONFIG');
  expect(() => validateConfig(withElement(el => { el.w = 500; }, 'ten-quan'))).toThrow('INVALID_CONFIG');
});

test('links lead only to https or a phone number; words carry no markup; colours are hex', () => {
  const link = (url: string) => withElement(el => { el.link = url; }, 'ten-quan');
  expect(validateConfig(link('https://facebook.com/quan'))).toBeTruthy();
  expect(validateConfig(link('tel:+84901234567'))).toBeTruthy();
  for (const bad of ['javascript:alert(1)', 'http://facebook.com/quan', 'https://user:pass@example.com', '/relative', 'tel:090;ext=1', 'data:text/html,x', 'https://a b.com'])
    expect(() => validateConfig(link(bad)), bad).toThrow('INVALID_CONFIG');
  const changes: Change[] = [el => { el.words = { vi: '<img onerror=x>' }; }, el => { el.words = { vi: '' }; }, el => { el.words = { vi: 'a', fr: 'b' }; },
    el => { el.color = 'red'; }, el => { el.color = 'url(https://x.test/a.png)'; }, el => { el.font = 'comic'; }, el => { el.size = 1000; }];
  for (const change of changes) expect(() => validateConfig(withElement(change, 'ten-quan')), change.toString()).toThrow('INVALID_CONFIG');
});

test('pictures come from the built-in art, the app, or an https upload; nothing else', () => {
  const picture = (src: string) => withElement(el => { el.src = src; }, 'anh-chinh');
  for (const ok of ['art:latte', '/tpl/hero-1.webp', 'https://media.example/a.jpg']) expect(validateConfig(picture(ok)), ok).toBeTruthy();
  for (const bad of ['art:unknown', '/tpl/../etc/passwd', '/media/x.jpg', 'http://media.example/a.jpg', 'javascript:alert(1)', 'tel:0901234567'])
    expect(() => validateConfig(picture(bad)), bad).toThrow('INVALID_CONFIG');
});

test('a page has 1 to 8 sections with distinct ids, and no two elements share an id', () => {
  const base = page();
  const sections = (list: unknown) => ({ ...base, doc: { ...base.doc, sections: list } });
  expect(() => validateConfig(sections([]))).toThrow('INVALID_CONFIG');
  expect(() => validateConfig(sections(Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => ({ id: `s${i}`, h: 300, els: [] }))))).toThrow('INVALID_CONFIG');
  expect(() => validateConfig(sections([base.doc.sections[0], { ...base.doc.sections[0], els: [] }]))).toThrow('INVALID_CONFIG');
  const twice = structuredClone(base); twice.doc.sections.push({ id: 'b', h: 300, els: [structuredClone(twice.doc.sections[0].els[0])] });
  expect(() => validateConfig(twice)).toThrow('INVALID_CONFIG');
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
