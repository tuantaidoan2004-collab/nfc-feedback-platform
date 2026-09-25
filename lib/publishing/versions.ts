import type { TemplateKey } from './config';
import { EVERY_BUILT_IN, type SettingField } from './settings';

/**
 * Bản khuôn (Tài giao Claude quyết, 24/09; `docs/thiet-ke-va-khuon.md` mục 16).
 *
 * Mỗi khuôn có số bản riêng, số nguyên từ 1. Bản phát hành của shop ghim một bản (`page_releases.template_version_id`),
 * và trang khách vẽ đúng bản đó: CSS của nó nằm trong `components/skins/<khoá>.v<bản>.css`, tệp đóng băng, mã băm giữ
 * trong `tests/contracts/skin.spec.ts`. Đổi diện mạo = thêm một bản ở đây và một tệp mới; shop đang chạy **không đổi**
 * cho tới khi chủ quán tự chuyển bản nháp sang bản mới, xem trước, rồi phát hành.
 *
 * Sửa lỗi, bảo mật, luật Google **không** thành bản mới: chúng sửa thẳng tệp của mọi bản đang chạy (và ghi lại mã băm),
 * vì không shop nào được chọn ở lại với một trang lỗi hay trái luật Google.
 */
/** `settings`: what the owner may adjust on this version (settings.ts). Part of the version, frozen with its stylesheet. */
export type TemplateRelease = { version: number; date: string; notes: string; settings: readonly SettingField[] };

export const TEMPLATE_NAMES: Record<TemplateKey, string> = { standard: '1 · Bản gốc', minimal: '2 · Tối giản', glass: '3 · Kính',
  deco: '4 · Chồng thẻ', spotlight: '5 · Ánh sáng tụ', 'big-button': '6 · Nút lớn' };

/**
 * Cũ nhất trước. Ghi chú viết cho chủ quán đọc: bản này khác bản trước ở chỗ nào họ nhìn thấy được.
 *
 * Bản 1 mở đúng những ô mà thiết kế của nó thật sự dùng (P2, 25/09):
 * - khuôn 1 vẽ thẻ trôi trên nền của shop, nên nhận mọi kiểu nền và watermark;
 * - khuôn 3 tự vẽ cảnh kính từ hai màu nền, nên chỉ nhận nền một màu hoặc chuyển màu;
 * - khuôn 2, 4, 5 tự vẽ nền của mình (mảng màu, hình vẽ, lưới chấm), nên chỉ mở nút góp ý;
 * - khuôn 6 không mở ô nào (Tài, 25/09).
 * Không khuôn nào mở "bố cục": cả sáu được thiết kế cho trang tràn màn hình.
 */
const PLANE: SettingField = { kind: 'feedbackButton' };
export const TEMPLATE_RELEASES: Record<TemplateKey, readonly TemplateRelease[]> = {
  standard: [{ version: 1, date: '2026-09-24', notes: 'Thẻ trôi trên ảnh nền, mép trên mờ dần; nền phóng nhẹ và tối dần khi cuộn.',
    settings: [{ kind: 'background', allow: ['solid', 'gradient', 'media'] }, { kind: 'watermark' }, PLANE] }],
  minimal: [{ version: 1, date: '2026-09-24', notes: 'Một thẻ tối, quầng tím mờ quanh thẻ, link xếp thành lưới ô.', settings: [PLANE] }],
  glass: [{ version: 1, date: '2026-09-23', notes: 'Thân trang và nút link bằng kính khúc xạ trên nền chuyển màu.',
    settings: [{ kind: 'background', allow: ['solid', 'gradient'] }, PLANE] }],
  deco: [{ version: 1, date: '2026-09-24', notes: 'Thẻ nghiêng chồng trên thẻ poster, link xếp hàng dọc.', settings: [PLANE] }],
  spotlight: [{ version: 1, date: '2026-09-23', notes: 'Nền tối, ánh sáng hổ phách tụ quanh nút Google.', settings: [PLANE] }],
  'big-button': [{ version: 1, date: '2026-09-24', notes: 'Nền trắng sữa, một nút Google tròn lớn có chữ chạy vòng quanh.', settings: [] }],
};

export const latestVersion = (key: TemplateKey) => TEMPLATE_RELEASES[key][TEMPLATE_RELEASES[key].length - 1].version;

/** The table of one version; a template the platform does not ship keeps every built-in control, as before P2. */
export function settingsOf(releases: Record<string, readonly TemplateRelease[] | undefined>, key: string, version: number): readonly SettingField[] {
  const shipped = releases[key];
  if (!shipped) return EVERY_BUILT_IN;
  return shipped.find(release => release.version === version)?.settings ?? [];
}
