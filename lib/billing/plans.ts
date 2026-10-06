/**
 * Ba gói (Tài 06/10, kịch bản mục 3 và 3b) — thay hai gói 100k/120k của 05/10. Một quán trả một gói; gói mở khoá
 * tính năng, không giới hạn số trang. Trả theo năm bằng 10 tháng. Thẻ NFC vật lý bán riêng.
 *
 * Trạng thái tiền của một quán chỉ là hai cột: `shops.plan` và `shops.paid_until` (một ngày, giờ Việt Nam). Hàm thuần
 * ở đây biến hai cột đó thành trạng thái và quyền; mọi cổng (trang khách, dashboard, lời mời thành viên) hỏi cùng một
 * hàm. "Tiền quyết định ngày, cổng quyết định quyền" (commercial-model.md mục 2).
 */
export type PlanKey = 'basic' | 'events' | 'team';
/** Tính năng một gói mở khoá. Gói Cơ bản không mở gì thêm ngoài phần lõi (trang, nút Google, góp ý riêng, Dashboard, Data). */
export type Feature = 'events' | 'team';
export type Plan = { key: PlanKey; name: string; monthly: number; unlocks: Feature[]; features: string[] };
export const PLANS: Plan[] = [
  { key: 'basic', name: 'Cơ bản', monthly: 50000, unlocks: [],
    features: ['Trang của quán, không giới hạn số trang', 'Nút đánh giá Google, góp ý riêng', 'Dashboard, Data, My Card', 'Admin Tài dựng và sửa trang'] },
  { key: 'events', name: 'Sự kiện', monthly: 70000, unlocks: ['events'],
    features: ['Mọi thứ của gói Cơ bản', 'Khúc sự kiện trên trang của quán', 'Mua thêm collab'] },
  { key: 'team', name: 'Đội ngũ', monthly: 120000, unlocks: ['events', 'team'],
    features: ['Mọi thứ của gói Sự kiện', 'Tài khoản cho nhân viên, phân quyền', 'Nhật ký: ai tạo, ai nhờ sửa gì'] },
];
export const PLAN_KEYS = PLANS.map(plan => plan.key);
export const planOf = (key: PlanKey) => PLANS.find(plan => plan.key === key)!;
export const isPlanKey = (value: unknown): value is PlanKey => typeof value === 'string' && (PLAN_KEYS as string[]).includes(value);
/** Chuỗi: giá thoả thuận, chưa làm (kịch bản mục 13). Collab: trả một lần cho mỗi collab, cần gói Sự kiện. */
export const CHAIN_NOTE = 'Nhiều chi nhánh, phân quyền theo chi nhánh — giá thoả thuận.';
export const COLLAB_PRICE = 100000;
export const YEAR_MONTHS = 10;
export const yearly = (plan: Plan) => plan.monthly * YEAR_MONTHS;
/** Quá hạn bao nhiêu ngày thì tắt trang (Tài 06/10). */
export const GRACE_DAYS = 14;

/**
 * trial — chưa tính phí (chưa có gói hay chưa có hạn): mọi tính năng mở, như giai đoạn trải nghiệm.
 * active — còn hạn · grace — quá hạn ≤ 14 ngày: vẫn chạy đủ, dashboard nhắc trả · off — quá 14 ngày: trang tắt, thẻ và
 * link chuyển tới Google của quán, dashboard chỉ còn hướng dẫn ghi lại thẻ.
 */
export type BillingState = 'trial' | 'active' | 'grace' | 'off';
export type Billing = { state: BillingState; plan: PlanKey | null; paidUntil: string | null; offFrom: string | null };

const DAY = 86400000;
const day = (text: string) => Date.parse(`${text}T00:00:00Z`);
export const addDays = (text: string, days: number) => new Date(day(text) + days * DAY).toISOString().slice(0, 10);

/** `paidUntil` and `today` are calendar days in Viet Nam time, 'YYYY-MM-DD'; the database supplies both. */
export function billingOf(plan: unknown, paidUntil: string | null, today: string): Billing {
  const key = isPlanKey(plan) ? plan : null;
  if (!key || !paidUntil) return { state: 'trial', plan: key, paidUntil, offFrom: null };
  const offFrom = addDays(paidUntil, GRACE_DAYS + 1);
  const state: BillingState = today <= paidUntil ? 'active' : today < offFrom ? 'grace' : 'off';
  return { state, plan: key, paidUntil, offFrom };
}
export function entitled(billing: Billing, feature: Feature) {
  if (billing.state === 'trial') return true;
  if (billing.state === 'off' || !billing.plan) return false;
  return planOf(billing.plan).unlocks.includes(feature);
}
/** The SQL fragment both gates select, so the day is always Viet Nam's and never the server's. */
export const BILLING_COLUMNS = (shop: string) =>
  `${shop}.plan billing_plan,to_char(${shop}.paid_until,'YYYY-MM-DD') billing_paid_until,to_char(timezone('Asia/Ho_Chi_Minh',clock_timestamp())::date,'YYYY-MM-DD') billing_today`;
export const billingRow = (row: { billing_plan: unknown; billing_paid_until: string | null; billing_today: string }) =>
  billingOf(row.billing_plan, row.billing_paid_until, row.billing_today);
/** "31/10/2026" from "2026-10-31". */
export const viDate = (text: string) => text.split('-').reverse().join('/');
