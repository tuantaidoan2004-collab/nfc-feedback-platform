'use client';
/**
 * Chờ chủ quán duyệt (G3, kịch bản mục 1 bước 5). Nhân viên thấy yêu cầu đã gửi tới quán nào, rút được, gửi thêm cho quán
 * khác bằng @chủ quán hay link trang; được duyệt thì có nút vào thẳng quán. Trang tự hỏi lại mỗi 20 giây.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './gray.module.css';

type Mine = { requests: { id: string; createdAt: string; decidedAt: string | null; outcome: string | null; shopName: string; shopSlug: string }[];
  shops: { slug: string; name: string }[] };
export const JOIN_ERRORS: Record<string, string> = {
  SHOP_NOT_FOUND: 'Chưa tìm thấy quán. Gõ @tài khoản của chủ quán, hoặc dán link trang của quán (link trên thẻ cũng được).',
  SHOP_AMBIGUOUS: 'Chủ quán này có nhiều quán. Dán link trang của đúng quán bạn làm.', ALREADY_MEMBER: 'Bạn đã ở trong quán này rồi.',
  TOO_MANY_REQUESTS: 'Bạn đang có nhiều yêu cầu chờ. Đợi chủ quán duyệt, hoặc rút bớt.', INVALID_MESSAGE: 'Lời nhắn tối đa 200 ký tự, không dùng < >.',
};
const STATUS: Record<string, string> = { approved: 'Đã duyệt', declined: 'Chủ quán chưa đồng ý', withdrawn: 'Bạn đã rút' };
const when = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });

export default function JoinWait({ handle, initial }: { handle: string; initial: Mine }) {
  const [mine, setMine] = useState(initial), [shop, setShop] = useState(''), [message, setMessage] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const response = await fetch('/api/start/join', { cache: 'no-store' }); if (response.ok) setMine(await response.json()); } catch { /* Next round. */ }
  }, []);
  const waiting = mine.requests.some(request => !request.decidedAt);
  useEffect(() => { if (!waiting) return; const timer = window.setInterval(() => void load(), 20000); return () => window.clearInterval(timer); }, [waiting, load]);
  const send = async (method: 'POST' | 'DELETE', body: object) => {
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/start/join', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(JOIN_ERRORS[data.error] ?? 'Chưa gửi được. Thử lại.'); return; }
      setMine(data); if (method === 'POST') { setShop(''); setMessage(''); setNotice(`Đã gửi yêu cầu vào ${data.shop}.`); }
    } catch { setNotice('Không thể kết nối. Thử lại.'); } finally { setBusy(false); }
  };
  return <div className={styles.split} data-join-wait>
    <div style={{ display: 'grid', gap: 14 }}>
      <h1 className={styles.headline}>{mine.shops.length ? 'Bạn đã vào quán' : waiting ? 'Đang chờ chủ quán duyệt' : 'Vào quán nơi bạn làm'}</h1>
      <p className={styles.lead}>Tài khoản <strong>@{handle}</strong>. Chủ quán (hoặc quản lý có quyền Thành viên) thấy yêu cầu của bạn ở <strong>Quản lý →
        Thành viên</strong>, chọn vai rồi duyệt. Trang này tự cập nhật.</p>
      {mine.shops.map(item => <Link key={item.slug} className={styles.pill} href={`/app/${item.slug}`} style={{ justifySelf: 'start' }} data-join-enter>Vào {item.name} →</Link>)}
    </div>
    <div style={{ display: 'grid', gap: 16 }}>
      {mine.requests.length > 0 && <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>{mine.requests.map(request =>
        <li key={request.id} className="qs-card" style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }} data-join-request={request.outcome ?? 'open'}>
          <div style={{ flex: '1 1 200px' }}><strong>{request.shopName}</strong><br /><span className="qs-small qs-muted">Gửi {when(request.createdAt)} ·{' '}
            {request.decidedAt ? STATUS[request.outcome!] : 'đang chờ duyệt'}</span></div>
          {!request.decidedAt && <button type="button" className={`${styles.pill} ${styles.soft} ${styles.small}`} disabled={busy} onClick={() => void send('DELETE', { requestId: request.id })}>Rút</button>}
        </li>)}</ul>}
      <form className="qs-card" style={{ padding: 18, display: 'grid', gap: 10 }} onSubmit={event => { event.preventDefault(); void send('POST', { shop, ...(message.trim() ? { message } : {}) }); }}>
        <strong>{mine.requests.length ? 'Xin vào một quán khác' : 'Xin vào quán'}</strong>
        <input className="qs-input" required maxLength={300} placeholder="@tài khoản chủ quán, hoặc link trang của quán" value={shop} onChange={event => setShop(event.target.value)} aria-label="Quán" />
        <input className="qs-input" maxLength={200} placeholder="Lời nhắn cho chủ quán (không bắt buộc), vd: Em là Lan, ca sáng" value={message} onChange={event => setMessage(event.target.value)} aria-label="Lời nhắn" />
        <button className={styles.pill} disabled={busy || !shop.trim()} style={{ justifySelf: 'start' }}>Gửi yêu cầu</button>
        {notice && <p className="qs-small" role="status">{notice}</p>}
      </form>
    </div>
  </div>;
}
