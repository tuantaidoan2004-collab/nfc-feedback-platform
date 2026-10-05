'use client';
/**
 * Ô "Dán link Google Maps của quán" (Tài 05/10): mỗi quán mặc định để trống; chủ quán tự dán link quán mình, hệ thống đưa
 * link cho tool Google Maps đọc đánh giá 1–5 sao rồi hiện ở Data và Dashboard. Dùng ở tab Data và bước Google của onboarding.
 * Ô báo "đúng link" đúng khi máy chủ sẽ nhận (lib/google/maps-link.ts).
 */
import { useState } from 'react';
import { mapsLink } from '@/lib/google/maps-link';
import styles from './maps-link.module.css';

type Props = { canManage: boolean; busy: boolean; current?: string | null; onSave: (url: string) => Promise<boolean>; onCancel?: () => void };

export default function MapsLinkCard({ canManage, busy, current, onSave, onCancel }: Props) {
  const [typed, setTyped] = useState(current ?? ''), url = mapsLink(typed);
  if (!canManage) return <section className={styles.card} data-maps-link>
    <div className={styles.head}><span className={styles.badge} aria-hidden="true">📍</span>
      <div><h3>Đánh giá Google của quán sẽ hiện ở đây</h3><p>Chủ quán dán link Google Maps của quán ở ô này, đánh giá 1–5 sao sẽ tự về.</p></div></div>
  </section>;
  return <section className={styles.card} data-maps-link>
    <div className={styles.head}><span className={styles.badge} aria-hidden="true">📍</span>
      <div><h3>Dán link Google Maps của quán</h3>
        <p>Hệ thống đọc đánh giá 1–5 sao từ link này rồi hiện ở Data và Dashboard — lần đầu vài phút sau khi lưu, sau đó mỗi ngày.</p></div></div>
    <ol className={styles.steps}>
      <li>Mở <a href="https://www.google.com/maps" target="_blank" rel="noreferrer">Google Maps ↗</a>, tìm đúng quán của bạn.</li>
      <li>Bấm <b>Chia sẻ</b> → <b>Sao chép đường liên kết</b>.</li>
      <li>Dán vào ô dưới rồi bấm <b>Lưu link</b>.</li>
    </ol>
    <input className={styles.input} value={typed} placeholder="https://maps.app.goo.gl/…" aria-label="Link Google Maps của quán"
      autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode="url" onChange={event => setTyped(event.target.value)}
      // Pasting the whole share text ("Tên quán https://maps.app.goo.gl/…") leaves just the link in the field.
      onPaste={event => { const link = mapsLink(event.clipboardData.getData('text')); if (link) { event.preventDefault(); setTyped(link); } }} />
    <p className={styles.check} data-ready={url ? 'true' : 'false'} aria-live="polite">
      {url ? '✓ Đúng link Google Maps' : typed.trim() ? 'Chưa phải link Google Maps của một quán (link thường bắt đầu bằng https://maps.app.goo.gl/)' : 'Link sẽ được kiểm ngay khi bạn dán.'}</p>
    <div className={styles.actions}>
      <button type="button" className={styles.save} disabled={!url || busy || url === current} onClick={() => url && void onSave(url)}>{busy ? 'Đang lưu…' : 'Lưu link'}</button>
      {url && <a href={url} target="_blank" rel="noreferrer">Mở thử link ↗</a>}
      {onCancel && <button type="button" className={styles.cancel} onClick={onCancel}>Huỷ</button>}
    </div>
  </section>;
}
