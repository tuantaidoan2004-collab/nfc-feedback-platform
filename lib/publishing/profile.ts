import { validateConfig, type PageConfig } from './config';

/**
 * Hồ sơ của **tài khoản** — nội dung do chủ quán sở hữu (migration 022, `docs/decisions.md` mục 11).
 *
 * Khuôn là ổ cắm, tài khoản là phích. Bản chụp release giữ **diện mạo** của lần phát hành đó và không bao giờ
 * bị sửa; các trường thuộc về tài khoản thì lấy từ bảng `shop_profile` lúc đọc. Nhờ vậy đổi khuôn chỉ là đổi
 * bộ xương: tên quán, link Google, danh sách link, logo, ảnh và câu hỏi tự chui vào ổ của khuôn mới.
 */
export type ShopProfileRow = {
  name: string;
  google_url: string | null;
  question_vi: string;
  question_en: string;
  links: unknown;
  logo: unknown;
  poster: unknown;
};

/**
 * Ghép hồ sơ tài khoản lên cấu hình đã phát hành.
 *
 * Hai luật, và luật thứ hai quan trọng hơn:
 *
 * 1. Trường nào thuộc tài khoản thì tài khoản thắng. `google_url` là ngoại lệ có điều kiện: tài khoản chưa cấp
 *    link thì giữ link trong bản chụp, vì `PageConfig` bắt buộc phải có một URL hợp lệ.
 * 2. **Hồ sơ hỏng không bao giờ được làm trang khách sập.** Kết quả ghép phải qua lại `validateConfig`; không
 *    qua thì trả về đúng bản chụp. Một hàng dữ liệu xấu làm trang cũ hơn một chút, chứ không làm trang trắng.
 */
export function withProfile(config: PageConfig, row: ShopProfileRow | null | undefined): PageConfig {
  if (!row) return config;
  const merged = {
    ...config,
    name: row.name,
    googleUrl: row.google_url ?? config.googleUrl,
    text: { question: { vi: row.question_vi, en: row.question_en } },
    links: Array.isArray(row.links) ? row.links : config.links,
    logo: row.logo ?? null,
    poster: row.poster ?? null,
  };
  try { return validateConfig(merged); } catch { return config; }
}

/** Các cột hồ sơ, viết một lần để hai truy vấn trong resolver không lệch nhau. */
export const PROFILE_COLUMNS =
  'pr.name profile_name, pr.google_url profile_google_url, pr.question_vi profile_question_vi,' +
  ' pr.question_en profile_question_en, pr.links profile_links, pr.logo profile_logo, pr.poster profile_poster';

/** Gom các cột đã đặt tiền tố ở trên về đúng hình dạng `ShopProfileRow`. */
export function profileFrom(row: Record<string, unknown>): ShopProfileRow | null {
  if (typeof row.profile_name !== 'string') return null;
  return {
    name: row.profile_name,
    google_url: typeof row.profile_google_url === 'string' ? row.profile_google_url : null,
    question_vi: String(row.profile_question_vi ?? ''),
    question_en: String(row.profile_question_en ?? ''),
    links: row.profile_links,
    logo: row.profile_logo,
    poster: row.profile_poster,
  };
}
