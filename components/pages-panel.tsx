'use client';
import { useState } from 'react';

import { FREE_PAGES, vnd, type Price } from '@/lib/publishing/pricing';
import type { PageSummary } from '@/lib/owner/pages';
import styles from './owner-app.module.css';
// Same stylesheets as the framed pictures, so framing one adds no new global CSS (see guest-styles.ts).
import './guest-styles';
import { TEMPLATE_KEYS, isTemplateKey, TEMPLATE_NAMES, TEMPLATE_PRICES } from '@/lib/publishing/templates';

/**
 * The shop's pages (lát P3, docs/goi-va-trang.md mục 3): a picture of each beside its link, its template and whether it
 * is live. Choosing one points the editor and the cards below at it. The owner makes new pages two ways -- a copy of
 * the chosen page, or a template fresh from the library -- and each starts as a draft at its own permanent link.
 */
export type PageList = { pages: PageSummary[]; monthly: number; canManage: boolean };
const ERRORS: Record<string, string> = {
  OWNER_ROLE_REQUIRED: 'Chỉ tài khoản chủ shop tạo được trang mới, vì mỗi trang là một gói.',
  IMPERSONATION_READ_ONLY: 'Quản trị không tạo hay đổi tên trang của shop.',
  INVALID_PAGE: 'Tên trang tối đa 60 ký tự.',
  REASON_REQUIRED: 'Cần ghi lỗi gì (tối đa 1000 ký tự) để nền tảng xử lý.',
  PAGE_NOT_LIVE: 'Trang chưa chạy nên không cần tạm dừng.', PAGE_CLOSED: 'Trang này đã đóng.',
  PAUSE_NOT_YOURS: 'Trang do nền tảng tạm dừng; liên hệ nền tảng để mở lại.',
};
const templateName = (key: string) => isTemplateKey(key) ? TEMPLATE_NAMES[key] : key;
/** What one page costs a month (lib/publishing/pricing.ts). Nothing is charged yet; the panel says so. */
const priceLabel = (price: Price) => price.free === 'template' ? 'Miễn phí (khuôn miễn phí)' : price.free === 'slot' ? 'Miễn phí (suất miễn phí)'
  : price.billable ? `${vnd(price.monthly)}/tháng` : `${vnd(price.list)}/tháng khi chạy`;
const STATE: Record<PageSummary['state'], string> = { draft: 'Chưa phát hành', active: 'Đang chạy', paused: 'Tạm ngừng', closed: 'Đã đóng' };

