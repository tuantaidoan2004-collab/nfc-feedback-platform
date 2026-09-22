'use client';

import { useState } from 'react';
import ShopFeedbackV2 from './shop-feedback-v2';
import { COATS } from '@/lib/publishing/coats';
import { defaultConfig, STEM_BACKGROUND, type PageConfig } from '@/lib/publishing/config';
import './coat-viewer.css';

/**
 * Bàn xem áo khoác (lát A29). Chỉ tồn tại ngoài production — cổng ở `app/xem/page.tsx`.
 *
 * Nó dựng **đúng** component trang khách, không phải bản sao: cùng DOM, cùng hành vi, cùng
 * `guest-page.css`. Thứ duy nhất đổi giữa các lần bấm là thuộc tính `data-coat`. Nếu một áo
 * trông khác ở đây thì nó cũng khác đúng như vậy trên trang thật.
 */
export default function CoatViewer({ shopSlug, shopName }: { shopSlug: string; shopName: string }) {
  const [coat, setCoat] = useState<string | undefined>(COATS[0]?.id);
  const [withPhoto, setWithPhoto] = useState(true);
  const [open, setOpen] = useState(false);

  const config: PageConfig = {
    ...defaultConfig(shopName),
    poster: withPhoto ? { kind: 'image', url: STEM_BACKGROUND.still } : null,
  };
  const active = COATS.find(c => c.id === coat);

  return (
    <>
      <ShopFeedbackV2
        key={`${coat ?? 'goc'}-${withPhoto}`}
        coat={coat}
        pageConfig={config}
        slug={shopSlug}
        name={shopName}
        googleUrl="https://www.google.com/maps"
        heroUrl={null}
        heroKind={null}
      />

      <div className={`cv-dock${open ? '' : ' cv-dock-shut'}`}>
        <button type="button" className="cv-toggle" onClick={() => setOpen(v => !v)}
          aria-expanded={open} aria-controls="cv-panel">
          {open ? '▾' : '▴'} Áo khoác
        </button>
        <div id="cv-panel" className="cv-panel" hidden={!open}>
          <div className="cv-row">
            <button type="button" className="cv-coat" aria-pressed={coat === undefined}
              onClick={() => setCoat(undefined)}>
              <span className="cv-name">Bản gốc</span>
              <span className="cv-line">trang đang chạy hôm nay</span>
            </button>
            {COATS.map(c => (
              <button key={c.id} type="button" className="cv-coat" aria-pressed={coat === c.id}
                onClick={() => setCoat(c.id)}>
                <span className="cv-name">{c.name}</span>
                <span className="cv-line">{c.line}</span>
              </button>
            ))}
          </div>
          <div className="cv-foot">
            <label className="cv-check">
              <input type="checkbox" checked={withPhoto} onChange={e => setWithPhoto(e.target.checked)} />
              Có ảnh quán
            </label>
            <span className="cv-kb">
              {active ? `${active.name} · +${active.kb} KB · hợp: ${active.suits.slice(0, 3).join(', ')}` : 'Không mặc áo nào'}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
