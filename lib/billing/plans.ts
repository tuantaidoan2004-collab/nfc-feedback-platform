/**
 * Ba gói (Tài 06/10, kịch bản mục 3 và 3b) — thay hai gói 100k/120k của 05/10. Một quán trả một gói; gói mở khoá
 * tính năng, không giới hạn số trang; mọi gói đều có tài khoản nhân viên và phân quyền. VIP quản lý không giới hạn địa chỉ
 * quán dưới một tài khoản, một giá. Trả theo năm bằng 10 tháng. Thẻ NFC vật lý bán riêng.
 *
 * Trạng thái tiền của một quán chỉ là hai cột: `shops.plan` và `shops.paid_until` (một ngày, giờ Việt Nam). Hàm thuần
 * ở đây biến hai cột đó thành trạng thái và quyền; mọi cổng (trang khách, dashboard, lời mời thành viên) hỏi cùng một
 * hàm. "Tiền quyết định ngày, cổng quyết định quyền" (commercial-model.md mục 2).
 */
export type PlanKey = 'basic' | 'events' | 'vip';
/**
 * Tính năng một gói mở khoá. Gói Cơ bản không mở gì thêm ngoài phần lõi (trang, nút Google, góp ý riêng, Dashboard, Data,
 * nhân viên và phân quyền). `branches`: thêm địa chỉ quán dưới cùng một gói VIP (G3b, lib/account/branches.ts).
 */
export type Feature = 'events' | 'branches';
export type Plan = { key: PlanKey; name: string; monthly: number; unlocks: Feature[]; features: string[] };
export const PLANS: Plan[] = [
  { key: 'basic', name: 'Cơ bản', monthly: 50000, unlocks: [],
    features: ['Trang của quán, không giới hạn số trang', 'Nút đánh giá Google, góp ý riêng', 'Dashboard, Data, My Card', 'Tài khoản nhân viên, phân quyền', 'Admin Tài dựng và sửa trang'] },
  { key: 'events', name: 'Sự kiện', monthly: 70000, unlocks: ['events'],
    features: ['Mọi thứ của gói Cơ bản', 'Khúc sự kiện trên trang của quán', 'Mua thêm collab'] },
  { key: 'vip', name: 'VIP', monthly: 120000, unlocks: ['events', 'branches'],
    features: ['Mọi thứ của gói Sự kiện', 'Nhiều địa chỉ quán dưới một tài khoản, không giới hạn', 'Một giá cho mọi địa chỉ'] },
];
export const PLAN_KEYS = PLANS.map(plan => plan.key);
export const planOf = (key: PlanKey) => PLANS.find(plan => plan.key === key)!;
export const isPlanKey = (value: unknown): value is PlanKey => typeof value === 'string' && (PLAN_KEYS as string[]).includes(value);
/** Chuỗi lớn: giá thoả thuận, chưa làm (kịch bản mục 13). Collab: trả một lần cho mỗi collab, cần gói Sự kiện. */
export const CHAIN_NOTE = 'Chuỗi lớn cần quản lý vùng, báo cáo chéo chi nhánh — giá thoả thuận.';
export const COLLAB_PRICE = 100000;
export const YEAR_MONTHS = 10;
export const yearly = (plan: Plan) => plan.monthly * YEAR_MONTHS;
/** Quá hạn bao nhiêu ngày thì tắt trang (Tài 06/10). */
export const GRACE_DAYS = 14;
/**
 * Khách tự đến (tự đăng ký) dùng thử bao nhiêu ngày trước khi phải quét 10k (Tài 06/10: "được trải nghiệm một hồi rồi mới
 * khoá"; số ngày agent chọn, Tài đổi được). Kích hoạt mở tháng đầu ngay; trong tháng đó trả nốt giá gói − 10k.
 */
export const TRY_DAYS = 3;
export const ACTIVATION_FEE = 10000;
export type Cycle = 'month' | 'year';
/** Một kỳ trả: tháng = 1 tháng, năm = 12 tháng với giá 10 tháng. */
export const cycleMonths = (cycle: Cycle) => cycle === 'year' ? 12 : 1;
export const cyclePrice = (plan: PlanKey, cycle: Cycle) => planOf(plan).monthly * (cycle === 'year' ? YEAR_MONTHS : 1);

