/** Khung pha xám: thương hiệu bên trái, thanh hoàn thành bên phải (mẫu Jitter, kịch bản mục 4). */
import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './gray.module.css';

export default function GrayShell({ percent, children }: { percent: number; children: ReactNode }) {
  return <div className={styles.gray}>
    <header className={styles.top}>
      <Link href="/" className={styles.brand}>Quite Sensational</Link>
      <div className={styles.meter} aria-label={`Đã hoàn thành ${percent}%`}>Hoàn thành {percent}%<div className={styles.track}><div className={styles.fill} style={{ width: `${percent}%` }} /></div></div>
    </header>
    <div className={styles.body}>{children}</div>
  </div>;
}
