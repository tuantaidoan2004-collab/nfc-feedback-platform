/**
 * Phông của trang canvas (lib/canvas/doc.ts `FONTS`), mỗi phông đủ tiếng Việt. Next tự lưu tệp phông trên chính máy chủ của
 * mình lúc dựng (không gọi Google lúc khách mở trang, hợp CSP `font-src 'self'`). Không nạp sẵn: trình duyệt chỉ tải phông
 * khi trang thật sự có chữ dùng nó.
 */
import { Alfa_Slab_One, Cormorant_Garamond, Dancing_Script, Great_Vibes, Josefin_Sans, Montserrat, Nunito, Patrick_Hand, Playfair_Display } from 'next/font/google';
import type { FontKey } from '@/lib/canvas/doc';

const display = Montserrat({ subsets: ['vietnamese', 'latin'], variable: '--cv-display', display: 'swap', preload: false });
const serif = Playfair_Display({ subsets: ['vietnamese', 'latin'], variable: '--cv-serif', display: 'swap', preload: false });
const script = Great_Vibes({ subsets: ['vietnamese', 'latin'], weight: '400', variable: '--cv-script', display: 'swap', preload: false });
const hand = Patrick_Hand({ subsets: ['vietnamese', 'latin'], weight: '400', variable: '--cv-hand', display: 'swap', preload: false });
/** Two faces for premium lettering (Tài 07/10: "font chưa mang lại sự khác biệt"): a thin geometric for wide-spaced names, a fine serif. */
const geo = Josefin_Sans({ subsets: ['vietnamese', 'latin'], variable: '--cv-geo', display: 'swap', preload: false });
const elegant = Cormorant_Garamond({ subsets: ['vietnamese', 'latin'], weight: ['300', '400', '500', '600'], style: ['normal', 'italic'], variable: '--cv-elegant', display: 'swap', preload: false });
const rounded = Nunito({ subsets: ['vietnamese', 'latin'], variable: '--cv-rounded', display: 'swap', preload: false });
const slab = Alfa_Slab_One({ subsets: ['vietnamese', 'latin'], weight: '400', variable: '--cv-slab', display: 'swap', preload: false });
const brush = Dancing_Script({ subsets: ['vietnamese', 'latin'], variable: '--cv-brush', display: 'swap', preload: false });

/** Class names that define every --cv-* family variable; set once on the page root. */
export const fontVariables = [display, serif, script, hand, rounded, slab, brush, geo, elegant].map(font => font.variable).join(' ');
/** `sans` is the platform's own Be Vietnam Pro (app/layout.tsx). */
export const FONT_STACK: Record<FontKey, string> = {
  sans: 'var(--font-qs), system-ui, sans-serif', display: 'var(--cv-display), system-ui, sans-serif', serif: 'var(--cv-serif), Georgia, serif',
  script: 'var(--cv-script), cursive', hand: 'var(--cv-hand), cursive', rounded: 'var(--cv-rounded), system-ui, sans-serif',
  slab: 'var(--cv-slab), Georgia, serif', brush: 'var(--cv-brush), cursive',
  geo: 'var(--cv-geo), system-ui, sans-serif', elegant: 'var(--cv-elegant), Georgia, serif',
  'rieng-chinh': "'cv-rieng-chinh', var(--font-qs), system-ui, sans-serif", 'rieng-dac-biet': "'cv-rieng-dac-biet', var(--cv-display), system-ui, sans-serif",
};
