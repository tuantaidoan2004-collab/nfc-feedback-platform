'use client';
/**
 * Bước 4 — hoàn tất và loading (kịch bản mục 1), trở lại pha trời xanh: đường cong trượt tới nút 🎉, vài dòng trạng thái, rồi
 * vào giao diện chính với lời chào.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './sky.module.css';
import Journey from './journey';

const LINES = ['Đang dựng nơi làm việc của bạn…', 'Đang nối dữ liệu Google…', 'Sắp xong rồi…'];
const EMOJIS = ['👋', '🧑‍💼', '🏪', '🔐', '🎉'];
export default function Finish({ slug }: { slug: string }) {
  const router = useRouter(), [line, setLine] = useState(0), [error, setError] = useState(''), [step, setStep] = useState(3);
  useEffect(() => {
    let alive = true;
    const slide = window.setTimeout(() => setStep(4), 150);
    const ticker = window.setInterval(() => setLine(i => Math.min(i + 1, LINES.length - 1)), 900);
    void (async () => {
      const response = await fetch(`/api/owner/v2/${slug}/onboarding`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'finish' }) }).catch(() => null);
      if (!alive) return;
      if (!response?.ok) { setError('Còn bước Dashboard chưa xong.'); window.setTimeout(() => router.push('/bat-dau/tien-trinh'), 1600); return; }
      window.setTimeout(() => alive && router.push(`/app/${slug}?chao=1`), 2800);
    })();
    return () => { alive = false; window.clearTimeout(slide); window.clearInterval(ticker); };
  }, [slug, router]);
  return <div className={styles.sky}>
    <div className={styles.glow} />
    <header className={styles.top}><span className={styles.brand}>Quite Sensational</span></header>
    <div className={styles.stage}>
      <section className={styles.screen} aria-live="polite">
        <h1 className={styles.title}>Hoàn tất!</h1>
        <p className={styles.lead}>{error || LINES[line]}</p>
      </section>
    </div>
    <Journey emojis={EMOJIS} current={step} />
  </div>;
}