export default function PagesPanel({ shop, endpoint, origin, list, selected, onSelect, onChanged }: {
  shop: string; endpoint: string; origin: string; list: PageList | null; selected: string | null;
  onSelect: (page: string) => void; onChanged: (select?: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [template, setTemplate] = useState<string>(TEMPLATE_KEYS[0]), [label, setLabel] = useState('');
  const send = async (method: 'POST' | 'PATCH', body: unknown, done: (data: { slug: string }) => string) => {
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`${endpoint}/pages`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(ERRORS[data.error] ?? 'Chưa làm được. Thử lại.'); return; }
      setNotice(done(data)); await onChanged(method === 'POST' ? data.slug : undefined);
    } catch { setNotice('Không thể kết nối. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  };
  if (!list) return <section className={styles.panel} aria-label="Trang" data-pages><h2>Trang</h2><p className={styles.hint}>Đang tải…</p></section>;
  const current = selected ?? (list.pages.find(page => page.state !== 'closed') ?? list.pages[0])?.slug;
  return <section className={styles.panel} aria-label="Trang" data-pages>
    <h2>Trang ({list.pages.length})</h2>
    <p className={styles.hint}>Mỗi trang là một link riêng, với khuôn, nội dung và thẻ NFC riêng. Chọn một trang để sửa nó và thẻ của nó ở bên dưới.
      Trang mới là bản nháp: khách chỉ thấy sau khi bạn bấm <strong>Phát hành</strong>.</p>
    <p className={styles.hint} data-pages-price>Dự kiến: <strong>{vnd(list.monthly)}/tháng</strong> · {FREE_PAGES} trang có phí đầu tiên được miễn,
      khuôn miễn phí không tính vào đó. <strong>Chưa thu phí</strong> trong giai đoạn thử.</p>
    <ul className={styles.pageList}>{list.pages.map(page => <li key={page.slug} className={styles.pageRow} data-page={page.slug} aria-current={page.slug === current}>
      <div className={styles.thumb} aria-hidden="true">
        {/* A picture, so no script runs in it: server HTML and CSS only -- nothing hydrates, nothing is recorded. */}
        <iframe src={`/ZZZ/${shop}/thumb/${page.slug}`} sandbox="allow-same-origin" loading="lazy" tabIndex={-1} title={`Ảnh trang ${page.slug}`} />
      </div>
      <div>
        <h3>{page.label || templateName(page.template.key)}</h3>
        <p><a href={`${origin}/${page.slug}`} target="_blank" rel="noreferrer">{origin.replace(/^https?:\/\//, '')}/{page.slug}</a></p>
        <p>{templateName(page.template.key)} · bản {page.template.version} · <span className={styles.badge} data-page-state={page.state}>
          {STATE[page.state]}{page.state === 'paused' && page.pauseReason !== 'emergency' ? ' (do nền tảng)' : ''}</span></p>
        <p data-page-price>{priceLabel(page.price)}</p>
      </div>
      <div className={styles.rowButtons}>
        {page.state !== 'closed' && <button type="button" disabled={page.slug === current} onClick={() => onSelect(page.slug)}>{page.slug === current ? 'Đang sửa' : 'Sửa trang này'}</button>}
        {/* Tài, 25/09: an emergency stop for when something is wrong -- at once, with a report to the platform. */}
        {list.canManage && page.state === 'active' && <button type="button" disabled={busy} data-pause={page.slug} onClick={() => {
          const reason = window.prompt('Tạm dừng trang này ngay? Khách quét sẽ thấy "Trang tạm ngừng", dữ liệu giữ nguyên, và nền tảng nhận báo cáo.\nGhi ngắn lỗi gì:');
          if (reason) void send('POST', { action: 'pause', page: page.slug, reason }, () => 'Đã tạm dừng trang và gửi báo cáo cho nền tảng. Bấm "Mở lại" khi đã ổn.');
        }}>Tạm dừng khẩn cấp</button>}
        {list.canManage && page.state === 'paused' && page.pauseReason === 'emergency' && <button type="button" disabled={busy} data-resume={page.slug}
          onClick={() => void send('POST', { action: 'resume', page: page.slug }, () => 'Đã mở lại trang: khách thấy trang như trước.')}>Mở lại</button>}
        {page.state !== 'closed' && <button type="button" disabled={busy} data-rename={page.slug} onClick={() => {
          const name = window.prompt('Tên trang (chỉ bạn thấy, ví dụ "Phòng VIP")', page.label);
          if (name !== null) void send('PATCH', { page: page.slug, label: name }, () => 'Đã đổi tên trang.');
        }}>Đổi tên</button>}
        {list.canManage && page.state !== 'closed' && <button type="button" disabled={busy} data-copy={page.slug}
          onClick={() => void send('POST', { copy: page.slug, label: page.label ? `${page.label} (bản sao)`.slice(0, 60) : '' },
            data => `Đã nhân bản thành trang mới ${data.slug}. Sửa rồi bấm Phát hành để khách thấy.`)}>Nhân bản</button>}
      </div>
    </li>)}</ul>
    {list.canManage && <div className={styles.toolRow} data-new-page>
      <label>Trang mới từ kho khuôn<select value={template} onChange={e => setTemplate(e.target.value)}>
        {TEMPLATE_KEYS.map(key => <option key={key} value={key}>{TEMPLATE_NAMES[key]} — {TEMPLATE_PRICES[key] ? `${vnd(TEMPLATE_PRICES[key])}/tháng` : 'miễn phí'}</option>)}</select></label>
      <label>Tên trang<input value={label} maxLength={60} placeholder="Ví dụ: Quầy bar" onChange={e => setLabel(e.target.value)} /></label>
      <button type="button" disabled={busy} onClick={() => void send('POST', { template, label },
        data => { setLabel(''); return `Đã tạo trang mới ${data.slug} từ khuôn ${templateName(template)}. Dùng "Nhập dữ liệu từ trang khác" để lấy nội dung của quán.`; })}>Tạo trang</button>
    </div>}
    <p role="status" className={styles.notice} data-pages-notice>{notice}</p>
  </section>;
}
