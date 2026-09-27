import { validateConfig, defaultConfig, type PageConfig } from './config';
import { SETTING_KEY, type SettingField } from './settings';
import type { TemplateRelease } from './versions';

/**
 * Gói template (lát M1, 27/09; `docs/kien-truc-nen-tang.md` mục 3). Mỗi template là một thư mục `templates/<khoá>/`:
 * `manifest.json` (tệp này mô tả hình dạng của nó) và một tệp CSS cho mỗi bản, `v<bản>.css`, đóng băng khi đã phát hành.
 * `node scripts/templates.mjs` đọc các thư mục và sinh `lib/publishing/templates.generated.ts` cùng
 * `components/guest-styles.ts`; không nơi nào khác trong mã liệt kê template. Designer thêm hay sửa template mà không đụng TypeScript.
 *
 * - `key`: tên thư mục, chữ thường và gạch nối; không bao giờ đổi, vì bản phát hành của shop ghim theo nó.
 * - `number`, `name`: hiện cho chủ quán là "<số> · <tên>"; `number` cũng là thứ tự trong mọi danh sách.
 * - `pricePerMonth`: giá mỗi trang mỗi tháng, đồng (`pricing.ts`); 0 là miễn phí và không chiếm suất miễn phí.
 * - `page`: khung trắng trang mới bắt đầu, đè lên trang mặc định. Chỉ bố cục, nền, watermark và `links: []` — không bao
 *   giờ là nội dung của ai (DESIGN.md mục 8).
 * - `effects`: hiệu ứng nền tảng template dùng; mỗi hiệu ứng là một module trong `components/effects/` (lát M2).
 * - `versions`: cũ nhất trước; ngày, ghi chú cho chủ quán, và bảng ô được chỉnh (`settings.ts`).
 */
export type TemplateEffects = {
  /** Template 6: lớp sương 300 ms trước khi sang Google, Google mở cùng tab (thiet-ke-va-template.md mục 12). */
  leaveTransitionMs?: number;
  /** Template 3: kính khúc xạ (thiet-ke-va-template.md mục 15). */
  glass?: boolean;
  /** Template 6: nút Google dạng hạt ngọc, chữ chạy vòng quanh. */
  googleButton?: 'orb';
  /**
   * Lời cảm ơn của quán, tim bung, đếm ngược rồi Google mở ở tab mới (Tài 27/09; components/effects/thanks.tsx). At most 4:
   * a browser lets a page open a tab only while the tap is fresh, about five seconds in Chromium.
   */
  thankYouSeconds?: number;
};
export type TemplatePage = Partial<Pick<PageConfig, 'layout' | 'background' | 'watermark'>> & { links?: [] };
export type TemplateManifest = {
  key: string; number: number; name: string; pricePerMonth: number;
  page: TemplatePage; effects: TemplateEffects; versions: readonly TemplateRelease[];
};

const PAGE_KEYS = ['layout', 'background', 'watermark', 'links'];
const EFFECT_KEYS = ['leaveTransitionMs', 'glass', 'googleButton', 'thankYouSeconds'];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The template's starting page: the built-in default page, with what the manifest's `page` says on top. */
export const startingPage = (manifest: Pick<TemplateManifest, 'page'>): PageConfig =>
  validateConfig({ ...defaultConfig('YOUR SHOP'), ...structuredClone(manifest.page) });

/**
 * Every problem with one manifest, in words a designer can act on; empty when it is sound. `folder` is the directory
 * it was read from and `stylesheets` the `v<n>.css` files beside it. Run by the contract test on every package.
 */
