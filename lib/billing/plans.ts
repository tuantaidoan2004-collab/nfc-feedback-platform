/**
 * Bảng giá mới (Tài 05/10, kịch bản mục 3) — thay cách tính tiền cũ theo template/trang. Hai gói; trả theo năm bằng 10
 * tháng. "Thẻ public" là một trang đã phát hành. Giai đoạn trải nghiệm: miễn phí hết, không chặn giới hạn.
 */
export type Plan = { key: 'standard' | 'vip'; name: string; monthly: number; publicCards: number | null; features: string[] };
export const PLANS: Plan[] = [
  { key: 'standard', name: 'Đầy đủ', monthly: 100000, publicCards: 4,
    features: ['Đủ mọi chức năng', 'Tối đa 4 thẻ public', 'Mọi template', 'Data, Dashboard, kết nối Google'] },
  { key: 'vip', name: 'VIP', monthly: 120000, publicCards: null,
    features: ['Mọi thứ của gói Đầy đủ', 'Trên 4 thẻ public, không giới hạn', 'Ưu tiên hỗ trợ'] },
];
export const YEAR_MONTHS = 10;
export const yearly = (plan: Plan) => plan.monthly * YEAR_MONTHS;
/** Trải nghiệm: không gói nào bị chặn. Khi bắt đầu thu phí, đổi thành false và áp `publicCards`. */
export const TRIAL = true;
