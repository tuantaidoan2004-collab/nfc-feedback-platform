'use client';
import { useState } from 'react';
import styles from './admin.module.css';

export type ShopRow = {
  id: string; slug: string; name: string; publishing_state: string;
  tags: number; active_tags: number;
  owner_user_id: string | null; owner_username: string | null; owner_email: string | null; last_seen: string | null;
};

type Handover = { slug: string; name: string; tagCode: string; ownerUsername: string; ownerUserId: string; setupUrl: string | null; expiresAt: string };

const failed = (status: number) =>
  status === 409 ? 'Tài khoản hoặc email này đã được dùng cho shop khác.'
  : status === 400 ? 'Thông tin chưa hợp lệ. Kiểm tra lại tên, tài khoản, email và đường dẫn Google.'
  : status === 401 ? 'Phiên đã hết hạn. Hãy đăng nhập lại.'
  : 'Dịch vụ đang gián đoạn. Vui lòng thử lại.';

export default function AdminShops({ initial, origin }: { initial: ShopRow[]; origin: string | null }) {
  const [shops, setShops] = useState(initial);
  const [handover, setHandover] = useState<Handover | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);

  const refresh = async () => {
    const response = await fetch('/gov/api/shops', { credentials: 'same-origin' });
    if (response.ok) setShops((await response.json()).shops);
  };

  const reissue = async (row: ShopRow) => {
    if (!row.owner_user_id) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/gov/api/setup-links', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUserId: row.owner_user_id, shopId: row.id }) });
      if (!response.ok) { setError(failed(response.status)); return; }
      const body = await response.json();
      setHandover({ slug: row.slug, name: row.name, tagCode: '', ownerUsername: row.owner_username ?? '', ownerUserId: row.owner_user_id,
        setupUrl: body.setupUrl, expiresAt: body.expiresAt });
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
  };

  return <>
    <section className={styles.panel}>
      <h2>Tạo shop mới</h2>
      <p className={styles.muted}>Một lần bấm tạo trang khách, bản phát hành đầu tiên, một mã thẻ và tài khoản chủ shop chưa có mật khẩu.</p>
      <form className={styles.form} onSubmit={async event => {
        event.preventDefault(); setBusy(true); setError(''); setHandover(null);
        const form = new FormData(event.currentTarget), element = event.currentTarget;
        try {
          const response = await fetch('/gov/api/shops', { method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: form.get('name'), ownerUsername: form.get('ownerUsername'),
              ownerEmail: form.get('ownerEmail'), googleUrl: form.get('googleUrl') }) });
          if (!response.ok) { setError(failed(response.status)); return; }
          const { shop } = await response.json();
          setHandover({ ...shop, expiresAt: shop.setupExpiresAt });
          element.reset();
          await refresh();
        } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
      }}>
        <label>Tên shop<input name="name" required maxLength={100} placeholder="Cà Phê Ban Mai"/></label>
        <label>Tài khoản chủ shop<input name="ownerUsername" required maxLength={64} placeholder="caphe-banmai" pattern="[a-z0-9][a-z0-9_.\-]{2,63}"/></label>
        <label>Email chủ shop<input name="ownerEmail" type="email" required maxLength={254} placeholder="chu@example.com"/></label>
        <label>Đường dẫn Google (bỏ trống nếu chưa có)<input name="googleUrl" type="url" maxLength={2048} placeholder="https://maps.app.goo.gl/..."/></label>
        <button disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo shop'}</button>
      </form>
      {error && <p role="alert" className={styles.muted}>{error}</p>}

      {handover && <div className={styles.handover} data-handover>
        <h2>Gửi liên kết này cho chủ shop</h2>
        <p className={styles.muted}>
          Chỉ hiện một lần: hệ thống chỉ lưu bản băm, không tra lại được. Liên kết dùng một lần và hết hạn
          lúc {new Date(handover.expiresAt).toLocaleString('vi-VN')}. Mất thì phát liên kết mới.
        </p>
        <code>{handover.setupUrl ?? 'Chưa cấu hình APP_ORIGIN nên không dựng được đường dẫn.'}</code>
        <p className={styles.muted}>
          Tài khoản <strong>{handover.ownerUsername}</strong>
          {handover.tagCode && <> · mã thẻ <strong>{handover.tagCode}</strong> (trạng thái <em>prepared</em>, chưa quét được cho tới khi kích hoạt)</>}
        </p>
      </div>}
    </section>

    <section className={styles.panel}>
      <h2>Shop đang có ({shops.length})</h2>
      <div className={styles.wide}>
        <table className={styles.table}>
          <thead><tr><th>Shop</th><th>Trang khách</th><th>Dashboard</th><th>Chủ shop</th><th>Thẻ</th><th>Trạng thái</th><th>Hoạt động</th><th/></tr></thead>
          <tbody>
            {shops.map(row => <tr key={row.id}>
              <td>{row.name}<br/><code>{row.slug}</code></td>
              <td>{origin ? <a href={`${origin}/${row.slug}`} target="_blank" rel="noreferrer">mở</a> : '—'}</td>
              <td>{origin ? <a href={`${origin}/ZZZ/${row.slug}`} target="_blank" rel="noreferrer">mở</a> : '—'}</td>
              <td>{row.owner_username ?? <em>chưa có</em>}<br/><span className={styles.muted}>{row.owner_email ?? ''}</span></td>
              <td>{row.active_tags}/{row.tags} hoạt động</td>
              <td>{row.publishing_state}</td>
              <td>{row.last_seen ? new Date(row.last_seen).toLocaleDateString('vi-VN') : 'chưa có lượt nào'}</td>
              <td>{row.owner_user_id && <button disabled={busy} onClick={() => reissue(row)}>Phát lại liên kết</button>}</td>
            </tr>)}
            {!shops.length && <tr><td colSpan={8} className={styles.muted}>Chưa có shop nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </>;
}
