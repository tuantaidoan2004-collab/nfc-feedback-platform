'use client';
/**
 * Tab Quản lý (kịch bản mục 7): lấy từ "Cài đặt" cũ và làm tốt hơn — thành viên và quyền, thẻ NFC, mức hỗ trợ của nền tảng.
 * Bản khung dùng lại các panel cũ đang chạy đúng (màu đã trỏ sang giao diện mới); dựng lại cho đẹp ở đợt ⑤.
 */
import { useEffect, useState } from 'react';
import type { TabProps } from './index';
import styles from './tabs.module.css';
import TeamPanel from '../../team-panel';
import CardsPanel from '../../cards-panel';

const LEVELS: [string, string, string][] = [
  ['off', 'Tắt', 'Quản trị nền tảng chỉ xem số liệu tổng quan.'],
  ['view', 'Khấc 1 · Xem', 'Xem số liệu và đọc nội dung góp ý.'],
  ['edit', 'Khấc 2 · Sửa', 'Sửa giao diện, nút và link. Không thấy dữ liệu nào.'],
  ['full', 'Khấc 3 · Toàn quyền', 'Xem số liệu, đọc góp ý và sửa giao diện.'],
];

export default function ManageTab({ slug, origin, role }: TabProps) {
  const endpoint = `/api/owner/v2/${slug}`;
  const [level, setLevel] = useState<string | null>(null), [notice, setNotice] = useState('');
  useEffect(() => {
    fetch(`${endpoint}/summary`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(body => body && setLevel(body.support.level)).catch(() => {});
  }, [endpoint]);
  const choose = async (next: string) => {
    setNotice('Đang lưu…');
    const response = await fetch(`${endpoint}/support`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level: next }) }).catch(() => null);
    if (response?.ok) { setLevel(next); setNotice('Đã đổi.'); } else setNotice('Chỉ chủ quán đổi được mức này.');
  };
  return <div className={styles.grid}>
    <section className={styles.card}><h2>Thành viên và quyền</h2><p>Mời nhân viên, chia vai, cấp quyền sửa trang hay đọc góp ý.</p>
      <div className={styles.legacy}><TeamPanel endpoint={endpoint} /></div></section>
    <section className={styles.card}><h2>Thẻ NFC</h2><p>Mỗi thẻ mở một trang của quán. Nhân bản, đổi tên, bật hoặc tắt thẻ.</p>
      <div className={styles.legacy}><CardsPanel endpoint={endpoint} origin={origin} /></div></section>
    <section className={styles.card}><h2>Hỗ trợ từ Quite Sensational</h2><p>Bạn quyết định đội ngũ nền tảng được làm gì khi hỗ trợ quán. Mọi lần xem đều được ghi lại.</p>
      <div className={styles.list} style={{ marginTop: 12 }} role="radiogroup" aria-label="Mức hỗ trợ">{LEVELS.map(([value, label, text]) =>
        <label key={value} className={styles.item} style={{ gridTemplateColumns: 'auto 1fr', cursor: role === 'owner' ? 'pointer' : 'default' }}>
          <input type="radio" name="support" checked={level === value} disabled={role !== 'owner'} onChange={() => void choose(value)} />
          <span><strong style={{ fontSize: 14 }}>{label}</strong><br /><span className="qs-small qs-muted">{text}</span></span></label>)}</div>
      <p className="qs-small qs-muted" role="status">{notice}</p></section>
  </div>;
}
