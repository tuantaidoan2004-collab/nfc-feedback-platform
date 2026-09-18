'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ExperienceRow } from '@/lib/owner/dashboard';
import type { FeedbackComment, ThreadExperience } from '@/lib/owner/comments';
import { faceFor } from '@/lib/faces';
import { relativeTime } from '@/lib/relative-time';
import AdminBadge, { VerifiedTick } from './admin-badge';
import RoleBadge from './role-badge';
import { Avatar } from './profile-panel';
import styles from './owner-app.module.css';

/**
 * Phản hồi của khách as a comment thread (lát F4, Tài 2026-09-18/19): laid out like YouTube's comments — round
 * picture on the left, a line that curves into "N phản hồi", replies indented under it — in NFC's own colours.
 * The customer's picture is the face they chose (💬 when they chose none), the name is the kind ("Riêng tư"; later
 * "⭐⭐⭐⭐ GG Review"), then relative time; the exact time, call-back number, topic and source sit behind ⓘ.
 * There is no processing status. Replies are the shop's internal notes: liked, pinned, edited, deleted.
 */
/** What a thread needs of the customer's feedback: a Data row, or the thread API's own copy when opened from the bell. */
type ThreadRow = Pick<ExperienceRow, 'session_id' | 'first_rated_at' | 'rating' | 'topic' | 'message' | 'phone' | 'source_label' | 'comment_count'>;
/** Someone who can be @mentioned in a reply: a member of this shop who may read its feedback (lát F5). */
export type Person = { handle: string; displayName: string | null; avatarUrl: string | null };
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
/** A reply's text with each @handle picked out, as the person who was mentioned will see it. */
function Mentioned({ text }: { text: string }) {
  const parts = text.split(/((?:^|(?<=[^a-z0-9_.-]))@[a-z0-9][a-z0-9_.-]{2,63})/gi);
  return <>{parts.map((part, i) => part.startsWith('@') && i % 2 === 1 ? <span key={i} className={styles.mention}>{part}</span> : part)}</>;
}
export type Me = { kind: 'member'; handle: string; displayName: string | null; avatarUrl: string | null } | { kind: 'admin'; handle: string; title: string | null };
const exact = (iso: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso));
const ERRORS: Record<string, string> = {
  INVALID_COMMENT: 'Phản hồi cần 1–2000 ký tự.', NOT_YOUR_COMMENT: 'Chỉ người viết sửa được phản hồi này.', PERMISSION_REQUIRED: 'Vai của bạn chưa được đọc và phản hồi góp ý.',
  SUPPORT_NOT_GRANTED: 'Quản trị chỉ phản hồi được khi chủ shop đặt mức hỗ trợ Khấc 3.', COMMENT_NOT_FOUND: 'Phản hồi này không còn nữa.',
};

function Thumb({ filled }: { filled: boolean }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Zm0 0 4-8a2.5 2.5 0 0 1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.5 20H7"
    fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
}
function PersonPicture({ author, size }: { author: Pick<FeedbackComment['author'], 'kind' | 'handle' | 'displayName' | 'avatarUrl'>; size: number }) {
  if (author.kind === 'admin') return <span className={styles.adminPicture} style={{ width: size, height: size }} aria-hidden="true"><VerifiedTick size={Math.round(size * 0.6)} /></span>;
  return <Avatar profile={author} size={size} />;
}

