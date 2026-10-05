import { ARTBOARD, ARTS, BUTTON_LOOKS, DECK_LOOKS, FONTS, GOOGLE_LOOKS, ICONS, MAX_ELEMENTS, MAX_SECTION_H, MAX_SECTIONS, MOTIONS_IN, MOTIONS_LOOP,
  SHAPES, type PageDoc } from './doc';

/**
 * Kiểm một tài liệu canvas trước khi lưu (doc.ts). Chặt như `validateConfig` của trang cũ: mỗi đối tượng chỉ có đúng các khoá
 * đã biết, mỗi số trong khoảng, mỗi màu đúng dạng, mỗi link là https (hoặc tel: cho nút gọi), mỗi chữ không chứa ký tự điều
 * khiển hay dấu < >. Tài liệu đi từ trình sửa của chủ quán vào trang khách của mọi người, nên không gì ngoài danh sách lọt qua.
 */
export class CanvasError extends Error { constructor(public readonly code: string, public readonly at = '') { super(at ? `${code} at ${at}` : code); } }
function fail(at: string): never { throw new CanvasError('INVALID_PAGE', at); }
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

function keys(v: unknown, at: string, required: string[], optional: string[] = []): asserts v is Obj {
  if (!isObj(v)) fail(at);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(v as Obj)) if (!allowed.has(key)) fail(`${at}.${key}`);
  for (const key of required) if (!(key in (v as Obj))) fail(`${at}.${key}`);
}
const num = (v: unknown, at: string, min: number, max: number) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(at); };
const opt = (v: Obj, key: string, check: (value: unknown, at: string) => void, at: string) => { if (key in v && v[key] !== undefined) check(v[key], `${at}.${key}`); };
const oneOf = (list: readonly string[]) => (v: unknown, at: string) => { if (typeof v !== 'string' || !list.includes(v)) fail(at); };
const bool = (v: unknown, at: string) => { if (typeof v !== 'boolean') fail(at); };
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

export const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const color = (v: unknown, at: string) => { if (typeof v !== 'string' || !COLOR.test(v)) fail(at); };
function fill(v: unknown, at: string) {
  if (typeof v === 'string') return color(v, at);
  keys(v, at, ['kind', 'stops'], ['angle', 'x', 'y']);
  if (v.kind === 'linear') { num(v.angle, `${at}.angle`, 0, 360); if ('x' in v || 'y' in v) fail(at); }
  else if (v.kind === 'radial') { num(v.x, `${at}.x`, 0, 100); num(v.y, `${at}.y`, 0, 100); if ('angle' in v) fail(at); }
  else fail(`${at}.kind`);
  const stops = v.stops; if (!Array.isArray(stops) || stops.length < 2 || stops.length > 6) fail(`${at}.stops`);
  (stops as unknown[]).forEach((stop, i) => { if (!Array.isArray(stop) || stop.length !== 2) fail(`${at}.stops.${i}`); color(stop[0], `${at}.stops.${i}`); num(stop[1], `${at}.stops.${i}`, 0, 100); });
}
function text(v: unknown, at: string, max: number, allowEmpty = false) {
  if (typeof v !== 'string' || v.length > max || (!allowEmpty && !v.trim()) || /[\u0000-\u0008\u000b-\u001f\u007f<>]/.test(v)) fail(at);
}
function words(v: unknown, at: string, max = 400) { keys(v, at, ['vi'], ['en']); text(v.vi, `${at}.vi`, max); opt(v, 'en', (e, a) => text(e, a, max, true), at); }
/** https without credentials, or tel: for a call button. Never javascript:, data:, or a relative path. */
export function linkProblem(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\u007f<>\s]/.test(value)) return true;
  if (/^tel:\+?[0-9]{3,15}$/.test(value)) return false;
  try { const url = new URL(value); return url.protocol !== 'https:' || !!url.username || !!url.password; } catch { return true; }
}
const link = (v: unknown, at: string) => { if (linkProblem(v)) fail(at); };
/**
 * `art:<key>` (built in), `/tpl/<file>` (shipped with the app), or an upload (passes the image review to publish): https, or
 * plain http only on this machine -- the local app's store (scripts/local/store.ts), the same exception as
 * lib/media/storage-settings.ts. Elsewhere such an address names no upload of the shop, so the review refuses it.
 */
