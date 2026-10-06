'use client';
/**
 * Chuyển qua lại giữa các quán và thêm địa chỉ quán (G3b, kịch bản mục 13). Một nút nhỏ cạnh tên quán, ở màn Orb và ở đầu mỗi
 * tab: mở danh sách mọi quán người này vào được (quán chính trước, các địa chỉ của nó ngay dưới), bấm là sang quán đó ở đúng tab
 * đang mở. Chủ quán gói VIP (hay quán chưa tính phí) thêm địa chỉ ở cuối danh sách: tên và Place ID, dùng chung gói VIP.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AccountShop } from '@/lib/account/branches';
import { PLACE_ID_FINDER } from '@/lib/google/place-id';
import styles from './switcher.module.css';

export type Shops = { list: AccountShop[]; canAdd: boolean; owner: boolean };
export const ShopsContext = createContext<{ slug: string; shops: Shops } | null>(null);

const ERRORS: Record<string, string> = {
  INVALID_NAME: 'Tên quán cần 1–100 ký tự, không có dấu < >.', INVALID_PLACE_ID: 'Place ID chưa đúng. Dán lại mã từ trang tìm Place ID của Google, hoặc để trống.',
  VIP_REQUIRED: 'Thêm địa chỉ quán cần gói VIP.', OWNER_ROLE_REQUIRED: 'Chỉ chủ quán thêm được địa chỉ.',
  TOO_MANY_BRANCHES: 'Đã nhiều địa chỉ quá mức tự thêm. Nhắn Admin Tài để mở thêm.',
};

export default function ShopSwitcher() {
  const value = useContext(ShopsContext);
  const [open, setOpen] = useState(false), [adding, setAdding] = useState(false);
  const box = useRef<HTMLDivElement>(null), router = useRouter(), path = usePathname();
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away); window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', escape); };
  }, [open]);
  if (!value) return null;
  const { slug, shops } = value;
  // Nothing to switch to and nothing to add: no button at all.
  if (shops.list.length < 2 && !shops.owner) return null;
  const tab = path?.split('/')[3];
  const go = (to: string) => { setOpen(false); router.push(`/app/${to}${tab ? `/${tab}` : ''}`); };
  return <div className={styles.switcher} ref={box}>
    <button type="button" className={styles.trigger} aria-label="Chuyển quán" aria-expanded={open} aria-haspopup="menu" data-shop-switcher
      onClick={() => setOpen(!open)}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <div className={styles.menu} role="menu" aria-label="Các quán của bạn">
      <p className={styles.heading}>Các quán của bạn</p>
      <ul>{shops.list.map(shop => <li key={shop.slug}>
        <button type="button" role="menuitem" className={styles.item} aria-current={shop.slug === slug ? 'true' : undefined} data-switch-to={shop.slug}
          data-branch={shop.mainSlug ? '' : undefined} onClick={() => shop.slug === slug ? setOpen(false) : go(shop.slug)}>
          <span className={styles.name}>{shop.name}</span>
          <span className={styles.meta}>{[shop.mainSlug ? 'Địa chỉ' : shops.list.some(other => other.mainSlug === shop.slug) && 'Quán chính',
            shop.role === 'manager' && 'Nhân viên'].filter(Boolean).join(' · ')}</span>
          {shop.slug === slug && <svg className={styles.check} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button></li>)}</ul>
      {shops.canAdd ? <button type="button" role="menuitem" className={styles.add} data-add-branch onClick={() => { setOpen(false); setAdding(true); }}>
        <span aria-hidden="true">+</span> Thêm địa chỉ quán</button>
        : shops.owner && <p className={styles.note}>Nhiều địa chỉ quán dưới một tài khoản có ở <a href={`/app/${slug}/cai-dat?view=billing`}>gói VIP</a>.</p>}
    </div>}
    {adding && <AddBranch slug={slug} onClose={() => setAdding(false)} onAdded={to => { setAdding(false); router.push(`/app/${to}`); router.refresh(); }} />}
  </div>;
}

function AddBranch({ slug, onClose, onAdded }: { slug: string; onClose: () => void; onAdded: (slug: string) => void }) {
  const [name, setName] = useState(''), [placeId, setPlaceId] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/owner/v2/${slug}/branches`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, placeId }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(ERRORS[body.error] ?? 'Chưa thêm được. Thử lại.'); return; }
      onAdded(body.slug);
    } catch { setError('Không thể kết nối. Thử lại.'); } finally { setBusy(false); }
  };
  return <div className={styles.back} role="dialog" aria-modal="true" aria-labelledby="them-dia-chi" onClick={onClose}>
    <form className={styles.dialog} onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); void submit(); }} data-branch-form>
      <h2 id="them-dia-chi">Thêm địa chỉ quán</h2>
      <p className="qs-small qs-muted">Mỗi địa chỉ có link đánh giá Google, trang, thẻ và đội ngũ riêng, và dùng chung gói VIP của quán chính — không tính thêm tiền.</p>
      <label className="qs-field">Tên quán ở địa chỉ này
        <input className="qs-input" name="name" required maxLength={100} autoFocus placeholder="Vd: Quán Mây — Quận 3" value={name} onChange={event => setName(event.target.value)} /></label>
      <label className="qs-field">Place ID trên Google <small>(có thể thêm sau)</small>
        <input className="qs-input" name="placeId" placeholder="ChIJ…" value={placeId} onChange={event => setPlaceId(event.target.value)} /></label>
      <a className="qs-small" href={PLACE_ID_FINDER} target="_blank" rel="noreferrer">Mở trang tìm Place ID của Google ↗</a>
      {error && <p className="qs-small qs-error" role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="button" className="qs-btn ghost" onClick={onClose}>Huỷ</button>
        <button className="qs-btn" disabled={busy || !name.trim()}>{busy ? 'Đang thêm…' : 'Thêm địa chỉ'}</button>
      </div>
    </form>
  </div>;
}