/**
 * trial — chưa tính phí (chưa có gói hay chưa có hạn): mọi tính năng mở, như giai đoạn trải nghiệm. Quán tự đăng ký chưa
 * kích hoạt cũng là trial cho tới hết `activateBy`, rồi thành locked: dashboard chỉ còn màn quét 10k.
 * active — còn hạn · grace — quá hạn ≤ 14 ngày: vẫn chạy đủ, dashboard nhắc trả · off — quá 14 ngày: trang tắt, thẻ và
 * link chuyển tới Google của quán, dashboard chỉ còn hướng dẫn ghi lại thẻ.
 */
export type BillingState = 'trial' | 'active' | 'grace' | 'off' | 'locked';
export type Billing = { state: BillingState; plan: PlanKey | null; paidUntil: string | null; offFrom: string | null;
  /** A shop that signed itself up and has not paid the 10k: the last day it may look around without paying. */
  activateBy: string | null;
  /** An address added under a VIP shop (G3b, kịch bản mục 13): the shop that pays for it, whose state this is. */
  main?: { slug: string; name: string } | null };

const DAY = 86400000;
const day = (text: string) => Date.parse(`${text}T00:00:00Z`);
export const addDays = (text: string, days: number) => new Date(day(text) + days * DAY).toISOString().slice(0, 10);

/**
 * `paidUntil`, `today` and `activateBy` are calendar days in Viet Nam time, 'YYYY-MM-DD'; the database supplies them.
 * `activateBy` is set only for a shop that signed itself up and has neither paid the 10k nor been given a plan by /gov.
 */
export function billingOf(plan: unknown, paidUntil: string | null, today: string, activateBy: string | null = null): Billing {
  const key = isPlanKey(plan) ? plan : null;
  if (activateBy && !paidUntil) return { state: today <= activateBy ? 'trial' : 'locked', plan: key, paidUntil: null, offFrom: null, activateBy };
  if (!key || !paidUntil) return { state: 'trial', plan: key, paidUntil, offFrom: null, activateBy: null };
  const offFrom = addDays(paidUntil, GRACE_DAYS + 1);
  const state: BillingState = today <= paidUntil ? 'active' : today < offFrom ? 'grace' : 'off';
  return { state, plan: key, paidUntil, offFrom, activateBy: null };
}
/** Only the frame opens: past 14 days unpaid, or a self-signed-up shop past its days without the 10k. */
export const closed = (billing: Billing) => billing.state === 'off' || billing.state === 'locked';
export function entitled(billing: Billing, feature: Feature) {
  if (billing.state === 'trial') return true;
  if (closed(billing) || !billing.plan) return false;
  return planOf(billing.plan).unlocks.includes(feature);
}
/**
 * The SQL fragment every gate selects, so the day is always Viet Nam's and never the server's. An address added under a VIP
 * shop (`main_shop_id`, G3b) has no plan of its own: every column comes from the shop that pays for it, so paying there opens
 * every address and letting it lapse closes every address.
 */
export const BILLING_COLUMNS = (shop: string) => {
  const paying = (columns: (alias: string) => string) =>
    `CASE WHEN ${shop}.main_shop_id IS NULL THEN ${columns(shop)} ELSE (SELECT ${columns('pay')} FROM shops pay WHERE pay.id=${shop}.main_shop_id) END`;
  return `${paying(s => `${s}.plan`)} billing_plan,${paying(s => `to_char(${s}.paid_until,'YYYY-MM-DD')`)} billing_paid_until,
  to_char(timezone('Asia/Ho_Chi_Minh',clock_timestamp())::date,'YYYY-MM-DD') billing_today,
  ${paying(s => `CASE WHEN ${s}.self_signup AND ${s}.activated_at IS NULL AND ${s}.paid_until IS NULL
    THEN to_char(timezone('Asia/Ho_Chi_Minh',${s}.created_at)::date+${TRY_DAYS},'YYYY-MM-DD') END`)} billing_activate_by,
  (SELECT main.slug FROM shops main WHERE main.id=${shop}.main_shop_id) billing_main_slug,
  (SELECT main.name FROM shops main WHERE main.id=${shop}.main_shop_id) billing_main_name`;
};
export type BillingRow = { billing_plan: unknown; billing_paid_until: string | null; billing_today: string; billing_activate_by?: string | null;
  billing_main_slug?: string | null; billing_main_name?: string | null };
export const billingRow = (row: BillingRow): Billing => ({ ...billingOf(row.billing_plan, row.billing_paid_until, row.billing_today, row.billing_activate_by ?? null),
  main: row.billing_main_slug ? { slug: row.billing_main_slug, name: row.billing_main_name ?? row.billing_main_slug } : null });
/** "31/10/2026" from "2026-10-31". */
export const viDate = (text: string) => text.split('-').reverse().join('/');
