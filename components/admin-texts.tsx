'use client';
import { useState } from 'react';
import styles from './admin.module.css';
import { buttonClass } from './platform/ui';
import type { TextForReview } from '@/lib/admin/text-review';

/**
 * Cửa duyệt chữ (migration 030, lát M2b): a shop's own thank-you line waits here, shown as the guest would read it in
 * the card before Google. Nothing reaches a guest page until it is approved; a refusal carries a reason the shop reads.
 */
export default function AdminTexts({ initial }: { initial: TextForReview[] }) {
  const [items, setItems] = useState(initial), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [refusing, setRefusing] = useState<string | null>(null);
  const decide = async (id: string, body: { decision: 'approve' } | { decision: 'reject'; reason: string }) => {
    setBusy(id); setError('');
    try {
      const response = await fetch(`/gov/api/texts/${id}`, { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) { const { error: code } = await response.json().catch(() => ({ error: '' }));
        setError(code === 'TEXT_ALREADY_REVIEWED' ? 'Câu này đã có quyết định ở nơi khác; danh sách đã cập nhật.' : code === 'REASON_REQUIRED' ? 'Cần ghi lý do (tối đa 300 ký tự).' : 'Không lưu được quyết định. Vui lòng thử lại.');
        if (code !== 'TEXT_ALREADY_REVIEWED') return; }
      setItems(current => current.filter(item => item.id !== id)); setRefusing(null);
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(''); }
  };
  return <section className={styles.panel} data-text-review>
    <h2>Lời cảm ơn chờ duyệt {items.length > 0 && <span>({items.length})</span>}</h2>
    <p className={styles.muted}>Câu shop tự viết, hiện khi khách bấm nút Google. Từ chối khi câu nhắc sao, quà, tên nhân viên, hoặc hối thúc khách đánh giá.</p>
    {items.length === 0 ? <p className={styles.muted} data-texts-empty>Không có câu nào đang chờ.</p> :
      <ul className={styles.items}>
        {items.map(item => <li key={item.id} data-text-item={item.id}>
          <p><strong>{item.shop_name}</strong> · /{item.slug} · gửi {new Date(item.created_at).toLocaleString('vi-VN')}</p>
          <p>“{item.text_vi}”</p>
          <p className={styles.muted}>“{item.text_en}”</p>
          {refusing === item.id
            ? <form className={styles.form} onSubmit={event => { event.preventDefault();
                void decide(item.id, { decision: 'reject', reason: String(new FormData(event.currentTarget).get('reason') ?? '') }); }}>
                <label>Lý do (shop sẽ đọc)<input name="reason" required maxLength={300} placeholder="Câu đang nhắc khách cho 5 sao"/></label>
                <button className={buttonClass('danger')} disabled={busy === item.id}>Xác nhận từ chối</button>
                <button type="button" className={buttonClass('quiet')} onClick={() => setRefusing(null)}>Huỷ</button>
              </form>
            : <div className={styles.actions}>
                <button className={buttonClass('primary')} disabled={busy === item.id} onClick={() => void decide(item.id, { decision: 'approve' })}>Duyệt</button>
                <button className={buttonClass('secondary')} disabled={busy === item.id} onClick={() => setRefusing(item.id)}>Từ chối…</button>
              </div>}
        </li>)}
      </ul>}
    {error && <p role="alert" className={styles.muted}>{error}</p>}
  </section>;
}
