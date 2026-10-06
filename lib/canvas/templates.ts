import type { PageDoc } from './doc';
import type { Knobs } from './knobs';
import { CANVAS_TEMPLATES } from './templates.generated';
import { PublishingError, validateConfig, type PageConfig } from '../publishing/config';

/**
 * Template canvas của nền tảng (đợt ②): mỗi template là `templates/<khoá>/template.json` — tên, số thứ tự, nhóm trong Library,
 * một câu mô tả, và tài liệu trang (doc.ts) mà trang mới bắt đầu từ đó. `node scripts/templates.mjs` sinh danh sách; không nơi
 * nào khác liệt kê template. Trang tạo từ template là bản sao của tài liệu: sửa trang không đổi template, và ngược lại.
 */
/** `knobs`: what Bàn dựng may turn without redrawing the page (knobs.ts); the templates made before 06/10 have none. */
export type CanvasTemplate = { key: string; number: number; name: string; groups: string[]; about: string; doc: PageDoc; knobs?: Knobs };
export { CANVAS_TEMPLATES };
export const canvasTemplate = (key: unknown) => typeof key === 'string' ? CANVAS_TEMPLATES.find(t => t.key === key) ?? null : null;
/** What a list of templates shows (the Library, the gallery, the landing): everything but the document itself. */
export type TemplateCard = Omit<CanvasTemplate, 'doc' | 'knobs'>;
export const templateCards = (): TemplateCard[] => CANVAS_TEMPLATES.map(t => ({ key: t.key, number: t.number, name: t.name, groups: t.groups, about: t.about }));
/** The groups the Library offers, in the order Tài listed them (kịch bản mục 8), then any a template adds. */
export const TEMPLATE_GROUPS = [...new Set(['Only Poster', 'Only Background', 'Interactive cards', 'Simple', 'Không gian thực', 'Tối giản', 'Trong suốt', 'Thuỷ tinh',
  ...CANVAS_TEMPLATES.flatMap(t => t.groups)])];

/** The template a page starts from when none is named: the plainest one (templates/basic-1). */
export const DEFAULT_TEMPLATE = 'basic-1';

/**
 * A new page from a template: a copy of its document, named after the shop. The elements marked as the shop's places (doc.ts
 * SLOTS) keep the template's samples -- "Tên Quán", a bare link to Zalo -- because the shop's data goes into them each time the
 * page is shown (slots.ts bindShop), never into the stored page: a shop renamed, or its Zalo changed, is right on every page.
 */
export function pageFromTemplate(key: string, name: string): PageConfig {
  const template = canvasTemplate(key);
  if (!template) throw new PublishingError('INVALID_TEMPLATE');
  return validateConfig({ schemaVersion: 4, name: name.trim(), doc: structuredClone(template.doc) });
}
