'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './admin.module.css';
import { buttonClass } from './platform/ui';
import PageThumb from './canvas/thumb';
import type { PublishReviewRow } from '@/lib/admin/publish-reviews';

/**
 * Lần phát hành đầu chờ duyệt (kịch bản mục 4): a shop that signed itself up pressed Gửi duyệt. Tài looks at the page as the
 * guest would get it -- the picture, and the draft opened full size -- and approves that very draft, or sends it back with
 * a reason the owner reads in the editor. Approving lets the shop publish on its own from then on.
 */
const ERRORS: Record<string, string> = {
  REVIEW_ALREADY_DECIDED: 'Trang này đã có quyết định ở nơi khác; danh sách đã cập nhật.',
  DRAFT_CHANGED: 'Chủ quán vừa sửa trang. Danh sách đã tải bản mới nhất — xem lại rồi duyệt.',
  REASON_REQUIRED: 'Cần ghi lý do (tối đa 500 ký tự) để chủ quán biết sửa gì.',
  MEDIA_PENDING: 'Trang có ảnh đang chờ duyệt: duyệt ảnh ở khung "Ảnh chờ duyệt" trước.',
  MEDIA_REJECTED: 'Trang có ảnh đã bị từ chối; chủ quán cần thay ảnh.', MEDIA_UNKNOWN: 'Trang có ảnh chưa qua duyệt.',
  PAGE_NOT_PUBLISHABLE: 'Bản nháp hiện chưa phát hành được (sai luật trang). Chủ quán cần sửa.',
  PAGE_CLOSED: 'Trang đã đóng.', SHOP_SUSPENDED: 'Quán đang bị tạm khoá.',
};
const when = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

export default function AdminPublishReviews({ initial, origin }: { initial: PublishReviewRow[]; origin: string | null }) {
  const router = useRouter();
  const [items, setItems] = useState(initial), [busy, setBusy] = useState(''), [error, setError] = useState(''), [refusing, setRefusing] = useState<string | null>(null);
  const decide = async (item: PublishReviewRow, body: { decision: 'approve'; revision: number } | { decision: 'reject'; reason: string }) => {
    setBusy(item.id); setError('');
    try {
      const response = await fetch(`/gov/api/publish-reviews/${item.id}`, { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        const { error: code } = await response.json().catch(() => ({ error: '' }));
        setError(ERRORS[code] ?? 'Không lưu được quyết định. Vui lòng thử lại.');
        // The page draws the list afresh, keyed by each draft's revision (app/gov/page.tsx), so the newer draft replaces this one.
        if (code === 'DRAFT_CHANGED') router.refresh();
        if (code !== 'REVIEW_ALREADY_DECIDED') return;
      }
      setItems(current => current.filter(row => row.id !== item.id)); setRefusing(null);
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(''); }
  };
  return <section className={styles.panel} data-publish-reviews>
    <h2>Trang chờ duyệt lần đầu {items.length > 0 && <span>({items.length})</span>}</h2>
    <p className={styles.muted}>Quán tự đăng ký dùng ngay mọi thứ, riêng lần phát hành đầu chờ ở đây: một trang lừa đảo trên tên miền là Chrome gắn
      &quot;Nguy hiểm&quot; cả tên miền. Duyệt là phát hành đúng bản nháp đang thấy, và từ đó quán tự phát hành.</p>
    {items.length === 0 ? <p className={styles.muted} data-publish-reviews-empty>Không có trang nào đang chờ.</p> :
      <ul className={styles.items}>{items.map(item => <li key={item.id} data-publish-review={item.page_slug} className={styles.mediaItem}>
        <a href={`/gov/xem/${item.page_id}`} target="_blank" rel="noreferrer" aria-label={`Mở bản nháp /${item.page_slug}`}
          style={{ position: 'relative', display: 'block', width: 120, aspectRatio: '390 / 700', borderRadius: 12, overflow: 'hidden', background: 'var(--p-sunken)' }}>
          <PageThumb src={`/gov/xem/${item.page_id}?anh=1`} title={`Bản nháp /${item.page_slug}`} /></a>
        <div>
          <p><strong>{item.shop_name}</strong> · trang /{item.page_slug}{item.page_label && ` (${item.page_label})`}</p>
          <p className={styles.muted}>
            {item.owner_handle ? `@${item.owner_handle}` : 'Chưa có chủ'}{item.owner_email && ` · ${item.owner_email}`} · gửi lúc {when(item.requested_at)}
            {item.google_address && <><br />Google: {item.google_address}</>}</p>
          <p className={styles.muted}><a href={`/gov/xem/${item.page_id}`} target="_blank" rel="noreferrer">Mở bản nháp ↗</a>
            {origin && <> · sẽ lên ở {origin.replace(/^https?:\/\//, '')}/{item.page_slug}</>} · bản nháp {item.revision}</p>
          {refusing === item.id
            ? <form className={styles.form} onSubmit={event => { event.preventDefault();
                void decide(item, { decision: 'reject', reason: String(new FormData(event.currentTarget).get('reason') ?? '') }); }}>
                <label>Lý do (chủ quán sẽ đọc)<input name="reason" required maxLength={500} placeholder="Trang dùng tên và logo của một thương hiệu khác"/></label>
                <button className={buttonClass('danger')} disabled={busy === item.id}>Gửi lại cho chủ quán</button>
                <button type="button" className={buttonClass('quiet')} onClick={() => setRefusing(null)}>Huỷ</button>
              </form>
            : <div className={styles.actions}>
                <button className={buttonClass('primary')} disabled={busy === item.id} onClick={() => void decide(item, { decision: 'approve', revision: item.revision })}>Duyệt và phát hành</button>
                <button className={buttonClass('secondary')} disabled={busy === item.id} onClick={() => setRefusing(item.id)}>Chưa duyệt…</button>
              </div>}
        </div>
      </li>)}</ul>}
    {error && <p role="alert" className={styles.muted}>{error}</p>}
  </section>;
}
