import { notFound } from 'next/navigation';
import { Be_Vietnam_Pro } from 'next/font/google';
import { nfcEnv } from '@/server/env';
import CoatViewer from '@/components/coat-viewer';

/**
 * Bàn xem áo khoác (lát A29, 22/09/2026). Tài mở đường này trên preview để chốt/chỉnh/xoá
 * từng áo mà không phải chờ build lại cho mỗi lần đổi ý: mọi áo có sẵn ở đây, đổi ngay
 * trên máy khách.
 *
 * KHÔNG tồn tại trên production — cùng cách khoá mà `server/env.ts` đã dùng cho các bề mặt
 * v2: môi trường phải tự khai báo, thiếu biến thì cổng đóng.
 */
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

// Bộ chữ tiêu đề của áo "Nửa đêm". Next tự phục vụ tệp woff2 từ chính tên miền của mình,
// nên không có request nào sang Google và không phụ thuộc CSP bên ngoài.
const display = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['800'],
  variable: '--c-display',
  display: 'swap',
});

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (nfcEnv() === 'production' || nfcEnv() === undefined) notFound();
  const query = await searchParams;
  const one = (key: string) => { const v = query[key]; return Array.isArray(v) ? v[0] : v; };
  return (
    <div className={`xem-host ${display.variable}`}>
      <CoatViewer shopSlug={one('shop') ?? 'urr6ud'} shopName={one('ten') ?? 'Cà Phê Sớm Mai'} />
    </div>
  );
}
