'use client';
/**
 * Trả tiền cho quán (kịch bản mục 3b): chọn gói và kỳ → mã VietQR đúng số tiền, nội dung "QS <mã>" → chủ quán quét bằng app ngân
 * hàng → Admin Tài thấy tiền vào thì xác nhận, hạn tự cộng. Quán tự đăng ký chưa kích hoạt: chỉ có 10k, mở tháng đầu ngay.
 * Dùng ở Cài đặt → Thanh toán, màn chờ kích hoạt và màn trang đã tắt.
 */
import { useCallback, useEffect, useState } from 'react';
import { PLANS, ACTIVATION_FEE, cyclePrice, planOf, viDate, type Cycle, type PlanKey } from '@/lib/billing/plans';
import type { BillingStatus } from '@/lib/billing/payments';
import { ZALO } from '@/lib/contact';

const money = (amount: number) => `${amount.toLocaleString('vi-VN')}đ`;
const ERRORS: Record<string, string> = {
  PAYEE_NOT_SET: 'Admin Tài chưa đặt tài khoản nhận tiền. Nhắn Admin Tài qua Zalo.', OWNER_ROLE_REQUIRED: 'Chỉ chủ quán trả được tiền cho quán.', NOTHING_OWED: 'Tháng đầu đã trả đủ.',
};

