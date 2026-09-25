import { PublishingError, type PageConfig } from './config';

/**
 * Bảng cài đặt của một bản khuôn (lát P2, `docs/goi-va-trang.md` mục 2). Trình chỉnh không biết khuôn nào có gì: nó
 * đọc bảng này và vẽ ô. Hai loại ô:
 *
 * - **Ô có sẵn** của trình chỉnh, trỏ vào phần diện mạo đã có trong `PageConfig`: bố cục, nền (kèm những kiểu nền khuôn
 *   nhận), watermark, nút góp ý. Khuôn không mở ô nào thì chủ quán không đổi được phần đó — server từ chối.
 * - **Ô chung** do khuôn tự khai: màu, thanh kéo, lựa chọn, bật/tắt. Giá trị nằm ở `config.settings[key]`; trang khách
 *   đưa màu và số thành biến CSS `--s-<key>`, lựa chọn và bật/tắt thành thuộc tính `data-s-<key>` trên trang, để tệp CSS
 *   của đúng bản khuôn đó đọc. Thêm một ô chung vào bản mới không cần sửa dashboard.
 *
 * Nội dung (tên, link Google, câu hỏi, nút link, logo, poster) không nằm trong bảng: nó là của trang, khuôn nào cũng
 * có. Luật Google không đi qua đây: ô không bao giờ chạm nút Google (test hợp đồng của skin).
 */
export type BackgroundKind = PageConfig['background']['kind'];
export type SettingField =
  | { kind: 'layout' }
  | { kind: 'background'; allow: readonly BackgroundKind[] }
  | { kind: 'watermark' }
  | { kind: 'feedbackButton' }
  | { kind: 'color'; key: string; label: string; default: string }
  | { kind: 'range'; key: string; label: string; min: number; max: number; step: number; default: number }
  | { kind: 'choice'; key: string; label: string; options: readonly { value: string; label: string }[]; default: string }
  | { kind: 'toggle'; key: string; label: string; default: boolean };
export type SettingValue = string | number | boolean;
export type Settings = Record<string, SettingValue>;
type OwnField = Extract<SettingField, { key: string }>;
export const BUILT_IN = ['layout', 'background', 'watermark', 'feedbackButton'] as const;
/** A template the platform does not ship (older test fixtures) keeps every built-in control, as before P2. */
export const EVERY_BUILT_IN: readonly SettingField[] = [{ kind: 'layout' }, { kind: 'background', allow: ['solid', 'gradient', 'media'] }, { kind: 'watermark' }, { kind: 'feedbackButton' }];

const invalid = (): never => { throw new PublishingError('INVALID_SETTING'); };
const own = (fields: readonly SettingField[]) => fields.filter((field): field is OwnField => 'key' in field);
export const SETTING_KEY = /^[a-z][a-z0-9-]{0,31}$/;

/** Whether `value` is a valid value for `field`. */
export function fits(field: OwnField, value: unknown): value is SettingValue {
  if (field.kind === 'color') return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
  if (field.kind === 'range') return typeof value === 'number' && Number.isFinite(value) && value >= field.min && value <= field.max
    && Math.abs(Math.round((value - field.min) / field.step) * field.step - (value - field.min)) < 1e-9;
  if (field.kind === 'choice') return typeof value === 'string' && field.options.some(option => option.value === value);
  return typeof value === 'boolean';
}

/** Every stored value is a field of this version and fits it. Missing values are fine: the CSS carries the default. */
export function checkSettings(fields: readonly SettingField[], settings: Settings | undefined) {
  const declared = new Map(own(fields).map(field => [field.key, field]));
  for (const [key, value] of Object.entries(settings ?? {})) { const field = declared.get(key); if (!field || !fits(field, value)) invalid(); }
}

/**
 * Settings carried onto another version (the shop moved its draft, versions.ts): a value the new version still has and
 * still accepts stays; every other field of the new version starts at its default; the rest is dropped.
 */
export function convertSettings(fields: readonly SettingField[], settings: Settings | undefined): Settings | undefined {
  const next: Settings = {};
  for (const field of own(fields)) next[field.key] = settings && fits(field, settings[field.key]) ? settings[field.key] : field.default;
  return Object.keys(next).length ? next : undefined;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/**
 * The owner's door (lib/owner/design.ts): the first built-in control this save changes although the template does not
 * offer it, or a background of a kind the template does not take. A value that was already there stays, so a page
 * made before its template's table cannot be locked out of saving its content.
 */
export function lockedChange(fields: readonly SettingField[], before: PageConfig, after: PageConfig): string | null {
  const open = new Set(fields.map(field => field.kind));
  if (!open.has('layout') && after.layout !== before.layout) return 'layout';
  if (!same(after.background, before.background)) {
    const background = fields.find((field): field is Extract<SettingField, { kind: 'background' }> => field.kind === 'background');
    if (!background || !background.allow.includes(after.background.kind)) return 'background';
  }
  if (!open.has('watermark') && after.watermark.enabled !== before.watermark.enabled) return 'watermark';
  if (!open.has('feedbackButton') && !same(after.feedbackButton, before.feedbackButton)) return 'feedbackButton';
  return null;
}

/**
 * What the guest page puts on its page element for a template's own fields: colours and numbers as CSS custom
 * properties, choices and switches as data attributes. Values were checked where they were written and again by
 * `validateConfig` on the way out, so every key and value here is already a safe token.
 */
export function settingsOnPage(settings: Settings | undefined) {
  const style: Record<string, string> = {}, attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings ?? {})) {
    if (typeof value === 'number' || (typeof value === 'string' && value.startsWith('#'))) style[`--s-${key}`] = String(value);
    else if (value === true) attributes[`data-s-${key}`] = '';
    else if (typeof value === 'string') attributes[`data-s-${key}`] = value;
  }
  return { style, attributes };
}
