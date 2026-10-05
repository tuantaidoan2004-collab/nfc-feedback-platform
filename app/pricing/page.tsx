import type { Metadata } from 'next';
import Link from 'next/link';
import { PLANS, yearly, YEAR_MONTHS } from '@/lib/billing/plans';
import '@/components/qs/qs.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bảng giá', description: 'Hai gói: Đầy đủ 100.000đ/tháng (tối đa 4 thẻ public) và VIP 120.000đ/tháng. Trả theo năm chỉ tính 10 tháng. Đang trải nghiệm: miễn phí.' };

/** Pricing — một "dimension" riêng (kịch bản mục 2–3). Giá thật; giai đoạn trải nghiệm thì miễn phí hết. */
export default function Page() {
  return <div className="qs" data-theme="light" style={{ minHeight: '100dvh', padding: 'clamp(18px, 5vw, 64px)', display: 'grid', gap: 28, alignContent: 'start', justifyItems: 'center' }}>
    <header style={{ width: 'min(1100px, 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Link href="/" style={{ fontWeight: 700, letterSpacing: '-.04em', fontSize: 20, textDecoration: 'none' }}>QuiteSensational</Link>
      <Link href="/bat-dau" className="qs-btn blue">Bắt đầu miễn phí</Link>
    </header>
    <div style={{ textAlign: 'center', display: 'grid', gap: 12, maxWidth: 720 }}>
      <h1 style={{ fontSize: 'clamp(36px, 6vw, 72px)', letterSpacing: '-.05em' }}>Một giá, đủ mọi thứ</h1>
      <p className="qs-muted">Đang trong giai đoạn trải nghiệm: mọi gói đều miễn phí, mọi template đều Free. Bảng giá dưới đây áp dụng khi bắt đầu thu phí — Quite Sensational sẽ báo trước.</p>
    </div>
    <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', width: 'min(900px, 100%)' }}>
      {PLANS.map(plan => <article key={plan.key} className="qs-card" style={{ padding: 28, display: 'grid', gap: 14, alignContent: 'start' }}>
        <h2>{plan.name}</h2>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-.03em' }}>{plan.monthly.toLocaleString('vi-VN')}đ<span className="qs-muted" style={{ fontSize: 16, fontWeight: 500 }}>/tháng</span></div>
        <p className="qs-muted">Hoặc {yearly(plan).toLocaleString('vi-VN')}đ/năm — chỉ trả {YEAR_MONTHS} tháng.</p>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>{plan.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
        <Link href="/bat-dau" className="qs-btn">Dùng thử miễn phí</Link>
      </article>)}
    </div>
    <p className="qs-small qs-muted">Thẻ public = một trang đã phát hành, có link riêng. Thẻ NFC vật lý bán riêng, ngoài gói.</p>
  </div>;
}
