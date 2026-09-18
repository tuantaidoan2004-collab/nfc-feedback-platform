'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Notification } from '@/lib/owner/notifications';
import { relativeTime } from '@/lib/relative-time';
import AdminBadge from './admin-badge';
import styles from './owner-app.module.css';

/**
 * The bell (lát F5, Tài 2026-09-19): mentions across every shop the person may read feedback in. It checks every
 * minute while the tab is visible and again when the tab comes back. Opening a notification marks it read and opens
 * the thread — here, or in the other shop's dashboard.
 */
type Inbox = { unread: number; items: Notification[] };

export default function NotificationBell({ onOpen }: { onOpen: (slug: string, sessionId: string) => void }) {
  const [inbox, setInbox] = useState<Inbox | null>(null), [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    try { const r = await fetch('/api/owner/v2/notifications', { cache: 'no-store' }); if (r.ok) setInbox(await r.json()); } catch { /* the bell keeps what it had */ }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
    const tick = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60000);
    const back = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', back);
    return () => { clearInterval(tick); document.removeEventListener('visibilitychange', back); };
  }, [load]);
  const mark = async (body: unknown) => {
    await fetch('/api/owner/v2/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    await load();
  };
  const unread = inbox?.unread ?? 0;
  return <div className={styles.bellWrap}>
    <button type="button" className={styles.bell} data-bell aria-expanded={open} aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
      onClick={() => { setOpen(!open); if (!open) void load(); }}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Zm4 3a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
      {unread > 0 && <span className={styles.bellCount} data-bell-count>{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <section className={styles.inbox} aria-label="Thông báo" data-inbox>
      <header><h2>Thông báo</h2>{unread > 0 && <button type="button" className={styles.textButton} onClick={() => void mark({ all: true })}>Đánh dấu đã đọc hết</button>}</header>
      {!inbox ? <p className={styles.hint} style={{ padding: 12 }}>Đang tải…</p> : inbox.items.length === 0
        ? <p className={styles.hint} style={{ padding: 12 }}>Chưa có ai nhắc bạn. Khi ai đó viết @handle của bạn trong một phản hồi, thông báo sẽ hiện ở đây.</p>
        : <ul>{inbox.items.map(n => <li key={n.id} data-notification={n.id} data-unread={!n.read || undefined}>
          <button type="button" onClick={() => { setOpen(false); if (!n.read) void mark({ ids: [n.id] }); onOpen(n.shop.slug, n.sessionId); }}>
            <span>{n.actorKind === 'admin' ? <AdminBadge handle={n.actorHandle} title={null} /> : <strong>@{n.actorHandle}</strong>} đã nhắc bạn trong một phản hồi</span>
            {n.excerpt && <em>“{n.excerpt}”</em>}
            <small>{n.shop.name} · {relativeTime(n.createdAt)}</small>
          </button></li>)}</ul>}
    </section>}
  </div>;
}
