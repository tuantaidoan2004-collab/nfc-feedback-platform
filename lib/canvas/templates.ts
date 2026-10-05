import type { PageDoc, TextEl } from './doc';
import { CANVAS_TEMPLATES } from './templates.generated';
import { PublishingError, validateConfig, type PageConfig } from '../publishing/config';

/**
 * Template canvas của nền tảng (đợt ②): mỗi template là `templates/<khoá>/template.json` — tên, số thứ tự, nhóm trong Library,
 * một câu mô tả, và tài liệu trang (doc.ts) mà trang mới bắt đầu từ đó. `node scripts/templates.mjs` sinh danh sách; không nơi
 * nào khác liệt kê template. Trang tạo từ template là bản sao của tài liệu: sửa trang không đổi template, và ngược lại.
 */
export type CanvasTemplate = { key: string; number: number; name: string; groups: string[]; about: string; doc: PageDoc };
export { CANVAS_TEMPLATES };
export const canvasTemplate = (key: unknown) => typeof key === 'string' ? CANVAS_TEMPLATES.find(t => t.key === key) ?? null : null;
/** What a list of templates shows (the Library, the gallery, the landing): everything but the document itself. */
export type TemplateCard = Omit<CanvasTemplate, 'doc'>;
export const templateCards = (): TemplateCard[] => CANVAS_TEMPLATES.map(t => ({ key: t.key, number: t.number, name: t.name, groups: t.groups, about: t.about }));
/** The groups the Library offers, in the order Tài listed them (kịch bản mục 8), then any a template adds. */
export const TEMPLATE_GROUPS = [...new Set(['Only Poster', 'Only Background', 'Interactive cards', 'Simple', 'Không gian thực', 'Tối giản', 'Trong suốt', 'Thuỷ tinh',
  ...CANVAS_TEMPLATES.flatMap(t => t.groups)])];

/** The template a page starts from when none is named: the plainest one (templates/basic-1). */
export const DEFAULT_TEMPLATE = 'basic-1';

/** A line's width in ems, roughly: wide and narrow letters apart, accents ignored. Only ever compared with another line's. */
function ems(line: string) {
  let width = 0;
  for (const ch of line.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) {
    width += ch === ' ' ? .28 : /[mwMW@]/.test(ch) ? .86 : /[iljtfrI1.,'|!:;]/.test(ch) ? .32 : /[A-Z0-9#&%]/.test(ch) ? .68 : .54;
  }
  return width;
}
/**
 * The size at which `name` fits where the template's placeholder sat (Tài 05/10: "Tên quán" là chỗ của tên thật), so a long
 * name shrinks instead of spilling out of its frame. A line holds what the placeholder's longest line took, or most of the
 * box's width when that is more; a placeholder over several lines lends the name its lines.
 */
function fittedSize(placeholder: string, name: string, size: number, width: number) {
  const lines = placeholder.split('\n'), room = Math.max(Math.max(...lines.map(ems)) * size, width * .9), wanted = ems(name) * size;
  if (wanted <= room) return size;
  if (lines.length > 1 && wanted <= room * lines.length * .85) return size;
  const scale = Math.max(.45, (lines.length > 1 ? room * lines.length * .85 : room * .97) / wanted);
  return Math.round(size * scale * 10) / 10;
}

/**
 * A new page from a template, carrying the shop's name: a template marks where the name goes with the element id `ten-quan`
 * (or `ten-quan-<anything>` for a second place, a signature), and `chu-dau` for an avatar initial, so "Tên quán" becomes
 * the shop's own name from the first moment. A placeholder written in capitals keeps the name in capitals; a name longer than
 * the placeholder gets smaller letters, so it stays inside the template's frame.
 */
export function pageFromTemplate(key: string, name: string): PageConfig {
  const template = canvasTemplate(key);
  if (!template) throw new PublishingError('INVALID_TEMPLATE');
  const doc = structuredClone(template.doc), clean = name.trim();
  const fill = (el: { t: string; id: string }, width: number) => {
    if (el.t !== 'text') return;
    const text = el as TextEl, capitals = text.words.vi === text.words.vi.toLocaleUpperCase('vi');
    if (text.id === 'ten-quan' || text.id.startsWith('ten-quan-')) {
      const shown = capitals || text.caps ? clean.toLocaleUpperCase('vi') : clean;
      text.size = fittedSize(text.caps ? text.words.vi.toLocaleUpperCase('vi') : text.words.vi, shown, text.size, width);
      text.words = { vi: capitals ? shown : clean };
    }
    if (text.id === 'chu-dau') text.words = { vi: Array.from(clean)[0]?.toLocaleUpperCase('vi') ?? 'Q' };
  };
  // Each text with the width it really has: its own, or inside a stack (or a deck's front card) the column's.
  for (const section of doc.sections) for (const el of section.els) {
    fill(el, el.w);
    const column = el.t === 'stack' ? { kids: el.kids, inner: el.w - 2 * (el.pad ?? 0) } : el.t === 'deck' ? { kids: el.front.kids, inner: el.w - 2 * (el.front.pad ?? 0) } : null;
    for (const kid of column?.kids ?? []) {
      fill(kid, Math.min(kid.w ?? column!.inner, column!.inner));
      if (kid.t === 'row') for (const c of kid.kids) fill(c, c.w);
    }
  }
  return validateConfig({ schemaVersion: 4, name: clean, doc });
}
