import type { Metadata } from 'next';
import Link from 'next/link';
import { PLANS, yearly, YEAR_MONTHS, COLLAB_PRICE, CHAIN_NOTE } from '@/lib/billing/plans';
import '@/components/qs/qs.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bảng giá', description: 'Cơ bản 50.000đ, Sự kiện 70.000đ, VIP 120.000đ cho mọi địa chỉ quán, mỗi tháng. Mọi gói có tài khoản nhân viên, không giới hạn số trang. Trả theo năm chỉ tính 10 tháng.' };

/** Pricing — một "dimension" riêng (kịch bản mục 2–3). Ba gói (Tài 06/10); quán chưa tính phí thì vẫn miễn phí hết. */
export default function Page() {
  return <div className="qs" data-theme="light" style={{ minHeight: '100dvh', padding: 'clamp(18px, 5vw, 64px)', display: 'grid', gap: 28, alignContent: 'start', justifyItems: 'center' }}>
    <header style={{ width: 'min(1100px, 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Link href="/" style={{ fontWeight: 700, letterSpacing: '-.04em', fontSize: 20, textDecoration: 'none' }}>QuiteSensational</Link>
      <Link href="/bat-dau" className="qs-btn blue">Bắt đầu miễn phí</Link>
    </header>
    <div style={{ textAlign: 'center', display: 'grid', gap: 12, maxWidth: 720 }}>
      <h1 style={{ fontSize: 'clamp(36px, 6vw, 72px)', letterSpacing: '-.05em' }}>Trả cho thứ quán cần</h1>
      <p className="qs-muted">Mọi gói có tài khoản nhân viên và phân quyền, không giới hạn số trang. VIP gồm mọi địa chỉ quán của bạn. Đang trong giai đoạn trải nghiệm: mọi tính năng mở miễn phí, mọi template đều Free.</p>
    </div>
    <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', width: 'min(1100px, 100%)' }}>
      {PLANS.map(plan => <article key={plan.key} className="qs-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2>{plan.name}</h2>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-.03em' }}>{plan.monthly.toLocaleString('vi-VN')}đ<span className="qs-muted" style={{ fontSize: 16, fontWeight: 500 }}>/tháng</span></div>
        <p className="qs-muted">Hoặc {yearly(plan).toLocaleString('vi-VN')}đ/năm — chỉ trả {YEAR_MONTHS} tháng.</p>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>{plan.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
        <Link href="/bat-dau" className="qs-btn" style={{ marginTop: 'auto' }}>Dùng thử miễn phí</Link>
      </article>)}
    </div>
    <div className="qs-card" style={{ padding: 22, width: 'min(1100px, 100%)', display: 'grid', gap: 6 }}>
      <h2 style={{ fontSize: 18 }}>Chuỗi lớn</h2><p className="qs-muted">{CHAIN_NOTE} Nhắn Admin Tài để bàn.</p></div>
    <p className="qs-small qs-muted" style={{ maxWidth: 720, textAlign: 'center' }}>Collab: {COLLAB_PRICE.toLocaleString('vi-VN')}đ trả một lần cho mỗi collab, cần gói Sự kiện. Thẻ NFC vật lý bán riêng, ngoài gói.</p>
  </div>;
}
