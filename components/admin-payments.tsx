'use client';
import { useEffect, useState } from 'react';
import styles from './admin.module.css';
import { buttonClass } from './platform/ui';
import { BANKS } from '@/lib/billing/vietqr';
import { PLANS } from '@/lib/billing/plans';
import type { Payee, PaymentView } from '@/lib/billing/payments';

/**
 * Thanh toán ở /gov (Tài 06/10, kịch bản mục 3b). Quán bấm trả → một yêu cầu với nội dung "QS <mã>" và đúng số tiền. Tài mở app
 * ngân hàng, thấy khoản vào khớp nội dung và số tiền thì bấm "Đã nhận": hạn của quán tự cộng. Không khớp thì hỏi quán qua Zalo
 * trước khi bấm. Ở dưới: tài khoản nhận tiền, kèm mã quét thử 2.000đ để chắc ngân hàng và số tài khoản đúng.
 */
type Row = PaymentView & { shop: { slug: string; name: string } };
const PLAN_NAMES = Object.fromEntries(PLANS.map(plan => [plan.key, plan.name])) as Record<string, string>;
const money = (amount: number) => `${amount.toLocaleString('vi-VN')}đ`;
const when = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });
const viDate = (text: string) => text.split('-').reverse().join('/');
export const paymentWhat = (row: PaymentView) => row.kind === 'activation' ? `Kích hoạt · gói ${PLAN_NAMES[row.plan]} · mở tháng đầu`
  : `${PLAN_NAMES[row.plan]} · ${row.months === 12 ? '1 năm' : row.months === 1 ? '1 tháng' : 'phần còn lại tháng đầu'}${row.settlesFirstMonth && row.months ? ' + phần còn lại tháng đầu' : ''}`;

