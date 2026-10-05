/**
 * Biểu tượng của trang canvas (lib/canvas/doc.ts `ICONS`): dấu thương hiệu vẽ đơn giản giữ màu riêng (Instagram, TikTok,
 * Zalo, Facebook, YouTube, Google, ghim Maps), còn lại là nét mảnh theo màu chữ. Mỗi biểu tượng là một SVG 24×24 lấp đầy hộp.
 */
import type { ReactNode } from 'react';
import type { IconKey } from '@/lib/canvas/doc';

const line = (children: ReactNode, width = 1.8) => <g fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">{children}</g>;

const ICON: Record<IconKey, (id: string) => ReactNode> = {
  instagram: id => <>
    <defs><radialGradient id={`${id}-ig`} cx="30%" cy="107%" r="150%"><stop offset="0" stopColor="#fdf497" /><stop offset=".05" stopColor="#fdf497" />
      <stop offset=".45" stopColor="#fd5949" /><stop offset=".6" stopColor="#d6249f" /><stop offset=".9" stopColor="#285AEB" /></radialGradient></defs>
    <rect width="24" height="24" rx="6.5" fill={`url(#${id}-ig)`} /><rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.8" /><circle cx="16.1" cy="7.9" r="1" fill="#fff" /></>,
  tiktok: () => <><rect width="24" height="24" rx="12" fill="#111" />
    <path d="M13.6 5.5v8.7a2.6 2.6 0 1 1-2.6-2.6" fill="none" stroke="#25F4EE" strokeWidth="2" strokeLinecap="round" transform="translate(-.6 -.4)" />
    <path d="M13.6 5.5v8.7a2.6 2.6 0 1 1-2.6-2.6" fill="none" stroke="#FE2C55" strokeWidth="2" strokeLinecap="round" transform="translate(.6 .4)" />
    <path d="M13.6 5.5v8.7a2.6 2.6 0 1 1-2.6-2.6M13.6 5.5c.3 2 1.7 3.4 3.8 3.6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></>,
  zalo: () => <><rect width="24" height="24" rx="6.5" fill="#0068FF" /><path d="M5.2 6.6h13.6v8.6H11l-3.6 2.6v-2.6H5.2Z" fill="#fff" />
    <text x="12" y="13.2" textAnchor="middle" fontSize="5.2" fontWeight="800" fontFamily="Arial, sans-serif" fill="#0068FF">Zalo</text></>,
  facebook: () => <><circle cx="12" cy="12" r="12" fill="#1877F2" /><path d="M13.3 19v-5.6h1.9l.3-2.2h-2.2V9.8c0-.6.2-1.1 1.1-1.1h1.2V6.8a15 15 0 0 0-1.7-.1c-1.7 0-2.9 1-2.9 3v1.5H9.1v2.2H11V19Z" fill="#fff" /></>,
  youtube: () => <><rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#FF0033" /><path d="m10 8.8 5.4 3.2-5.4 3.2Z" fill="#fff" /></>,
  google: () => <g transform="scale(.5)">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5Z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6Z" />
    <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1Z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48Z" /></g>,
  maps: id => <>
    <defs><clipPath id={`${id}-pin`}><path d="M12 1.2c-4.4 0-7.9 3.4-7.9 7.7 0 5.6 6.4 11.8 7.4 13.4.3.4.8.4 1 0 1-1.6 7.4-7.8 7.4-13.4 0-4.3-3.5-7.7-7.9-7.7Z" /></clipPath></defs>
    <g clipPath={`url(#${id}-pin)`}><rect width="24" height="24" fill="#34A853" /><path d="M0 0h12L6 9.5 0 13Z" fill="#1A73E8" /><path d="M12 0h12v11L12 9.5 7 7Z" fill="#EA4335" />
      <path d="M24 9 12 12.5 9 24h15Z" fill="#FBBC04" /><path d="M0 13 12 9.5 3 24H0Z" fill="#4285F4" /></g>
    <circle cx="12" cy="8.9" r="3.1" fill="#fff" /></>,
  globe: () => line(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z" /></>),
  link: () => line(<><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>, 2),
  wifi: () => line(<><path d="M2.5 9.2a14 14 0 0 1 19 0M5.6 12.6a9.4 9.4 0 0 1 12.8 0M8.7 15.9a4.8 4.8 0 0 1 6.6 0" /><circle cx="12" cy="19.2" r=".9" fill="currentColor" /></>, 2),
  phone: () => line(<path d="M6 3h3l2 5-2 1a11 11 0 0 0 6 6l1-2 5 2v3a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2Z" />),
  mail: () => line(<><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></>),
  pin: () => line(<><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.6" /></>),
  hand: () => <g>
    <path d="M9.2 21.5c-1.6-1.4-4.6-4.4-5.4-6-.6-1.2.5-2.3 1.6-1.6l2.4 1.7V5.2a1.4 1.4 0 0 1 2.8 0v6.3-1.9a1.4 1.4 0 0 1 2.8 0v1.9-1.2a1.4 1.4 0 0 1 2.8 0v1.6-.8a1.4 1.4 0 0 1 2.8 0v4.8c0 2.6-1 4.2-2.3 5.6Z"
      fill="#fff" stroke="#111" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M7.6 2.6 8.4 4M11.4 2.2v1.6M15 3l-.9 1.3" stroke="#111" strokeWidth="1.2" strokeLinecap="round" /></g>,
  cursor: () => <g><path d="M5 3.5 18 11l-5.6 1.3 3.2 6.1-2.4 1.2-3.1-6.1L6 17.6Z" fill="#fff" stroke="#c4161c" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M17.5 3.6 19 2M20 7h2M15 1v2" stroke="#c4161c" strokeWidth="1.4" strokeLinecap="round" /></g>,
  tooth: () => <path d="M7.4 3.2c1.7 0 2.7.9 4.6.9s2.9-.9 4.6-.9c2.6 0 4 2.2 3.6 5-.3 2.3-1.4 3.3-1.8 5.7-.4 2.6-.5 7.1-2.3 7.1-1.9 0-1.7-4.6-3-5.8-.4-.4-.8-.4-1.2 0-1.3 1.2-1.1 5.8-3 5.8-1.8 0-1.9-4.5-2.3-7.1-.4-2.4-1.5-3.4-1.8-5.7-.4-2.8 1-5 3.6-5Z" fill="currentColor" />,
  sparkle: () => <path d="M12 1.5c.6 5.5 2.7 9.3 10.5 10.5-7.8 1.2-9.9 5-10.5 10.5C11.4 17 9.3 13.2 1.5 12 9.3 10.8 11.4 7 12 1.5Z" fill="currentColor" />,
  heart: () => line(<path d="M12 20s-8-4.6-8-10.3A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 8 2.5C20 15.4 12 20 12 20Z" />, 2),
  plus: () => line(<path d="M12 4v16M4 12h16" />, 3),
  camera: () => line(<><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".6" fill="currentColor" /></>),
  calendar: () => line(<><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>),
  shampoo: () => line(<><path d="M9 7h6l1 3v10a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 20V10Z" /><path d="M10.5 7V4.5h3V7M13.5 4.5h3l1 1.5" /><rect x="10" y="12" width="4" height="5" rx="1" /></>, 1.4),
  conditioner: () => line(<><rect x="8" y="6" width="8" height="15.5" rx="2" /><path d="M10 6V3.5h4V6" /><path d="M12 10.5c-1.4 1.9-2 2.9-2 3.8a2 2 0 0 0 4 0c0-.9-.6-1.9-2-3.8Z" /></>, 1.4),
  jar: () => line(<><rect x="5" y="9" width="14" height="10" rx="2.5" /><path d="M4.5 9h15M7 9V7.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V9" /><path d="M8 5.5c1-1.4 2.6-1.4 3.6 0s2.6 1.4 3.6 0" /></>, 1.4),
  capsule: () => line(<><rect x="3" y="9" width="10" height="5" rx="2.5" transform="rotate(-40 8 11.5)" /><rect x="11" y="9" width="10" height="5" rx="2.5" transform="rotate(40 16 11.5)" />
    <path d="M7 18.5h.01M10 20h.01M14 20h.01M17 18.5h.01" /></>, 1.4),
  car: () => line(<path d="M2 15.5c2.6-2.4 6.6-3.6 10.4-3.6 3.4 0 6.6 1 9.6 3.2M3.6 15.2c4.5-.9 10.5-.8 16.8.3" />, 1.3),
  scissors: () => line(<><circle cx="6.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /><path d="m8.4 15.8 9-11.8M15.6 15.8l-9-11.8" /></>),
  pole: () => <g><rect x="8" y="3" width="8" height="18" rx="3" fill="#fff" stroke="#222" strokeWidth="1" />
    <path d="M8 6 16 3M8 10 16 6M8 14l8-4M8 18l8-4M9 21l7-3" stroke="#d32f2f" strokeWidth="1.6" /><path d="M8.5 6.6 15.5 4M8.5 12.6 15.5 10M8.5 18.6 15.5 16" stroke="#1e4fd6" strokeWidth="1.2" /></g>,
  cup: () => line(<><path d="M4 9h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6Z" /><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3.5c-.8 1 .8 2 0 3M12 3.5c-.8 1 .8 2 0 3" /></>),
  flag: () => <g><path d="M5 21V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M5 4h14l-2.5 4.5L19 13H5Z" fill="#fff" stroke="currentColor" strokeWidth="1.2" />
    <path d="M8 4h3v3H8zM14 4h3v3h-3zM5 7h3v3H5zM11 7h3v3h-3zM8 10h3v3H8zM14 10h3v3h-3z" fill="currentColor" /></g>,
  polish: () => <g><rect x="9" y="2.5" width="6" height="8" rx="1.2" fill="currentColor" />
    <path d="M7 10.5h10a1 1 0 0 1 1 1V20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8.5a1 1 0 0 1 1-1Z" fill="#ff5c9a" stroke="currentColor" strokeWidth="1.2" />
    <path d="M9 14.5c1.2-1 2.6-1 3.8 0" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" fill="none" /></g>,
  bowl: () => line(<><path d="M3 12h18a9 9 0 0 1-18 0Z" /><path d="M8 21h8M14 3l-3 8M19 4l-6 7.5" /><path d="M6 12c1-1.2 2-1.2 3 0s2 1.2 3 0 2-1.2 3 0" /></>),
  smile: () => line(<><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c2 2 5 2 7 0" /><path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.6" /></>),
  clinic: () => <g><path d="M12 2.5c2 0 3 1.6 3 3.6v2.9h2.9c2 0 3.6 1 3.6 3s-1.6 3-3.6 3H15v2.9c0 2-1 3.6-3 3.6s-3-1.6-3-3.6V15H6.1c-2 0-3.6-1-3.6-3s1.6-3 3.6-3H9V6.1c0-2 1-3.6 3-3.6Z"
    fill="none" stroke="#1f9d6b" strokeWidth="1.6" /><path d="M12 9.2c1.2-1.5 3.4-.6 3 1.2-.3 1.4-3 3.4-3 3.4s-2.7-2-3-3.4c-.4-1.8 1.8-2.7 3-1.2Z" fill="#e53950" /></g>,
  star: () => <path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z" fill="currentColor" />,
  music: () => line(<><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>),
  gift: () => line(<><rect x="3.5" y="9" width="17" height="11.5" rx="1.5" /><path d="M2.5 9h19v3.5h-19ZM12 9v11.5M12 9c-1.5-3.5-6-4-6-1.5S12 9 12 9Zm0 0c1.5-3.5 6-4 6-1.5S12 9 12 9Z" /></>),
  menu: () => line(<><rect x="4.5" y="3" width="15" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></>),
  bed: () => line(<><path d="M3 18V7M3 13h18v5M21 18v-3.5a3.5 3.5 0 0 0-3.5-3.5H11v2" /><circle cx="7" cy="11" r="1.8" /></>),
  key: () => line(<><circle cx="8" cy="14" r="4" /><path d="m11 11 9-9M17 5l2 2M15 7l2 2" /></>),
};

let serial = 0;
/** An icon filling its box. `id` keeps gradient ids unique when the same icon appears twice on a page. */
export default function CanvasIcon({ icon, color, id }: { icon: IconKey; color?: string; id?: string }) {
  const key = id ?? `i${serial++}`;
  return <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" style={color ? { color } : undefined} className="cv-icon">{ICON[icon](`cvi-${key}`)}</svg>;
}
