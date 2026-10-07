import type { PageDoc } from './doc';
import type { Knobs } from './knobs';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANVAS_TEMPLATES as LIBRARY } from './templates.generated';
import { START_DOC } from './start-page';
import { PublishingError, validateConfig, type PageConfig } from '../publishing/config';

/**
 * Template canvas của nền tảng (đợt ②): mỗi template là `templates/<khoá>/template.json` — tên, số thứ tự, nhóm trong Library,
 * một câu mô tả, và tài liệu trang (doc.ts) mà trang mới bắt đầu từ đó. `node scripts/templates.mjs` sinh danh sách; không nơi
 * nào khác liệt kê template. Trang tạo từ template là bản sao của tài liệu: sửa trang không đổi template, và ngược lại.
 */
/** `knobs`: what Bàn dựng may turn without redrawing the page (knobs.ts); the templates made before 06/10 have none. */
export type CanvasTemplate = { key: string; number: number; name: string; groups: string[]; about: string; doc: PageDoc; knobs?: Knobs };
/**
 * Mẫu cho test (Tài 06/10 xoá hết mẫu khỏi thư viện thật): the test runners point `NFC_TEMPLATE_DIR` at tests/fixtures/templates —
 * the deleted templates, kept as fixtures so the rules of slots, knobs, decks and the Google button are still tested on real
 * documents. Production never sets it, so its library is exactly templates/.
 */
function fixtures(): CanvasTemplate[] {
  const dir = process.env.NFC_TEMPLATE_DIR;
  if (!dir) return [];
  return readdirSync(dir).filter(file => file.endsWith('.json')).sort().map(file => JSON.parse(readFileSync(join(dir, file), 'utf8')) as CanvasTemplate);
}
export const CANVAS_TEMPLATES: readonly CanvasTemplate[] = [...LIBRARY, ...fixtures()].sort((a, b) => a.number - b.number);
export const canvasTemplate = (key: unknown) => typeof key === 'string' ? CANVAS_TEMPLATES.find(t => t.key === key) ?? null : null;
/** What a list of templates shows (the Library, the gallery, the landing): everything but the document itself. */
export type TemplateCard = Omit<CanvasTemplate, 'doc' | 'knobs'>;
export const templateCards = (): TemplateCard[] => CANVAS_TEMPLATES.map(t => ({ key: t.key, number: t.number, name: t.name, groups: t.groups, about: t.about }));
/** The groups the Library offers, in the order Tài listed them (kịch bản mục 8), then any a template adds. */
export const TEMPLATE_GROUPS = [...new Set(['Only Poster', 'Only Background', 'Interactive cards', 'Simple', 'Không gian thực', 'Tối giản', 'Trong suốt', 'Thuỷ tinh',
  ...CANVAS_TEMPLATES.flatMap(t => t.groups)])];

/**
 * What a new shop's first page starts from: the hidden start page (start-page.ts), not a template in the library (Tài 06/10:
 * every old template deleted). Its `template_versions` row carries this key; nothing in the library may take it.
 */
export const DEFAULT_TEMPLATE = 'trang-dau';
const START: CanvasTemplate = { key: DEFAULT_TEMPLATE, number: 0, name: 'Trang đầu', groups: [], about: 'Tên quán, nút Google, máy bay giấy góp ý.', doc: START_DOC };
/** A template a page may be made from: one in the library, or the hidden start page. */
export const pageTemplate = (key: unknown) => key === DEFAULT_TEMPLATE ? START : canvasTemplate(key);

/**
 * A new page from a template: a copy of its document, named after the shop. The elements marked as the shop's places (doc.ts
 * SLOTS) keep the template's samples -- "Tên Quán", a bare link to Zalo -- because the shop's data goes into them each time the
 * page is shown (slots.ts bindShop), never into the stored page: a shop renamed, or its Zalo changed, is right on every page.
 */
export function pageFromTemplate(key: string, name: string): PageConfig {
  const template = pageTemplate(key);
  if (!template) throw new PublishingError('INVALID_TEMPLATE');
  return validateConfig({ schemaVersion: 4, name: name.trim(), doc: structuredClone(template.doc) });
}
