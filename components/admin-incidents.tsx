'use client';
import { useState } from 'react';
import styles from './admin.module.css';
import { buttonClass } from './platform/ui';
import type { IncidentForReview } from '@/lib/admin/page-incidents';

/**
 * Báo cáo tạm dừng khẩn cấp (lát P4): an owner stopped a page because something went wrong. The page stays stopped until
 * the owner or an administrator starts it again. How the shop is compensated is still to be decided (Tài, 25/09); the
 * note written here records what was done.
 */
const REASONS: Record<string, string> = { emergency: 'chủ quán dừng khẩn cấp', admin: 'admin tạm dừng', billing: 'gói hết hạn' };
const ERRORS: Record<string, string> = {
  INCIDENT_ALREADY_RESOLVED: 'Báo cáo này đã được xử lý ở nơi khác; danh sách đã cập nhật.',
  NOTE_REQUIRED: 'Cần ghi đã xử lý thế nào (tối đa 1000 ký tự).',
  PAGE_NOT_PAUSED: 'Trang không còn tạm ngừng.', PAGE_CLOSED: 'Trang đã đóng.',
};

export default function AdminIncidents({ initial, origin }: { initial: IncidentForReview[]; origin: string | null }) {
  const [items, setItems] = useState(initial), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const post = async (url: string, body: unknown) => {
    const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (response.ok) return true;
    const { error: code } = await response.json().catch(() => ({ error: '' }));
    setError(ERRORS[code] ?? 'Không làm được. Vui lòng thử lại.'); return code === 'INCIDENT_ALREADY_RESOLVED' ? 'gone' : false;
  };
  const act = async (item: IncidentForReview, action: 'resume' | 'close') => {
    if (action === 'close' && window.prompt(`Đóng vĩnh viễn trang /${item.page_slug}? Link sẽ không tồn tại nữa và không bao giờ cấp lại. Gõ đúng mã trang để xác nhận.`) !== item.page_slug) return;
    setBusy(item.id); setError('');
    try { if (await post(`/gov/api/pages/${item.page_id}`, { action }) === true)
      setItems(current => current.map(row => row.page_id === item.page_id ? { ...row, page_state: action === 'resume' ? 'active' : 'closed', pause_reason: null } : row)); }
    catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(''); }
  };
  const resolve = async (item: IncidentForReview) => {
    const resolution = window.prompt('Đã xử lý thế nào? (ghi lại để tra sau)');
    if (!resolution) return;
    setBusy(item.id); setError('');
    try { if (await post(`/gov/api/incidents/${item.id}`, { resolution })) setItems(current => current.filter(row => row.id !== item.id)); }
    catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(''); }
  };
  return <section className={styles.panel} data-incidents>
    <h2>Báo cáo tạm dừng {items.length > 0 && <span>({items.length})</span>}</h2>
    <p className={styles.muted}>Chủ quán bấm tạm dừng khẩn cấp khi trang có lỗi: khách quét thấy &quot;Trang tạm ngừng&quot;, dữ liệu giữ nguyên.</p>
    {items.length === 0 ? <p className={styles.muted} data-incidents-empty>Không có báo cáo nào đang chờ.</p> :
      <ul className={styles.items}>{items.map(item => <li key={item.id} data-incident={item.id}>
        <p><strong>{item.shop_name}</strong> · trang {origin ? <a href={`${origin}/${item.page_slug}`} target="_blank" rel="noreferrer">/{item.page_slug}</a> : `/${item.page_slug}`}
          {item.page_label && ` (${item.page_label})`} · <span data-incident-state>{item.page_state === 'paused' ? `tạm ngừng — ${REASONS[item.pause_reason ?? ''] ?? ''}` : item.page_state === 'closed' ? 'đã đóng' : 'đang chạy'}</span></p>
        <p className={styles.muted}>{new Date(item.created_at).toLocaleString('vi-VN')} · Chủ quán ghi: {item.reason}</p>
        <div className={styles.actions}>
          {item.page_state === 'paused' && <button className={buttonClass('primary')} disabled={busy === item.id} onClick={() => void act(item, 'resume')}>Mở lại trang</button>}
          {item.page_state !== 'closed' && <button className={buttonClass('danger')} disabled={busy === item.id} onClick={() => void act(item, 'close')}>Đóng trang</button>}
          <button className={buttonClass('secondary')} disabled={busy === item.id} onClick={() => void resolve(item)}>Đã xử lý</button>
        </div>
      </li>)}</ul>}
    {error && <p role="alert" className={styles.muted}>{error}</p>}
  </section>;
}
