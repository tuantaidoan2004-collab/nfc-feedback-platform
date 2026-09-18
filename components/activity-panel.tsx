'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityRow } from '@/lib/owner/activity';
import AdminBadge from './admin-badge';
import { Avatar } from './profile-panel';
import styles from './owner-app.module.css';

/**
 * Hoạt động (lát F3, Tài 2026-09-18): who did what in the shop, newest first. The search box works like Spotlight —
 * ⌘K or Ctrl+K from anywhere on the dashboard focuses it, results follow the typing, accents do not matter — and
 * the filters narrow by person, kind of action and days. Nothing here can be edited.
 */
/** Accent-blind, as the server searches: "Thu" finds "@thu.nv", "an" finds "Ân". */
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
/** Someone who can be picked with @: everyone in the team now, plus anyone who has a line here (support, people who left). */
type Person = { id: string; handle: string; name: string | null; avatarUrl: string | null; kind: string };
type Page = { rows: ActivityRow[]; next: string | null; people: { id: string; handle: string; kind: string }[]; actions: Record<string, string> };
const when = (iso: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(iso));

export default function ActivityPanel({ endpoint }: { endpoint: string }) {
  const [filters, setFilters] = useState({ q: '', actor: '', action: '', from: '', to: '' });
  const [page, setPage] = useState<Page | null>(null), [more, setMore] = useState<ActivityRow[]>([]), [notice, setNotice] = useState('');
  const search = useRef<HTMLInputElement>(null), latest = useRef(0);
  const [team, setTeam] = useState<Person[]>([]), [pick, setPick] = useState(0), [closed, setClosed] = useState(false);
  useEffect(() => {
    void fetch(`${endpoint}/team`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(body => {
      if (body) setTeam(body.members.map((m: { userId: string; handle: string; displayName: string | null; avatarUrl: string | null }) =>
        ({ id: m.userId, handle: m.handle, name: m.displayName, avatarUrl: m.avatarUrl, kind: 'member' })));
    }).catch(() => {});
  }, [endpoint]);
  const query = useCallback((before?: string) => {
    // The @word still being typed picks a person; it is not a search term.
    const words = { ...filters, q: filters.q.replace(/(^|\s)@[^\s@]*$/, '') };
    const p = new URLSearchParams(); Object.entries(words).forEach(([k, v]) => { if (v.trim()) p.set(k, v.trim()); }); if (before) p.set('before', before);
    return p.toString();
  }, [filters]);
  // Typing waits a moment before asking, so each keystroke does not send a request.
  useEffect(() => {
    const sequence = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${endpoint}/activity?${query()}`, { cache: 'no-store' });
        if (sequence !== latest.current) return;
        const body = await response.json().catch(() => ({}));
        if (!response.ok) { setNotice(body.error === 'PERMISSION_REQUIRED' ? 'Vai của bạn chưa được xem lịch sử hoạt động.' : 'Chưa tải được lịch sử.'); return; }
        setPage(body); setMore([]); setNotice('');
      } catch { if (sequence === latest.current) setNotice('Không thể kết nối. Vui lòng thử lại.'); }
    }, filters.q ? 180 : 0);
    return () => clearTimeout(timer);
  }, [endpoint, query, filters.q]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.current?.focus(); search.current?.select(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  const rows = [...(page?.rows ?? []), ...more];
  // Typing @ opens a list of accounts; the word being typed after it narrows the list.
  const mention = /(^|\s)@([^\s@]*)$/.exec(filters.q);
  const people: Person[] = [...team, ...(page?.people ?? []).filter(p => !team.some(t => t.id === p.id)).map(p => ({ ...p, name: null, avatarUrl: null }))];
  const matches = mention && !closed ? people.filter(p => fold(`${p.handle} ${p.name ?? ''}`).includes(fold(mention[2]))).slice(0, 8) : [];
  const choose = (person: Person) => {
    setFilters({ ...filters, actor: person.id, q: filters.q.slice(0, mention!.index + mention![1].length).trimEnd() });
    setPick(0); search.current?.focus();
  };
  const next = more.length ? null : page?.next;
  const loadMore = async (before: string) => {
    try { const r = await fetch(`${endpoint}/activity?${query(before)}`, { cache: 'no-store' }); if (r.ok) { const b = await r.json(); setMore(m => [...m, ...b.rows]); } } catch { /* the button stays */ }
  };

  return <section aria-label="Hoạt động" data-activity>
    <div className={styles.panel}>
      <label className={styles.spotlight}><span className={styles.srOnly}>Tìm trong lịch sử</span>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <input ref={search} type="search" value={filters.q} maxLength={100} placeholder="Tìm người, việc, thẻ… Gõ @ để chọn tài khoản" data-activity-search
          role="combobox" aria-expanded={matches.length > 0} aria-controls="activity-mentions" aria-autocomplete="list"
          aria-activedescendant={matches.length ? `mention-${matches[Math.min(pick, matches.length - 1)].id}` : undefined}
          onChange={e => { setFilters({ ...filters, q: e.target.value }); setPick(0); setClosed(false); }}
          onKeyDown={e => {
            if (!matches.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setPick((pick + 1) % matches.length); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setPick((pick - 1 + matches.length) % matches.length); }
            else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(matches[Math.min(pick, matches.length - 1)]); }
            else if (e.key === 'Escape') { e.preventDefault(); setClosed(true); }
          }} />
        <kbd>⌘K</kbd></label>
      {matches.length > 0 && <ul className={styles.mentions} id="activity-mentions" role="listbox" aria-label="Tài khoản" data-mentions>
        {matches.map((p, i) => <li key={p.id} id={`mention-${p.id}`} role="option" aria-selected={i === Math.min(pick, matches.length - 1)} data-mention={p.handle}
          onMouseDown={e => { e.preventDefault(); choose(p); }} onMouseEnter={() => setPick(i)}>
          {p.kind === 'admin' ? <AdminBadge handle={p.handle} title={null} /> : <><Avatar profile={{ handle: p.handle, displayName: p.name, avatarUrl: p.avatarUrl }} size={28} />
            <span><strong>{p.name ?? `@${p.handle}`}</strong>{p.name && <small>@{p.handle}</small>}</span></>}
        </li>)}</ul>}
      <div className={styles.activityFilters}>
        <label>Người<select value={filters.actor} onChange={e => setFilters({ ...filters, actor: e.target.value })}><option value="">Tất cả</option>
          {people.map(p => <option key={p.id} value={p.id}>@{p.handle}{p.kind === 'admin' ? ' (quản trị)' : ''}</option>)}</select></label>
        <label>Việc<select value={filters.action} onChange={e => setFilters({ ...filters, action: e.target.value })}><option value="">Tất cả</option>
          {page && Object.entries(page.actions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Từ ngày<input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></label>
        <label>Đến ngày<input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></label>
      </div>
      <p role="status" className={styles.hint}>{notice}</p>
    </div>
    <div className={styles.panel}>
      {!page ? <p className={styles.hint}>Đang tải…</p> : rows.length === 0 ? <p className={styles.hint}>Không có hoạt động nào khớp.</p>
        : <ol className={styles.timeline}>{rows.map(row => <li key={row.id} data-activity-row={row.action}>
          <span className={styles.timelineWho}>{row.actor_kind === 'admin' ? <AdminBadge handle={row.actor_handle} title={null} /> : <strong>@{row.actor_handle}</strong>}</span>
          <span className={styles.timelineWhat}>{page.actions[row.action] ?? row.action}{row.target && <> · <em>{row.target}</em></>}
            {Object.entries(row.detail).filter(([, v]) => typeof v === 'string' && v).map(([k, v]) => <small key={k}> · {String(v)}</small>)}</span>
          <time dateTime={row.at}>{when(row.at)}</time>
        </li>)}</ol>}
      {next && <button type="button" className={styles.textButton} onClick={() => void loadMore(next)}>Xem thêm</button>}
    </div>
  </section>;
}
