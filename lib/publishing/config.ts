import type { PageDoc } from '../canvas/doc';
import { CanvasError, validateDoc } from '../canvas/validate';

/**
 * Một trang như được lưu trong bản nháp và bản phát hành (đợt ②, 05/10): tên của trang (tiêu đề tab, danh sách trang) và tài
 * liệu canvas của nó (lib/canvas/doc.ts). Thay hẳn cấu hình cũ (schemaVersion 1–3: khung cố định + lớp da CSS theo template);
 * trang khách vẽ từ tài liệu này. Link đánh giá Google không nằm trong trang: nút Google luôn dùng link của quán (Place ID).
 */
export type PageConfig = { schemaVersion: 4; name: string; doc: PageDoc };
export class PublishingError extends Error { constructor(public readonly code: string) { super(code); } }

const NAME = /[\u0000-\u001f\u007f<>]/;
export function validateConfig(value: unknown): PageConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PublishingError('INVALID_CONFIG');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join() !== 'doc,name,schemaVersion' || v.schemaVersion !== 4) throw new PublishingError('INVALID_CONFIG');
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 100 || NAME.test(v.name)) throw new PublishingError('INVALID_CONFIG');
  try { return { schemaVersion: 4, name: v.name.trim(), doc: validateDoc(v.doc) }; }
  catch (error) { if (error instanceof CanvasError) throw new PublishingError('INVALID_CONFIG'); throw error; }
}

/** The row every template version gets in `template_versions` (its columns predate the canvas and stay as they were). */
export const TEMPLATE_ROW = { schemaVersion: 1, rendererVersion: '1', capabilities: ['canvas', 'google-invariant', 'vi-en'] } as const;
