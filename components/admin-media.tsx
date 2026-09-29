'use client';
import { useEffect, useState } from 'react';
import styles from './admin.module.css';
import { buttonClass } from './platform/ui';
import type { MediaForReview } from '@/lib/admin/media-review';

/**
 * Cửa duyệt ảnh (migration 023): every picture or video a shop uploads waits here. Nothing reaches a guest page until
 * it is approved; a refusal carries a reason the shop reads in its editor. Shown with the file itself, so the decision
 * is made on what the guest would see, not on a file name.
 */
const size = (bytes: number | null) => bytes === null ? '' : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const clock = (value: string) => new Date(value).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });

export default function AdminMedia({ initial }: { initial: MediaForReview[] }) {
  const [items, setItems] = useState(initial), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [refusing, setRefusing] = useState<string | null>(null);
  // Uploads whose link still works, as the database said when the list was drawn; each opens when its link has expired
  // (lib/owner/media.ts, UPLOAD_SETTLE_SECONDS). The server refuses an early decision anyway.
  const [uploading, setUploading] = useState(() => new Set(initial.filter(item => item.uploading).map(item => item.id)));
  useEffect(() => {
    const waiting = items.filter(item => uploading.has(item.id));
    if (!waiting.length) return;
    const next = Math.min(...waiting.map(item => new Date(item.ready_at).getTime()));
    const timer = setTimeout(() => setUploading(new Set(waiting.filter(item => new Date(item.ready_at).getTime() > Date.now()).map(item => item.id))),
      Math.max(0, next - Date.now()) + 250);
    return () => clearTimeout(timer);
  }, [items, uploading]);
  const decide = async (id: string, body: { decision: 'approve' } | { decision: 'reject'; reason: string }) => {
    setBusy(id); setError('');
    try {
      const response = await fetch(`/gov/api/media/${id}`, { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) { const { error: code } = await response.json().catch(() => ({ error: '' }));
        setError(code === 'MEDIA_ALREADY_REVIEWED' ? 'Ảnh này đã có quyết định ở nơi khác; danh sách đã cập nhật.' : code === 'REASON_REQUIRED' ? 'Cần ghi lý do (tối đa 300 ký tự).'
          : code === 'MEDIA_STILL_UPLOADING' ? 'Link tải lên của tệp này còn hiệu lực; duyệt được sau ít phút.' : 'Không lưu được quyết định. Vui lòng thử lại.');
        if (code !== 'MEDIA_ALREADY_REVIEWED') return; }
      setItems(current => current.filter(item => item.id !== id)); setRefusing(null);
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(''); }
  };
  return <section className={styles.panel} data-media-review>
    <h2>Ảnh chờ duyệt {items.length > 0 && <span>({items.length})</span>}</h2>
    <p className={styles.muted}>Ảnh và video shop tải lên chỉ lên trang khách sau khi được duyệt. Trong lúc chờ, trang đang chạy của shop vẫn giữ nguyên.</p>
    {items.length === 0 ? <p className={styles.muted} data-media-empty>Không có ảnh nào đang chờ.</p> :
      <ul className={styles.items}>
        {items.map(item => { const stillUploading = uploading.has(item.id); return <li key={item.id} data-media-item={item.id} className={styles.mediaItem}>
          {item.kind === 'video'
            ? <video src={item.url} muted playsInline controls preload="metadata" className={styles.mediaThumb} />
            // eslint-disable-next-line @next/next/no-img-element -- a picture on the public media store, sized by CSS
            : <img src={item.url} alt={`Ảnh của ${item.shop_name}`} className={styles.mediaThumb} />}
          <div>
            <p><strong>{item.shop_name}</strong> · /{item.slug}</p>
            <p className={styles.muted}>{item.kind === 'video' ? 'Video' : 'Ảnh'} {size(item.size_bytes)} · tải lên {new Date(item.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
            {/* While its upload link still works the file can still change: decided on what will stay, not on what is there now. */}
            {stillUploading && <p className={styles.muted} data-media-uploading>Link tải lên còn hiệu lực tới {clock(item.ready_at)}; duyệt được từ lúc đó.</p>}
            {refusing === item.id
              ? <form className={styles.form} onSubmit={event => { event.preventDefault();
                  void decide(item.id, { decision: 'reject', reason: String(new FormData(event.currentTarget).get('reason') ?? '') }); }}>
                  <label>Lý do (shop sẽ đọc)<input name="reason" required maxLength={300} placeholder="Logo của một thương hiệu khác"/></label>
                  <button className={buttonClass('danger')} disabled={busy === item.id}>Xác nhận từ chối</button>
                  <button type="button" className={buttonClass('quiet')} onClick={() => setRefusing(null)}>Huỷ</button>
                </form>
              : <div className={styles.actions}>
                  <button className={buttonClass('primary')} disabled={busy === item.id || stillUploading} onClick={() => void decide(item.id, { decision: 'approve' })}>Duyệt</button>
                  <button className={buttonClass('secondary')} disabled={busy === item.id || stillUploading} onClick={() => setRefusing(item.id)}>Từ chối…</button>
                </div>}
          </div>
        </li>; })}
      </ul>}
    {error && <p role="alert" className={styles.muted}>{error}</p>}
  </section>;
}
