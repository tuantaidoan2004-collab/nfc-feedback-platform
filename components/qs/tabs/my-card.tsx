'use client';
/**
 * Tab My Card (kịch bản mục 7): từng thẻ của quán — đã phát hành hay chưa, link, tên, mã, các thẻ NFC trỏ vào — để chủ quán
 * và nhân viên cùng xem. Quán mới: trống, kèm lối sang Library để tạo trang đầu tiên.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { TabProps } from './index';
import styles from './tabs.module.css';
import Icon from '../icons';

type Page = { slug: string; label: string | null; state: string; createdAt: string };
type Card = { id: string; code: string; label: string; state: string; page: string };
const PAGE_STATES: Record<string, string> = { draft: 'Chưa phát hành', active: 'Đã phát hành', paused: 'Tạm dừng', closed: 'Đã đóng' };
const CARD_STATES: Record<string, string> = { prepared: 'Chưa kích hoạt', tested: 'Đã thử', active: 'Đang hoạt động', disabled: 'Đã tắt' };

export default function MyCardTab({ slug, origin }: TabProps) {
  const [pages, setPages] = useState<Page[] | null>(null), [cards, setCards] = useState<Card[]>([]), [notice, setNotice] = useState('');
  useEffect(() => {
    void (async () => {
      const [p, c] = await Promise.all([fetch(`/api/owner/v2/${slug}/pages`, { cache: 'no-store' }), fetch(`/api/owner/v2/${slug}/cards`, { cache: 'no-store' })].map(r => r.catch(() => null)));
      setPages(p?.ok ? (await p.json()).pages : []); setCards(c?.ok ? (await c.json()).cards : []);
    })();
  }, [slug]);
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setNotice('Đã sao chép link.'); } catch { setNotice('Chưa sao chép được — giữ lâu vào link để sao chép.'); }
  };
  if (pages === null) return <p className="qs-muted">Đang tải…</p>;
  if (pages.length === 0) return <div className={`${styles.card} ${styles.empty}`}>
    <Icon name="card" size={34} /><strong>Chưa có thẻ nào</strong><span>Tạo trang đầu tiên của quán trong Library — mỗi trang là một thẻ có link riêng.</span>
    <Link className="qs-btn" href={`/app/${slug}/library?muc=template`}>Tới Library</Link></div>;
  return <div className={styles.grid}>
    {notice && <p className="qs-small" role="status">{notice}</p>}
    {pages.map(page => {
      const url = `${origin}/${page.slug}`, tags = cards.filter(card => card.page === page.slug);
      return <article key={page.slug} className={styles.card} style={{ display: 'grid', gap: 12 }} data-my-card={page.slug}>
        <div className={styles.row}>
          <div><h2>{page.label || 'Trang chưa đặt tên'}</h2><span className={styles.dot} data-state={page.state}>{PAGE_STATES[page.state] ?? page.state}</span></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="qs-btn ghost small" onClick={() => void copy(url)}><Icon name="link" size={16} /> Sao chép link</button>
            <Link className="qs-btn ghost small" href={`/app/${slug}/sua/${page.slug}`}><Icon name="pencil" size={16} /> Sửa trang</Link>
            <a className="qs-btn small" href={url} target="_blank" rel="noreferrer">Mở trang</a>
          </div>
        </div>
        <p className="qs-small qs-muted">{url.replace(/^https?:\/\//, '')} · Mã <code>{page.slug}</code> · Tạo {new Date(page.createdAt).toLocaleDateString('vi-VN')}</p>
        {tags.length > 0 && <table className={styles.table}><thead><tr><th>Thẻ NFC</th><th>Mã</th><th>Trạng thái</th></tr></thead>
          <tbody>{tags.map(card => <tr key={card.id}><td>{card.label || 'Thẻ'}</td><td><code>/t/{card.code}</code></td>
            <td><span className={styles.dot} data-state={card.state}>{CARD_STATES[card.state] ?? card.state}</span></td></tr>)}</tbody></table>}
      </article>;
    })}
  </div>;
}
