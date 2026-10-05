'use client';
import { useState } from 'react';
import styles from './admin.module.css';
import { buttonClass } from './platform/ui';
import type { EditRequestRow } from '@/lib/admin/edit-requests';

/**
 * Trang chờ admin sửa (Tài 05/10): quán chọn mẫu rồi bấm "Nhờ admin sửa". Đọc ý của quán, lấy ảnh/video quán gửi qua Zalo,
 * đưa cả hai cho agent kèm dòng lệnh dưới mỗi yêu cầu; agent sửa và phát hành (scripts/sua-trang.mjs), yêu cầu tự đóng.
 */
export default function AdminEditRequests({ initial, origin }: { initial: EditRequestRow[]; origin: string | null }) {
  const [items, setItems] = useState(initial), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const done = async (id: string) => {
    setBusy(id); setError('');
    try {
      const response = await fetch(`/gov/api/edit-requests/${id}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok && response.status !== 409) { setError('Chưa lưu được. Thử lại.'); return; }
      setItems(current => current.filter(item => item.id !== id));
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(''); }
  };
  return <section className={styles.panel} data-edit-requests>
    <h2>Trang chờ sửa {items.length > 0 && <span>({items.length})</span>}</h2>
    <p className={styles.muted}>Quán bấm “Nhờ admin sửa”. Đưa agent ý của quán, file quán gửi qua Zalo và dòng <code>sua-trang</code> bên dưới; agent sửa, phát hành, yêu cầu tự đóng.</p>
    {items.length === 0 ? <p className={styles.muted}>Không có trang nào chờ sửa.</p> : <ul className={styles.items}>{items.map(item => <li key={item.id} data-edit-request={item.page_slug}>
      <p><strong>{item.shop_name}</strong> · {item.page_label || 'Trang'} /{item.page_slug} · {item.page_state === 'active' ? 'đang chạy' : 'chưa phát hành'} · @{item.owner_handle}{item.owner_email ? ` · ${item.owner_email}` : ''} · {new Date(item.created_at).toLocaleString('vi-VN')}</p>
      <p>{item.message ? `“${item.message}”` : <em>Quán không ghi gì — hỏi qua Zalo.</em>}</p>
      <p><code>node scripts/sua-trang.mjs lay {item.page_slug}</code></p>
      <div className={styles.actions}>{origin && item.page_state === 'active' && <a className={buttonClass('secondary')} href={`${origin}/${item.page_slug}`} target="_blank" rel="noreferrer">Trang khách</a>}
        <button className={buttonClass('secondary')} disabled={busy === item.id} onClick={() => void done(item.id)}>Đã xong</button></div>
    </li>)}</ul>}
    {error && <p role="alert" className={styles.muted}>{error}</p>}
  </section>;
}
