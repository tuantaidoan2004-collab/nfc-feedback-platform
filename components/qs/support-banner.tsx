'use client';
/**
 * Phiên xem thay mặt (lát F2, D2): on every screen an administrator opens for a shop -- the Orb, the tabs, the page editor --
 * a strip says who is looking, how far they may go, why, until when, and ends the session in one tap. The owner sees the
 * same visit, with the reason as typed, in Quản lý.
 */
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import AdminBadge from '../admin-badge';

export type SupportSession = { admin: string; adminTitle: string | null; scope: 'overview' | 'feedback' | 'design'; reason: string; expiresAt: string };
export const SUPPORT_SCOPES: Record<SupportSession['scope'], string> = { overview: 'Chỉ số liệu tổng quan', feedback: 'Kèm góp ý riêng tư', design: 'Sửa giao diện' };
export const clock = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

/** `row`: a strip in the page's flow (the editor's banner row); otherwise it floats at the foot of the screen, clear of the Orb. */
export default function SupportBanner({ slug, session, row }: { slug: string; session: SupportSession; row?: boolean }) {
  const router = useRouter(), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), strip = useRef<HTMLElement>(null);
  // Floating, the strip covers the foot of the screen, and on a phone it wraps to several lines: the frame keeps exactly that much
  // room under its last line (--qs-support-room in qs.css), so the end of every tab still scrolls clear of it.
  useEffect(() => {
    const node = strip.current, frame = node?.parentElement;
    if (row || !node || !frame) return;
    const observer = new ResizeObserver(() => frame.style.setProperty('--qs-support-room', `${node.offsetHeight + 28}px`));
    observer.observe(node);
    return () => { observer.disconnect(); frame.style.removeProperty('--qs-support-room'); };
  }, [row]);
  const end = async () => {
    setBusy(true);
    try { const response = await fetch(`/api/owner/v2/${slug}/impersonation`, { method: 'DELETE' }); if (response.ok) { router.replace('/gov'); return; } }
    catch { /* Said below. */ } finally { setBusy(false); }
    setNotice('Chưa kết thúc được phiên. Thử lại.');
  };
  return <aside ref={strip} className={row ? 'qs-support' : 'qs-support qs-support-float'} data-impersonation={session.scope} role="note">
    <span><strong>Đang xem thay mặt chủ quán</strong> · <AdminBadge handle={session.admin} title={session.adminTitle} /> · {SUPPORT_SCOPES[session.scope]}
      {session.scope === 'design' ? '' : ' · chỉ xem'} · hết hạn lúc {clock(session.expiresAt)}</span>
    <span className="qs-small">Lý do: {session.reason}</span>
    <button type="button" className="qs-btn small" disabled={busy} onClick={() => void end()}>Kết thúc phiên</button>
    {notice && <span className="qs-small" role="status">{notice}</span>}
  </aside>;
}
