'use client';
/**
 * Tín hiệu cho Orb (kịch bản mục 6): mỗi vài giây hỏi máy chủ có gì mới trên trang của quán từ lần hỏi trước.
 * Khách bấm bất kỳ nút nào → nảy; bấm Google → nảy mạnh hơn; khách gửi góp ý riêng → Orb ngả đỏ một lúc; chấm 5 sao → xanh lá.
 * Hỏi định kỳ cho đơn giản và chạy được ở mọi nơi; khi chạy trên máy chủ riêng có thể đổi sang đẩy thẳng (SSE).
 */
import { useEffect, useRef, useState } from 'react';

type Signal = { cursor: string | null; taps: number; google: number; feedback: number; good: number };
export function usePulse(slug: string) {
  const [pulse, setPulse] = useState({ n: 0, strong: false });
  const [mood, setMood] = useState<'calm' | 'alert' | 'good'>('calm');
  const cursor = useRef<string | null>(null), calmAt = useRef(0);
  useEffect(() => {
    let stopped = false, timer = 0;
    const ask = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const query = cursor.current ? `?since=${encodeURIComponent(cursor.current)}` : '';
          const response = await fetch(`/api/owner/v2/${slug}/pulse${query}`, { cache: 'no-store' });
          if (response.ok) {
            const signal = await response.json() as Signal;
            const first = cursor.current === null; cursor.current = signal.cursor;
            if (!first) {
              if (signal.google > 0) setPulse(p => ({ n: p.n + 1, strong: true }));
              else if (signal.taps > 0) setPulse(p => ({ n: p.n + 1, strong: false }));
              if (signal.feedback > 0) { setMood('alert'); calmAt.current = Date.now() + 120000; }
              else if (signal.good > 0) { setMood('good'); calmAt.current = Date.now() + 60000; }
            }
          }
        } catch { /* Offline for a moment: the next tick asks again. */ }
        if (calmAt.current && Date.now() > calmAt.current) { calmAt.current = 0; setMood('calm'); }
      }
      if (!stopped) timer = window.setTimeout(ask, 5000);
    };
    void ask();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [slug]);
  return { pulse, mood };
}
