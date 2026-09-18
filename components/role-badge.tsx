import styles from './owner-app.module.css';

/** A role as Discord shows it: its icon and name in the role's colour (lát F3). */
export default function RoleBadge({ role }: { role: { name: string; icon: string | null; color: string } }) {
  return <span className={styles.roleBadge} style={{ color: role.color, borderColor: `${role.color}55`, background: `${role.color}14` }} data-role-badge={role.name}>
    {role.icon && <span aria-hidden="true">{role.icon}</span>}{role.name}</span>;
}