export function sourceProblem(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  if (value.startsWith('art:')) return !(ARTS as readonly string[]).includes(value.slice(4));
  if (value.startsWith('/tpl/')) return !/^\/tpl\/[a-z0-9-]{1,60}\.(?:webp|jpg|png|svg)$/.test(value);
  if (value.length > 2048 || /[\u0000-\u001f\u007f<>\s]/.test(value)) return true;
  try {
    const url = new URL(value);
    if (url.username || url.password) return true;
    return !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)));
  } catch { return true; }
}
const source = (v: unknown, at: string) => { if (sourceProblem(v)) fail(at); };
const shadow = (v: unknown, at: string) => { keys(v, at, ['x', 'y', 'blur', 'color']); num(v.x, `${at}.x`, -60, 60); num(v.y, `${at}.y`, -60, 60); num(v.blur, `${at}.blur`, 0, 120); color(v.color, `${at}.color`); };
const edge = (v: unknown, at: string) => { keys(v, at, ['w', 'color']); num(v.w, `${at}.w`, 0, 24); fill(v.color, `${at}.color`); };
const glass = (v: unknown, at: string) => { keys(v, at, ['blur', 'tint']); num(v.blur, `${at}.blur`, 0, 60); color(v.tint, `${at}.tint`); };
const focus = (v: unknown, at: string) => { if (!Array.isArray(v) || v.length !== 2) fail(at); num((v as unknown[])[0], at, 0, 100); num((v as unknown[])[1], at, 0, 100); };
function motion(v: unknown, at: string) {
  keys(v, at, [], ['in', 'at', 'loop']);
  opt(v, 'in', oneOf(MOTIONS_IN), at); opt(v, 'at', (n, a) => num(n, a, 0, 20000), at); opt(v, 'loop', oneOf(MOTIONS_LOOP), at);
}
function panel(v: unknown, at: string) {
  keys(v, at, [], ['fill', 'glass', 'radius', 'edge', 'shadow', 'top']);
  opt(v, 'fill', fill, at); opt(v, 'glass', glass, at); opt(v, 'radius', (n, a) => num(n, a, 0, 400), at); opt(v, 'edge', edge, at); opt(v, 'shadow', shadow, at);
  opt(v, 'top', (n, a) => num(n, a, 0, 200), at);
}

const BOX = ['id', 't', 'x', 'y', 'w', 'h'];
const BOX_OPTIONAL = ['name', 'r', 'o', 'hide', 'lock', 'motion'];
/** Fields every element may carry beyond its own, checked once here. Inside a stack x, y are absent and w is optional. */
function box(v: Obj, at: string, inStack: boolean) {
  if (typeof v.id !== 'string' || !ID.test(v.id)) fail(`${at}.id`);
  if (!inStack) { num(v.x, `${at}.x`, -800, 3000); num(v.y, `${at}.y`, -800, MAX_SECTION_H + 400); num(v.w, `${at}.w`, 1, 3000); }
  else opt(v, 'w', (n, a) => num(n, a, 1, ARTBOARD), at);
  num(v.h, `${at}.h`, 1, 3000);
  opt(v, 'name', (n, a) => text(n, a, 60), at); opt(v, 'r', (n, a) => num(n, a, -360, 360), at); opt(v, 'o', (n, a) => num(n, a, 0, 1), at);
  opt(v, 'hide', bool, at); opt(v, 'lock', bool, at); opt(v, 'motion', motion, at);
}
/** An element's own keys, exactly, and the box every element has (id, place, size, turn, fade, motion). */
function own(v: unknown, at: string, required: string[], optional: string[], inStack: boolean): asserts v is Obj {
  keys(v, at, inStack ? BOX.filter(k => !['x', 'y', 'w'].includes(k)).concat(required) : [...BOX, ...required], [...BOX_OPTIONAL, ...(inStack ? ['w'] : []), ...optional]);
  box(v, at, inStack);
}

