'use client';
/**
 * Ô Dashboard → kết nối Google (kịch bản mục 5), bố cục như "We found a few teams for you!" của Jitter: bên trái lời dẫn,
 * bên phải thẻ trắng với kết quả và nút đen. Hai màn:
 *   1. Place ID (Tài 05/10; 08/10: tự tìm từ link): một ô dán link Google Maps của quán hoặc chính mã; link đánh giá hiện ra ngay khi
 *      có mã (link rút gọn thì máy chủ mở link để tìm) (bắt buộc: nút Google trên trang cần link);
 *   2. "Kết nối với Google Business để đồng bộ đánh giá 5 sao" (bỏ qua được, làm lại sau ở tab Data). Trước khi Google cấp
 *      quyền API: chủ quán dán link Google Maps của quán, tool Google Maps trên máy Tài đọc đánh giá (nguồn `maps`).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './gray.module.css';
import Icon from '../icons';
import { ESTIMATE, useGoogleBusiness } from '../tabs/google-business';
import MapsLinkCard from '../tabs/maps-link';
import { parsePlaceId, PLACE_ID_FINDER, reviewLink } from '@/lib/google/place-id';
import { mapsLink } from '@/lib/google/maps-link';

type Saved = { name: string; placeId: string | null; reviewLink: string | null };

export default function GoogleStep({ slug }: { slug: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<'place' | 'business'>('place');
  const [saved, setSaved] = useState<Saved | null>(null), [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const business = useGoogleBusiness(slug);
  const load = async (advance = false) => {
    const response = await fetch(`/api/owner/v2/${slug}/places`, { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return;
    const body = await response.json() as Saved; setSaved(body);
    if (advance && body.reviewLink) setStage('business');
  };
  useEffect(() => { void Promise.resolve().then(() => load(true)); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  const placeId = parsePlaceId(typed);
  // A short share link (maps.app.goo.gl) is opened by the server, which finds the Place ID behind it.
  const shortLink = !placeId && mapsLink(typed) !== null;
  const save = async () => {
    if (!placeId && !shortLink) return;
    setBusy(true); setError('');
    const response = await fetch(`/api/owner/v2/${slug}/places`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId: placeId ?? typed }) }).catch(() => null);
    setBusy(false);
    if (!response?.ok) { setError(shortLink ? 'Chưa tìm ra Place ID từ link này. Dán link đầy đủ của quán hoặc Place ID.' : 'Chưa lưu được. Kiểm tra lại mã rồi thử lần nữa.'); return; }
    setTyped(''); await load(); setStage('business');
  };
  const finish = async () => {
    setBusy(true);
    const response = await fetch(`/api/owner/v2/${slug}/onboarding`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'dashboard' }) }).catch(() => null);
    setBusy(false);
    if (!response?.ok) { setError('Cần dán Place ID của quán trước.'); setStage('place'); return; }
    router.push('/bat-dau/tien-trinh');
  };
  const connection = business.data?.connection;

  if (stage === 'place') return <div className={styles.split}>
    <div>
      <div className={styles.badge} aria-hidden="true">📍</div>
      <h1 className={styles.headline}>Dán Place ID của quán</h1>
      <p className={styles.lead} style={{ marginTop: 18 }}>Place ID là mã Google đặt cho quán của bạn. Dán link Google Maps của quán (hoặc chính mã), hệ thống tự tìm mã và tạo sẵn link đánh giá Google cho trang.</p>
    </div>
    <div style={{ display: 'grid', gap: 18 }}>
      <div className={styles.panel}>
        <div className={styles.step}>
          <span className={styles.num}>1</span>
          <div><strong>Mở quán trên Google Maps, bấm Chia sẻ, sao chép link</strong><span>Hoặc tìm mã ở trang của Google: gõ tên quán, chọn đúng quán, Google hiện dòng “Place ID”.</span></div>
          <a className={`${styles.pill} ${styles.small}`} href={PLACE_ID_FINDER} target="_blank" rel="noreferrer">Mở trang tìm <Icon name="external" size={16} /></a>
        </div>
        <div className={styles.step}>
          <span className={styles.num}>2</span>
          <div><strong>Dán link Google Maps của quán, hoặc Place ID</strong>
            <input className={styles.field} style={{ marginTop: 12 }} placeholder="https://maps.app.goo.gl/… hoặc ChIJ…" value={typed} onChange={event => { setTyped(event.target.value); setError(''); }}
              // Pasting the finder's whole line or a link leaves just the ID in the field.
              onPaste={event => { const id = parsePlaceId(event.clipboardData.getData('text')); if (id) { event.preventDefault(); setTyped(id); setError(''); } }}
              aria-label="Place ID" autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode="text" />
          </div>
        </div>
        <div className={styles.link} data-ready={placeId ? 'true' : 'false'} aria-live="polite">
          <span className={styles.note}>{placeId ? 'Link đánh giá đã sẵn sàng' : shortLink ? 'Link rút gọn: bấm Lưu, hệ thống tự tìm Place ID' : 'Link đánh giá sẽ hiện ở đây'}</span>
          <code>search.google.com/local/writereview?placeid=<b>{placeId ?? (typed.trim() ? '…' : '')}</b></code>
          {placeId && <a href={reviewLink(placeId)} target="_blank" rel="noreferrer">Mở thử link ↗</a>}
          {typed.trim() && !placeId && !shortLink && <span className={styles.error}>Chưa giống Place ID hay link Google Maps của quán.</span>}
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.pill} disabled={busy || (!placeId && !shortLink)} onClick={() => void save()}>{busy ? 'Đang tìm…' : 'Lưu Place ID'}</button>
        {saved?.reviewLink && <button type="button" className={`${styles.pill} ${styles.soft}`} onClick={() => setStage('business')}>Giữ mã đã lưu</button>}
        <button type="button" className={styles.skipText} onClick={() => router.push('/bat-dau/tien-trinh')}>Quay lại</button>
      </div>
    </div>
  </div>;

  return <div className={styles.split}>
    <div>
      <div className={styles.badge} aria-hidden="true">⭐</div>
      <h1 className={styles.headline}>Kết nối với Google Business để đồng bộ đánh giá 5 sao</h1>
      <p className={styles.lead} style={{ marginTop: 18 }}>{business.data?.maps || connection?.mode === 'maps'
        ? 'Dán link Google Maps của quán — đánh giá 1–5 sao tự về tab Data, lần đầu sau vài phút, rồi mỗi ngày.'
        : 'Đăng nhập Google, bấm Cho phép — đánh giá 1–5 sao của quán tự về tab Data, và bạn trả lời ngay ở đó.'}</p>
    </div>
    <div style={{ display: 'grid', gap: 18 }}>
      <div className={styles.panel}>
        {saved?.reviewLink && <div className={styles.saved} data-place-saved>
          <strong>Link đánh giá của quán đã sẵn sàng</strong>
          {saved.placeId && <span className={styles.note}>Place ID: {saved.placeId}</span>}
          <a href={saved.reviewLink} target="_blank" rel="noreferrer">Mở thử link đánh giá ↗</a>
        </div>}
        {connection ? <div className={styles.row}><div><strong>{connection.locationTitle ?? (connection.mode === 'maps' ? 'Google Maps' : 'Google Business')}</strong>
          <span>{connection.lastSyncedAt ? `${connection.averageRating?.toFixed(1).replace('.', ',')}★ · ${connection.totalReviews} đánh giá (${ESTIMATE})${connection.mode === 'maps' ? ' · từ Google Maps' : ''}`
            : 'Đã nhận link. Đang lấy đánh giá lần đầu, thường vài phút — bạn cứ đi tiếp.'}</span></div>
          <span className="qs-pill free">Đã kết nối</span></div>
          : business.data?.maps ? <MapsLinkCard canManage={business.data.canManage} busy={business.busy} onSave={url => business.act('maps-link', url)} />
          : <p className={styles.note}><span className="qs-pill">Đang chờ Google cấp quyền API cho nền tảng</span> Bạn kết nối sau trong tab Data.</p>}
        {(business.error || error) && <p className={styles.error}>{business.error || error}</p>}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.pill} disabled={busy} onClick={() => void finish()}>{connection ? 'Xong bước Dashboard' : 'Tiếp tục'}</button>
        {!connection && <button type="button" className={`${styles.pill} ${styles.soft}`} disabled={busy} onClick={() => void finish()}>Để sau</button>}
        <button type="button" className={styles.skipText} onClick={() => setStage('place')}>Đổi Place ID</button>
      </div>
    </div>
  </div>;
}