function Composer({ me, initial, label, people = [], onSend, onCancel }: { me: Me; initial: string; label: string; people?: Person[];
  onSend: (text: string) => Promise<boolean>; onCancel: () => void }) {
  const [value, setValue] = useState(initial), [busy, setBusy] = useState(false), box = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(initial.length), [pick, setPick] = useState(0), [closed, setClosed] = useState(false), listId = useId();
  // Typing @ offers the people who can read this thread; the word after it narrows the list.
  const typed = /(^|\s)@([a-z0-9_.-]*)$/i.exec(value.slice(0, caret));
  const matches = typed && !closed ? people.filter(p => fold(`${p.handle} ${p.displayName ?? ''}`).includes(fold(typed[2]))).slice(0, 6) : [];
  const choose = (person: Person) => {
    const start = typed!.index + typed![1].length, next = `${value.slice(0, start)}@${person.handle} ${value.slice(caret)}`;
    setValue(next); setPick(0); const at = start + person.handle.length + 2; setCaret(at);
    requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(at, at); });
  };
  useEffect(() => { const el = box.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, []);
  const send = async () => { if (!value.trim() || busy) return; setBusy(true); if (await onSend(value)) setValue(''); setBusy(false); };
  return <div className={styles.composer} data-composer>
    {me.kind === 'admin' ? <PersonPicture author={{ kind: 'admin', handle: me.handle, displayName: null, avatarUrl: null }} size={28} />
      : <Avatar profile={me} size={28} />}
    <div className={styles.composerBox}>
      <textarea ref={box} value={value} rows={1} maxLength={2000} aria-label={label} placeholder="Viết phản hồi nội bộ… (khách không thấy)"
        role="combobox" aria-expanded={matches.length > 0} aria-controls={listId} aria-autocomplete="list"
        onChange={e => { setValue(e.target.value); setCaret(e.target.selectionStart); setClosed(false); setPick(0); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
        onSelect={e => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={e => {
          if (matches.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setPick((pick + 1) % matches.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setPick((pick - 1 + matches.length) % matches.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(matches[Math.min(pick, matches.length - 1)]); return; }
            if (e.key === 'Escape') { e.preventDefault(); setClosed(true); return; }
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } if (e.key === 'Escape') onCancel();
        }} />
      {matches.length > 0 && <ul id={listId} className={styles.mentions} role="listbox" aria-label="Nhắc tới" data-composer-mentions>
        {matches.map((p, i) => <li key={p.handle} role="option" aria-selected={i === Math.min(pick, matches.length - 1)} data-mention={p.handle}
          onMouseDown={e => { e.preventDefault(); choose(p); }} onMouseEnter={() => setPick(i)}>
          <Avatar profile={p} size={24} /><span><strong>{p.displayName ?? `@${p.handle}`}</strong>{p.displayName && <small>@{p.handle}</small>}</span></li>)}</ul>}
      <div className={styles.composerActions}>
        <button type="button" className={styles.ghostButton} onClick={onCancel}>Huỷ</button>
        <button type="button" className={styles.sendButton} disabled={!value.trim() || busy} onClick={() => void send()}>{busy ? 'Đang gửi…' : 'Phản hồi'}</button>
      </div>
    </div>
  </div>;
}

function Reply({ comment, canWrite, act, onReply, people }: { comment: FeedbackComment; canWrite: boolean; people: Person[];
  act: (method: string, body: unknown, done?: string) => Promise<boolean>; onReply: (handle: string) => void }) {
  const [menu, setMenu] = useState(false), [editing, setEditing] = useState(false);
  const a = comment.author;
  return <li className={styles.reply} data-comment={comment.id} data-pinned={comment.pinned || undefined}>
    <PersonPicture author={a} size={28} />
    <div className={styles.replyMain}>
      {comment.pinned && <p className={styles.pinnedLabel}>📌 Đã ghim</p>}
      <p className={styles.replyHead}>
        {a.kind === 'admin' ? <AdminBadge handle={a.handle} title={a.title} />
          : <span className={a.owner ? styles.ownerHandle : styles.handle} data-comment-author={a.handle}>@{a.handle}</span>}
        {a.kind === 'member' && a.role && <RoleBadge role={a.role} />}
        <time dateTime={comment.createdAt} title={exact(comment.createdAt)}>{relativeTime(comment.createdAt)}</time>
        {comment.editedAt && <span className={styles.edited}>(đã chỉnh sửa)</span>}
      </p>
      {editing ? <Composer me={{ kind: 'member', handle: a.handle, displayName: a.displayName, avatarUrl: a.avatarUrl }} initial={comment.body} label="Sửa phản hồi" people={people}
          onCancel={() => setEditing(false)} onSend={async text => { const ok = await act('PATCH', { id: comment.id, op: 'edit', value: text }); if (ok) setEditing(false); return ok; }} />
        : <p className={styles.replyBody} data-comment-body><Mentioned text={comment.body} /></p>}
      <div className={styles.replyActions}>
        <button type="button" className={styles.likeButton} aria-pressed={comment.liked} disabled={!canWrite} aria-label={comment.liked ? 'Bỏ thích' : 'Thích'} data-like
          onClick={() => void act('PATCH', { id: comment.id, op: 'like', value: !comment.liked })}><Thumb filled={comment.liked} />{comment.likes > 0 && <span>{comment.likes}</span>}</button>
        {canWrite && <button type="button" className={styles.ghostButton} onClick={() => onReply(a.handle)}>Phản hồi</button>}
        {canWrite && <div className={styles.menuWrap}>
          <button type="button" className={styles.dots} aria-label="Thêm thao tác" aria-expanded={menu} onClick={() => setMenu(!menu)}>⋮</button>
          {menu && <div className={styles.menu} role="menu" onClick={() => setMenu(false)}>
            <button type="button" role="menuitem" onClick={() => void act('PATCH', { id: comment.id, op: 'pin', value: !comment.pinned }, comment.pinned ? 'Đã bỏ ghim.' : 'Đã ghim phản hồi.')}>{comment.pinned ? 'Bỏ ghim' : 'Ghim'}</button>
            {comment.mine && <button type="button" role="menuitem" onClick={() => setEditing(true)}>Sửa</button>}
            {comment.canDelete && <button type="button" role="menuitem" onClick={() => { if (window.confirm('Xoá phản hồi này?')) void act('DELETE', { id: comment.id }, 'Đã xoá phản hồi.'); }}>Xoá</button>}
          </div>}
        </div>}
      </div>
    </div>
  </li>;
}

function Thread({ row, endpoint, hidden, canWrite, me, topic, say, people, initiallyOpen = false }: { row: ThreadRow; endpoint: string; hidden: boolean; canWrite: boolean;
  me: Me | null; topic: (key: string) => string; say: (text: string) => void; people: Person[]; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen), [info, setInfo] = useState(false), [comments, setComments] = useState<FeedbackComment[] | null>(null);
  const [count, setCount] = useState(row.comment_count), [composer, setComposer] = useState<string | null>(null);
  const face = faceFor(row.rating);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${endpoint}/comments?session=${row.session_id}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { say(ERRORS[body.error] ?? 'Chưa tải được phản hồi.'); return; }
      setComments(body.comments); setCount(body.comments.length);
    } catch { say('Không thể kết nối. Vui lòng thử lại.'); }
  }, [endpoint, row.session_id, say]);
  const act = async (method: string, body: unknown, done?: string) => {
    try {
      const response = await fetch(`${endpoint}/comments`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { say(ERRORS[data.error] ?? 'Chưa lưu được. Thử lại.'); return false; }
      if (done) say(done);
      await load(); return true;
    } catch { say('Không thể kết nối. Vui lòng thử lại.'); return false; }
  };
  useEffect(() => { if (initiallyOpen) void Promise.resolve().then(load); }, [initiallyOpen, load]);
  const reply = (handle?: string) => { setOpen(true); if (!comments) void load(); setComposer(handle ? `@${handle} ` : ''); };
  const words = hidden ? 'Nội dung góp ý đang ẩn với bạn.' : row.message;

  return <article className={styles.thread} data-row={row.session_id}>
    <div className={styles.threadRail}>
      <span className={styles.customerFace} role="img" aria-label={row.rating ? `${row.rating} sao` : 'Không chấm sao'}>{face ?? '💬'}</span>
      {count > 0 && <span className={styles.stem} aria-hidden="true" />}
    </div>
    <div className={styles.threadMain}>
      <p className={styles.threadHead}>
        <strong data-kind>Riêng tư</strong>
        <time dateTime={row.first_rated_at}>{relativeTime(row.first_rated_at)}</time>
        <button type="button" className={styles.infoButton} aria-label="Chi tiết" aria-expanded={info} data-info-button onClick={() => setInfo(!info)}>i</button>
      </p>
      {info && <dl className={styles.infoPanel} data-info>
        <dt>Lúc</dt><dd>{exact(row.first_rated_at)}</dd>
        {!hidden && row.phone && <><dt>Số gọi lại</dt><dd data-phone><a href={`tel:${row.phone}`}>{row.phone}</a></dd></>}
        {!hidden && row.topic && <><dt>Chủ đề</dt><dd>{topic(row.topic)}</dd></>}
        <dt>Nguồn</dt><dd>{row.source_label}</dd>
        <dt>Mã</dt><dd><code>{row.session_id.slice(0, 8)}</code></dd>
      </dl>}
      <p className={words ? styles.threadBody : `${styles.threadBody} ${styles.muted}`} data-message-for={row.session_id}>{words ?? 'Chỉ chấm sao, không viết gì.'}</p>
      {canWrite && !hidden && <div className={styles.replyActions}><button type="button" className={styles.ghostButton} data-reply onClick={() => reply()}>Phản hồi</button></div>}
      {composer !== null && me && <Composer key={composer} me={me} initial={composer} label="Phản hồi nội bộ" people={people} onCancel={() => setComposer(null)}
        onSend={async text => { const ok = await act('POST', { sessionId: row.session_id, body: text }); if (ok) setComposer(null); return ok; }} />}
      {count > 0 && <button type="button" className={styles.repliesToggle} aria-expanded={open} data-replies-toggle
        onClick={() => { const next = !open; setOpen(next); if (next && !comments) void load(); }}>
        {count} phản hồi <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>}
    </div>
    {open && comments && comments.length > 0 && <ul className={styles.replies} data-replies>
      {comments.map(c => <Reply key={`${c.id}:${c.editedAt}:${c.likes}:${c.pinned}:${c.liked}`} comment={c} canWrite={canWrite} act={act} people={people} onReply={handle => reply(handle)} />)}
    </ul>}
  </article>;
}

/** The shop's members who may read feedback, for @ suggestions. Support gets none: the team is the shop's own. */
export function usePeople(endpoint: string, enabled: boolean) {
  const [people, setPeople] = useState<Person[]>([]);
  useEffect(() => {
    if (!enabled) return;
    void fetch(`${endpoint}/team`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(body => {
      if (body) setPeople((body.members as { handle: string; displayName: string | null; avatarUrl: string | null; owner: boolean; feedbackOverride: boolean | null; permissions: string[] }[])
        .filter(m => m.owner || (m.feedbackOverride ?? m.permissions.includes('feedback'))).map(m => ({ handle: m.handle, displayName: m.displayName, avatarUrl: m.avatarUrl })));
    }).catch(() => {});
  }, [endpoint, enabled]);
  return people;
}

/** One thread on its own, over the page: where a notification leads (lát F5). */
export function ThreadDialog({ endpoint, sessionId, canWrite, me, topic, onClose }: { endpoint: string; sessionId: string; canWrite: boolean; me: Me | null;
  topic: (key: string) => string; onClose: () => void }) {
  const [row, setRow] = useState<ThreadRow | null>(null), [notice, setNotice] = useState('');
  const people = usePeople(endpoint, canWrite && me?.kind === 'member');
  useEffect(() => {
    void fetch(`${endpoint}/comments?session=${encodeURIComponent(sessionId)}`, { cache: 'no-store' }).then(async r => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setNotice(ERRORS[body.error] ?? 'Không mở được phản hồi này.'); return; }
      setRow({ ...(body.experience as ThreadExperience), comment_count: body.comments.length });
    }).catch(() => setNotice('Không thể kết nối. Vui lòng thử lại.'));
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [endpoint, sessionId, onClose]);
  return <div className={styles.dialogBackdrop} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Phản hồi được nhắc" data-thread-dialog>
      <header><h2>Phản hồi của khách</h2><button type="button" className={styles.dots} aria-label="Đóng" onClick={onClose}>✕</button></header>
      <p role="status" className={styles.notice}>{notice}</p>
      {row ? <Thread row={row} endpoint={endpoint} hidden={false} canWrite={canWrite} me={me} topic={topic} say={setNotice} people={people} initiallyOpen />
        : !notice && <p className={styles.hint}>Đang mở…</p>}
    </section>
  </div>;
}

export default function FeedbackThreads({ rows, endpoint, hidden, canWrite, me, topic }: { rows: ExperienceRow[]; endpoint: string; hidden: boolean; canWrite: boolean;
  me: Me | null; topic: (key: string) => string }) {
  const [notice, setNotice] = useState('');
  const people = usePeople(endpoint, canWrite && me?.kind === 'member');
  if (rows.length === 0) return <p className={styles.hint}>Chưa có phản hồi trong khoảng này.</p>;
  return <div data-feedback-threads>
    <p role="status" className={styles.notice} data-thread-notice>{notice}</p>
    {rows.map(row => <Thread key={row.session_id} row={row} endpoint={endpoint} hidden={hidden} canWrite={canWrite} me={me} topic={topic} say={setNotice} people={people} />)}
  </div>;
}
