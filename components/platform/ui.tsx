import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { PLATFORM_NAME } from '@/lib/brand';
import styles from './ui.module.css';

/**
 * The platform's shared parts (lát S1). Kept to what the dashboard, /gov and the sign-in pages use today; a part joins
 * this file when a second screen needs it, not before.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'caution' | 'quiet';
/** The class of a button of that kind, for places that render their own <button> or <a>. */
export const buttonClass = (variant: ButtonVariant = 'secondary') =>
  `${styles.button}${variant === 'secondary' ? '' : ` ${styles[variant]}`}`;
export function Button({ variant = 'secondary', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button {...rest} className={`${buttonClass(variant)}${className ? ` ${className}` : ''}`} />;
}
export const fieldClass = styles.field;
export const cardClass = styles.card;
export function Eyebrow({ children }: { children: ReactNode }) { return <span className={styles.eyebrow}>{children}</span>; }
export function Badge({ tone, children }: { tone?: 'accent' | 'success' | 'danger' | 'warn'; children: ReactNode }) {
  return <span className={styles.badge} data-tone={tone}>{children}</span>;
}
/** The mark and name of the platform, as on the sign-in pages and the dashboard header. */
export function BrandLine() {
  return <span className={styles.brandLine} data-brand><span className={styles.brandMark} aria-hidden="true">Q</span><span>{PLATFORM_NAME}</span></span>;
}
/** One card in the middle of the ground: the sign-in, set-password and two-factor pages. */
export function AuthCard({ eyebrow, children, ...data }: { eyebrow?: string; children: ReactNode } & Record<`data-${string}`, string>) {
  return <main className={styles.auth}><div className={styles.authCard} {...data}><BrandLine />{eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}{children}</div></main>;
}
/** What an empty list says instead of a zero: the next thing to do (audit A7). */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className={styles.empty}><strong>{title}</strong>{children && <p>{children}</p>}{action}</div>;
}
