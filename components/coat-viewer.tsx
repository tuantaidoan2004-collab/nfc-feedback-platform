'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ShopFeedbackV2 from './shop-feedback-v2';
import { COATS } from '@/lib/publishing/coats';
import { defaultConfig, STEM_BACKGROUND, type PageConfig } from '@/lib/publishing/config';
import './coat-viewer.css';

/**
 * Bàn xem áo khoác (lát A29). Chỉ tồn tại ngoài production — cổng ở `app/xem/page.tsx`.
 *
 * Nó dựng **đúng** component trang khách, không phải bản sao: cùng DOM, cùng hành vi, cùng
 * `guest-page.css`. Thứ duy nhất đổi giữa các lần bấm là thuộc tính `data-coat`.
 *
 * Bàn này là công cụ nội bộ. Trên trang khách thật, chủ quán **không** thấy ô chọn nào:
 * áo khoác đến từ cấu hình đã phát hành, và chỗ chọn nó là dashboard (Tài chốt 22/09).
 */
export default function CoatViewer({ shopSlug, shopName }: { shopSlug: string; shopName: string }) {
  const [index, setIndex] = useState(0);
  const [withPhoto, setWithPhoto] = useState(false);
  const [linkCount, setLinkCount] = useState(3);
  const [open, setOpen] = useState(false);
  const [replay, setReplay] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const coat = COATS[index];
  const go = useCallback((step: number) => {
    setIndex(i => (i + step + COATS.length) % COATS.length);
    setReplay(r => r + 1);
  }, []);

  // Vuốt ngang để đổi áo. Vuốt dọc vẫn là cuộn trang, không cướp cử chỉ của khách.
  useEffect(() => {
    const start = (e: TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
    const end = (e: TouchEvent) => {
      const from = touch.current; touch.current = null;
      if (!from) return;
      const dx = e.changedTouches[0].clientX - from.x;
      const dy = e.changedTouches[0].clientY - from.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx < 0 ? 1 : -1);
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchend', end, { passive: true });
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', keys);
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchend', end);
      window.removeEventListener('keydown', keys);
    };
  }, [go]);

  // Chủ quán thêm/bớt link bất cứ lúc nào, nên bàn xem phải thử được mọi số lượng.
  const base = defaultConfig(shopName);
  const pool = [...base.links, ...base.links, ...base.links].slice(0, 6);
  const config: PageConfig = {
    ...base,
    links: pool.slice(0, linkCount).map((l, i) => ({ ...l, url: `${l.url}${i > 2 ? `?n=${i}` : ''}` })),
    poster: withPhoto ? { kind: 'image', url: STEM_BACKGROUND.still } : null,
  };

  return (
    <>
      <ShopFeedbackV2
        key={`${coat.id}-${withPhoto}-${linkCount}-${replay}`}
        coat={coat.id}
        pageConfig={config}
        slug={shopSlug}
        name={shopName}
        googleUrl="https://www.google.com/maps"
        heroUrl={null}
        heroKind={null}
      />

      <div className={`cv${open ? ' cv-open' : ''}`}>
        <div className="cv-strip">
          <button type="button" className="cv-nav" onClick={() => go(-1)} aria-label="Áo trước">‹</button>
          <button type="button" className="cv-now" onClick={() => setOpen(v => !v)} aria-expanded={open}>
            <span className="cv-now-name">{coat.name}</span>
            <span className="cv-now-line">{coat.line} · {index + 1}/{COATS.length}</span>
          </button>
          <button type="button" className="cv-nav" onClick={() => go(1)} aria-label="Áo sau">›</button>
        </div>

        <div className="cv-panel" hidden={!open}>
          <p className="cv-blurb">{coat.blurb}</p>
          <p className="cv-meta">Hợp: {coat.suits.join(' · ')} · +{coat.kb} KB</p>
          <div className="cv-acts">
            <button type="button" className="cv-act" onClick={() => setReplay(r => r + 1)}>Chạy lại hiệu ứng</button>
            <label className="cv-act cv-check">
              <input type="checkbox" checked={withPhoto} onChange={e => setWithPhoto(e.target.checked)} />
              Ảnh quán
            </label>
            <label className="cv-act cv-check">
              Link
              <input type="range" min={1} max={6} value={linkCount} style={{ width: 66 }}
                onChange={e => setLinkCount(Number(e.target.value))} />
              {linkCount}
            </label>
          </div>
          <p className="cv-hintline">Vuốt ngang hoặc ← → để đổi áo. Bàn này chỉ có trên bản thử; trang khách thật không có ô chọn nào.</p>
        </div>
      </div>
    </>
  );
}
