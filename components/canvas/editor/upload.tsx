'use client';
/**
 * Ảnh của quán trong trình sửa: "Tải ảnh lên" cho một phần tử ảnh hoặc nền khúc. Ảnh được thu nhỏ trong trình duyệt, gửi
 * thẳng vào kho bằng link ký ngắn hạn (lib/owner/media.ts), rồi chờ duyệt ở /gov; trang dùng được ngay trong bản nháp, nhưng
 * chỉ phát hành được khi mọi ảnh đã duyệt (lib/publishing/media-gate.ts). Mỗi ảnh cho biết nó đang ở đâu trong lượt duyệt.
 */
import { createContext, useContext, useState } from 'react';
import { POSTER, shrinkImage } from '@/lib/client/shrink-image';
import type { MediaState } from '@/lib/owner/design';
import Icon from '@/components/qs/icons';
import styles from './editor.module.css';

type Uploads = { shop: string; enabled: boolean; states: Record<string, MediaState>; added: (url: string) => void };
export const UploadContext = createContext<Uploads | null>(null);

const ERRORS: Record<string, string> = {
  UNSUPPORTED_MEDIA: 'Chỉ nhận ảnh JPG, PNG hoặc WebP.', MEDIA_TOO_LARGE: 'Ảnh quá lớn (tối đa 5 MB sau khi thu nhỏ).',
  UPLOAD_QUEUE_FULL: 'Quán đang có 20 ảnh chờ duyệt. Đợi duyệt bớt rồi tải tiếp.', UPLOADS_NOT_CONFIGURED: 'Kho ảnh chưa được cài trên máy chủ này.',
  LOGIN_REQUIRED: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi thử lại.', IMPERSONATION_ENDED: 'Phiên xem thay mặt đã kết thúc.',
};
const SAID: Record<MediaState, string> = { pending: 'Đang chờ duyệt — trang phát hành được khi ảnh được duyệt.', approved: 'Đã duyệt.',
  rejected: 'Ảnh bị từ chối — thay ảnh khác để phát hành.' };

/** Where a picture stands: null for the app's own pictures, which need no review. */
export function useReview(src: string | undefined): MediaState | 'unknown' | null {
  const uploads = useContext(UploadContext);
  if (!src || src.startsWith('art:') || src.startsWith('/tpl/')) return null;
  return uploads?.states[src] ?? 'unknown';
}

export function UploadButton({ value, onChange }: { value?: string; onChange: (url: string) => void }) {
  const uploads = useContext(UploadContext), review = useReview(value), [state, setState] = useState('');
  if (!uploads) return null;
  if (!uploads.enabled) return <p className={styles.note}>Máy chủ này chưa có kho ảnh, nên tạm dùng tranh có sẵn bên dưới.</p>;
  return <div className={styles.upload} data-upload>
    <label className={styles.chip}>
      <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = '';
        if (!file) return;
        setState('Đang chuẩn bị ảnh…');
        try {
          const shrunk = await shrinkImage(file, POSTER);
          setState('Đang tải lên…');
          const signed = await fetch(`/api/owner/v2/${uploads.shop}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: shrunk.type, size: shrunk.blob.size }) });
          const data = await signed.json().catch(() => ({}));
          if (!signed.ok) { setState(ERRORS[data.error] ?? 'Chưa tải lên được. Thử lại.'); return; }
          const sent = await fetch(data.upload, { method: 'PUT', headers: data.headers, body: shrunk.blob });
          if (!sent.ok) { setState('Kho ảnh từ chối tệp. Thử lại.'); return; }
          uploads.added(data.url); onChange(data.url); setState('');
        } catch { setState('Không thể kết nối tới kho ảnh. Thử lại.'); }
      }} />
      <Icon name="upload" size={16} />Tải ảnh lên
    </label>
    {state ? <p className={styles.note} role="status" data-upload-state>{state}</p>
      : review && <p className={review === 'approved' ? styles.note : styles.warn} data-review={review}>
        {review === 'unknown' ? 'Ảnh này không đến từ lượt tải lên của quán: thay ảnh khác để phát hành.' : SAID[review]}</p>}
  </div>;
}
