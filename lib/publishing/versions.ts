import type { TemplateKey } from './config';

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
export type TemplateRelease = { version: number; date: string; notes: string };

export const TEMPLATE_NAMES: Record<TemplateKey, string> = { standard: '1 · Bản gốc', minimal: '2 · Tối giản', glass: '3 · Kính',
  deco: '4 · Chồng thẻ', spotlight: '5 · Ánh sáng tụ', 'big-button': '6 · Nút lớn' };

/** Cũ nhất trước. Ghi chú viết cho chủ quán đọc: bản này khác bản trước ở chỗ nào họ nhìn thấy được. */
export const TEMPLATE_RELEASES: Record<TemplateKey, readonly TemplateRelease[]> = {
  standard: [{ version: 1, date: '2026-09-24', notes: 'Thẻ trôi trên ảnh nền, mép trên mờ dần; nền phóng nhẹ và tối dần khi cuộn.' }],
  minimal: [{ version: 1, date: '2026-09-24', notes: 'Một thẻ tối, quầng tím mờ quanh thẻ, link xếp thành lưới ô.' }],
  glass: [{ version: 1, date: '2026-09-23', notes: 'Thân trang và nút link bằng kính khúc xạ trên nền chuyển màu.' }],
  deco: [{ version: 1, date: '2026-09-24', notes: 'Thẻ nghiêng chồng trên thẻ poster, link xếp hàng dọc.' }],
  spotlight: [{ version: 1, date: '2026-09-23', notes: 'Nền tối, ánh sáng hổ phách tụ quanh nút Google.' }],
  'big-button': [{ version: 1, date: '2026-09-24', notes: 'Nền trắng sữa, một nút Google tròn lớn có chữ chạy vòng quanh.' }],
};

export const latestVersion = (key: TemplateKey) => TEMPLATE_RELEASES[key][TEMPLATE_RELEASES[key].length - 1].version;