function leaf(v: unknown, at: string, inStack: boolean, depth: number) {
  if (!isObj(v)) fail(at);
  const t = (v as Obj).t;
  if (t === 'text') {
    own(v, at, ['words', 'font', 'size', 'color'], ['weight', 'colors', 'align', 'spacing', 'line', 'italic', 'caps', 'shadow', 'stroke', 'underline', 'arc', 'link', 'disc'], inStack);
    words(v.words, `${at}.words`, 600); oneOf(FONTS)(v.font, `${at}.font`); num(v.size, `${at}.size`, 4, 240); color(v.color, `${at}.color`);
    opt(v, 'weight', (n, a) => { num(n, a, 100, 900); if (Number(n) % 100) fail(a); }, at);
    opt(v, 'colors', (list, a) => { if (!Array.isArray(list) || !list.length || list.length > 8) fail(a); (list as unknown[]).forEach((c, i) => color(c, `${a}.${i}`)); }, at);
    opt(v, 'align', oneOf(['left', 'center', 'right']), at); opt(v, 'spacing', (n, a) => num(n, a, -10, 100), at); opt(v, 'line', (n, a) => num(n, a, .6, 3), at);
    opt(v, 'italic', bool, at); opt(v, 'caps', bool, at); opt(v, 'underline', bool, at); opt(v, 'shadow', shadow, at);
    opt(v, 'stroke', (s, a) => { keys(s, a, ['w', 'color']); num(s.w, `${a}.w`, 0, 12); color(s.color, `${a}.color`); }, at);
    opt(v, 'arc', (n, a) => { num(n, a, -2000, 2000); if (Math.abs(Number(n)) < 20) fail(a); }, at); opt(v, 'link', link, at);
    opt(v, 'disc', (d, a) => { keys(d, a, ['fill'], ['edge']); fill(d.fill, `${a}.fill`); opt(d, 'edge', edge, a); }, at);
  } else if (t === 'image') {
    own(v, at, ['src'], ['fit', 'focus', 'mask', 'radius', 'edge', 'shadow', 'gray', 'frame', 'caption', 'link'], inStack);
    source(v.src, `${at}.src`); opt(v, 'fit', oneOf(['cover', 'contain']), at); opt(v, 'focus', focus, at);
    opt(v, 'mask', oneOf(['none', 'circle', 'clover', 'arch', 'blob']), at); opt(v, 'radius', (n, a) => num(n, a, 0, 400), at);
    opt(v, 'edge', edge, at); opt(v, 'shadow', shadow, at); opt(v, 'gray', bool, at); opt(v, 'frame', oneOf(['polaroid', 'gilded']), at);
    opt(v, 'caption', (w, a) => words(w, a, 80), at); opt(v, 'link', link, at);
  } else if (t === 'shape') {
    own(v, at, ['shape'], ['fill', 'edge', 'radius', 'glass', 'shadow', 'link'], inStack);
    oneOf(SHAPES)(v.shape, `${at}.shape`); opt(v, 'fill', fill, at); opt(v, 'edge', edge, at); opt(v, 'radius', (n, a) => num(n, a, 0, 400), at);
    opt(v, 'glass', glass, at); opt(v, 'shadow', shadow, at); opt(v, 'link', link, at);
  } else if (t === 'icon') {
    own(v, at, ['icon'], ['color', 'link'], inStack); oneOf(ICONS)(v.icon, `${at}.icon`); opt(v, 'color', color, at); opt(v, 'link', link, at);
  } else if (t === 'button') {
    own(v, at, ['look', 'label'], ['link', 'wifi', 'icon', 'tag', 'bg', 'fg', 'edge', 'font', 'size', 'shadow', 'weight', 'spacing'], inStack);
    oneOf(BUTTON_LOOKS)(v.look, `${at}.look`); words(v.label, `${at}.label`, 120);
    opt(v, 'link', link, at);
    opt(v, 'wifi', (w, a) => { keys(w, a, ['name'], ['pass']); text(w.name, `${a}.name`, 64); opt(w, 'pass', (p, b) => text(p, b, 64, true), a); }, at);
    // A button goes somewhere: a link, or the shop's wifi. Never both, never neither.
    if (('link' in v) === ('wifi' in v)) fail(`${at}.link`);
    opt(v, 'icon', oneOf(ICONS), at); opt(v, 'tag', (w, a) => words(w, a, 30), at); opt(v, 'bg', fill, at); opt(v, 'fg', color, at); opt(v, 'edge', edge, at);
    opt(v, 'font', oneOf(FONTS), at); opt(v, 'size', (n, a) => num(n, a, 6, 60), at); opt(v, 'shadow', shadow, at);
    opt(v, 'weight', (n, a) => { num(n, a, 100, 900); if (Number(n) % 100) fail(a); }, at); opt(v, 'spacing', (n, a) => num(n, a, -10, 100), at);
  } else if (t === 'google') {
    own(v, at, ['look'], ['bg', 'fg', 'shadow', 'bar', 'ring'], inStack);
    oneOf(GOOGLE_LOOKS)(v.look, `${at}.look`); opt(v, 'bg', fill, at); opt(v, 'fg', color, at); opt(v, 'shadow', oneOf(['soft', 'hard', 'none']), at);
    opt(v, 'bar', color, at); opt(v, 'ring', color, at);
  } else if (t === 'lang') {
    own(v, at, ['look', 'color'], ['bg', 'label'], inStack); oneOf(['select', 'chip'])(v.look, `${at}.look`); color(v.color, `${at}.color`);
    opt(v, 'bg', fill, at); opt(v, 'label', bool, at);
  } else if (t === 'legal') {
    own(v, at, ['color'], ['size'], inStack); color(v.color, `${at}.color`); opt(v, 'size', (n, a) => num(n, a, 8, 20), at);
  } else if (t === 'row' && inStack && depth < 2) {
    keys(v, at, ['id', 't', 'h', 'gap', 'kids'], ['w', 'hide']);
    if (typeof v.id !== 'string' || !ID.test(v.id)) fail(`${at}.id`);
    num(v.h, `${at}.h`, 1, 1000); num(v.gap, `${at}.gap`, 0, 200); opt(v, 'w', (n, a) => num(n, a, 1, ARTBOARD), at); opt(v, 'hide', bool, at);
    const list = v.kids; if (!Array.isArray(list) || !list.length || list.length > 6) fail(`${at}.kids`);
    (list as unknown[]).forEach((kid, i) => { leaf(kid, `${at}.kids.${i}`, true, depth + 1); if (!('w' in (kid as Obj)) || (kid as Obj).t === 'row') fail(`${at}.kids.${i}`); });
  } else fail(`${at}.t`);
}

