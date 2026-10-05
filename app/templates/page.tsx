import type { Metadata } from 'next';
import Link from 'next/link';
import { templateCards } from '@/lib/canvas/templates';
import PageThumb from '@/components/canvas/thumb';
import '@/components/qs/qs.css';

export const metadata: Metadata = { title: 'Template', description: 'Thư viện template cho trang của quán — miễn phí trong giai đoạn trải nghiệm.' };

/** Thư viện template công khai (kịch bản mục 2): mỗi mẫu vẽ nhỏ đúng như trang khách, bấm để xem thử như khách thấy. */
export default function Page() {
  const cards = templateCards();
  return <div className="qs" data-theme="light" style={{ minHeight: '100dvh', padding: 'clamp(18px, 5vw, 64px)', display: 'grid', gap: 28, alignContent: 'start', justifyItems: 'center' }}>
    <header style={{ width: 'min(1100px, 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Link href="/" style={{ fontWeight: 700, letterSpacing: '-.04em', fontSize: 20, textDecoration: 'none' }}>QuiteSensational</Link>
      <Link href="/bat-dau" className="qs-btn blue">Bắt đầu miễn phí</Link>
    </header>
    <div style={{ textAlign: 'center', display: 'grid', gap: 12, maxWidth: 720 }}>
      <h1 style={{ fontSize: 'clamp(36px, 6vw, 72px)', letterSpacing: '-.05em' }}>Template</h1>
      <p className="qs-muted">{cards.length} mẫu, mỗi mẫu một cách chạy riêng. Tất cả đều Free trong giai đoạn trải nghiệm.</p>
    </div>
    <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', width: 'min(1100px, 100%)' }}>
      {cards.map(card => <Link key={card.key} href={`/templates/${card.key}`} style={{ display: 'grid', gap: 6, textDecoration: 'none' }} data-template={card.key}>
        <div style={{ aspectRatio: '9 / 16', borderRadius: 22, overflow: 'hidden', position: 'relative', boxShadow: 'var(--qs-shadow)', background: '#f2f2f4' }}>
          <PageThumb src={`/templates/${card.key}?anh=1`} title={`Mẫu ${card.name}`} />
          <span className="qs-pill free" style={{ position: 'absolute', top: 10, left: 10 }}>Free</span></div>
        <strong>{card.name}</strong><span className="qs-small qs-muted">{card.groups.join(' · ')}</span></Link>)}
    </div>
  </div>;
}
