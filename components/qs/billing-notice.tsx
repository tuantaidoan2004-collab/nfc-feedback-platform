'use client';
/**
 * Gói quá hạn (kịch bản mục 3b). Trong 14 ngày: một dải nhắc trên mọi màn, dashboard vẫn đủ. Quá 14 ngày: dashboard chỉ
 * còn màn này — trang đã tắt, thẻ đưa khách thẳng tới Google của quán, và cách ghi link của quán vào lại thẻ bằng app NFC.
 */
import { useState } from 'react';
import { PLANS, viDate, type Billing } from '@/lib/billing/plans';
import { ZALO } from '@/lib/contact';

const planName = (billing: Billing) => PLANS.find(plan => plan.key === billing.plan)?.name ?? '';

export function BillingStrip({ billing }: { billing: Billing }) {
  if (billing.state !== 'grace' || !billing.paidUntil || !billing.offFrom) return null;
  return <aside className="qs-billing-strip" role="note" data-billing="grace">
    <span>Gói <strong>{planName(billing)}</strong> đã hết hạn ngày {viDate(billing.paidUntil)}. Trang của quán sẽ tắt từ ngày <strong>{viDate(billing.offFrom)}</strong> nếu chưa gia hạn.</span>
    <a className="qs-btn small" href={ZALO.url} target="_blank" rel="noopener noreferrer">Gia hạn với Admin Tài</a>
  </aside>;
}

export function BillingOff({ name, billing, googleUrl }: { name: string; billing: Billing; googleUrl: string | null }) {
  const [copied, setCopied] = useState('');
  const copy = async () => {
    if (!googleUrl) return;
    try { await navigator.clipboard.writeText(googleUrl); setCopied('Đã chép link.'); } catch { setCopied('Chưa chép được — giữ ngón tay trên link để chép.'); }
  };
  return <div className="qs" style={{ display: 'grid', placeItems: 'center', padding: 16, minHeight: '100dvh' }}>
    <section className="qs-card" data-billing="off" style={{ padding: 28, maxWidth: 520, width: '100%', display: 'grid', gap: 16 }}>
      <p className="qs-small qs-muted">{name}</p>
      <h1 style={{ fontSize: 24, lineHeight: 1.25 }}>Trang của quán đang tắt</h1>
      <p className="qs-muted">Gói {planName(billing)} hết hạn ngày {billing.paidUntil ? viDate(billing.paidUntil) : '—'}. Khách chạm thẻ hay mở link của quán
        vẫn được đưa thẳng tới trang đánh giá Google của quán, nên không ai thấy trang lỗi.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ fontSize: 17 }}>Không dùng trang nữa? Ghi link của quán vào lại thẻ</h2>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
          <li>Tải app <strong>NFC Tools</strong> (có trên iPhone và Android).</li>
          <li>Mở <strong>Write</strong> → <strong>Add a record</strong> → <strong>URL / URI</strong>, dán link dưới đây, bấm OK.</li>
          <li>Bấm <strong>Write</strong>, rồi áp thẻ vào lưng điện thoại tới khi app báo xong. Làm lần lượt từng thẻ.</li>
        </ol>
        {googleUrl ? <div style={{ display: 'grid', gap: 8 }}>
          <code data-google-link style={{ display: 'block', padding: '12px 14px', borderRadius: 12, background: 'var(--qs-soft)', wordBreak: 'break-all', fontSize: 13 }}>{googleUrl}</code>
          <button type="button" className="qs-btn" onClick={() => void copy()}>Chép link Google của quán</button>
          {copied && <p className="qs-small qs-muted" role="status">{copied}</p>}
        </div> : <p className="qs-small">Quán chưa có link đánh giá Google — nhắn Admin Tài để lấy link.</p>}
        <p className="qs-small qs-muted">Thẻ báo đã khoá, không ghi được? Nhắn Admin Tài.</p>
      </div>
      <a className="qs-btn ghost" href={ZALO.url} target="_blank" rel="noopener noreferrer">Dùng tiếp — nhắn Admin Tài</a>
    </section>
  </div>;
}