export function manifestProblems(value: unknown, folder: string, stylesheets: readonly string[]): string[] {
  const problems: string[] = [], say = (text: string) => { problems.push(`${folder}: ${text}`); };
  if (!object(value)) return [`${folder}: manifest.json không phải một object`];
  const known = ['key', 'number', 'name', 'pricePerMonth', 'page', 'effects', 'versions'];
  for (const key of Object.keys(value)) if (!known.includes(key)) say(`trường lạ "${key}"`);
  if (value.key !== folder) say(`"key" phải trùng tên thư mục (${folder})`);
  if (typeof value.key !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(value.key)) say('"key" chỉ gồm chữ thường, số, gạch nối');
  if (!Number.isInteger(value.number) || Number(value.number) < 1) say('"number" là số nguyên từ 1');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 40) say('"name" từ 1 tới 40 ký tự');
  if (!Number.isInteger(value.pricePerMonth) || Number(value.pricePerMonth) < 0) say('"pricePerMonth" là số đồng, nguyên, không âm');
  if (!object(value.page)) say('"page" phải là object');
  else {
    for (const key of Object.keys(value.page)) if (!PAGE_KEYS.includes(key)) say(`"page" chỉ nhận ${PAGE_KEYS.join(', ')}; "${key}" là nội dung của trang, không của template`);
    if ('links' in value.page && !(Array.isArray(value.page.links) && value.page.links.length === 0)) say('"page.links" chỉ được là []');
    try { startingPage({ page: value.page as TemplatePage }); } catch { say('"page" không tạo được một trang hợp lệ'); }
  }
  if (!object(value.effects)) say('"effects" phải là object ({} khi không dùng)');
  else {
    for (const key of Object.keys(value.effects)) if (!EFFECT_KEYS.includes(key)) say(`hiệu ứng lạ "${key}"`);
    const e = value.effects;
    if ('leaveTransitionMs' in e && !(Number.isInteger(e.leaveTransitionMs) && Number(e.leaveTransitionMs) > 0 && Number(e.leaveTransitionMs) <= 300))
      say('"leaveTransitionMs" từ 1 tới 300 (thiet-ke-va-template.md mục 12, ranh giới 2)');
    if ('glass' in e && e.glass !== true) say('"glass" chỉ ghi khi là true');
    if ('googleButton' in e && e.googleButton !== 'orb') say('"googleButton" chỉ nhận "orb"');
    if ('thankYouSeconds' in e && !(Number.isInteger(e.thankYouSeconds) && Number(e.thankYouSeconds) >= 1 && Number(e.thankYouSeconds) <= 4))
      say('"thankYouSeconds" từ 1 tới 4 (trình duyệt chỉ cho mở tab mới trong khoảng 5 giây sau cú chạm)');
    if ('thankYouSeconds' in e && 'leaveTransitionMs' in e) say('"thankYouSeconds" và "leaveTransitionMs" là hai cách rời trang — chỉ chọn một');
  }
  const versions = Array.isArray(value.versions) ? value.versions as unknown[] : null;
  if (!versions?.length) say('"versions" cần ít nhất một bản');
  else versions.forEach((release, i) => {
    const at = `bản ${i + 1}`;
    if (!object(release)) return say(`${at} phải là object`);
    if (release.version !== i + 1) say(`${at}: "version" phải là ${i + 1} (đánh số liền, cũ nhất trước)`);
    if (typeof release.date !== 'string' || !/^2\d{3}-\d{2}-\d{2}$/.test(release.date)) say(`${at}: "date" dạng YYYY-MM-DD`);
    else if (i > 0 && String((versions[i - 1] as Record<string, unknown>).date) > release.date) say(`${at}: ngày không được sớm hơn bản trước`);
    if (typeof release.notes !== 'string' || release.notes.trim().length <= 10) say(`${at}: "notes" viết cho chủ quán, hơn 10 ký tự`);
    if (!Array.isArray(release.settings)) say(`${at}: "settings" là danh sách ([] khi không mở ô nào)`);
    else for (const field of release.settings as SettingField[]) if ('key' in field && !SETTING_KEY.test(field.key)) say(`${at}: khoá ô "${field.key}" không hợp lệ`);
    if (!stylesheets.includes(`v${i + 1}.css`)) say(`${at}: thiếu tệp v${i + 1}.css`);
  });
  for (const file of stylesheets) if (!versions?.some((_, i) => file === `v${i + 1}.css`)) say(`tệp ${file} không thuộc bản nào`);
  return problems;
}
