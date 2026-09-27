import { EVERY_BUILT_IN, type SettingField } from './settings';

/**
 * Bản khuôn (Tài giao Claude quyết, 24/09; `docs/thiet-ke-va-khuon.md` mục 16).
 *
 * Mỗi khuôn có số bản riêng, số nguyên từ 1. Bản phát hành của shop ghim một bản (`page_releases.template_version_id`),
 * và trang khách vẽ đúng bản đó: CSS của nó nằm trong `templates/<khoá>/v<bản>.css`, tệp đóng băng, mã băm giữ
 * trong `tests/contracts/skin.spec.ts`. Đổi diện mạo = thêm một bản vào `manifest.json` của gói và một tệp mới; shop đang chạy **không đổi**
 * cho tới khi chủ quán tự chuyển bản nháp sang bản mới, xem trước, rồi phát hành.
 *
 * Sửa lỗi, bảo mật, luật Google **không** thành bản mới: chúng sửa thẳng tệp của mọi bản đang chạy (và ghi lại mã băm),
 * vì không shop nào được chọn ở lại với một trang lỗi hay trái luật Google.
 */
/** `settings`: what the owner may adjust on this version (settings.ts). Part of the version, frozen with its stylesheet. */
export type TemplateRelease = { version: number; date: string; notes: string; settings: readonly SettingField[] };

/** The table of one version; a template the platform does not ship keeps every built-in control, as before P2. */
export function settingsOf(releases: Record<string, readonly TemplateRelease[] | undefined>, key: string, version: number): readonly SettingField[] {
  const shipped = releases[key];
  if (!shipped) return EVERY_BUILT_IN;
  return shipped.find(release => release.version === version)?.settings ?? [];
}
