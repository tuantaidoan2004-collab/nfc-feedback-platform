import { ARTBOARD, FIRST_SCREEN, MAX_ELEMENTS, MAX_SECTIONS, type El, type Kid, type PageDoc, type RowEl, type RowKid, type Section } from './doc';
import { placeAll } from './layout';
import { walk } from './validate';

/**
 * Các phép sửa một tài liệu canvas (doc.ts), dùng cho trình sửa trang (components/canvas/editor). Mỗi phép trả về tài liệu mới
 * và giữ nguyên mọi phần không đổi, nên trình sửa chỉ vẽ lại đúng chỗ vừa sửa và lưu lại được lịch sử để hoàn tác.
 */
export type AnyEl = El | Kid | RowKid;
/** Where an element lives: a section's own element (`top`), a child of a stack or of a deck's front card, or a child of a row in one. */
export type Located = { section: number; top: El; kid?: Kid; rowKid?: RowKid };
export const targetOf = (found: Located): AnyEl => found.rowKid ?? found.kid ?? found.top;
const kidsOf = (el: El): Kid[] | null => el.t === 'stack' ? el.kids : el.t === 'deck' ? el.front.kids : null;

export function locate(doc: PageDoc, id: string): Located | null {
  for (const [section, s] of doc.sections.entries()) for (const top of s.els) {
    if (top.id === id) return { section, top };
    for (const kid of kidsOf(top) ?? []) {
      if (kid.id === id) return { section, top, kid };
      if (kid.t === 'row') for (const rowKid of kid.kids) if (rowKid.id === id) return { section, top, kid, rowKid };
    }
  }
  return null;
}

const withKids = (el: El, kids: Kid[]): El => el.t === 'stack' ? { ...el, kids } : el.t === 'deck' ? { ...el, front: { ...el.front, kids } } : el;
/** The section holding `id`, rebuilt by `change`; every other section keeps its identity. */
function inSection(doc: PageDoc, id: string, change: (section: Section) => Section): PageDoc {
  const found = locate(doc, id);
  if (!found) return doc;
  return { ...doc, sections: doc.sections.map((s, i) => i === found.section ? change(s) : s) };
}

/** Replaces one element (top-level, child or row child) with what `change` makes of it. */
export function patch(doc: PageDoc, id: string, change: (el: AnyEl) => AnyEl): PageDoc {
  return inSection(doc, id, section => ({ ...section, els: section.els.map(top => {
    if (top.id === id) return change(top) as El;
    const kids = kidsOf(top);
    if (!kids?.some(kid => kid.id === id || (kid.t === 'row' && kid.kids.some(k => k.id === id)))) return top;
    return withKids(top, kids.map(kid => kid.id === id ? change(kid) as Kid
      : kid.t === 'row' && kid.kids.some(k => k.id === id) ? { ...kid, kids: kid.kids.map(k => k.id === id ? change(k) as RowKid : k) } : kid));
  }) }));
}

/** Takes an element out. A row left empty goes too (a row always holds something, validate.ts). */
export function remove(doc: PageDoc, id: string): PageDoc {
  return inSection(doc, id, section => ({ ...section, els: section.els.filter(top => top.id !== id).map(top => {
    const kids = kidsOf(top);
    if (!kids) return top;
    const next = kids.filter(kid => kid.id !== id).map(kid => kid.t === 'row' ? { ...kid, kids: kid.kids.filter(k => k.id !== id) } : kid)
      .filter(kid => kid.t !== 'row' || kid.kids.length > 0);
    return next.length === kids.length && next.every((kid, i) => kid === kids[i]) ? top : withKids(top, next);
  }) }));
}

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** A new id no element of the page has: `base-<4 letters>`. */
export function freshId(doc: PageDoc, base: string, taken = new Set([...walk(doc)].map(el => el.id))) {
  const stem = base.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'el';
  for (;;) {
    const id = `${stem}-${Math.random().toString(36).slice(2, 6)}`;
    if (ID.test(id) && !taken.has(id)) { taken.add(id); return id; }
  }
}
/** A deep copy with new ids throughout (a stack's children too), so the copy and the original never share one. */
function renamed<T extends AnyEl | RowEl>(el: T, doc: PageDoc, taken: Set<string>): T {
  const copy = structuredClone(el) as AnyEl | RowEl;
  const rename = (item: { id: string }) => { item.id = freshId(doc, item.id.replace(/-[a-z0-9]{4}$/, ''), taken); };
  rename(copy);
  const kids = 'kids' in copy && Array.isArray(copy.kids) ? copy.kids as (Kid | RowKid)[] : copy.t === 'deck' ? copy.front.kids : [];
  for (const kid of kids) { rename(kid); if (kid.t === 'row') kid.kids.forEach(rename); }
  return copy as T;
}

export const countOf = (doc: PageDoc) => [...walk(doc)].length;
/** A copy just below and to the right of the original (or right after it, inside a stack). Null when the page is full. */
export function duplicate(doc: PageDoc, id: string): { doc: PageDoc; id: string } | null {
  const found = locate(doc, id);
  if (!found || found.rowKid) return null;
  const taken = new Set([...walk(doc)].map(el => el.id));
  if (!found.kid) {
    if (doc.sections[found.section].els.length >= MAX_ELEMENTS || countOf(doc) >= MAX_ELEMENTS * 2) return null;
    const copy = renamed(found.top, doc, taken);
    if ('x' in copy) { copy.x += 12; copy.y += 12; }
    return { doc: inSection(doc, id, s => ({ ...s, els: [...s.els, copy] })), id: copy.id };
  }
  const kids = kidsOf(found.top)!;
  if (kids.length >= 24) return null;
  const copy = renamed(found.kid, doc, taken), at = kids.indexOf(found.kid) + 1;
  return { doc: patch(doc, found.top.id, top => withKids(top as El, [...kids.slice(0, at), copy, ...kids.slice(at)])), id: copy.id };
}

