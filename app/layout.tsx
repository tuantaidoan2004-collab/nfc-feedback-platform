import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'NFC Feedback · Bản thử', description: 'Trang thương hiệu và góp ý khách hàng — bản thử local.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body>{children}</body></html>;
}
