import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { THEME_COOKIE, type Theme } from './theme-cookie';
import './platform.css';

export async function themeFromCookie(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return value === 'dark' || value === 'light' ? value : 'system';
}
/** The ground of every platform page, already in the viewer's theme on first paint (the cookie is read here). */
export default async function PlatformShell({ children }: { children: ReactNode }) {
  return <div className="platform" data-theme={await themeFromCookie()}>{children}</div>;
}