function kids(list: unknown, at: string, depth: number) {
  if (!Array.isArray(list) || list.length > 24) fail(at);
  (list as unknown[]).forEach((kid, i) => leaf(kid, `${at}.${i}`, true, depth));
}

function element(v: unknown, at: string) {
  if (!isObj(v)) fail(at);
  const t = (v as Obj).t;
  if (t === 'feedback') {
    own(v, at, ['icon', 'color', 'edge'], [], false);
    oneOf(['plane', 'chat', 'mail'])(v.icon, `${at}.icon`); color(v.color, `${at}.color`); color(v.edge, `${at}.edge`);
  } else if (t === 'stack') {
    own(v, at, ['kids', 'gap'], ['pad', 'align', 'panel', 'reveal'], false);
    kids(v.kids, `${at}.kids`, 1); num(v.gap, `${at}.gap`, 0, 200); opt(v, 'pad', (n, a) => num(n, a, 0, 120), at);
    opt(v, 'align', oneOf(['start', 'center', 'end', 'stretch']), at); opt(v, 'panel', panel, at); opt(v, 'reveal', (n, a) => num(n, a, 100, 5000), at);
  } else if (t === 'deck') {
    own(v, at, ['look', 'front', 'cards'], [], false);
    oneOf(DECK_LOOKS)(v.look, `${at}.look`);
    keys(v.front, `${at}.front`, ['kids', 'gap'], ['pad', 'panel', 'tilt']);
    kids(v.front.kids, `${at}.front.kids`, 1); num(v.front.gap, `${at}.front.gap`, 0, 200);
    opt(v.front, 'pad', (n, a) => num(n, a, 0, 120), `${at}.front`); opt(v.front, 'panel', panel, `${at}.front`); opt(v.front, 'tilt', (n, a) => num(n, a, -15, 15), `${at}.front`);
    const cards = v.cards; if (!Array.isArray(cards) || cards.length > 4) fail(`${at}.cards`);
    (cards as unknown[]).forEach((card, i) => {
      const a = `${at}.cards.${i}`; keys(card, a, ['icon', 'label', 'link', 'fill'], ['fg']);
      oneOf(ICONS)(card.icon, `${a}.icon`); words(card.label, `${a}.label`, 40); link(card.link, `${a}.link`); fill(card.fill, `${a}.fill`); opt(card, 'fg', color, a);
    });
  } else leaf(v, at, false, 0);
}

