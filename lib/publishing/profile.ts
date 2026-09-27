import { validateConfig, type PageConfig } from './config';
import { assertPublishable } from './policy';

/**
 * Hồ sơ của **trang** — nội dung do chủ quán sở hữu (migration 022; từ migration 024 mỗi TRANG một hàng, không phải mỗi
 * quán, vì Tài chốt 25/09 nội dung nằm ở từng trang — `docs/goi-va-trang.md` mục 3).
 *
 * Template là ổ cắm, tài khoản là phích. Bản chụp release giữ **diện mạo** của lần phát hành đó và không bao giờ
 * bị sửa; các trường thuộc về tài khoản thì lấy từ bảng `page_profile` (tên `shop_profile` trước migration 027) lúc đọc. Nhờ vậy đổi template chỉ là đổi
 * bộ xương: tên quán, link Google, danh sách link, logo, ảnh và câu hỏi tự chui vào ổ của template mới.
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
 * 1. **Hồ sơ điền vào ổ nó có, không bịt ổ nó không có.** Tên quán và câu hỏi là `NOT NULL` nên luôn của tài
 *    khoản. Còn link Google, danh sách link, logo và ảnh: hồ sơ **trống** nghĩa là "tài khoản chưa cấp", chứ
 *    không phải "tài khoản muốn xoá" — lúc đó bản chụp giữ nguyên giá trị của nó.
 *
 *    Không có luật này thì một quán đã phát hành ba link sẽ **mất sạch link trên trang khách**, vì hàng hồ sơ
 *    mà trigger seed ra có `links = '[]'`. Đúng lỗi đó đã làm `publishing.spec.ts:112` đỏ.
 * 2. **Hồ sơ hỏng không bao giờ được làm trang khách sập, và không bao giờ đi vòng qua luật Google.**
 *    Kết quả ghép phải qua lại `validateConfig` **và** `assertPublishable`; không qua thì trả về đúng bản chụp.
 *
 *    Vế thứ hai là chỗ suýt thủng: tên quán và câu hỏi nằm trong hàng rào của `google-policy.md` (lát F-013 —
 *    "tên quán và câu hỏi đi qua cùng một phép kiểm với nhãn link"). Nếu hồ sơ tài khoản được ghép vào lúc đọc
 *    mà không kiểm lại, một quán đặt tên "Đánh giá 5 sao nhận quà" sẽ lên thẳng trang khách, không qua cửa
 *    phát hành. Kiểm ở đây đóng đúng cái cửa đó: hồ sơ phạm luật thì **bản đã phát hành vẫn giữ nguyên trên
 *    trang**, chứ trang không đổi theo và cũng không sập. Test `publishing.spec.ts:112` giữ tính chất này.
 */
export function withProfile(config: PageConfig, row: ShopProfileRow | null | undefined): PageConfig {
  if (!row) return config;
  const links = Array.isArray(row.links) && row.links.length ? row.links : config.links;
  const merged = {
    ...config,
    name: row.name,
    googleUrl: row.google_url ?? config.googleUrl,
    text: { question: { vi: row.question_vi, en: row.question_en } },
    links,
    logo: row.logo ?? config.logo,
    poster: row.poster ?? config.poster,
  };
  try { const next = validateConfig(merged); assertPublishable(next); return next; } catch { return config; }
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
