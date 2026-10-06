import type { Pool, PoolClient } from 'pg';
import { authorize, transaction, OwnerError, type OwnerCredential } from '../owner/auth';
import { AdminError } from '../admin/error';
import { recordAdminAction } from '../admin/audit';
import { shortCode } from '../short-code';
import { qrSvg } from '../qr';
import { vietQr, bankName, BANKS } from './vietqr';
import { ACTIVATION_FEE, BILLING_COLUMNS, billingRow, cycleMonths, cyclePrice, isPlanKey, planOf, type Billing, type Cycle, type PlanKey } from './plans';

/**
 * Thu tiền bằng chuyển khoản (Tài 06/10, kịch bản mục 3b). Chủ quán chọn gói và kỳ → hệ thống tạo một yêu cầu có mã riêng
 * (nội dung chuyển khoản "QS <mã>") và mã VietQR đúng số tiền → Admin Tài thấy tiền vào tài khoản thì bấm "Đã nhận" ở /gov → hạn
 * tự cộng. Không dịch vụ ngân hàng nào đọc giao dịch; khoá khớp là mã + số tiền, và chỉ Admin Tài xác nhận
 * (commercial-model.md mục 7: nguồn thanh toán cắm rời, bản ghi là chuẩn duy nhất).
 *
 * Quán tự đăng ký: 10k kích hoạt mở tháng đầu ngay; trong tháng đó trả nốt giá gói − 10k ("còn lại của tháng đầu"), có thể
 * gộp với kỳ tiếp theo. Quán Tài đi chào được tặng tới một ngày (/gov "Đặt gói"), không có 10k.
 */
export type Payee = { bankBin: string; bank: string; accountNumber: string; accountName: string };
export type PaymentView = { id: string; kind: 'activation' | 'plan'; plan: PlanKey; months: number; amount: number; settlesFirstMonth: boolean;
  code: string; memo: string; status: 'pending' | 'received' | 'cancelled'; createdAt: string; decidedAt: string | null; paidUntilAfter: string | null };
export type BillingStatus = { billing: Billing; payee: Payee | null; pending: (PaymentView & { qr: string | null }) | null;
  /** What remains of the first month after the 10k, until it is paid. */
  owed: number; history: PaymentView[] };

const memoOf = (code: string) => `QS ${code}`;
const view = (row: Record<string, unknown>): PaymentView => ({ id: row.id as string, kind: row.kind as PaymentView['kind'], plan: row.plan as PlanKey,
  months: row.months as number, amount: row.amount as number, settlesFirstMonth: row.settles_first_month as boolean, code: row.code as string,
  memo: memoOf(row.code as string), status: row.status as PaymentView['status'], createdAt: (row.created_at as Date).toISOString(),
  decidedAt: row.decided_at ? (row.decided_at as Date).toISOString() : null, paidUntilAfter: (row.paid_until_after as string | null) ?? null });
const COLUMNS = `id,kind,plan,months,amount,settles_first_month,code,status,created_at,decided_at,to_char(paid_until_after,'YYYY-MM-DD') paid_until_after`;

export async function readPayee(db: Pool | PoolClient): Promise<Payee | null> {
  const row = (await db.query('SELECT bank_bin,account_number,account_name FROM payment_settings')).rows[0];
  return row ? { bankBin: row.bank_bin, bank: bankName(row.bank_bin), accountNumber: row.account_number, accountName: row.account_name } : null;
}
/** The rest of the first month: the activated plan's price less the 10k, until a payment that settles it is received. */
async function owedOf(db: PoolClient, shopId: string) {
  const row = (await db.query(`SELECT a.plan FROM payments a WHERE a.shop_id=$1 AND a.kind='activation' AND a.status='received'
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.shop_id=$1 AND p.kind='plan' AND p.status='received' AND p.settles_first_month)
    ORDER BY a.decided_at DESC LIMIT 1`, [shopId])).rows[0];
  return row ? Math.max(0, planOf(row.plan).monthly - ACTIVATION_FEE) : 0;
}
/** A shop with addresses under it (G3b) pays VIP: a lower plan would leave them unpaid for. */
export async function hasBranches(db: PoolClient, shopId: string) {
  return !!(await db.query('SELECT 1 FROM shops WHERE main_shop_id=$1 LIMIT 1', [shopId])).rowCount;
}
async function shopBilling(db: PoolClient, shopId: string) {
  return billingRow((await db.query(`SELECT ${BILLING_COLUMNS('s')} FROM shops s WHERE s.id=$1`, [shopId])).rows[0]);
}

export class Payments {
  constructor(private pool: Pool) {}

