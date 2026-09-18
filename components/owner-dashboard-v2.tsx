'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { OwnerDashboard as Repository, ExperienceRow, Period } from '@/lib/owner/dashboard';
import { copy } from '@/lib/copy';
import { faceFor } from '@/lib/faces';
import styles from './owner-app.module.css';
import DesignEditor from './design-editor';
import CardsPanel from './cards-panel';

/**
 * Owner dashboard, lát C2 (2026-09-18). A left menu with four views. Overview loads only totals, so the dashboard
 * opens fast however much data a shop has; the Data view loads rows only when the owner picks a period. Data stays
 * on screen when the tab is hidden and is refreshed quietly on return, instead of blanking and reloading.
 */
type Summary = Awaited<ReturnType<Repository['summary']>>;
type Data = Awaited<ReturnType<Repository['read']>>;
type View = 'home' | 'data' | 'design' | 'settings';
export type Impersonation = { admin: string; scope: 'overview' | 'feedback' | 'design'; reason: string; expiresAt: string };

const VIEWS: [View, string, string][] = [
  ['home', 'Tổng quan', 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z'],
  ['data', 'Dữ liệu', 'M4 20V10m6 10V4m6 16v-7m4 7H2'],
  ['design', 'Thiết kế & Link', 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Zm9-13 4 4'],
  ['settings', 'Cài đặt', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.4 3h-4l-.4 2.5a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.2 1.3l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z'],
];
const PERIODS: Record<Period, string> = { today: 'Hôm nay', week: '7 ngày', month: '30 ngày' };
const STATUS: Record<string, string> = { new: 'Chưa xử lý', progress: 'Đang xử lý', resolved: 'Đã xử lý' };
const SCOPES: Record<string, string> = { overview: 'Chỉ số liệu tổng quan', feedback: 'Kèm góp ý riêng tư', design: 'Sửa giao diện' };
/** The owner's four positions (Tài, 2026-09-17). Nothing, at any position, lets support export the shop's data. */
const LEVELS: [string, string, string][] = [
  ['off', 'Tắt', 'Quản trị chỉ xem số liệu tổng quan.'],
  ['view', 'Khấc 1 · Xem', 'Xem số liệu và đọc nội dung góp ý.'],
  ['edit', 'Khấc 2 · Sửa', 'Sửa giao diện, nút và link. Không thấy dữ liệu nào, kể cả tổng quan.'],
  ['full', 'Khấc 3 · Toàn quyền', 'Xem số liệu, đọc góp ý và sửa giao diện.'],
];
const LEVEL_NAMES: Record<string, string> = Object.fromEntries(LEVELS.map(([value, label]) => [value, label]));
const ENDINGS: Record<string, string> = { ended: 'đã kết thúc', superseded: 'bị thay bằng phiên mới', expired: 'hết hạn' };
const TOPICS = copy.vi as Record<string, string>;
const hcmDate = (daysBack = 0) => new Date(Date.now() + 7 * 3600000 - daysBack * 86400000).toISOString().slice(0, 10);
const time = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] ?? '').join('').toUpperCase();

function Icon({ path }: { path: string }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}

/** A total with its own period menu (the ≡ button), so each card can show a different window without reloading. */
function Kpi({ id, title, value, sub, period, onPeriod, accent }: { id: string; title: string; value: string; sub?: string; period?: Period; onPeriod?: (p: Period) => void; accent?: boolean }) {
  const [open, setOpen] = useState(false);
  return <article className={`${styles.kpi}${accent ? ` ${styles.accent}` : ''}`} data-kpi={id}>
    <header><span>{title}</span>
      {onPeriod && <button type="button" className={styles.menuButton} aria-label={`Đổi khoảng thời gian: ${title}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>}
    </header>
    <strong data-kpi-value>{value}</strong>
    <p>{period ? PERIODS[period] : ''}{sub ? `${period ? ' · ' : ''}${sub}` : ''}</p>
    {open && onPeriod && <div className={styles.menu} role="menu">{(Object.keys(PERIODS) as Period[]).map(key =>
      <button key={key} type="button" role="menuitemradio" aria-checked={key === period} onClick={() => { onPeriod(key); setOpen(false); }}>{PERIODS[key]}</button>)}</div>}
  </article>;
}

/** Seven days of openings, drawn with CSS bars: no chart library, and it reads the same on a phone. */
function Week({ daily }: { daily: Summary['daily'] }) {
  const peak = Math.max(1, ...daily.map(d => d.opens));
  const weekday = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(new Date(`${value}T12:00:00Z`));
  return <section className={styles.panel} aria-label="Bảy ngày gần nhất" data-week><h2>Bảy ngày gần nhất</h2>
    <ol className={styles.bars}>{daily.map(point => <li key={point.day} data-day={point.day}>
      <span className={styles.bar} style={{ height: `${Math.round(point.opens / peak * 100)}%` }} data-opens={point.opens}
        title={`${point.day}: ${point.opens} lượt truy cập, ${point.sessions} phiên, ${point.private} phản hồi riêng`} />
      <strong>{point.opens}</strong><span>{weekday(point.day)}</span></li>)}</ol>
    <p className={styles.hint}>Lượt truy cập trang khách theo giờ Việt Nam. Chạm vào cột để xem số phiên và phản hồi riêng.</p>
  </section>;
}

/**
 * Trang bio (Review Landing Pages in English): every link that opens the shop's page — the main page and each NFC
 * card — in one quiet row that drops down into a table. Cards load only when opened, so the overview stays light.
 * Each row copies its link or opens it ("Truy cập"); no share button and no QR code (Tài chose both).
 */
type Landing = { key: string; name: string; code: string; url: string; state: string | null };
const CARD_STATES: Record<string, string> = { prepared: 'Chưa kích hoạt', tested: 'Đã thử', active: 'Đang hoạt động', disabled: 'Đã tắt' };
function LandingPages({ url, endpoint }: { url: string; endpoint: string }) {
  const [open, setOpen] = useState(false), [cards, setCards] = useState<Landing[] | null>(null), [status, setStatus] = useState('');
  const origin = url.replace(/\/[^/]*$/, '');
  const main: Landing = { key: 'main', name: 'Trang chính', code: url.slice(origin.length + 1), url, state: null };
  const toggle = async () => {
    setOpen(!open);
    if (open || cards) return;
    try {
      const response = await fetch(`${endpoint}/cards`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setCards([]); setStatus('Phiên này không xem được danh sách thẻ.'); return; }
      setCards((body.cards as Array<{ id: string; code: string; label: string; state: string }>).map(card =>
        ({ key: card.id, name: card.label, code: card.code, url: `${origin}/t/${card.code}`, state: card.state })));
    } catch { setCards([]); setStatus('Không thể kết nối. Vui lòng thử lại.'); }
  };
  const copy = async (row: Landing) => {
    try { await navigator.clipboard.writeText(row.url); setStatus(`Đã sao chép link ${row.name}.`); }
    catch { setStatus('Chưa sao chép được. Giữ lâu vào link để sao chép.'); }
  };
  const rows = [main, ...(cards ?? [])];
  return <section className={`${styles.panel} ${styles.landing}`} aria-label="Trang bio" data-customer-link={url} data-landing-pages>
    <button type="button" className={styles.landingHead} aria-expanded={open} aria-controls="landing-pages" onClick={() => void toggle()}>
      <span><strong>Trang bio</strong><small>{cards ? `${rows.length} link` : 'Trang chính và link của từng thẻ NFC'}</small></span>
      <svg className={styles.chevron} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <div id="landing-pages">
      {!cards ? <p className={styles.hint}>Đang tải…</p> : <table className={styles.landingTable}>
        <thead><tr><th>Tên</th><th>Link</th><th>Trạng thái</th><th><span className={styles.srOnly}>Thao tác</span></th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.key} data-landing={row.code}>
          <td><strong>{row.name}</strong> <code>{row.code}</code></td>
          <td className={styles.landingUrl}>{row.url.replace(/^https?:\/\//, '')}</td>
          <td>{row.state ? <span className={styles.dot} data-state={row.state}>{CARD_STATES[row.state] ?? row.state}</span> : <span className={styles.dot} data-state="main">Trang gốc</span>}</td>
          <td className={styles.landingActions}><button type="button" onClick={() => void copy(row)}>Sao chép</button>
            <a href={row.url} target="_blank" rel="noreferrer">Truy cập</a></td>
        </tr>)}</tbody>
      </table>}
      <p role="status" className={styles.hint}>{status}</p>
    </div>}
  </section>;
}

function Support({ support, canChange, change }: { support: Summary['support']; canChange: boolean; change: (level: string) => Promise<void> }) {
  // The chosen position shows at once; the saved one takes over when the server answers.
  const [chosen, setChosen] = useState<string | null>(null);
  const busy = chosen !== null;
  return <section className={styles.panel} aria-label="Hỗ trợ từ quản trị" data-support={support.level}><h2>Hỗ trợ từ quản trị</h2>
    <p className={styles.hint}>Chọn mức quản trị viên nền tảng được làm trên shop này. Mỗi lượt quản trị vào đều hiện ở mục bên dưới. Không mức nào cho quản trị tải dữ liệu về. Xong việc thì đưa về Tắt.</p>
    <div className={styles.levels} role="radiogroup" aria-label="Mức hỗ trợ">{LEVELS.map(([value, label, meaning]) =>
      <label key={value} className={styles.level} data-level={value}>
        <input type="radio" name="support-level" checked={(chosen ?? support.level) === value} disabled={!canChange || busy}
          onChange={async () => { setChosen(value); await change(value); setChosen(null); }} />
        <span><strong>{label}</strong><small>{meaning}</small></span></label>)}</div>
    {!canChange && <p className={styles.hint}>Chỉ tài khoản chủ shop đổi được mức này.</p>}
    {support.history.length > 0 && <p className={styles.hint} data-support-history>{support.history.map(h => `${LEVEL_NAMES[h.level]} bởi ${h.by} lúc ${time(h.at)}`).join(' · ')}</p>}
  </section>;
}

const PASSWORD_ERRORS: Record<string, string> = {
  WRONG_PASSWORD: 'Mật khẩu hiện tại chưa đúng.', WEAK_PASSWORD: 'Mật khẩu mới cần ít nhất 12 ký tự.',
  SAME_PASSWORD: 'Mật khẩu mới phải khác mật khẩu hiện tại.', TOO_MANY_ATTEMPTS: 'Thử sai quá nhiều lần. Đợi 15 phút rồi thử lại.',
  LOGIN_REQUIRED: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi đổi mật khẩu.',
};
/** The owner's own password. Other devices signed in to this account are signed out; this one stays. */
function PasswordForm() {
  const [values, setValues] = useState({ current: '', next: '', confirm: '' }), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => { setValues({ ...values, [key]: e.target.value }); setNotice(''); };
  return <form className={styles.passwordForm} data-password-form onSubmit={async e => {
    e.preventDefault();
    if (values.next.length < 12) { setNotice(PASSWORD_ERRORS.WEAK_PASSWORD); return; }
    if (values.next !== values.confirm) { setNotice('Hai lần nhập mật khẩu mới chưa giống nhau.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/owner/v2/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: values.current, next: values.next }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(PASSWORD_ERRORS[body.error] ?? 'Chưa đổi được mật khẩu. Thử lại.'); return; }
      setValues({ current: '', next: '', confirm: '' });
      setNotice('Đã đổi mật khẩu. Các máy khác đang đăng nhập tài khoản này đã bị đăng xuất.');
    } catch { setNotice('Không thể kết nối. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }}>
    <h3>Đổi mật khẩu</h3>
    <label>Mật khẩu hiện tại<input type="password" autoComplete="current-password" required value={values.current} onChange={set('current')} /></label>
    <label>Mật khẩu mới (ít nhất 12 ký tự)<input type="password" autoComplete="new-password" required minLength={12} value={values.next} onChange={set('next')} /></label>
    <label>Nhập lại mật khẩu mới<input type="password" autoComplete="new-password" required value={values.confirm} onChange={set('confirm')} /></label>
    <button disabled={busy}>{busy ? 'Đang đổi…' : 'Đổi mật khẩu'}</button>
    <p role="status" className={styles.hint} data-password-notice>{notice}</p>
  </form>;
}

function AdminVisits({ visits }: { visits: Summary['adminVisits'] }) {
  return <section className={styles.panel} aria-label="Lượt truy cập của quản trị" data-admin-visits><h2>Lượt truy cập của quản trị</h2>
    <p className={styles.hint}>Mỗi lần quản trị viên nền tảng xem dashboard thay mặt shop đều được ghi lại ở đây, kèm lý do. Quản trị viên chỉ được xem, không sửa và không tải được dữ liệu.</p>
    {visits.length === 0 ? <p>Chưa có lượt nào.</p> : <ul className={styles.list}>{visits.map(v => <li key={v.id} data-admin-visit={v.id}>
      <strong>{v.admin}</strong> · {time(v.started_at)} · {SCOPES[v.scope]}
      <p data-reason>{v.reason}</p>
      <p className={styles.hint}>{v.ended_at ? `${ENDINGS[v.end_reason ?? 'ended']} lúc ${time(v.ended_at)}` : `hết hạn lúc ${time(v.expires_at)}`} · {v.reads} lần xem</p>
    </li>)}</ul>}
  </section>;
}

function CaseForm({ row, save }: { row: ExperienceRow; save: (row: ExperienceRow, status: string, note: string) => Promise<boolean> }) {
  const [status, setStatus] = useState(row.status ?? 'new'), [note, setNote] = useState(row.note), [busy, setBusy] = useState(false);
  return <form className={styles.caseForm} onSubmit={async e => { e.preventDefault(); setBusy(true); await save(row, status, note); setBusy(false); }}>
    <label>Trạng thái<select value={status} onChange={e => setStatus(e.target.value)} disabled={busy}>{Object.entries(STATUS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
    <label>Ghi chú nội bộ<textarea value={note} maxLength={2000} onChange={e => setNote(e.target.value)} disabled={busy} /></label>
    <button disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu xử lý'}</button>
  </form>;
}

/** One row per response; the customer's own words span the whole table right under it, with the note button beside. */
function FeedbackTable({ rows, readOnly, overview, save }: { rows: ExperienceRow[]; readOnly: boolean; overview: boolean; save: (row: ExperienceRow, status: string, note: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (rows.length === 0) return <p className={styles.hint}>Chưa có phản hồi trong khoảng này.</p>;
  return <div className={styles.tableWrap}><table className={styles.table} data-feedback-table>
    <thead><tr><th>Thời gian</th><th>Cảm xúc</th><th>Loại</th><th>Chủ đề</th><th>Nguồn</th><th>Số gọi lại</th><th>Xử lý</th></tr></thead>
    <tbody>{rows.map(row => {
      const face = faceFor(row.rating), hasFeedback = !!row.status;
      return <Fragment key={`${row.session_id}:${row.case_revision}:${row.experience_revision}`}>
        <tr data-row={row.session_id} className={hasFeedback ? styles.withMessage : undefined}>
          <td>{time(row.first_rated_at)}</td>
          <td className={styles.face}>{face ? <span role="img" aria-label={`${row.rating} sao`}>{face}</span> : <span title="Chưa chấm sao">—</span>}</td>
          <td>Riêng tư</td>
          <td>{row.topic ? TOPICS[row.topic] ?? row.topic : '—'}</td>
          <td>{row.source_label}</td>
          <td data-phone>{row.phone ? <a href={`tel:${row.phone}`}>{row.phone}</a> : '—'}</td>
          <td><span className={styles.status} data-status={row.status ?? 'none'}>{row.status ? STATUS[row.status] : '—'}</span></td>
        </tr>
        {hasFeedback && <tr className={styles.messageRow} data-message-for={row.session_id}><td colSpan={7}>
          <div className={styles.messageLine}>
            <p className={styles.message}>{row.message ?? (overview ? 'Nội dung góp ý ẩn trong phạm vi tổng quan.' : '')}</p>
            {!readOnly && <button type="button" className={styles.noteButton} aria-expanded={editing === row.session_id}
              onClick={() => setEditing(editing === row.session_id ? null : row.session_id)}>{row.note ? 'Ghi chú ✎' : 'Ghi chú'}</button>}
          </div>
          {readOnly && row.note && <p className={styles.hint}>Ghi chú nội bộ: {row.note}</p>}
          {!readOnly && !editing && row.note && <p className={styles.hint}>Ghi chú: {row.note}</p>}
          {!readOnly && editing === row.session_id && <CaseForm row={row} save={async (...args) => { const ok = await save(...args); if (ok) setEditing(null); return ok; }} />}
        </td></tr>}
      </Fragment>;
    })}</tbody>
  </table></div>;
}

type Range = { key: Period | 'custom'; from: string; to: string };
const rangeFor = (key: Period): Range => ({ key, from: hcmDate(key === 'today' ? 0 : key === 'week' ? 6 : 29), to: hcmDate() });

export default function OwnerDashboard({ slug, name, customerUrl, impersonation }: { slug: string; name: string; customerUrl: string; impersonation: Impersonation | null }) {
  const router = useRouter();
  const endpoint = `/api/owner/v2/${encodeURIComponent(slug)}`;
  // A design session sees only the editor: at position 2 the owner has hidden every figure from support.
  const designOnly = impersonation?.scope === 'design';
  const [view, setView] = useState<View>(designOnly ? 'design' : 'home');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [notice, setNotice] = useState(''), [expired, setExpired] = useState(false), [loading, setLoading] = useState(false);
  const [periods, setPeriods] = useState<Record<string, Period>>({ visits: 'today', google: 'today', private: 'today' });
  const [range, setRange] = useState<Range | null>(null);
  const [custom, setCustom] = useState({ from: hcmDate(6), to: hcmDate() });
  const [extra, setExtra] = useState({ source: '', release: '', rating: '', status: '' });
  const [cursor, setCursor] = useState(''), [dataset, setDataset] = useState('experiences');
  const latest = useRef(0);

  const query = range ? (() => { const p = new URLSearchParams({ from: range.from, to: range.to }); Object.entries(extra).forEach(([k, v]) => { if (v) p.set(k, v); }); return p.toString(); })() : '';
  const fail = useCallback(async (response: Response) => {
    if (response.status === 401) { setExpired(true); setNotice(impersonation ? 'Phiên xem thay mặt đã kết thúc.' : 'Phiên đăng nhập đã hết hạn.'); return; }
    if (response.status === 403 && impersonation && (await response.clone().json().catch(() => ({}))).error === 'SUPPORT_NOT_GRANTED') { setNotice('Chủ shop đã tắt quyền đọc góp ý. Kết thúc phiên và mở lại ở phạm vi tổng quan.'); return; }
    setNotice(response.status === 403 ? 'Bạn không còn quyền truy cập shop này.' : 'Không thể tải dữ liệu. Vui lòng thử lại.');
  }, [impersonation]);
  const loadSummary = useCallback(async () => {
    if (designOnly) return;
    try {
      const response = await fetch(`${endpoint}/summary`, { cache: 'no-store' });
      if (!response.ok) return fail(response);
      setSummary(await response.json()); setExpired(false);
    } catch { setNotice('Không thể kết nối. Vui lòng thử lại.'); }
  }, [endpoint, fail, designOnly]);
  const loadData = useCallback(async (quiet = false) => {
    if (!query) return;
    const sequence = ++latest.current;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`${endpoint}?${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { cache: 'no-store' });
      if (sequence !== latest.current) return;
      if (!response.ok) { await fail(response); return; }
      setData(await response.json()); setExpired(false);
    } catch { if (sequence === latest.current) setNotice('Không thể kết nối. Vui lòng thử lại.'); }
    finally { if (sequence === latest.current) setLoading(false); }
  }, [endpoint, query, cursor, fail]);

  // Loads start after the render that asked for them (a microtask), never synchronously inside the effect.
  useEffect(() => { void Promise.resolve().then(loadSummary); }, [loadSummary]);
  useEffect(() => { void Promise.resolve().then(() => loadData()); }, [loadData]);
  // Keep what is on screen while the tab is hidden; on return refresh quietly in the background.
  useEffect(() => {
    const refresh = () => { void loadSummary(); void loadData(true); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) refresh(); };
    document.addEventListener('visibilitychange', visible); window.addEventListener('pageshow', restored);
    return () => { document.removeEventListener('visibilitychange', visible); window.removeEventListener('pageshow', restored); };
  }, [loadSummary, loadData]);

  const pick = (key: Period) => { setNotice(''); setCursor(''); setRange(rangeFor(key)); };
  const changeSupport = async (level: string) => {
    try {
      const response = await fetch(`${endpoint}/support`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level }) });
      if (!response.ok) { setNotice(response.status === 401 ? 'Phiên đăng nhập đã hết hạn.' : 'Chưa đổi được mức hỗ trợ. Thử lại.'); return; }
      setNotice(`Đã đặt mức hỗ trợ: ${LEVEL_NAMES[level]}.`); await loadSummary();
    } catch { setNotice('Chưa xác nhận được mức hỗ trợ. Tải lại để kiểm tra.'); }
  };
  const save = async (row: ExperienceRow, status: string, note: string) => {
    try {
      const response = await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: row.session_id, expectedCaseRevision: row.case_revision, expectedExperienceRevision: row.experience_revision, status, note }) });
      if (response.status === 401) { setExpired(true); setNotice('Phiên đăng nhập đã hết hạn.'); return false; }
      if (response.status === 409) { setNotice('Góp ý hoặc trạng thái đã thay đổi. Dữ liệu mới được tải lại; hãy kiểm tra trước khi lưu.'); await loadData(true); return false; }
      if (!response.ok) { setNotice('Không lưu được. Kiểm tra quyền truy cập và thử lại.'); return false; }
      setNotice('Đã lưu xử lý.'); await Promise.all([loadData(true), loadSummary()]); return true;
    } catch { setNotice('Chưa xác nhận được kết quả lưu. Tải lại để kiểm tra trước khi gửi lại.'); return false; }
  };
  const logout = async () => {
    try { const r = await fetch('/api/owner/v2/logout', { method: 'POST' }); if (r.ok) { setSummary(null); setData(null); router.replace(`/owner/login?next=${encodeURIComponent(`/ZZZ/${slug}`)}`); } else setNotice('Chưa đăng xuất được. Thử lại.'); }
    catch { setNotice('Chưa đăng xuất được. Thử lại.'); }
  };
  const endStandIn = async () => {
    try { const r = await fetch(`${endpoint}/impersonation`, { method: 'DELETE' }); if (r.ok) { setSummary(null); setData(null); router.replace('/gov'); } else setNotice('Chưa kết thúc được phiên. Thử lại.'); }
    catch { setNotice('Chưa kết thúc được phiên. Thử lại.'); }
  };

  const totals = summary?.totals;
  const owner = !impersonation;
  const title = VIEWS.find(([id]) => id === view)![1];
  return <div className={styles.app}>
    <aside className={styles.side}>
      <div className={styles.avatar} aria-hidden="true">{initials(name)}</div>
      <p className={styles.shopName}>{name}</p>
      <p className={styles.account}>{summary ? summary.account : ' '}</p>
      {summary && summary.shops.length > 1 && <label className={styles.picker}>Shop đang xem
        <select value={slug} onChange={e => { if (e.target.value !== slug) router.push(`/ZZZ/${e.target.value}`); }}>
          {summary.shops.map(shop => <option key={shop.slug} value={shop.slug}>{shop.name}</option>)}</select></label>}
      <nav className={styles.nav} aria-label="Phần của dashboard">{VIEWS.filter(([id]) => !designOnly || id === 'design').map(([id, label, icon]) =>
        <button key={id} type="button" data-view={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}><Icon path={icon} /><span>{label}</span></button>)}</nav>
      {owner && <button type="button" className={styles.logout} onClick={logout}>Đăng xuất</button>}
    </aside>
    <main className={styles.content}>
      {impersonation && <aside className={styles.impersonation} data-impersonation={impersonation.scope} role="note">
        <strong>Đang xem thay mặt chủ shop</strong> · {impersonation.admin} · {SCOPES[impersonation.scope]} · chỉ xem · hết hạn lúc {time(impersonation.expiresAt)}
        <p>Lý do: {impersonation.reason}</p>
        <button type="button" onClick={endStandIn}>Kết thúc phiên</button>
      </aside>}
      <header className={styles.top}><p className={styles.brand}>NFC Feedback</p><h1>{title}</h1></header>
      <p role="status" aria-live="polite" className={styles.notice}>{notice}</p>
      {expired && (impersonation ? <Link href="/gov">Về trang quản trị</Link> : <a href={`/owner/login?next=${encodeURIComponent(`/ZZZ/${slug}`)}`}>Đăng nhập lại</a>)}

      {view === 'home' && <section aria-label="Tổng quan" data-panel="home">
        {!totals ? <p className={styles.hint}>Đang tải…</p> : <>
          <div className={styles.kpis}>
            <Kpi id="visits" accent title="Lượt truy cập" value={String(totals[periods.visits].opens)} sub={`${totals[periods.visits].sessions} phiên`}
              period={periods.visits} onPeriod={p => setPeriods({ ...periods, visits: p })} />
            <Kpi id="google" title="Đánh giá Google" value="—" sub="Chưa kết nối Google" period={periods.google} onPeriod={p => setPeriods({ ...periods, google: p })} />
            <Kpi id="private" title="Phản hồi riêng tư" value={String(totals[periods.private].private)} sub={`${totals[periods.private].messages} có lời nhắn`}
              period={periods.private} onPeriod={p => setPeriods({ ...periods, private: p })} />
            <Kpi id="unresolved" title="Góp ý chưa xử lý" value={String(summary!.unresolved)} sub="Tất cả thời gian" />
          </div>
          <p className={styles.hint} data-google-note>Số đánh giá Google sẽ có khi shop kết nối Google Business Profile. Trang khách không biết được khách đã đăng review hay chưa.</p>
          <Week daily={summary!.daily} />
          <LandingPages url={customerUrl} endpoint={endpoint} />
        </>}
      </section>}

      {view === 'data' && <section aria-label="Dữ liệu" data-panel="data">
        <div className={styles.panel}>
          <div className={styles.presets} role="group" aria-label="Khoảng thời gian">
            {(Object.keys(PERIODS) as Period[]).map(key => <button key={key} type="button" aria-pressed={range?.key === key} onClick={() => pick(key)}>{PERIODS[key]}</button>)}
            <button type="button" aria-pressed={range?.key === 'custom'} onClick={() => { setCursor(''); setRange({ key: 'custom', ...custom }); }}>Tùy chọn</button>
          </div>
          {range?.key === 'custom' && <form className={styles.filters} onSubmit={e => { e.preventDefault(); setCursor(''); setRange({ key: 'custom', ...custom }); }}>
            <label>Từ ngày<input type="date" value={custom.from} onChange={e => setCustom({ ...custom, from: e.target.value })} required /></label>
            <label>Đến ngày<input type="date" value={custom.to} onChange={e => setCustom({ ...custom, to: e.target.value })} required /></label>
            <button>Xem</button></form>}
          {data && <form className={styles.filters} onSubmit={e => { e.preventDefault(); setCursor(''); void loadData(); }}>
            <label>Nguồn<select value={extra.source} onChange={e => setExtra({ ...extra, source: e.target.value })}><option value="">Tất cả</option><option value="direct">Trực tiếp</option><option value="unknown">Chưa rõ</option>{data.tags.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <label>Bản phát hành<select value={extra.release} onChange={e => setExtra({ ...extra, release: e.target.value })}><option value="">Tất cả</option><option value="unknown">Chưa rõ</option>{data.releases.map(r => <option key={r.id} value={r.id}>{time(r.created_at)} · {r.id.slice(0, 8)}</option>)}</select></label>
            <label>Cảm xúc<select value={extra.rating} onChange={e => setExtra({ ...extra, rating: e.target.value })}><option value="">Tất cả</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{faceFor(n)} {n}</option>)}</select></label>
            <label>Xử lý<select value={extra.status} onChange={e => setExtra({ ...extra, status: e.target.value })}><option value="">Tất cả</option>{Object.entries(STATUS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
          </form>}
          {!range && <p className={styles.hint}>Chọn khoảng thời gian để xem dữ liệu. Dữ liệu chỉ tải khi bạn chọn, để dashboard luôn nhẹ.</p>}
        </div>
        {loading && <p className={styles.hint}>Đang tải dữ liệu…</p>}
        {data && range && <>
          <div className={styles.kpis}>{Object.entries({ opens: 'Lượt truy cập', sessions: 'Phiên 15 phút', rated: 'Có chấm sao', average: 'Điểm trung bình', feedback: 'Có lời nhắn', unresolved: 'Chưa xử lý' })
            .map(([key, label]) => <article key={key} className={styles.small}><span>{label}</span><strong data-metric={key}>{data.metrics[key as keyof typeof data.metrics] ?? '—'}</strong></article>)}</div>
          <section className={styles.panel} aria-label="Nguồn thẻ" data-sources><h2>Nguồn thẻ</h2>
            {data.sources.length === 0 ? <p className={styles.hint}>Chưa có phiên nào trong khoảng này.</p> : <ul className={styles.sources}>{data.sources.map(row => <li key={row.label} data-source={row.label}>
              <span>{row.label}</span><strong>{row.sessions}</strong></li>)}</ul>}
          </section>
          <section className={styles.panel} aria-label="Phản hồi của khách"><h2>Phản hồi của khách</h2>
            <FeedbackTable rows={data.records} readOnly={!!impersonation} overview={impersonation?.scope === 'overview'} save={save} />
            <nav className={styles.actions} aria-label="Phân trang">{cursor && <button type="button" onClick={() => setCursor('')}>Về trang đầu</button>}{data.nextCursor && <button type="button" onClick={() => setCursor(data.nextCursor!)}>Trang tiếp</button>}</nav>
          </section>
          {owner && <section className={styles.panel} aria-label="Tải dữ liệu"><h2>Tải dữ liệu</h2>
            <div className={styles.actions}><label>Loại dữ liệu<select value={dataset} onChange={e => setDataset(e.target.value)}><option value="experiences">Phản hồi hiện tại</option><option value="page_visits">Lượt truy cập</option><option value="receipts">Lịch sử phản hồi</option></select></label>
              {['csv', 'jsonl', 'dictionary'].map(format => <a key={format} className={styles.linkButton} href={`${endpoint}/export?${query}&dataset=${dataset}&format=${format}`}>{format === 'dictionary' ? 'Từ điển dữ liệu' : format.toUpperCase()}</a>)}</div>
            <p className={styles.hint}>CSV cho Excel. JSONL đọc theo từng dòng cho dữ liệu lớn. File giữ cùng khoảng thời gian và bộ lọc đang áp dụng.</p></section>}
        </>}
      </section>}

      {view === 'design' && (impersonation && !designOnly
        ? <section className={styles.panel} aria-label="Thiết kế & Link" data-panel="design"><h2>Thiết kế & Link</h2>
            <p className={styles.hint}>Phiên này chỉ để xem. Để chỉnh giao diện, mở phiên “Sửa giao diện”; chủ shop cần đặt mức hỗ trợ Khấc 2 hoặc Khấc 3.</p></section>
        : <div data-panel="design"><DesignEditor endpoint={endpoint} customerUrl={customerUrl} />
            <CardsPanel endpoint={endpoint} origin={customerUrl.replace(/\/[^/]*$/, '')} /></div>)}

      {view === 'settings' && <section aria-label="Cài đặt" data-panel="settings">
        {summary && <section className={styles.panel} aria-label="Tài khoản"><h2>Tài khoản</h2>
          <p><strong>{summary.account}</strong> · {summary.viewer.kind === 'admin' ? 'quản trị viên đang xem thay mặt' : summary.viewer.role === 'owner' ? 'chủ shop' : 'quản lý'}</p>
          {owner ? <PasswordForm /> : <p className={styles.hint}>Quản trị không đổi được mật khẩu của chủ shop.</p>}
          <p className={styles.hint}>Tài khoản phụ (quản lý, nhân viên) sẽ có ở đây.</p></section>}
        {summary && <Support support={summary.support} canChange={owner && summary.viewer.kind === 'owner' && summary.viewer.role === 'owner'} change={changeSupport} />}
        {summary && <AdminVisits visits={summary.adminVisits} />}
      </section>}
    </main>
  </div>;
}