function background(v: unknown, at: string) {
  keys(v, at, [], ['fill', 'src', 'fit', 'focus', 'gray', 'blur', 'dim']);
  opt(v, 'fill', fill, at); opt(v, 'src', source, at); opt(v, 'fit', oneOf(['cover', 'contain']), at); opt(v, 'focus', focus, at);
  opt(v, 'gray', bool, at); opt(v, 'blur', (n, a) => num(n, a, 0, 40), at); opt(v, 'dim', (n, a) => num(n, a, 0, .95), at);
}

/** Every id in the page, stack children included, so the editor can address any element and a page never has two. */
export function* walk(doc: PageDoc) {
  for (const section of doc.sections) for (const el of section.els) {
    yield el;
    if (el.t === 'stack') for (const kid of el.kids) { yield kid; if (kid.t === 'row') yield* kid.kids; }
    if (el.t === 'deck') for (const kid of el.front.kids) { yield kid; if (kid.t === 'row') yield* kid.kids; }
  }
}

/** The page as stored: the same object, deep-copied, or an error naming where it went wrong. */
export function validateDoc(value: unknown): PageDoc {
  keys(value, 'doc', ['v', 'sections'], ['backdrop', 'band', 'fx']);
  if (value.v !== 1) fail('doc.v');
  opt(value, 'backdrop', background, 'doc');
  opt(value, 'band', (b, a) => { keys(b, a, ['x', 'w', 'fill'], ['blur']); num(b.x, `${a}.x`, -100, ARTBOARD); num(b.w, `${a}.w`, 1, ARTBOARD + 200); fill(b.fill, `${a}.fill`);
    opt(b, 'blur', (n, c) => num(n, c, 0, 40), a); }, 'doc');
  opt(value, 'fx', (f, a) => { keys(f, a, [], ['hint', 'thanks']); opt(f, 'hint', (n, b) => num(n, b, 500, 20000), a);
    opt(f, 'thanks', (n, b) => { num(n, b, 1, 4); if (!Number.isInteger(n)) fail(b); }, a); }, 'doc');
  const sections = value.sections;
  if (!Array.isArray(sections) || !sections.length || sections.length > MAX_SECTIONS) fail('doc.sections');
  (sections as unknown[]).forEach((section, i) => {
    const at = `doc.sections.${i}`;
    keys(section, at, ['id', 'h', 'els'], ['name', 'bg']);
    if (typeof section.id !== 'string' || !ID.test(section.id)) fail(`${at}.id`);
    num(section.h, `${at}.h`, 120, MAX_SECTION_H); opt(section, 'name', (n, a) => text(n, a, 40), at); opt(section, 'bg', background, at);
    if (!Array.isArray(section.els) || section.els.length > MAX_ELEMENTS) fail(`${at}.els`);
    (section.els as unknown[]).forEach((el, j) => element(el, `${at}.els.${j}`));
  });
  const doc = structuredClone(value) as PageDoc;
  const ids = new Set<string>(); let count = 0;
  for (const el of walk(doc)) { if (ids.has(el.id)) fail(`doc#${el.id}`); ids.add(el.id); count++; }
  if (count > MAX_ELEMENTS * 2) fail('doc.sections');
  if (new Set(doc.sections.map(s => s.id)).size !== doc.sections.length) fail('doc.sections');
  return doc;
}
