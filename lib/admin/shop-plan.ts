import type { Pool } from 'pg';
import { transaction } from '../owner/auth';
import { BILLING_COLUMNS, billingRow, isPlanKey } from '../billing/plans';
import { AdminError } from './error';
import { recordAdminAction } from './audit';
import { hasBranches } from '../billing/payments';

/**
 * Gói của một quán, Admin Tài đặt ở `/gov` (kịch bản mục 3b): gói nào, trả hoặc tặng tới ngày nào (giờ Việt Nam, tính
 * hết ngày đó). Quán Tài đi chào được tặng tới một ngày; quán tự đến thì ngày này do lần trả tiền đặt (lát G2). Bỏ gói
 * thì quán về "chưa tính phí": mọi thứ mở, như giai đoạn trải nghiệm. Mỗi lần đổi ghi vào sổ admin.
 */
const DATE = /^(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const realDate = (text: string) => DATE.test(text) && new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;

export async function setShopPlan(pool: Pool, adminId: string, input: { shopId?: unknown; plan?: unknown; paidUntil?: unknown }) {
  const shopId = typeof input.shopId === 'string' && /^[0-9a-f-]{36}$/.test(input.shopId) ? input.shopId : null;
  if (!shopId) throw new AdminError(400, 'INVALID_INPUT');
  const plan = input.plan === null || input.plan === '' ? null : isPlanKey(input.plan) ? input.plan : undefined;
  if (plan === undefined) throw new AdminError(400, 'INVALID_PLAN');
  const paidUntil = input.paidUntil === null || input.paidUntil === '' ? null : typeof input.paidUntil === 'string' && realDate(input.paidUntil) ? input.paidUntil : undefined;
  if (paidUntil === undefined || (paidUntil && !plan)) throw new AdminError(400, 'INVALID_PAID_UNTIL');
  return transaction(pool, async db => {
    const before = (await db.query(`SELECT s.is_template,s.main_shop_id,s.plan,to_char(s.paid_until,'YYYY-MM-DD') paid_until FROM shops s WHERE s.id=$1 FOR UPDATE`, [shopId])).rows[0];
    if (!before) throw new AdminError(404, 'SHOP_NOT_FOUND');
    if (before.is_template) throw new AdminError(400, 'TEMPLATE_HAS_NO_PLAN');
    // An address under a VIP shop is paid there (G3b); the paying shop keeps VIP while it has addresses.
    if (before.main_shop_id) throw new AdminError(409, 'PAID_BY_MAIN');
    if (plan && plan !== 'vip' && await hasBranches(db, shopId)) throw new AdminError(409, 'BRANCHES_NEED_VIP');
    const row = (await db.query(`UPDATE shops s SET plan=$2,paid_until=$3::date WHERE s.id=$1 RETURNING ${BILLING_COLUMNS('s')}`, [shopId, plan, paidUntil])).rows[0];
    await recordAdminAction(db, adminId, { action: 'shop.plan', shopId,
      detail: { from: { plan: before.plan, paidUntil: before.paid_until }, to: { plan, paidUntil } } });
    return billingRow(row);
  });
}
