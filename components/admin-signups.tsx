'use client';
import { useState } from 'react';
import styles from './admin.module.css';
import { buttonClass } from './platform/ui';
import { BUSY_HOURS, GOALS, SHOP_KINDS, type BusyHour, type Goal, type ShopKind } from '@/lib/start/draft';
import { TEMPLATE_NAMES, isTemplateKey } from '@/lib/publishing/templates';
import type { WaitingSignup } from '@/lib/start/signup';

export type SignupRow = WaitingSignup & { previewUrl: string | null };

/**
 * Pages owners built and saved before having a shop (lát D4b, Tài 27/09: chờ duyệt). Approving makes the shop exactly
 * as "Tạo shop mới" does -- page, prepared card, owner -- and the owner, who already chose a password, can sign in.
 * Refusing closes the account the save made. Nothing reaches a guest before this.
 */
export default function AdminSignups({ initial }: { initial: SignupRow[] }) {
  const [items, setItems] = useState(initial), [busy, setBusy] = useState(''), [note, setNote] = useState('');
  const decide = async (row: SignupRow, decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !window.confirm(`Từ chối trang ${row.shop_name}? Tài khoản @${row.username} sẽ bị khoá.`)) return;
    setBusy(row.id); setNote('');
    try {
      const response = await fetch(`/gov/api/signups/${row.id}`, { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNote(body.error === 'SIGNUP_DECIDED' ? 'Trang này đã có quyết định ở nơi khác; danh sách đã cập nhật.' : 'Không lưu được quyết định. Vui lòng thử lại.');
        if (body.error !== 'SIGNUP_DECIDED') return;
      } else setNote(decision === 'approve'
        ? `Đã duyệt ${row.shop_name}: trang /${body.shop.slug}, mã thẻ ${body.shop.tagCode}. Báo chủ quán đăng nhập bằng @${row.username}.`
        : `Đã từ chối ${row.shop_name}; tài khoản @${row.username} đã khoá.`);
      setItems(current => current.filter(item => item.id !== row.id));
    } catch { setNote('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(''); }
  };
  const answers = (row: SignupRow) => [row.kind ? SHOP_KINDS[row.kind as ShopKind] : null,
    row.hours.length ? `đông ${row.hours.map(hour => BUSY_HOURS[hour as BusyHour]).join(', ').toLowerCase()}` : null,
    row.goals.length ? `muốn: ${row.goals.map(goal => GOALS[goal as Goal]).join(', ').toLowerCase()}` : null].filter(Boolean).join(' · ') || 'chưa trả lời câu nào';
  return <section className={styles.panel} data-signups>
    <h2>Trang chờ duyệt {items.length > 0 && <span>({items.length})</span>}</h2>
    <p className={styles.muted}>Chủ quán tự dựng ở /bat-dau và đã có tài khoản. Duyệt thì tạo shop, trang và mã thẻ như “Tạo shop mới”.</p>
    {items.length === 0 ? <p className={styles.muted} data-signups-empty>Không có trang nào đang chờ.</p> :
      <ul className={styles.items}>
        {items.map(row => <li key={row.id} data-signup={row.id}>
          <p><strong>{row.shop_name}</strong> · {isTemplateKey(row.template_key) ? TEMPLATE_NAMES[row.template_key] : row.template_key}
            {row.previewUrl && <> · <a href={row.previewUrl} target="_blank" rel="noreferrer">xem trang</a></>}</p>
          <p className={styles.muted}>@{row.username} · {row.email}{row.zalo && <> · Zalo {row.zalo}</>} · lưu {new Date(row.created_at).toLocaleString('vi-VN')}</p>
          <p className={styles.muted}>{answers(row)}{row.decision === 'approved' && ' · lần duyệt trước chưa xong; sau 2 phút bấm Duyệt để tạo tiếp'}</p>
          <div className={styles.actions}>
            <button className={buttonClass('primary')} disabled={busy === row.id} onClick={() => void decide(row, 'approve')}>Duyệt</button>
            {row.decision === null && <button className={buttonClass('secondary')} disabled={busy === row.id} onClick={() => void decide(row, 'reject')}>Từ chối</button>}
          </div>
        </li>)}
      </ul>}
    {note && <p role="status" className={styles.muted} data-signups-note>{note}</p>}
  </section>;
}
