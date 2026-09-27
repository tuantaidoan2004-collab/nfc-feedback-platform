import { TEMPLATE_PRICES, isTemplateKey } from './templates';

/**
 * Giá (lát P5, Tài chốt 25–26/09, `docs/goi-va-trang.md` mục 4). **Chưa thu phí**: đây là bảng giá và số dự kiến để chủ
 * quán và nền tảng thấy trước; chưa có kỳ thanh toán, chưa có gì tự tạm ngừng khi chưa trả (Tài, 26/09: cần cảm nhận của
 * khách trước khi thu thật).
 *
 * - Mỗi khuôn một giá thuê mỗi tháng cho mỗi trang (`pricePerMonth` trong manifest của gói). Khuôn 6 miễn phí.
 * - Mỗi quán hai suất miễn phí, cho **hai trang có phí đang chạy lâu nhất**; khuôn 6 không chiếm suất. Đóng một trang được
 *   miễn thì trang có phí cũ nhất tiếp theo được miễn (khi có kỳ: từ kỳ sau).
 * - Chỉ trang **đang chạy** tính tiền: nháp chưa chạy; tạm ngừng là gói tạm dừng theo (Tài, 25/09); đóng là hết.
 * - Đổi khuôn: giá theo khuôn **đang chạy trên trang khách**; khi có kỳ, giá mới tính từ kỳ sau (Tài, 26/09).
 * - Thẻ NFC không tính phí trong app: thẻ chỉ là vật chứa link, bán riêng (Tài, 26/09).
 * "Lâu nhất" hôm nay đo bằng lúc tạo trang: chưa có cột "bắt đầu chạy". Đủ cho số dự kiến; khi thu thật thì ghi mốc riêng.
 */
export const FREE_PAGES = 2;
/** A template the platform does not ship (older test fixtures) is priced like any paid template. */
export const priceOf = (key: string) => isTemplateKey(key) ? TEMPLATE_PRICES[key] : 10000;

export type PricedInput = { slug: string; state: string; templateKey: string; createdAt: string | Date };
/** `free`: why nothing is charged -- the template costs nothing, or the page holds one of the free places. */
export type Price = { slug: string; list: number; monthly: number; billable: boolean; free: 'template' | 'slot' | null };

export function priceSheet(pages: readonly PricedInput[]): { pages: Price[]; monthly: number } {
  const running = pages.filter(page => page.state === 'active' && priceOf(page.templateKey) > 0)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.slug.localeCompare(b.slug));
  const slotted = new Set(running.slice(0, FREE_PAGES).map(page => page.slug));
  const priced = pages.map(page => {
    const list = priceOf(page.templateKey), billable = page.state === 'active';
    const free = list === 0 ? 'template' as const : billable && slotted.has(page.slug) ? 'slot' as const : null;
    return { slug: page.slug, list, billable, free, monthly: billable && !free ? list : 0 };
  });
  return { pages: priced, monthly: priced.reduce((sum, page) => sum + page.monthly, 0) };
}

export const vnd = (value: number) => `${value.toLocaleString('vi-VN')}đ`;
