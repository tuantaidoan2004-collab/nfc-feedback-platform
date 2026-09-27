'use client';
import { useState } from 'react';
import styles from './ui.module.css';
import { THEME_COOKIE, type Theme } from './theme-cookie';
const CHOICES: [Theme, string][] = [['dark', 'Tối'], ['light', 'Sáng'], ['system', 'Theo máy']];
/** Repaints every platform surface on the page at once, and remembers the choice for the server's next render. */
function apply(theme: Theme) {
  document.querySelectorAll<HTMLElement>('.platform').forEach(element => element.setAttribute('data-theme', theme));
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/**
 * Light, dark, or follow the phone (Tài 27/09: violet by default, white-orange-milk for daylight). The choice is kept in
 * a cookie so the server paints the right theme on the next visit; nothing about the viewer is sent anywhere.
 */
export default function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const choose = (next: Theme) => { setTheme(next); apply(next); };
  return <div className={styles.theme} role="group" aria-label="Giao diện" data-theme-toggle>
    {CHOICES.map(([value, label]) => <button key={value} type="button" aria-pressed={theme === value} data-theme-choice={value}
      onClick={() => choose(value)}>{label}</button>)}
  </div>;
}
