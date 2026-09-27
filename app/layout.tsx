import type { Metadata } from 'next';
import { PLATFORM_NAME } from '@/lib/brand';
import './globals.css';
// Indexable by default so the front page and the legal pages can be found (Search Console, the Business Profile's
// website). Every private or per-shop route opts out on its own: guest pages, dashboard, /gov, preview, setup links.
export const metadata: Metadata = { title: { default: PLATFORM_NAME, template: `%s · ${PLATFORM_NAME}` },
  description: 'Trang của quán mở từ thẻ NFC: khách đánh giá quán trên Google và gửi góp ý riêng cho quán.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body>{children}</body></html>;
}
