'use client';
import { useState } from 'react';
import { TEMPLATE_KEYS, isTemplateKey } from '@/lib/publishing/config';
import { TEMPLATE_NAMES } from '@/lib/publishing/versions';
import type { PageSummary } from '@/lib/owner/pages';
import styles from './owner-app.module.css';
// Same stylesheets as the framed pictures, so framing one adds no new global CSS (see guest-styles.ts).
import './guest-styles';

/**
 * The shop's pages (lát P3, docs/goi-va-trang.md mục 3): a picture of each beside its link, its template and whether it
 * is live. Choosing one points the editor and the cards below at it. The owner makes new pages two ways -- a copy of
 * the chosen page, or a template fresh from the library -- and each starts as a draft at its own permanent link.
 */
export type PageList = { pages: PageSummary[]; canManage: boolean };
const ERRORS: Record<string, string> = {
  OWNER_ROLE_REQUIRED: 'Chỉ tài khoản chủ shop tạo được trang mới, vì mỗi trang là một gói.',
  IMPERSONATION_READ_ONLY: 'Quản trị không tạo hay đổi tên trang của shop.',
  INVALID_PAGE: 'Tên trang tối đa 60 ký tự.',
};
const templateName = (key: string) => isTemplateKey(key) ? TEMPLATE_NAMES[key] : key;

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
  const current = selected ?? list.pages[0]?.slug;
  return <section className={styles.panel} aria-label="Trang" data-pages>
    <h2>Trang ({list.pages.length})</h2>
    <p className={styles.hint}>Mỗi trang là một link riêng, với khuôn, nội dung và thẻ NFC riêng. Chọn một trang để sửa nó và thẻ của nó ở bên dưới.
      Trang mới là bản nháp: khách chỉ thấy sau khi bạn bấm <strong>Phát hành</strong>.</p>
    <ul className={styles.pageList}>{list.pages.map(page => <li key={page.slug} className={styles.pageRow} data-page={page.slug} aria-current={page.slug === current}>
      <div className={styles.thumb} aria-hidden="true">
        {/* A picture, so no script runs in it: server HTML and CSS only -- nothing hydrates, nothing is recorded. */}
        <iframe src={`/ZZZ/${shop}/thumb/${page.slug}`} sandbox="allow-same-origin" loading="lazy" tabIndex={-1} title={`Ảnh trang ${page.slug}`} />
      </div>
      <div>
        <h3>{page.label || templateName(page.template.key)}</h3>
        <p><a href={`${origin}/${page.slug}`} target="_blank" rel="noreferrer">{origin.replace(/^https?:\/\//, '')}/{page.slug}</a></p>
        <p>{templateName(page.template.key)} · bản {page.template.version} · <span className={styles.badge} data-page-state={page.state}>
          {page.state === 'active' ? 'Đang chạy' : 'Chưa phát hành'}</span></p>
      </div>
      <div className={styles.rowButtons}>
        <button type="button" disabled={page.slug === current} onClick={() => onSelect(page.slug)}>{page.slug === current ? 'Đang sửa' : 'Sửa trang này'}</button>
        <button type="button" disabled={busy} data-rename={page.slug} onClick={() => {
          const name = window.prompt('Tên trang (chỉ bạn thấy, ví dụ "Phòng VIP")', page.label);
          if (name !== null) void send('PATCH', { page: page.slug, label: name }, () => 'Đã đổi tên trang.');
        }}>Đổi tên</button>
        {list.canManage && <button type="button" disabled={busy} data-copy={page.slug}
          onClick={() => void send('POST', { copy: page.slug, label: page.label ? `${page.label} (bản sao)`.slice(0, 60) : '' },
            data => `Đã nhân bản thành trang mới ${data.slug}. Sửa rồi bấm Phát hành để khách thấy.`)}>Nhân bản</button>}
      </div>
    </li>)}</ul>
    {list.canManage && <div className={styles.toolRow} data-new-page>
      <label>Trang mới từ kho khuôn<select value={template} onChange={e => setTemplate(e.target.value)}>
        {TEMPLATE_KEYS.map(key => <option key={key} value={key}>{TEMPLATE_NAMES[key]}</option>)}</select></label>
      <label>Tên trang<input value={label} maxLength={60} placeholder="Ví dụ: Quầy bar" onChange={e => setLabel(e.target.value)} /></label>
      <button type="button" disabled={busy} onClick={() => void send('POST', { template, label },
        data => { setLabel(''); return `Đã tạo trang mới ${data.slug} từ khuôn ${templateName(template)}. Dùng "Nhập dữ liệu từ trang khác" để lấy nội dung của quán.`; })}>Tạo trang</button>
    </div>}
    <p role="status" className={styles.notice} data-pages-notice>{notice}</p>
  </section>;
}
