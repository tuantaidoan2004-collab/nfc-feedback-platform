import { test, expect } from '@playwright/test';
import { pageFromTemplate } from '../../lib/canvas/templates';
import { sourceProblem, validateDoc, walk } from '../../lib/canvas/validate';
import { googleProblems, mediaOf, placeAll } from '../../lib/canvas/layout';
import { addSection, duplicate, freshId, insert, insertKid, keepGoogleInPlace, locate, moveSection, patch, remove, removeSection, reorder, targetOf } from '../../lib/canvas/edit';
import { FIRST_SCREEN, MAX_SECTIONS, type El, type PageDoc } from '../../lib/canvas/doc';

/**
 * The page editor's edits (lib/canvas/edit.ts, components/canvas/editor): each returns a new document that is still a valid
 * page, and leaves every part it did not touch as it was -- that is what lets the editor redraw only the change and undo it.
 */
const doc = () => pageFromTemplate('basic-1', 'Quán Thử').doc;
const ids = (d: PageDoc) => [...walk(d)].map(el => el.id);

test('an element is found wherever it sits: on the section, in a stack, in a row inside a stack', () => {
  const d = doc();
  expect(locate(d, 'anh-chinh')).toMatchObject({ section: 0, top: { id: 'anh-chinh' } });
  expect(locate(d, 'ten-quan')).toMatchObject({ top: { id: 'tam' }, kid: { id: 'ten-quan' } });
  expect(targetOf(locate(d, 'zalo')!).id).toBe('zalo');
  expect(locate(d, 'khong-co')).toBeNull();
});

test('a change touches one element; every other part keeps its identity, and the page stays valid', () => {
  const before = doc(), after = patch(before, 'zalo', el => ({ ...el, label: { vi: 'Zalo quán' } }) as typeof el);
  expect(targetOf(locate(after, 'zalo')!)).toMatchObject({ label: { vi: 'Zalo quán' } });
  expect(after.sections[0].els.find(el => el.id === 'anh-chinh')).toBe(before.sections[0].els.find(el => el.id === 'anh-chinh'));
  expect(targetOf(locate(before, 'zalo')!)).toMatchObject({ label: { vi: 'Zalo' } });
  expect(() => validateDoc(after)).not.toThrow();
  expect(patch(before, 'khong-co', el => el)).toBe(before);
});

test('removing, duplicating and layering keep ids unique and the page valid', () => {
  let d = doc();
  // A row left empty goes with its last button (a row always holds something).
  for (const id of ['instagram', 'zalo', 'tiktok']) d = remove(d, id);
  expect(ids(d)).not.toContain('hang-nut');
  expect(() => validateDoc(d)).not.toThrow();
  const copied = duplicate(d, 'anh-chinh')!;
  expect(copied.id).not.toBe('anh-chinh');
  expect(new Set(ids(copied.doc)).size).toBe(ids(copied.doc).length);
  const copy = locate(copied.doc, copied.id)!.top as El & { x: number; y: number }, original = locate(d, 'anh-chinh')!.top as El & { x: number; y: number };
  expect([copy.x - original.x, copy.y - original.y]).toEqual([12, 12]);
  // A stack copied whole renames its children too.
  const stack = duplicate(d, 'tam')!;
  expect(new Set(ids(stack.doc)).size).toBe(ids(stack.doc).length);
  expect(() => validateDoc(stack.doc)).not.toThrow();
  // Layers: to the front is the end of the list; inside a stack, along the column.
  const front = reorder(d, 'anh-chinh', 'front');
  expect(front.sections[0].els.at(-1)?.id).toBe('anh-chinh');
  const kids = (x: PageDoc) => (locate(x, 'tam')!.top as Extract<El, { t: 'stack' }>).kids.map(k => k.id);
  expect(kids(reorder(d, 'ten-quan', 'backward'))[0]).toBe('ten-quan');
  expect(kids(reorder(d, 'cho-logo', 'forward'))[1]).toBe('cho-logo');
});

