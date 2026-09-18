import styles from './owner-app.module.css';

/**
 * How a platform administrator appears to a shop (lát F2, Tài 2026-09-18): the @handle, a scalloped verified tick
 * like Instagram's but in neon purple, and a label — for Tài, @Quitesensational · Admin Tài.
 */
const SCALLOP = (() => {
  const point = (radius: number, step: number) => {
    const angle = (step / 16) * Math.PI * 2 - Math.PI / 2;
    return `${(12 + radius * Math.cos(angle)).toFixed(2)} ${(12 + radius * Math.sin(angle)).toFixed(2)}`;
  };
  let path = `M${point(10, 0)}`;
  for (let i = 0; i < 16; i++) path += ` Q${point(12.4, i + 0.5)} ${point(10, i + 1)}`;
  return `${path}Z`;
})();

export function VerifiedTick({ size = 16 }: { size?: number }) {
  return <svg className={styles.tick} viewBox="0 0 24 24" width={size} height={size} role="img" aria-label="Đã xác minh">
    <path d={SCALLOP} fill="#a855f7" />
    <path d="m7.4 12.3 3 3 6.2-6.4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export default function AdminBadge({ handle, title }: { handle: string; title: string | null }) {
  return <span className={styles.adminBadge} data-admin-badge={handle}>
    <strong>@{handle}</strong><VerifiedTick />{title && <span className={styles.adminTitle}>{title}</span>}
  </span>;
}
