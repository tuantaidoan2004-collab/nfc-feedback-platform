/** Icon nét mảnh dùng chung cho giao diện mới: 24×24, nét 1.8, màu theo chữ. */
import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  dashboard: <><path d="M4 20V11" /><path d="M10 20V5" /><path d="M16 20v-6" /><path d="M21 20H3" /></>,
  data: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5Z" /><path d="M8.5 9.5h7M8.5 12.5h4.5" /></>,
  library: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="3.5" /></>,
  card: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M7 14.5h4" /><path d="M15.5 9.2a3.2 3.2 0 0 1 0 4.6M17.8 7.4a5.8 5.8 0 0 1 0 8.2" /></>,
  manage: <><path d="M16 19a4 4 0 0 0-8 0" /><circle cx="12" cy="9" r="3.2" /><path d="M20.5 18a3.4 3.4 0 0 0-3.2-3.4M17.2 5.6a2.8 2.8 0 0 1 0 5.4M3.5 18a3.4 3.4 0 0 1 3.2-3.4M6.8 5.6a2.8 2.8 0 0 0 0 5.4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.5-2.4.9a7.4 7.4 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.4A7.4 7.4 0 0 0 7 6.4l-2.4-.9-2 3.5 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.5 2.4-.9a7.4 7.4 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.4 7.4 0 0 0 2.6-1.5l2.4.9 2-3.5Z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  home: <><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /></>,
  upload: <><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  template: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M3.5 9h17M9 9v11.5" /></>,
  brand: <><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.8-1 1.4-2-.5-1.3.4-2.5 1.8-2.5h1.9A3.4 3.4 0 0 0 20.5 12 8.5 8.5 0 0 0 12 3.5Z" /><circle cx="7.8" cy="11" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="8" r="1" /></>,
  event: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="m11 15 1.2-2.4L13.4 15l-1.2 1.8Z" /></>,
  more: <><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>,
  google: <><path d="M20.5 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.5Z" /><path d="M12 21c2.4 0 4.5-.8 6-2.2L15 16.5c-.8.6-1.8.9-3 .9a5.3 5.3 0 0 1-5-3.6H4v2.3A9 9 0 0 0 12 21Z" /><path d="M7 13.8a5.3 5.3 0 0 1 0-3.5V8H4a9 9 0 0 0 0 8.1Z" /><path d="M12 6.6c1.3 0 2.5.5 3.4 1.3L18 5.3A9 9 0 0 0 4 8l3 2.3a5.3 5.3 0 0 1 5-3.7Z" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>,
  star: <><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z" /></>,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>,
  sparkle: <><path d="M12 3.5 13.6 9l5.4 1.5-5.4 1.6L12 17.5l-1.6-5.4L5 10.5 10.4 9Z" /><path d="M19 15.5l.6 1.9 1.9.6-1.9.6L19 20.5l-.6-1.9-1.9-.6 1.9-.6Z" /></>,
  chevron: <><path d="m6 15 6-6 6 6" /></>,
  pencil: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  create: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  moon: <><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
};

export type IconName = keyof typeof paths;
export default function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
