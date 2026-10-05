'use client';
/**
 * Landing — bản khung (kịch bản mục 2; giao diện chi tiết chờ ảnh Tài gửi). Màn mở hiện logo; khúc A là video toàn khung
 * (HyperFrames, làm cuối cùng, hai bản dọc/ngang); khúc B chào mừng với nút xanh "Bắt đầu miễn phí"; C, D, E… mỗi khúc một
 * tính năng; footer. Navbar thông minh: ẩn khi đang ở video, ẩn khi lướt xuống, hiện khi lướt lên. Trỏ (hoặc chạm) vào
 * Product, Customer, Template, Pricing mở bảng lớn bo tròn.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './landing.module.css';
import type { TemplateCard } from '@/lib/publishing/templates';

type Panel = 'product' | 'customer' | 'template' | 'pricing';
const PANELS: [Panel, string][] = [['product', 'Product'], ['customer', 'Customer'], ['template', 'Template'], ['pricing', 'Pricing']];
const FEATURES: [string, string, string, string][] = [
  ['card', 'Card', 'Một chạm thẻ, mở trang của quán', 'Khách chạm thẻ NFC trên bàn hay quét QR: trang mang tên quán mở ra ngay, nhẹ trên 4G.'],
  ['data', 'Data', 'Mọi phản hồi về một hộp thư', 'Góp ý riêng của khách và đánh giá Google của quán nằm chung một chỗ, trả lời ngay tại đó.'],
  ['library', 'Library', 'Dựng trang như Canva', 'Chọn template, kéo thả, dán link — hoặc nhờ đội ngũ dựng giúp.'],
  ['orb', 'Orb', 'Nơi làm việc biết thở', 'Orb nảy lên mỗi khi khách bấm trên trang của quán, đổi màu khi có phản hồi cần chú ý.'],
  ['khong-loc', 'Đúng luật Google', 'Không lọc đánh giá', 'Mọi khách thấy cùng một lời mời đánh giá Google. Không hỏi sao trước, không đổi quà lấy đánh giá — hồ sơ của quán luôn an toàn.'],
];

export default function Landing({ templates }: { templates: TemplateCard[] }) {
  const [hidden, setHidden] = useState(true), [open, setOpen] = useState<Panel | null>(null);
  const last = useRef(0), video = useRef<HTMLElement>(null), closeTimer = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY, inVideo = y < (video.current?.offsetHeight ?? 0) * 0.6;
      setHidden(inVideo || y > last.current + 4 ? true : y < last.current - 4 ? false : h => h);
      if (y > last.current + 4) setOpen(null);
      last.current = y;
    };
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const hover = (panel: Panel | null) => { window.clearTimeout(closeTimer.current); if (panel) setOpen(panel); else closeTimer.current = window.setTimeout(() => setOpen(null), 180); };
  return <div className={styles.page}>
    <div className={styles.unveil} aria-hidden="true"><div>{'Quite Sensational'.split(' ').map((word, i) =>
      <span key={word} style={{ animationDelay: `${0.15 + i * 0.18}s`, marginRight: '0.25em' }}>{word}</span>)}</div></div>
    <header className={styles.nav} data-hidden={hidden && !open} onMouseLeave={() => hover(null)}>
      <Link href="/" className={styles.brand}>QuiteSensational</Link>
      <nav className={styles.menu} aria-label="Trang chính">{PANELS.map(([key, label]) =>
        <button key={key} type="button" aria-expanded={open === key} onMouseEnter={() => hover(key)} onFocus={() => setOpen(key)}
          onClick={() => setOpen(open === key ? null : key)}>{label}</button>)}</nav>
      <div className={styles.end}><button type="button" className={styles.burger} aria-label="Mở menu" aria-expanded={!!open} onClick={() => setOpen(open ? null : 'product')}>☰</button>
        <Link href="/owner/login" className={styles.signin}>Đăng nhập</Link>
        <Link href="/bat-dau" className={styles.start} data-landing-start>Bắt đầu miễn phí</Link></div>
    </header>
    {open && <div className={styles.mega} onMouseEnter={() => hover(open)} onMouseLeave={() => hover(null)} role="dialog" aria-label={open}>
      {/* Phones cannot hover: the four panels switch from this row instead. */}
      <div className={styles.megaTabs}>{PANELS.map(([key, label]) => <button key={key} type="button" aria-pressed={open === key} onClick={() => setOpen(key)}>{label}</button>)}</div>
      {open === 'product' && <div className={styles.megaGrid}>{FEATURES.map(([id, name, title]) =>
        <a key={id} className={styles.tile} href={`#${id}`} onClick={() => setOpen(null)}><div><strong>{name}</strong><br /><small>{title}</small></div><span>Learn more →</span></a>)}</div>}
      {open === 'customer' && <div className={styles.empty}>
        <p>Bạn có thể là người đầu tiên đi cùng chúng tôi từ những ngày đầu, hãy sử dụng thử các tính năng hữu ích ngay nhé</p>
        <Link href="/bat-dau" className={styles.start}>Bắt đầu</Link></div>}
      {open === 'template' && <div style={{ display: 'grid', gap: 16 }}>
        <div className={styles.megaGrid}>{templates.slice(0, 6).map(card =>
          <Link key={card.key} href="/templates" className={styles.templateTile} style={{ background: `linear-gradient(${card.angle}deg, ${card.colors.join(', ')})` }}>{card.name}</Link>)}</div>
        <Link href="/templates" className={styles.start} style={{ justifySelf: 'center', background: '#0b0b0c', boxShadow: 'none' }}>Khám phá</Link></div>}
      {open === 'pricing' && <div className={styles.megaGrid}>
        <Link href="/pricing" className={styles.tile}><div><strong>Đầy đủ</strong><br /><small>100.000đ/tháng · tối đa 4 thẻ public</small></div><span>Xem bảng giá →</span></Link>
        <Link href="/pricing" className={styles.tile}><div><strong>VIP</strong><br /><small>120.000đ/tháng · không giới hạn thẻ</small></div><span>Xem bảng giá →</span></Link>
        <Link href="/pricing" className={styles.tile}><div><strong>Theo năm</strong><br /><small>Trả 10 tháng, dùng 12 tháng</small></div><span>Xem bảng giá →</span></Link></div>}
    </div>}
    <main>
      <section ref={video} className={styles.video} aria-label="Video giới thiệu">
        <div className={styles.videoMark}><strong>Quite Sensational</strong><span>Video motion giới thiệu — làm bằng HyperFrames ở bước cuối (bản dọc cho điện thoại, bản ngang cho máy tính).</span></div>
        <p>Kéo xuống</p>
      </section>
      <section className={styles.welcome} aria-label="Chào mừng">
        <div><div className={styles.sign} aria-hidden="true">🧧</div>
          <h2>Chào mừng Đối tác<br />thịnh vượng</h2>
          <p>Công cụ đã sẵn sàng.</p>
          <Link href="/bat-dau" className={`${styles.start} ${styles.big}`}>Bắt đầu miễn phí</Link></div>
      </section>
      {FEATURES.map(([id, name, title, text]) => <section key={id} id={id} className={styles.feature}>
        <div className={styles.copy}><span className={styles.eyebrow}>{name}</span><h3>{title}</h3><p>{text}</p></div>
        <div className={styles.phone}><div className={styles.screen}>Video minh hoạ tính năng — làm theo ảnh tham khảo</div></div>
      </section>)}
    </main>
    <footer className={styles.footer}>
      <strong className={styles.brand}>QuiteSensational</strong>
      <nav><Link href="/pricing">Bảng giá</Link><Link href="/templates">Template</Link><Link href="/huong-dan-google">Mời đánh giá Google đúng luật</Link>
        <Link href="/quyen-rieng-tu">Quyền riêng tư</Link><Link href="/dieu-khoan">Điều khoản</Link><Link href="/owner/login">Đăng nhập</Link></nav>
      <small>© {new Date().getFullYear()} Quite Sensational</small>
    </footer>
  </div>;
}
