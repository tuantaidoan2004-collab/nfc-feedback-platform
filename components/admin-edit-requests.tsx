'use client';
import { useState } from 'react';
import styles from './admin.module.css';
import { buttonClass } from './platform/ui';
import PageThumb from './canvas/thumb';
import type { EditRequestRow } from '@/lib/admin/edit-requests';

/**
 * Trang chờ Admin Tài dựng (Tài 06/10): a shop picked a template and left its Zalo. Message it ("Nhắn Zalo"), mark that it is
 * done ("Đã nhắn Zalo" -- the owner then reads "Admin Tài đang chỉnh"), gather its details and files, and hand them to the agent
 * with the line under the request; the agent's publish closes it. "Đóng" closes one without publishing.
 */
const when = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
/** How long the shop has waited, in the largest unit that reads naturally. */
function waited(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 60 ? `${minutes} phút` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} giờ` : `${Math.round(minutes / 1440)} ngày`;
}
const spaced = (phone: string) => phone.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');

export default function AdminEditRequests({ initial }: { initial: EditRequestRow[] }) {
  const [items, setItems] = useState(initial), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const act = async (item: EditRequestRow, action: 'contacted' | 'done') => {
    setBusy(item.id); setError('');
    try {
      const response = await fetch(`/gov/api/edit-requests/${item.id}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }) });
      if (!response.ok && response.status !== 409) { setError('Chưa lưu được. Thử lại.'); return; }
      setItems(current => action === 'done' || response.status === 409 ? current.filter(row => row.id !== item.id)
        : current.map(row => row.id === item.id ? { ...row, contacted_at: new Date().toISOString() } : row));
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(''); }
  };
  return <section className={styles.panel} data-edit-requests>
    <h2>Trang chờ dựng {items.length > 0 && <span>({items.length})</span>}</h2>
    <p className={styles.muted}>Quán chọn mẫu và để lại số Zalo. Nhắn quán lấy thông tin (link, giờ mở cửa, wifi, ảnh, logo…) và điều muốn sửa, rồi
      đưa agent cùng dòng <code>sua-trang</code> bên dưới; agent dựng, phát hành, yêu cầu tự đóng.</p>
    {items.length === 0 ? <p className={styles.muted}>Không có trang nào chờ dựng.</p> : <ul className={styles.items}>{items.map(item => <li key={item.id}
      data-edit-request={item.page_slug} className={styles.mediaItem}>
      <a href={`/gov/xem/${item.page_id}`} target="_blank" rel="noreferrer" aria-label={`Mở trang /${item.page_slug}`}
        style={{ position: 'relative', display: 'block', width: 120, aspectRatio: '390 / 700', borderRadius: 12, overflow: 'hidden', background: 'var(--p-sunken)' }}>
        <PageThumb src={`/gov/xem/${item.page_id}?anh=1`} title={`Trang /${item.page_slug}`} /></a>
      <div>
        <p><strong>{item.shop_name}</strong> · {item.page_label || 'Trang'} /{item.page_slug} · {item.template_name ? `mẫu ${item.template_name}` : 'chỉnh trang đang có'}
          {' · '}{item.page_state === 'active' ? 'trang cũ đang chạy' : 'chưa phát hành'}</p>
        <p data-edit-contact>Zalo <strong>{spaced(item.contact)}</strong> · @{item.owner_handle}{item.owner_email ? ` · ${item.owner_email}` : ''}</p>
        <p className={styles.muted}>Gửi {when(item.created_at)} · chờ {waited(item.created_at)} · {item.contacted_at ? `đã nhắn ${when(item.contacted_at)}` : 'chưa nhắn'}</p>
        <p>{item.message ? `“${item.message}”` : <em>Quán không ghi gì — hỏi qua Zalo.</em>}</p>
        <p><code>node scripts/sua-trang.mjs lay {item.page_slug}</code></p>
        <div className={styles.actions}>
          <a className={buttonClass('primary')} href={`https://zalo.me/${item.contact}`} target="_blank" rel="noreferrer">Nhắn Zalo</a>
          {!item.contacted_at && <button className={buttonClass('secondary')} disabled={busy === item.id} onClick={() => void act(item, 'contacted')}>Đã nhắn Zalo</button>}
          <a className={buttonClass('secondary')} href={`/gov/xem/${item.page_id}`} target="_blank" rel="noreferrer">Xem mẫu khách chọn</a>
          <button className={buttonClass('secondary')} disabled={busy === item.id} onClick={() => void act(item, 'done')}>Đóng</button>
        </div>
      </div>
    </li>)}</ul>}
    {error && <p role="alert" className={styles.muted}>{error}</p>}
  </section>;
}
