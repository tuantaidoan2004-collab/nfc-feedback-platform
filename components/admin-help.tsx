'use client';
import { useState } from 'react';
import styles from './admin.module.css';
import { buttonClass } from './platform/ui';
import type { HelpRow } from '@/lib/admin/help';

/** Yêu cầu "Nhờ admin tạo giúp" từ Library → More (kịch bản mục 8): mở quán, dựng giúp, rồi bấm Đã xong. */
export default function AdminHelp({ initial, origin }: { initial: HelpRow[]; origin: string | null }) {
  const [items, setItems] = useState(initial), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const done = async (id: string) => {
    setBusy(id); setError('');
    try {
      const response = await fetch(`/gov/api/help/${id}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok && response.status !== 409) { setError('Chưa lưu được. Thử lại.'); return; }
      setItems(current => current.filter(item => item.id !== id));
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(''); }
  };
  return <section className={styles.panel} data-help-requests>
    <h2>Nhờ tạo giúp {items.length > 0 && <span>({items.length})</span>}</h2>
    <p className={styles.muted}>Quán bấm “Nhờ admin tạo giúp” trong Library. Mở quán bằng “Xem thay mặt” ở bảng shop (quán phải bật hỗ trợ khấc Sửa), dựng trang, rồi bấm Đã xong.</p>
    {items.length === 0 ? <p className={styles.muted}>Không có yêu cầu nào.</p> : <ul className={styles.items}>{items.map(item => <li key={item.id}>
      <p><strong>{item.shop_name}</strong> · /{item.slug} · @{item.username}{item.email ? ` · ${item.email}` : ''} · {new Date(item.created_at).toLocaleString('vi-VN')}</p>
      {item.message && <p>“{item.message}”</p>}
      <div className={styles.actions}>{origin && <a className={buttonClass('secondary')} href={`${origin}/${item.slug}`} target="_blank" rel="noreferrer">Trang khách</a>}
        <button className={buttonClass('primary')} disabled={busy === item.id} onClick={() => void done(item.id)}>Đã xong</button></div>
    </li>)}</ul>}
    {error && <p role="alert" className={styles.muted}>{error}</p>}
  </section>;
}