/** Moves an element up or down the layers of its section (or along its stack: up is earlier, nearer the top). */
export function reorder(doc: PageDoc, id: string, to: 'forward' | 'backward' | 'front' | 'back'): PageDoc {
  const found = locate(doc, id);
  if (!found || found.rowKid) return doc;
  const move = <T extends { id: string }>(list: T[]): T[] => {
    const from = list.findIndex(item => item.id === id), next = [...list], [item] = next.splice(from, 1);
    const at = to === 'front' ? next.length : to === 'back' ? 0 : Math.max(0, Math.min(next.length, from + (to === 'forward' ? 1 : -1)));
    next.splice(at, 0, item); return next;
  };
  if (!found.kid) return inSection(doc, id, s => ({ ...s, els: move(s.els) }));
  // Inside a stack "forward" means further down the column, as the panel shows it.
  return patch(doc, found.top.id, top => withKids(top as El, move(kidsOf(top as El)!)));
}

/** Adds an element on top of a section's layers. Null when the section or the page is full. */
export function insert(doc: PageDoc, section: number, el: El): PageDoc | null {
  if (doc.sections[section].els.length >= MAX_ELEMENTS || countOf(doc) >= MAX_ELEMENTS * 2) return null;
  return { ...doc, sections: doc.sections.map((s, i) => i === section ? { ...s, els: [...s.els, el] } : s) };
}
/** Adds a child at the end of a stack (or of a deck's front card). */
export function insertKid(doc: PageDoc, containerId: string, kid: Kid): PageDoc | null {
  const found = locate(doc, containerId), kids = found && !found.kid ? kidsOf(found.top) : null;
  if (!kids || kids.length >= 24 || countOf(doc) >= MAX_ELEMENTS * 2) return null;
  return patch(doc, containerId, top => withKids(top as El, [...kids, kid]));
}

export function patchSection(doc: PageDoc, index: number, change: (section: Section) => Section): PageDoc {
  return { ...doc, sections: doc.sections.map((s, i) => i === index ? change(s) : s) };
}
const LETTERS = 'ABCDEFGH';
/** A new, empty section after `after`: the next letter (Khúc B, C…), the colour of the one above it. */
export function addSection(doc: PageDoc, after: number): { doc: PageDoc; index: number } | null {
  if (doc.sections.length >= MAX_SECTIONS) return null;
  const taken = new Set(doc.sections.map(s => s.id));
  const letter = [...LETTERS].find(l => !taken.has(l.toLowerCase())) ?? 'x';
  const id = taken.has(letter.toLowerCase()) ? freshId(doc, 'khuc') : letter.toLowerCase();
  const above = doc.sections[after]?.bg?.fill;
  const section: Section = { id, name: `Khúc ${letter}`, h: 600, bg: { fill: typeof above === 'string' ? above : '#ffffff' }, els: [] };
  const sections = [...doc.sections.slice(0, after + 1), section, ...doc.sections.slice(after + 1)];
  return { doc: { ...doc, sections }, index: after + 1 };
}
/** Takes a section out; the first section never goes (it holds the first screen), and a page keeps at least one. */
export function removeSection(doc: PageDoc, index: number): PageDoc {
  if (index === 0 || doc.sections.length < 2) return doc;
  return { ...doc, sections: doc.sections.filter((_, i) => i !== index) };
}
/** Swaps a section with its neighbour. The first section stays first: the Google button's screen is its. */
export function moveSection(doc: PageDoc, index: number, by: -1 | 1): PageDoc {
  const to = index + by;
  if (index === 0 || to < 1 || to >= doc.sections.length) return doc;
  const sections = [...doc.sections]; [sections[index], sections[to]] = [sections[to], sections[index]];
  return { ...doc, sections };
}

/** The top-level element that holds `id` and moves with it: the element itself, or the stack or deck it sits in. */
export const moverOf = (doc: PageDoc, id: string) => { const found = locate(doc, id); return found ? found.top : null; };
const holdsGoogle = (el: El) => el.t === 'google' || (kidsOf(el) ?? []).some(k => k.t === 'google' || (k.t === 'row' && k.kids.some(c => c.t === 'google')));

/**
 * Keeps the Google button where the rules want it (kịch bản luật 0.1, layout.ts `googleProblems`): wholly inside the first
 * section's first screen and inside the page's width. Called on a move or a resize of the element holding it.
 */
export function keepGoogleInPlace(doc: PageDoc, topId: string): PageDoc {
  const found = locate(doc, topId);
  if (!found || found.kid || !holdsGoogle(found.top) || found.section !== 0 || !('x' in found.top)) return doc;
  const google = [...walk(doc)].find(el => el.t === 'google');
  const rect = google && placeAll(doc).find(p => p.id === google.id)?.rect;
  if (!rect) return doc;
  const dy = rect.y < 0 ? -rect.y : rect.y + rect.h > FIRST_SCREEN ? FIRST_SCREEN - rect.y - rect.h : 0;
  const dx = rect.x < 0 ? -rect.x : rect.x + rect.w > ARTBOARD ? ARTBOARD - rect.x - rect.w : 0;
  if (!dx && !dy) return doc;
  return patch(doc, topId, el => ({ ...el, x: Math.round((el as El & { x: number }).x + dx), y: Math.round((el as El & { y: number }).y + dy) }) as AnyEl);
}
