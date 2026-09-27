import type { CSSProperties } from 'react';
import styles from './owner-app.module.css';

/**
 * A role as Discord shows it: its icon and name in the role's colour (lát F3). Since S1 the colour is mixed into the
 * theme's own ink (owner-app.module.css .roleBadge), so a role painted near-black stays readable on the violet dark
 * theme and one painted near-white stays readable in daylight.
 */
export default function RoleBadge({ role }: { role: { name: string; icon: string | null; color: string } }) {
  return <span className={styles.roleBadge} style={{ '--role': role.color } as CSSProperties} data-role-badge={role.name}>
    {role.icon && <span aria-hidden="true">{role.icon}</span>}{role.name}</span>;
}