test('new elements and children get fresh ids; sections are added, moved and removed within the rules', () => {
  const d = doc(), id = freshId(d, 'chu');
  expect(id).toMatch(/^chu-[a-z0-9]{4}$/);
  const withText = insert(d, 0, { id, t: 'text', x: 20, y: 600, w: 300, h: 40, words: { vi: 'Mới' }, font: 'sans', size: 16, color: '#111111' })!;
  expect(withText.sections[0].els.at(-1)?.id).toBe(id);
  const kidId = freshId(withText, 'nut');
  const withKid = insertKid(withText, 'tam', { id: kidId, t: 'button', look: 'pill', label: { vi: 'Đặt bàn' }, link: 'https://example.com/dat-ban', h: 44 })!;
  expect(locate(withKid, kidId)).toMatchObject({ top: { id: 'tam' } });
  expect(() => validateDoc(withKid)).not.toThrow();
  // Sections: a new one after the first, called by the next letter; the first never moves and never goes.
  const added = addSection(withKid, 0)!;
  expect(added.index).toBe(1);
  expect(added.doc.sections[1]).toMatchObject({ id: 'b', name: 'Khúc B', els: [] });
  expect(moveSection(added.doc, 0, 1)).toBe(added.doc);
  expect(removeSection(added.doc, 0)).toBe(added.doc);
  expect(removeSection(added.doc, 1).sections).toHaveLength(1);
  let full = added.doc;
  while (full.sections.length < MAX_SECTIONS) full = addSection(full, full.sections.length - 1)!.doc;
  expect(addSection(full, 0)).toBeNull();
  expect(() => validateDoc(full)).not.toThrow();
});

test('the Google button is kept in the first screen and inside the page whichever way its block is moved', () => {
  const d = doc(), google = () => (d2: PageDoc) => placeAll(d2).find(p => p.id === 'google')!.rect;
  for (const [dx, dy] of [[0, 900], [0, -900], [500, 0], [-500, 0]] as const) {
    const moved = patch(d, 'tam', el => ({ ...el, x: (el as El).x + dx, y: (el as El).y + dy }) as typeof el);
    const kept = keepGoogleInPlace(moved, 'tam'), rect = google()(kept);
    expect(googleProblems(kept), `${dx},${dy}`).toBeNull();
    expect(rect.y + rect.h).toBeLessThanOrEqual(FIRST_SCREEN);
    expect(rect.y).toBeGreaterThanOrEqual(0);
  }
  // Something without the button is left alone.
  const image = patch(d, 'anh-chinh', el => ({ ...el, y: 2000 }) as typeof el);
  expect(keepGoogleInPlace(image, 'anh-chinh')).toBe(image);
});

test('a picture is built in, or an upload: https anywhere, plain http only from a store on this machine, and every upload is reviewed', () => {
  for (const ok of ['art:car', 'https://media.example/shops/a/b.webp', 'http://127.0.0.1:3322/nfc-media/shops/a/b.webp', 'http://localhost:9000/x.png'])
    expect(sourceProblem(ok), ok).toBe(false);
  for (const bad of ['http://media.example/a.jpg', 'http://192.168.1.5:3322/a.jpg', 'https://u:p@media.example/a.jpg', 'data:image/png;base64,AA',
    'javascript:alert(1)', 'tel:0900000000', '/etc/passwd', 'http://127.0.0.1:3322/a b.jpg', 'http://127.0.0.1:3322/<x>.jpg'])
    expect(sourceProblem(bad), bad).toBe(true);
  // The image review (media-gate.ts) sees every picture that is not the app's own, whatever its scheme.
  const d = doc(), local = 'http://127.0.0.1:3322/nfc-media/shops/a/b.webp';
  d.sections[0].bg = { ...d.sections[0].bg, src: local };
  expect(mediaOf(d)).toContain(local);
  expect(mediaOf(d).some(src => src.startsWith('art:') || src.startsWith('/tpl/'))).toBe(false);
});
