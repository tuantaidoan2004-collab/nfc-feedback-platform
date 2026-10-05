import type { Metadata } from 'next';
import Landing from '@/components/qs/landing/landing';
import { templateCards } from '@/lib/canvas/templates';
import { PLATFORM_NAME } from '@/lib/brand';
import '@/components/qs/qs.css';

// Rendered per request: each page carries its own CSP nonce (lát H1, proxy.ts).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { absolute: `${PLATFORM_NAME} · Trang của quán, mở bằng một lần chạm thẻ` },
  description: 'Thẻ NFC mở trang riêng của quán: mọi khách thấy cùng một lời mời đánh giá Google, chủ quán nhận góp ý riêng và đồng bộ đánh giá Google về một chỗ. Bắt đầu miễn phí.',
};

/** Trang chính (kịch bản mục 2) — bản khung; giao diện chi tiết theo ảnh Tài gửi. Indexed: the platform's own website. */
export default function Home() {
  return <div className="qs" data-theme="light"><Landing templates={templateCards()} /></div>;
}
