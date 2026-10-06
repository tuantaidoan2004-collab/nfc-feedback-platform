'use client';
/**
 * Gói và hạn trên dashboard (kịch bản mục 3b). Dải nhắc nổi ở chân mọi màn: quán tự đăng ký đang dùng thử chưa kích hoạt, và
 * gói quá hạn trong 14 ngày. Hai màn thay cả dashboard: chờ kích hoạt (hết ngày dùng thử mà chưa quét 10k) và trang đã tắt
 * (quá hạn 14 ngày: thẻ đưa khách thẳng tới Google của quán; gia hạn, hoặc ghi link của quán vào lại thẻ bằng app NFC).
 */
import { useState } from 'react';
import Link from 'next/link';
import { PLANS, viDate, type Billing } from '@/lib/billing/plans';
import PaymentPanel from './payment-panel';

const planName = (billing: Billing) => PLANS.find(plan => plan.key === billing.plan)?.name ?? '';

export function BillingStrip({ slug, billing }: { slug: string; billing: Billing }) {
  // An address added under a VIP shop is paid at that shop (G3b).
  const pay = <Link className="qs-btn small" href={`/app/${billing.main?.slug ?? slug}/cai-dat?view=billing`}>{billing.activateBy ? 'Kích hoạt 10.000đ' : 'Gia hạn'}{billing.main ? ` ở ${billing.main.name}` : ''}</Link>;
  if (billing.state === 'trial' && billing.activateBy) return <aside className="qs-billing-strip" role="note" data-billing="activate">
    <span>Bạn đang dùng thử tới hết ngày <strong>{viDate(billing.activateBy)}</strong>. Kích hoạt bằng 10.000đ để mở tháng đầu và dùng tiếp.</span>{pay}
  </aside>;
  if (billing.state !== 'grace' || !billing.paidUntil || !billing.offFrom) return null;
  return <aside className="qs-billing-strip" role="note" data-billing="grace">
    <span>Gói <strong>{planName(billing)}</strong> đã hết hạn ngày {viDate(billing.paidUntil)}. Trang của quán sẽ tắt từ ngày <strong>{viDate(billing.offFrom)}</strong> nếu chưa gia hạn.</span>{pay}
  </aside>;
}

/** Where to pay: here, or at the shop whose VIP plan covers this address (G3b). */
const Pay = ({ slug, billing }: { slug: string; billing: Billing }) => billing.main
  ? <section className="qs-card" style={{ padding: 24, display: 'grid', gap: 8 }} data-paid-by-main>
    <p>Địa chỉ này dùng chung gói của <strong>{billing.main.name}</strong>. Thanh toán ở quán chính là mọi địa chỉ mở lại cùng lúc.</p>
    <Link className="qs-btn" href={`/app/${billing.main.slug}/cai-dat?view=billing`}>Mở Thanh toán của {billing.main.name}</Link></section>
  : <PaymentPanel slug={slug} />;

const Frame = ({ children, kind }: { children: React.ReactNode; kind: string }) =>
  <div className="qs" style={{ display: 'grid', placeItems: 'center', padding: 16, minHeight: '100dvh' }}>
    <div data-billing={kind} style={{ maxWidth: 560, width: '100%', display: 'grid', gap: 16 }}>{children}</div>
  </div>;

/** Hết ngày dùng thử mà chưa kích hoạt: chỉ còn quét 10k. */
export function BillingLocked({ slug, name, billing }: { slug: string; name: string; billing: Billing }) {
  return <Frame kind="locked">
    <section className="qs-card" style={{ padding: 24, display: 'grid', gap: 8 }}>
      <p className="qs-small qs-muted">{name}</p>
      <h1 style={{ fontSize: 24, lineHeight: 1.25 }}>Kích hoạt quán để dùng tiếp</h1>
      <p className="qs-muted">Thời gian dùng thử đã hết ngày {billing.activateBy ? viDate(billing.activateBy) : '—'}. Quét 10.000đ là mở ngay tháng đầu; mọi thứ
        bạn đã làm vẫn còn nguyên.</p>
    </section>
    <Pay slug={slug} billing={billing} />
  </Frame>;
}

export function BillingOff({ slug, name, billing, googleUrl }: { slug: string; name: string; billing: Billing; googleUrl: string | null }) {
  const [copied, setCopied] = useState('');
  const copy = async () => {
    if (!googleUrl) return;
    try { await navigator.clipboard.writeText(googleUrl); setCopied('Đã chép link.'); } catch { setCopied('Chưa chép được — giữ ngón tay trên link để chép.'); }
  };
  return <Frame kind="off">
    <section className="qs-card" style={{ padding: 24, display: 'grid', gap: 8 }}>
      <p className="qs-small qs-muted">{name}</p>
      <h1 style={{ fontSize: 24, lineHeight: 1.25 }}>Trang của quán đang tắt</h1>
      <p className="qs-muted">Gói {planName(billing)} hết hạn ngày {billing.paidUntil ? viDate(billing.paidUntil) : '—'}. Khách chạm thẻ hay mở link của quán
        vẫn được đưa thẳng tới trang đánh giá Google của quán, nên không ai thấy trang lỗi. Gia hạn là trang bật lại.</p>
    </section>
    <Pay slug={slug} billing={billing} />
    <section className="qs-card" style={{ padding: 24, display: 'grid', gap: 8 }}>
      <h2 style={{ fontSize: 17 }}>Không dùng trang nữa? Ghi link của quán vào lại thẻ</h2>
      <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
        <li>Tải app <strong>NFC Tools</strong> (có trên iPhone và Android).</li>
        <li>Mở <strong>Write</strong> → <strong>Add a record</strong> → <strong>URL / URI</strong>, dán link dưới đây, bấm OK.</li>
        <li>Bấm <strong>Write</strong>, rồi áp thẻ vào lưng điện thoại tới khi app báo xong. Làm lần lượt từng thẻ.</li>
      </ol>
      {googleUrl ? <div style={{ display: 'grid', gap: 8 }}>
        <code data-google-link style={{ display: 'block', padding: '12px 14px', borderRadius: 12, background: 'var(--qs-soft)', wordBreak: 'break-all', fontSize: 13 }}>{googleUrl}</code>
        <button type="button" className="qs-btn ghost" onClick={() => void copy()}>Chép link Google của quán</button>
        {copied && <p className="qs-small qs-muted" role="status">{copied}</p>}
      </div> : <p className="qs-small">Quán chưa có link đánh giá Google — nhắn Admin Tài để lấy link.</p>}
      <p className="qs-small qs-muted">Thẻ báo đã khoá, không ghi được? Nhắn Admin Tài.</p>
    </section>
  </Frame>;
}
