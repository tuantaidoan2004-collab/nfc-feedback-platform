'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Card } from '@/lib/owner/cards';
import styles from './owner-app.module.css';

/**
 * NFC cards (lát E). One page, many cards: "Nhân bản thẻ" adds another card that opens the same page, with its own
 * short code and name so the Data view can split figures by card. The link shown is what gets written to the chip.
 */
type List = { cards: Card[]; active: number; canActivate: boolean };
const STATES: Record<Card['state'], string> = { prepared: 'Chưa kích hoạt', tested: 'Đã thử', active: 'Đang hoạt động', disabled: 'Đã tắt' };
const ERRORS: Record<string, string> = {
  OWNER_ROLE_REQUIRED: 'Chỉ tài khoản chủ shop kích hoạt được thẻ.',
  IMPERSONATION_READ_ONLY: 'Quản trị không thay đổi thẻ của shop.',
  INVALID_CARD: 'Tên thẻ cần từ 1 đến 60 ký tự.',
  SHOP_UNAVAILABLE: 'Trang đó chưa phát hành hoặc đang tạm dừng, nên thẻ đang chạy chưa chuyển sang được.',
  PAGE_CLOSED: 'Trang đó đã đóng.',
};

export default function CardsPanel({ endpoint, origin, page = null }: { endpoint: string; origin: string; page?: string | null }) {
  const [list, setList] = useState<List | null>(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [name, setName] = useState(''), [pages, setPages] = useState<{ slug: string; label: string; state: string }[]>([]), [target, setTarget] = useState(page ?? '');
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${endpoint}/cards`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(ERRORS[body.error] ?? 'Chưa tải được danh sách thẻ.'); return; }
      setList(body);
      // The shop's pages, for the page a card opens (Tài 08/10: a card could only ever go to the first page).
      const listed = await fetch(`${endpoint}/pages`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (listed?.pages) setPages((listed.pages as { slug: string; label: string; state: string }[]).filter(p => p.state !== 'closed'));
    } catch { setNotice('Không thể kết nối. Vui lòng thử lại.'); }
  }, [endpoint]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const send = async (method: 'POST' | 'PATCH', body: unknown, done: string) => {
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`${endpoint}/cards`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(ERRORS[data.error] ?? 'Chưa lưu được. Thử lại.'); return false; }
      setNotice(done); await load(); return true;
    } catch { setNotice('Không thể kết nối. Vui lòng thử lại.'); return false; }
    finally { setBusy(false); }
  };
  const link = (card: Card) => `${origin}/t/${card.code}`;
  const copy = async (card: Card) => {
    try { await navigator.clipboard.writeText(link(card)); setNotice(`Đã sao chép link thẻ ${card.code}.`); }
    catch { setNotice('Chưa sao chép được. Giữ lâu vào link để sao chép.'); }
  };
  const activate = (card: Card) => {
    if (!list) return;
    // Cards carry no fee in the app (Tài, 26/09): a card only holds a link, and is sold on its own.
    if (!window.confirm(`Kích hoạt thẻ ${card.label} (${card.code})?\nKhách chạm thẻ là mở trang ngay.`)) return;
    void send('PATCH', { id: card.id, state: 'active' }, `Đã kích hoạt thẻ ${card.code}. Chạm thử thẻ để chắc link đã ghi đúng.`);
  };

  return <section className={styles.panel} aria-label="Thẻ NFC" data-cards>
    <h2>Thẻ NFC</h2>
    <p className={styles.hint}>Mỗi thẻ mở một trang của quán (cột Trang); số liệu được tách theo từng thẻ. Đổi trang của thẻ ở cột Trang; thẻ mới mở trang chọn ở ô bên dưới. Ghi đúng link của thẻ vào chip NFC, rồi kích hoạt và chạm thử.</p>
    {list && <p className={styles.hint} data-card-count>Đang hoạt động: <strong>{list.active}</strong> thẻ.</p>}
    <p role="status" className={styles.notice} data-cards-notice>{notice}</p>
    {list && <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>Mã</th><th>Tên thẻ</th><th>Trang</th><th>Trạng thái</th><th>Link ghi vào thẻ</th><th /></tr></thead>
      <tbody>{list.cards.map(card => <tr key={card.id} data-card={card.code}>
        <td><code>{card.code}</code></td>
        <td><input aria-label={`Tên thẻ ${card.code}`} defaultValue={card.label} maxLength={60} placeholder="Ví dụ: Bàn 3"
          onBlur={e => { const value = e.target.value.trim(); if (value && value !== card.label) void send('PATCH', { id: card.id, label: value }, 'Đã đổi tên thẻ.'); }} /></td>
        <td data-card-page>{pages.length > 1
          ? <select aria-label={`Trang của thẻ ${card.code}`} value={card.page} disabled={busy}
              onChange={e => void send('PATCH', { id: card.id, page: e.target.value }, `Thẻ ${card.code} giờ mở trang /${e.target.value}.`)}>
              {pages.map(p => <option key={p.slug} value={p.slug}>{p.label || 'Trang'} · /{p.slug}</option>)}</select>
          : card.page}</td>
        <td><span className={styles.status} data-card-state={card.state}>{STATES[card.state]}</span></td>
        <td><button type="button" className={styles.noteButton} onClick={() => void copy(card)}>{link(card).replace(/^https?:\/\//, '')}</button></td>
        <td className={styles.rowButtons}>
          {card.state !== 'active' && list.canActivate && <button type="button" disabled={busy} onClick={() => activate(card)}>{card.state === 'disabled' ? 'Bật lại' : 'Kích hoạt'}</button>}
          {card.state === 'active' && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Tạm tắt thẻ ${card.code}? Khách chạm thẻ sẽ không mở được trang cho tới khi bật lại.`)) void send('PATCH', { id: card.id, state: 'disabled' }, `Đã tắt thẻ ${card.code}.`); }}>Tạm tắt</button>}
        </td>
      </tr>)}</tbody>
    </table></div>}
    <form className={styles.actions} onSubmit={e => { e.preventDefault(); const label = name.trim() || `Thẻ ${(list?.cards.length ?? 0) + 1}`;
      void send('POST', target ? { label, page: target } : { label }, `Đã nhân bản thẻ "${label}"${target ? ` cho trang /${target}` : ''}. Thẻ mới chưa kích hoạt.`).then(ok => { if (ok) setName(''); }); }}>
      <label>Tên thẻ mới<input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Bàn 3" /></label>
      {pages.length > 1 && <label>Mở trang<select value={target} onChange={e => setTarget(e.target.value)}>
        {!page && <option value="">Trang đầu tiên</option>}
        {pages.map(p => <option key={p.slug} value={p.slug}>{p.label || 'Trang'} · /{p.slug}</option>)}</select></label>}
      <button disabled={busy}>Nhân bản thẻ</button>
    </form>
  </section>;
}