export default function PaymentPanel({ slug }: { slug: string }) {
  const [status, setStatus] = useState<BillingStatus | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<PlanKey>('basic'), [cycle, setCycle] = useState<Cycle>('month'), [copied, setCopied] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/owner/v2/${slug}/billing`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(ERRORS[body.error] ?? 'Chưa tải được thanh toán. Thử lại.'); return; }
      setStatus(body); setError('');
      if (body.billing.plan) setPlan(current => body.pending ? body.pending.plan : body.billing.plan ?? current);
    } catch { setError('Không thể kết nối. Thử lại.'); }
  }, [slug]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  // While a transfer waits for Admin Tài, look again every half minute: the page turns to "Đã nhận" by itself.
  useEffect(() => {
    if (!status?.pending) return;
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [status?.pending, load]);
  const send = async (method: 'POST' | 'DELETE', body?: object) => {
    setBusy(true); setError(''); setCopied('');
    try {
      const response = await fetch(`/api/owner/v2/${slug}/billing`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(ERRORS[result.error] ?? 'Chưa tạo được mã. Thử lại.'); return; }
      setStatus(result);
    } catch { setError('Không thể kết nối. Thử lại.'); } finally { setBusy(false); }
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(text); } catch { setCopied(''); }
  };
  // On the phone that shows the code there is nothing to scan it with: save it as a picture, and the bank app's "scan QR"
  // reads it from the photo library.
  const save = async (svg: string, code: string) => {
    try {
      const image = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 720;
      const context = canvas.getContext('2d')!; context.imageSmoothingEnabled = false; context.drawImage(image, 0, 0, 720, 720); URL.revokeObjectURL(url);
      const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = `QS-${code}.png`; link.click();
    } catch { setError('Chưa lưu được ảnh. Chụp màn hình mã cũng được.'); }
  };
  if (!status) return <section className="qs-card" style={{ padding: 22 }} data-payment-panel><p className="qs-muted">{error || 'Đang tải thanh toán…'}</p></section>;
  const { billing, payee, pending, owed } = status, activating = !!billing.activateBy;
  const total = activating ? ACTIVATION_FEE : owed + cyclePrice(plan, cycle);
  return <section className="qs-card" style={{ padding: 22, display: 'grid', gap: 14 }} data-payment-panel>
    {pending ? <>
      <h2 style={{ fontSize: 18 }}>Quét mã để chuyển khoản</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'start' }}>
        {pending.qr && <div style={{ width: 200, maxWidth: '100%', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--qs-line)' }} data-payment-qr
          dangerouslySetInnerHTML={{ __html: pending.qr }} />}
        <dl style={{ margin: 0, display: 'grid', gap: 8, flex: '1 1 220px' }}>
          <div><dt className="qs-small qs-muted">Số tiền</dt><dd style={{ margin: 0, fontSize: 22, fontWeight: 700 }} data-payment-amount>{money(pending.amount)}</dd></div>
          <div><dt className="qs-small qs-muted">Nội dung chuyển khoản (giữ đúng)</dt><dd style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
            <strong data-payment-memo>{pending.memo}</strong><button type="button" className="qs-btn small ghost" onClick={() => void copy(pending.memo)}>{copied === pending.memo ? 'Đã chép' : 'Chép'}</button></dd></div>
          {payee && <div><dt className="qs-small qs-muted">Người nhận</dt><dd style={{ margin: 0 }}>{payee.accountName} · {payee.bank}</dd>
            <dd style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}>{payee.accountNumber}
              <button type="button" className="qs-btn small ghost" onClick={() => void copy(payee.accountNumber)}>{copied === payee.accountNumber ? 'Đã chép' : 'Chép số'}</button></dd></div>}
        </dl>
      </div>
      {pending.qr && <p className="qs-small qs-muted">Đang xem trên điện thoại? <button type="button" className="qs-btn small ghost" data-payment-save
        onClick={() => void save(pending.qr!, pending.code)}>Lưu ảnh mã</button> rồi mở app ngân hàng → Quét QR → chọn ảnh vừa lưu.</p>}
      <p className="qs-small qs-muted">{pending.kind === 'activation' ? `Kích hoạt gói ${planOf(pending.plan).name}: mở ngay tháng đầu. ` : ''}
        Chuyển xong, Admin Tài xác nhận trong ngày và trang này tự cập nhật. Có gì chưa rõ: Zalo {ZALO.number}.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="qs-btn small ghost" disabled={busy} onClick={() => void send('DELETE')}>Huỷ, chọn lại</button>
        <button type="button" className="qs-btn small ghost" disabled={busy} onClick={() => void load()}>Tôi đã chuyển — tải lại</button>
      </div>
    </> : <>
      <h2 style={{ fontSize: 18 }}>{activating ? 'Kích hoạt quán — 10.000đ' : owed ? 'Trả nốt tháng đầu hoặc gia hạn' : 'Gia hạn'}</h2>
      {activating && <p className="qs-small qs-muted">10.000đ mở <strong>ngay tháng đầu</strong> của gói bạn chọn. Trong tháng đó, chuyển nốt phần còn lại
        (giá gói − 10.000đ) là xong tháng đầu.</p>}
      {!activating && owed > 0 && <p className="qs-small" data-owed>Tháng đầu còn lại <strong>{money(owed)}</strong>{billing.paidUntil ? `, trả trước ${viDate(billing.paidUntil)}` : ''}.
        {' '}<button type="button" className="qs-btn small" disabled={busy || !payee} onClick={() => void send('POST', { kind: 'plan', plan: billing.plan ?? plan, cycle: 'rest' })}>Trả nốt {money(owed)}</button></p>}
      <div role="radiogroup" aria-label="Gói" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
        {PLANS.map(item => <button key={item.key} type="button" role="radio" aria-checked={plan === item.key} onClick={() => setPlan(item.key)}
          style={{ display: 'grid', justifyItems: 'start', gap: 2, padding: '10px 14px', borderRadius: 14, cursor: 'pointer', font: 'inherit', textAlign: 'left',
            background: 'var(--qs-card)', color: 'var(--qs-ink)', border: plan === item.key ? '2px solid var(--qs-ink)' : '1px solid var(--qs-line)' }}>
          <strong>{item.name}</strong><span className="qs-small qs-muted">{money(item.monthly)}/tháng</span></button>)}
      </div>
      {!activating && <div role="group" aria-label="Kỳ trả" style={{ display: 'flex', gap: 8 }}>
        {(['month', 'year'] as Cycle[]).map(value => <button key={value} type="button" aria-pressed={cycle === value} onClick={() => setCycle(value)}
          className="qs-btn small ghost" style={{ borderColor: cycle === value ? 'var(--qs-ink)' : undefined }}>{value === 'month' ? '1 tháng' : '1 năm · trả 10 tháng'}</button>)}
      </div>}
      {payee ? <button type="button" className="qs-btn blue" disabled={busy} data-payment-create
        onClick={() => void send('POST', { kind: activating ? 'activation' : 'plan', plan, cycle: activating ? 'month' : cycle })}>
        {busy ? 'Đang tạo…' : `Tạo mã chuyển khoản ${money(total)}`}</button>
        : <p className="qs-small">Admin Tài chưa đặt tài khoản nhận tiền. <a href={ZALO.url} target="_blank" rel="noopener noreferrer">Nhắn Admin Tài</a>.</p>}
      {!activating && owed > 0 && <p className="qs-small qs-muted">Số tiền trên đã gồm {money(owed)} còn lại của tháng đầu.</p>}
    </>}
    {error && <p className="qs-small qs-error" role="alert">{error}</p>}
  </section>;
}