  /** The owner's Thanh toán: where things stand, the request waiting for Admin Tài with its QR, and what was paid. */
  async status(credential: OwnerCredential, slug: string): Promise<BillingStatus> {
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'shell');
      if (access.actor.kind === 'owner' && access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
      const payee = await readPayee(db), owed = await owedOf(db, access.shopId);
      const rows = (await db.query(`SELECT ${COLUMNS} FROM payments WHERE shop_id=$1 ORDER BY created_at DESC LIMIT 20`, [access.shopId])).rows.map(view);
      const pending = rows.find(row => row.status === 'pending') ?? null;
      return { billing: access.billing, payee, owed, history: rows.filter(row => row.status === 'received'),
        pending: pending ? { ...pending, qr: payee ? qrSvg(vietQr({ bin: payee.bankBin, account: payee.accountNumber, amount: pending.amount, memo: pending.memo }), `Mã chuyển khoản ${pending.memo}`) : null } : null };
    });
  }

  /**
   * One request at a time: asking again replaces the one still waiting. `kind` activation is the 10k of a shop that signed
   * itself up; `plan` pays a month or a year of a plan, plus what remains of the first month if anything does, or (`cycle`
   * 'rest') only that remainder.
   */
  async request(credential: OwnerCredential, slug: string, input: { kind?: unknown; plan?: unknown; cycle?: unknown }) {
    if (!isPlanKey(input.plan) || !['activation', 'plan'].includes(input.kind as string) || !['month', 'year', 'rest'].includes(input.cycle as string))
      throw new OwnerError(400, 'INVALID_PAYMENT');
    const plan = input.plan, kind = input.kind as 'activation' | 'plan', cycle = input.cycle as Cycle | 'rest';
    await transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'shell');
      if (access.actor.kind !== 'owner' || access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
      if (access.billing.main) throw new OwnerError(409, 'PAID_BY_MAIN');
      if (!(await readPayee(db))) throw new OwnerError(409, 'PAYEE_NOT_SET');
      await db.query('SELECT 1 FROM shops WHERE id=$1 FOR UPDATE', [access.shopId]);
      if (plan !== 'vip' && await hasBranches(db, access.shopId)) throw new OwnerError(409, 'BRANCHES_NEED_VIP');
      const billing = await shopBilling(db, access.shopId), owed = await owedOf(db, access.shopId);
      let months: number, amount: number;
      if (kind === 'activation') {
        if (!billing.activateBy) throw new OwnerError(409, 'NOT_AWAITING_ACTIVATION');
        months = 1; amount = ACTIVATION_FEE;
      } else {
        if (billing.activateBy) throw new OwnerError(409, 'ACTIVATION_REQUIRED');
        if (cycle === 'rest' && !owed) throw new OwnerError(409, 'NOTHING_OWED');
        months = cycle === 'rest' ? 0 : cycleMonths(cycle); amount = owed + (cycle === 'rest' ? 0 : cyclePrice(plan, cycle));
      }
      await db.query("UPDATE payments SET status='cancelled',decided_at=clock_timestamp() WHERE shop_id=$1 AND status='pending'", [access.shopId]);
      await db.query(`INSERT INTO payments(shop_id,kind,plan,months,amount,settles_first_month,code,requested_by)VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [access.shopId, kind, plan, months, amount, kind === 'plan' && owed > 0, shortCode(6).toUpperCase(), access.userId]);
    });
    return this.status(credential, slug);
  }

  async cancel(credential: OwnerCredential, slug: string) {
    await transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'shell');
      if (access.actor.kind !== 'owner' || access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
      await db.query("UPDATE payments SET status='cancelled',decided_at=clock_timestamp() WHERE shop_id=$1 AND status='pending'", [access.shopId]);
    });
    return this.status(credential, slug);
  }

  /** /gov: requests waiting, newest first, and the last decisions. */
  async adminList() {
    const rows = (await this.pool.query(`SELECT p.id,p.kind,p.plan,p.months,p.amount,p.settles_first_month,p.code,p.status,p.created_at,p.decided_at,
        to_char(p.paid_until_after,'YYYY-MM-DD') paid_until_after,s.slug,s.name
      FROM payments p JOIN shops s ON s.id=p.shop_id WHERE p.status='pending' OR p.decided_at>clock_timestamp()-interval '30 days'
      ORDER BY (p.status='pending') DESC,p.created_at DESC LIMIT 100`)).rows;
    return rows.map(row => ({ ...view(row), shop: { slug: row.slug as string, name: row.name as string } }));
  }

  /**
   * Admin Tài saw the money arrive (or not). Received: the 10k opens the first month from today; a plan payment adds its
   * months after the paid day, or after yesterday when that has passed, so a late payment never pays for days already gone.
   */
  async decide(adminId: string, input: { id?: unknown; action?: unknown }) {
    const id = typeof input.id === 'string' && /^[0-9a-f-]{36}$/.test(input.id) ? input.id : null;
    if (!id || !['received', 'cancelled'].includes(input.action as string)) throw new AdminError(400, 'INVALID_INPUT');
    return transaction(this.pool, async db => {
      const payment = (await db.query('SELECT id,shop_id,kind,plan,months,amount,code,status FROM payments WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!payment) throw new AdminError(404, 'PAYMENT_NOT_FOUND');
      if (payment.status !== 'pending') throw new AdminError(409, 'PAYMENT_DECIDED');
      if (input.action === 'received' && payment.plan !== 'vip' && await hasBranches(db, payment.shop_id)) throw new AdminError(409, 'BRANCHES_NEED_VIP');
      if (input.action === 'cancelled') {
        await db.query("UPDATE payments SET status='cancelled',decided_at=clock_timestamp(),decided_by=$2 WHERE id=$1", [id, adminId]);
        await recordAdminAction(db, adminId, { action: 'payment.cancelled', shopId: payment.shop_id, detail: { code: payment.code, amount: payment.amount } });
        return { status: 'cancelled' as const };
      }
      const today = "timezone('Asia/Ho_Chi_Minh',clock_timestamp())::date";
      const shop = payment.kind === 'activation'
        ? (await db.query(`UPDATE shops SET activated_at=clock_timestamp(),plan=$2,paid_until=(${today}+interval '1 month')::date-1 WHERE id=$1
            RETURNING to_char(paid_until,'YYYY-MM-DD') paid_until`, [payment.shop_id, payment.plan])).rows[0]
        : payment.months > 0
          ? (await db.query(`UPDATE shops SET plan=$2,paid_until=(GREATEST(COALESCE(paid_until,${today}-1),${today}-1)+make_interval(months=>$3))::date WHERE id=$1
              RETURNING to_char(paid_until,'YYYY-MM-DD') paid_until`, [payment.shop_id, payment.plan, payment.months])).rows[0]
          : (await db.query(`SELECT to_char(COALESCE(paid_until,${today}),'YYYY-MM-DD') paid_until FROM shops WHERE id=$1`, [payment.shop_id])).rows[0];
      await db.query("UPDATE payments SET status='received',decided_at=clock_timestamp(),decided_by=$2,paid_until_after=$3::date WHERE id=$1", [id, adminId, shop.paid_until]);
      await recordAdminAction(db, adminId, { action: 'payment.received', shopId: payment.shop_id,
        detail: { code: payment.code, amount: payment.amount, kind: payment.kind, plan: payment.plan, months: payment.months, paidUntil: shop.paid_until } });
      return { status: 'received' as const, paidUntil: shop.paid_until as string };
    });
  }

  /** The one account every shop pays into. The name is what the bank shows; capitals without accents, as banks print it. */
  async setPayee(adminId: string, input: { bankBin?: unknown; accountNumber?: unknown; accountName?: unknown }) {
    const bin = typeof input.bankBin === 'string' && BANKS.some(bank => bank.bin === input.bankBin) ? input.bankBin : null;
    const account = typeof input.accountNumber === 'string' && /^[0-9A-Za-z]{4,19}$/.test(input.accountNumber.trim()) ? input.accountNumber.trim() : null;
    const name = typeof input.accountName === 'string' ? input.accountName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toUpperCase().replace(/\s+/g, ' ').trim() : '';
    if (!bin || !account || !/^[A-Z0-9 ]{2,50}$/.test(name)) throw new AdminError(400, 'INVALID_PAYEE');
    await transaction(this.pool, async db => {
      await db.query(`INSERT INTO payment_settings(id,bank_bin,account_number,account_name,updated_by)VALUES(true,$1,$2,$3,$4)
        ON CONFLICT(id) DO UPDATE SET bank_bin=$1,account_number=$2,account_name=$3,updated_by=$4,updated_at=clock_timestamp()`, [bin, account, name, adminId]);
      await recordAdminAction(db, adminId, { action: 'payment.payee', detail: { bank: bankName(bin), accountEnds: account.slice(-4) } });
    });
    return readPayee(this.pool);
  }
  /** The QR of a 2.000đ test transfer to the account just saved: Admin Tài scans it with his own bank app and checks the name. */
  async payeeCheck() {
    const payee = await readPayee(this.pool);
    if (!payee) return null;
    return { payee, qr: qrSvg(vietQr({ bin: payee.bankBin, account: payee.accountNumber, amount: 2000, memo: 'QS KIEM TRA' }), 'Mã chuyển khoản thử') };
  }
}
