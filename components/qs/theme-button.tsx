'use client';
/** Sáng → Tối → Theo máy. Lưu trong cookie (cùng cookie với giao diện cũ) để lần sau máy chủ vẽ đúng ngay từ đầu. */
import { useEffect, useState } from 'react';
import Icon from './icons';
import { THEME_COOKIE, type Theme } from '../platform/theme-cookie';

const NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
const LABEL: Record<Theme, string> = { light: 'Giao diện sáng', dark: 'Giao diện tối', system: 'Giao diện theo máy' };

export default function ThemeButton() {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => { void Promise.resolve().then(() => setTheme((document.querySelector<HTMLElement>('.qs')?.dataset.theme as Theme) ?? 'light')); }, []);
  const choose = () => {
    const next = NEXT[theme]; setTheme(next);
    document.querySelectorAll<HTMLElement>('.qs').forEach(element => element.setAttribute('data-theme', next));
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent('qs-theme', { detail: next }));
  };
  return <button type="button" className="qs-btn ghost small" onClick={choose} aria-label={`${LABEL[theme]} — bấm để đổi`} title={LABEL[theme]}>
    <Icon name={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'settings'} size={18} />
    <span className="qs-small">{theme === 'dark' ? 'Tối' : theme === 'light' ? 'Sáng' : 'Theo máy'}</span>
  </button>;
}
