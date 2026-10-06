import type { PageDoc, Words } from './doc';
import { COLOR, sourceProblem, walk } from './validate';

/**
 * Núm của mẫu (Tài 06/10, kịch bản 9b): những gì khách hay muốn đổi, gom thành vài nút vặn để Bàn dựng (và sau này chính khách)
 * đổi được mà không vẽ lại trang.
 *   palettes  bảng màu có tên, cùng số màu; bảng đầu là màu tài liệu đang dùng. Đổi bảng = thay từng màu theo vị trí, ở mọi chỗ
 *             trong tài liệu (giữ độ trong của màu #rrggbbaa). Màu không có trong bảng (trắng, bóng đổ) giữ nguyên.
 *   photos    ảnh của quán: id các phần tử ảnh nhận ảnh quán tải lên.
 *   texts     chữ của quán ngoài tên (câu chào): id các phần tử chữ.
 * Núm chỉ đổi màu, nguồn ảnh, điểm giữ ảnh và chữ — không đổi vị trí hay cỡ — nên mọi luật đã kiểm trên mẫu (nút Google trong
 * màn hình đầu) vẫn đúng sau khi vặn; trang vẫn qua đủ chốt chặn khi phát hành.
 */
export type Palette = { name: string; colors: string[] };
export type Knobs = { palettes: Palette[]; photos: { id: string; name: string }[]; texts: { id: string; name: string }[] };
/** What has been turned: the palette's index, a picture per photo id, words per text id. */
export type Choice = { palette?: number; photos?: Record<string, { src: string; focus?: [number, number] }>; texts?: Record<string, Words> };

const base = (color: string) => color.slice(0, 7).toLowerCase();
const alpha = (color: string) => color.length === 9 ? color.slice(7) : '';

/** Checks a template's knobs against its document: every colour of the first palette used, every id the right kind. */
export function knobsProblem(knobs: Knobs, doc: PageDoc): string | null {
  if (!knobs.palettes.length) return 'palettes trống';
  const size = knobs.palettes[0].colors.length, used = new Set<string>();
  for (const color of colorsOf(doc)) used.add(base(color));
  for (const [i, palette] of knobs.palettes.entries()) {
    if (!palette.name.trim()) return `palettes.${i}.name`;
    if (palette.colors.length !== size) return `palettes.${i}: phải có ${size} màu`;
    for (const color of palette.colors) if (!/^#[0-9a-fA-F]{6}$/.test(color)) return `palettes.${i}: ${color} phải dạng #rrggbb`;
    if (new Set(palette.colors.map(base)).size !== size) return `palettes.${i}: hai màu trùng`;
  }
  for (const color of knobs.palettes[0].colors) if (!used.has(base(color))) return `màu ${color} của bảng đầu không có trong tài liệu`;
  const kinds = new Map([...walk(doc)].map(el => [el.id, el.t]));
  for (const { id } of knobs.photos) if (kinds.get(id) !== 'image') return `photos: #${id} không phải ảnh`;
  for (const { id } of knobs.texts) if (kinds.get(id) !== 'text') return `texts: #${id} không phải chữ`;
  return null;
}

/** Every colour written in the document, wherever it sits. */
function colorsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') { if (COLOR.test(value) && value.length !== 4) out.push(value); }
  else if (Array.isArray(value)) for (const item of value) colorsOf(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) colorsOf(item, out);
  return out;
}
function recolor<T>(value: T, map: Map<string, string>): T {
  if (typeof value === 'string') return (COLOR.test(value) && map.has(base(value)) ? map.get(base(value))! + alpha(value) : value) as T;
  if (Array.isArray(value)) return value.map(item => recolor(item, map)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, recolor(v, map)])) as T;
  return value;
}

/**
 * The document with the knobs turned from `from` to `to`. It works on the page as it stands, not on the template, so what was
 * changed by hand outside the knobs (Claude's edits) survives a later turn of a knob.
 */
export function turnKnobs(doc: PageDoc, knobs: Knobs, from: Choice, to: Choice): PageDoc {
  const was = knobs.palettes[from.palette ?? 0], next = knobs.palettes[to.palette ?? 0];
  if (!was || !next) throw new Error('KNOB_PALETTE');
  const out = was === next ? structuredClone(doc) : recolor(doc, new Map(was.colors.map((c, i) => [base(c), next.colors[i].toLowerCase()])));
  for (const el of walk(out)) {
    const photo = to.photos?.[el.id];
    if (photo && el.t === 'image' && knobs.photos.some(p => p.id === el.id)) {
      if (sourceProblem(photo.src)) throw new Error('KNOB_PHOTO');
      el.src = photo.src; if (photo.focus) el.focus = photo.focus; else delete el.focus;
    }
    const words = to.texts?.[el.id];
    if (words && el.t === 'text' && knobs.texts.some(t => t.id === el.id)) el.words = words;
  }
  return out;
}

