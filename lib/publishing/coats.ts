/**
 * Áo khoác trang khách (lát A29, 22/09/2026). Hợp đồng ở `DESIGN.md` mục 1:
 *
 *   Một áo khoác CHỈ đặt token CSS. Nó không thêm, bớt, đổi thứ tự hay làm chậm
 *   bất kỳ nút DOM nào.
 *
 * Nhờ vậy mọi test trong `tests/contracts/google-policy.spec.ts` xanh cho mọi áo theo cấu tạo:
 * chúng kiểm cấu trúc, mà áo khoác không chạm được vào cấu trúc.
 *
 * `PageConfig` sau này lưu đúng một chuỗi `coat: <id>`; token nằm ở đây và trong
 * `components/coats.css`, không nằm trong cấu hình đã phát hành. Thêm áo mới không migration.
 *
 * Trang khách KHÔNG mang thuộc tính `data-coat` thì giữ nguyên diện mạo cũ — `coats.css`
 * chỉ định nghĩa trong phạm vi `.guest[data-coat="…"]`.
 */

/** Bộ chữ một áo được dùng. `kb` là ước tính woff2 có dải chữ Việt, dùng cho sàn 4. */
export type CoatFont = 'system' | 'be-vietnam-pro';

export type Coat = {
  id: string;
  /** Tên hiển thị cho chủ shop. Không bao giờ mang tên một hãng — `DESIGN.md` mục 8. */
  name: string;
  /** Dòng áo: `Không tranh` chạy được ngay; `Có tranh` cần tài sản hình của nền tảng. */
  line: 'Không tranh' | 'Có tranh';
  /** Một câu cho chủ shop, mô tả cảm giác chứ không mô tả kỹ thuật. */
  blurb: string;
  /** Ngành áo này hợp, dùng để gợi ý khi bàn giao shop. */
  suits: string[];
  display: CoatFont;
  body: CoatFont;
  /** Tổng KB áo thêm vào trang khách. Sàn 4 của `DESIGN.md`: ≤ 40. */
  kb: number;
};

export const COAT_FONT_KB: Record<CoatFont, number> = { system: 0, 'be-vietnam-pro': 38 };

export const COATS: Coat[] = [
  {
    id: 'ap-phich',
    name: 'Áp phích',
    line: 'Không tranh',
    blurb: 'Bố cục biên tập lệch trái: tên quán cỡ đại làm vật thể đồ hoạ, bề mặt tương tác nằm lệch phải, tranh tràn khỏi mép màn hình.',
    suits: ['cà phê', 'bar', 'quán khuya', 'tiệm bánh', 'phòng thu'],
    display: 'be-vietnam-pro', body: 'system', kb: COAT_FONT_KB['be-vietnam-pro'],
  },
];

export const coatIds = COATS.map(c => c.id);
export const isCoat = (value: unknown): value is string =>
  typeof value === 'string' && coatIds.includes(value);
export const coatById = (id: string) => COATS.find(c => c.id === id);
