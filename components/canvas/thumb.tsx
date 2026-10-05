'use client';
/**
 * Một trang khách vẽ nhỏ: chính trang đó trong một khung, thu theo bề ngang của ô (390 đơn vị = bề ngang cột trang). Khung
 * không chạy JavaScript và trang ở chế độ ảnh (`still`): không ghi lượt ghé, không chuyển động. Dùng cho ảnh trang trong
 * Library và ảnh template trong Library, thư viện công khai, landing.
 */
import { useState } from 'react';

export default function PageThumb({ src, title }: { src: string; title: string }) {
  const [scale, setScale] = useState(0);
  return <div ref={el => { if (el) { const w = el.getBoundingClientRect().width; if (w && Math.abs(w / 390 - scale) > 0.005) setScale(w / 390); } }}
    style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
    {scale > 0 && <iframe src={src} sandbox="allow-same-origin" loading="lazy" tabIndex={-1} title={title}
      style={{ position: 'absolute', left: 0, top: 0, width: 390, height: `${100 / scale}%`, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0' }} />}
  </div>;
}