export default function AdminPayments() {
  const [rows, setRows] = useState<Row[] | null>(null), [check, setCheck] = useState<{ payee: Payee; qr: string } | null>(null);
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const load = async () => {
    try {
      const response = await fetch('/gov/api/payments', { credentials: 'same-origin' });
      if (!response.ok) { setError('Chưa tải được thanh toán.'); return; }
      const body = await response.json(); setRows(body.payments); setCheck(body.check); if (!body.check) setEditing(true);
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); }
  };
  useEffect(() => { void Promise.resolve().then(load); }, []);
  const decide = async (row: Row, action: 'received' | 'cancelled') => {
    if (action === 'received' && !window.confirm(`Đã thấy ${money(row.amount)} với nội dung "${row.memo}" vào tài khoản?`)) return;
    setBusy(row.id); setError('');
    try {
      const response = await fetch('/gov/api/payments', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action }) });
      if (!response.ok && response.status !== 409) { setError('Chưa lưu được. Thử lại.'); return; }
      if ((response.status === 409 && (await response.json().catch(() => ({}))).error === 'BRANCHES_NEED_VIP'))
        setError(`${row.shop.name} có địa chỉ quán dưới gói VIP: yêu cầu này là gói thấp hơn. Bấm "Huỷ" rồi nhắn chủ quán chọn VIP.`);
      await load();
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(''); }
  };
  const savePayee = async (form: FormData) => {
    setBusy('payee'); setError('');
    try {
      const response = await fetch('/gov/api/payments', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankBin: form.get('bankBin'), accountNumber: form.get('accountNumber'), accountName: form.get('accountName') }) });
      if (!response.ok) { setError('Kiểm lại ngân hàng, số tài khoản (4–19 chữ số) và tên chủ tài khoản.'); return; }
      setCheck((await response.json()).check); setEditing(false);
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(''); }
  };
  const pending = rows?.filter(row => row.status === 'pending') ?? [], done = rows?.filter(row => row.status !== 'pending') ?? [];
  return <section className={styles.panel} data-payments>
    <h2>Thanh toán chờ xác nhận {pending.length > 0 && <span>({pending.length})</span>}</h2>
    <p className={styles.muted}>Mở app ngân hàng: khoản nào khớp <strong>nội dung</strong> và <strong>số tiền</strong> thì bấm “Đã nhận”, hạn của quán tự cộng.
      Khách gõ sai nội dung thì hỏi qua Zalo trước khi bấm.</p>
    {rows === null ? <p className={styles.muted}>Đang tải…</p> : pending.length === 0 ? <p className={styles.muted}>Không có khoản nào chờ.</p>
      : <ul className={styles.items}>{pending.map(row => <li key={row.id} data-payment={row.code} style={{ display: 'grid', gap: 6, padding: '12px 0', borderBottom: '1px solid var(--p-line)' }}>
        <p><strong>{row.shop.name}</strong> <code>{row.shop.slug}</code> · {paymentWhat(row)}</p>
        <p>Nội dung <strong data-memo>{row.memo}</strong> · số tiền <strong>{money(row.amount)}</strong> · tạo {when(row.createdAt)}</p>
        <div className={styles.actions}>
          <button className={buttonClass('primary')} disabled={busy === row.id} onClick={() => void decide(row, 'received')}>Đã nhận</button>
          <button className={buttonClass('quiet')} disabled={busy === row.id} onClick={() => void decide(row, 'cancelled')}>Huỷ</button>
        </div>
      </li>)}</ul>}
    {done.length > 0 && <details style={{ marginTop: 12 }}><summary className={styles.muted}>30 ngày qua ({done.length})</summary>
      <ul className={styles.items}>{done.map(row => <li key={row.id} className={styles.muted}>{row.shop.name} · {paymentWhat(row)} · {money(row.amount)} · {row.memo} ·{' '}
        {row.status === 'received' ? `đã nhận ${when(row.decidedAt!)} · hạn tới ${viDate(row.paidUntilAfter!)}` : 'đã huỷ'}</li>)}</ul></details>}

    <h2 style={{ marginTop: 22 }}>Tài khoản nhận tiền</h2>
    {check && !editing && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'start', marginTop: 8 }} data-payee>
      <div style={{ width: 168 }} dangerouslySetInnerHTML={{ __html: check.qr }} />
      <div style={{ display: 'grid', gap: 6, flex: '1 1 260px' }}>
        <p><strong>{check.payee.bank}</strong> · {check.payee.accountNumber} · {check.payee.accountName}</p>
        <p className={styles.muted}>Quét thử mã này bằng app ngân hàng của bạn (2.000đ, nội dung QS KIEM TRA): app phải hiện đúng tên <strong>{check.payee.accountName}</strong>.
          Sai tên thì đừng chuyển — sửa ngân hàng hoặc số tài khoản. Khách thấy đúng mã kiểu này.</p>
        <div><button className={buttonClass('secondary')} onClick={() => setEditing(true)}>Sửa tài khoản</button></div>
      </div>
    </div>}
    {editing && <form className={styles.form} onSubmit={event => { event.preventDefault(); void savePayee(new FormData(event.currentTarget)); }} data-payee-form>
      <label>Ngân hàng<select name="bankBin" defaultValue={check?.payee.bankBin ?? BANKS[0].bin}>{BANKS.map(bank => <option key={bank.bin} value={bank.bin}>{bank.name}</option>)}</select></label>
      <label>Số tài khoản<input name="accountNumber" required inputMode="numeric" maxLength={19} defaultValue={check?.payee.accountNumber ?? ''} autoComplete="off" /></label>
      <label>Tên chủ tài khoản (như app ngân hàng ghi)<input name="accountName" required maxLength={50} defaultValue={check?.payee.accountName ?? ''} placeholder="NGUYEN VAN A" /></label>
      <div className={styles.actions}><button className={buttonClass('primary')} disabled={busy === 'payee'}>Lưu tài khoản</button>
        {check && <button type="button" className={buttonClass('quiet')} onClick={() => setEditing(false)}>Huỷ</button>}</div>
    </form>}
    {!check && !editing && <p className={styles.muted}>Chưa có tài khoản nhận tiền: quán chưa tạo được mã chuyển khoản.</p>}
    {error && <p role="alert" className={styles.muted}>{error}</p>}
  </section>;
}
