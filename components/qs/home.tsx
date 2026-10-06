'use client';
/**
 * Màn Orb (kịch bản mục 6): trang trắng, Orb trôi tự do (vẽ ở StudioFrame), vài dòng chữ nhẹ. Lần đầu vào sau onboarding
 * (`?chao=1`) có popup "Chào mừng đối tác" nồng nhiệt.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { burstConfetti } from '../confetti';
import ThemeButton from './theme-button';
import ShopSwitcher from './shop-switcher';
import styles from './studio.module.css';

export default function Home({ name, welcome }: { name: string; welcome: boolean }) {
  const [hint, setHint] = useState(true), [greet, setGreet] = useState(welcome);
  const host = useRef<HTMLDivElement>(null), router = useRouter();
  useEffect(() => {
    const hide = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent ? event.code === 'Space' : (event.target as HTMLElement)?.closest('[data-orb-hub]')) setHint(false);
    };
    window.addEventListener('keydown', hide); window.addEventListener('pointerdown', hide);
    return () => { window.removeEventListener('keydown', hide); window.removeEventListener('pointerdown', hide); };
  }, []);
  useEffect(() => {
    if (!greet || !host.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => host.current && burstConfetti(host.current, 160), 250);
    return () => window.clearTimeout(timer);
  }, [greet]);
  const close = () => { setGreet(false); router.replace(window.location.pathname); };
  return <div className={styles.home} ref={host}>
    <div className={styles.homeTop}>
      <div><div className={styles.brand}>Quite Sensational</div><div className={styles.shopLine}><span className={styles.shopName}>{name}</span><ShopSwitcher /></div></div>
      <ThemeButton />
    </div>
    <div />
    <p className={styles.hint} style={{ opacity: hint ? 1 : 0 }}>Bấm vào Orb hoặc nhấn <kbd>Space</kbd> để mở các tab</p>
    {greet && <div className={styles.welcomeBack} role="dialog" aria-modal="true" aria-labelledby="chao" onClick={close}>
      <div className={styles.welcome} onClick={event => event.stopPropagation()}>
        <div className={styles.seal} aria-hidden="true">🎉</div>
        <h2 id="chao" style={{ fontSize: 26 }}>Chào mừng đối tác!</h2>
        <p>Nơi làm việc của <strong style={{ color: 'var(--qs-ink)' }}>{name}</strong> đã sẵn sàng. Chúc quán mình ngày càng thịnh vượng.</p>
        <p className="qs-small">Bấm vào Orb (hoặc nhấn Space) để mở Dashboard, Data, Library, My Card, Quản lý, Cài đặt.</p>
        <button type="button" className="qs-btn" onClick={close} autoFocus>Bắt đầu thôi</button>
      </div>
    </div>}
  </div>;
}
