'use client';
/**
 * Tab Data (kịch bản mục 7): nơi thành viên tương tác thật với khách. Góp ý riêng và đánh giá Google trong một hộp thư,
 * mới nhất trên cùng; không có ô "lượt truy cập" hay số rườm rà. Bấm một dòng để xử lý: góp ý riêng có trạng thái và ghi
 * chú; đánh giá Google trả lời được khi Google đã cấp quyền API. Trước đó chủ quán dán link Google Maps của quán, tool Google
 * Maps trên máy Tài đọc đánh giá (nguồn `maps`): ngày đăng là ước đoán, trả lời trên Google Maps.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TabProps } from './index';
import styles from './tabs.module.css';
import { dayOf, ESTIMATE, GOOGLE_ERRORS, useGoogleBusiness, waitingForTool } from './google-business';
import MapsLinkCard from './maps-link';
import Icon from '../icons';

type Experience = { session_id: string; first_rated_at: string; updated_at: string; rating: number | null; experience_revision: string;
  message: string | null; phone: string | null; status: string | null; note: string; case_revision: number; source_label: string; topic: string | null };
/** `estimated`: the day is the Google Maps tool's guess, so it is shown without a time. */
type Item = { key: string; kind: 'private' | 'google'; at: string; estimated: boolean; name: string; photo: string | null; stars: number | null; text: string | null;
  status: string; raw: Experience | null; reply: string | null };
const RANGES = { 7: '7 ngày', 30: '30 ngày', 90: '90 ngày' } as const;
const STATUS: Record<string, string> = { new: 'Mới', progress: 'Đang xử lý', resolved: 'Đã xong' };
const when = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const day = (back: number) => new Date(Date.now() + 7 * 3600000 - back * 86400000).toISOString().slice(0, 10);
const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map(word => Array.from(word)[0] ?? '').join('').toUpperCase() || 'K';

export function Stars({ value }: { value: number | null }) {
  if (!value) return <span className={styles.meta}>Không chấm sao</span>;
  return <span className={styles.stars} aria-label={`${value} trên 5 sao`}>{'★★★★★'.split('').map((star, i) => <span key={i} className={i < value ? '' : styles.off}>{star}</span>)}</span>;
}

export default function DataTab({ slug, role }: TabProps) {
  const [range, setRange] = useState<keyof typeof RANGES>(30), [filter, setFilter] = useState<'all' | 'private' | 'google'>('all');
  const [rows, setRows] = useState<Experience[] | null>(null), [error, setError] = useState(''), [open, setOpen] = useState<string | null>(null), [since, setSince] = useState(0);
  const google = useGoogleBusiness(slug), [editing, setEditing] = useState(false), [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/owner/v2/${slug}?from=${day(range - 1)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error === 'PERMISSION_REQUIRED' ? 'Bạn chưa được cấp quyền đọc góp ý.' : 'Chưa tải được dữ liệu.'); setRows([]); return; }
      setRows(body.records); setError(''); setSince(Date.now() - range * 86400000);
    } catch { setError('Không thể kết nối. Thử lại sau.'); }
  }, [slug, range]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const items = useMemo<Item[]>(() => {
    const privateItems: Item[] = (rows ?? []).filter(r => r.message || r.rating).map(r => ({ key: `p:${r.session_id}`, kind: 'private', at: r.updated_at, estimated: false,
      name: 'Khách của quán', photo: null, stars: r.rating, text: r.message, status: r.status ?? 'rated', raw: r, reply: null }));
    const estimated = google.data?.connection?.mode === 'maps';
    const googleItems: Item[] = (google.data?.reviews ?? []).filter(r => Date.parse(r.createdAt) >= since).map(r => ({ key: `g:${r.reviewId}`, kind: 'google',
      at: r.createdAt, estimated, name: r.reviewerName ?? 'Người dùng Google', photo: r.reviewerPhoto, stars: r.stars, text: r.comment, status: r.reply ? 'replied' : 'unreplied', raw: null, reply: r.reply }));
    return [...privateItems, ...googleItems].filter(item => filter === 'all' || item.kind === filter).sort((a, b) => b.at.localeCompare(a.at));
  }, [rows, google.data, since, filter]);
  const connection = google.data?.connection;
  return <div className={styles.grid}>
    <div className={styles.row}>
      <div className={styles.chips} role="group" aria-label="Nguồn">
        {([['all', 'Tất cả'], ['private', 'Góp ý riêng'], ['google', 'Google']] as const).map(([key, label]) =>
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
      </div>
      <div className={styles.segmented} role="group" aria-label="Khoảng thời gian">
        {(Object.keys(RANGES).map(Number) as (keyof typeof RANGES)[]).map(key => <button key={key} type="button" aria-pressed={range === key} onClick={() => setRange(key)}>{RANGES[key]}</button>)}
      </div>
    </div>
    {google.data && (!connection || editing) && (google.data.maps
      ? <MapsLinkCard canManage={google.data.canManage} busy={google.busy} current={connection?.mapsUrl}
        onSave={async url => { const ok = await google.act('maps-link', url); if (ok) { setEditing(false); setNotice('Đã lưu link. Đánh giá Google của quán sẽ về trong vài phút.'); } return ok; }}
        onCancel={connection ? () => setEditing(false) : undefined} />
      : <section className={styles.banner}><div className={styles.row}><div><h2 style={{ fontSize: 17 }}>Đánh giá Google của quán sẽ hiện ở đây</h2>
        <p className="qs-muted qs-small">Kết nối Google Business một lần, hệ thống tự kéo đánh giá 1–5 sao về và bạn trả lời ngay tại đây.</p></div>
        <span className="qs-pill">Đang chờ Google cấp quyền API</span></div></section>)}
    {connection && !editing && <div className={styles.row}>
      <p className="qs-small qs-muted"><Icon name="google" size={16} /> {connection.locationTitle ?? (connection.mode === 'maps' ? 'Google Maps' : 'Google Business')}
        {connection.averageRating !== null && <> · {connection.averageRating.toFixed(1).replace('.', ',')}★</>}
        {connection.totalReviews !== null && <> · {connection.totalReviews} đánh giá <span className="qs-pill">{ESTIMATE}</span></>}
        {connection.lastSyncedAt && <> · {connection.mode === 'maps' ? 'Google Maps' : 'đồng bộ'} {when(connection.lastSyncedAt)}</>}
        {waitingForTool(connection) && <> · <span className="qs-pill">{connection.lastSyncedAt ? 'đang cập nhật…' : 'đang lấy đánh giá lần đầu, thường vài phút…'}</span></>}</p>
      <div className={styles.row} style={{ gap: 8 }}>
        {(connection.mode === 'google' || google.data?.maps) && <button type="button" className="qs-btn ghost small" disabled={google.busy || waitingForTool(connection)}
          onClick={async () => { if (await google.act('sync') && connection.mode === 'maps') setNotice('Đã gửi yêu cầu. Đánh giá mới về trong vài phút.'); }}>
          {google.busy ? 'Đang gửi…' : 'Cập nhật ngay'}</button>}
        {connection.mode === 'maps' && google.data?.canManage && <button type="button" className="qs-btn ghost small" onClick={() => setEditing(true)}>Đổi link</button>}
      </div>
    </div>}
    {connection?.lastError === 'MAPS_RUN_FAILED' && !editing && <p className="qs-error">{GOOGLE_ERRORS.MAPS_RUN_FAILED}</p>}
    {notice && <p className="qs-small" role="status">{notice}</p>}
    {(error || google.error) && <p className="qs-error">{error || google.error}</p>}
    {rows === null ? <p className="qs-muted">Đang tải…</p> : items.length === 0 ? <div className={`${styles.card} ${styles.empty}`}>
      <strong>Chưa có phản hồi nào trong {RANGES[range]}</strong><span>Khi khách chấm sao, gửi góp ý riêng hay đánh giá trên Google, mọi thứ sẽ về đây.</span></div>
      : <ul className={styles.list}>{items.map(item => <li key={item.key} className={styles.item} data-item={item.kind}>
        <div className={styles.avatar}>{item.photo ? <img src={item.photo} alt="" referrerPolicy="no-referrer" /> : item.kind === 'private' ? <Icon name="data" size={20} /> : initials(item.name)}</div>
        <button type="button" className={styles.itemOpen} onClick={() => setOpen(open === item.key ? null : item.key)} aria-expanded={open === item.key}>
          <div>
            <div className={styles.row} style={{ justifyContent: 'flex-start', gap: 8 }}>
              <strong style={{ fontSize: 14 }}>{item.name}</strong>
              <span className={styles.source} data-kind={item.kind}>{item.kind === 'google' ? 'Google' : 'Góp ý riêng'}</span>
            </div>
            <Stars value={item.stars} />
            {item.text && <p className={styles.message}>{item.text}</p>}
            <p className={styles.meta}>{item.estimated ? `${dayOf(item.at)} (${ESTIMATE})` : when(item.at)}{item.raw?.source_label ? ` · ${item.raw.source_label}` : ''}</p>
          </div>
        </button>
        <span className={styles.status} data-status={item.status}>{item.kind === 'google' ? (item.reply ? 'Đã trả lời' : 'Chưa trả lời') : STATUS[item.status] ?? 'Chỉ chấm sao'}</span>
        {/* A support session reads, never handles: the server refuses its writes, so it is offered none (lát D2). */}
        {open === item.key && (item.kind === 'private' && item.raw?.message ? (role === 'support'
          ? <p className={`qs-small qs-muted ${styles.detail}`} data-read-only>Quản trị chỉ đọc góp ý, không đổi trạng thái hay ghi chú.</p>
          : <CaseEditor slug={slug} row={item.raw} onSaved={load} />)
          : item.kind === 'google' ? <GoogleReply reply={item.reply} fromMaps={connection?.mode === 'maps'} /> : null)}
      </li>)}</ul>}
  </div>;
}

function CaseEditor({ slug, row, onSaved }: { slug: string; row: Experience; onSaved: () => void }) {
  const [status, setStatus] = useState(row.status === 'new' ? 'progress' : row.status ?? 'progress'), [note, setNote] = useState(row.note), [notice, setNotice] = useState('');
  return <form className={styles.detail} onSubmit={async event => {
    event.preventDefault(); setNotice('Đang lưu…');
    const response = await fetch(`/api/owner/v2/${slug}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: row.session_id, status, note, expectedCaseRevision: row.case_revision, expectedExperienceRevision: row.experience_revision }) }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) { setNotice(body?.error === 'CASE_CONFLICT' ? 'Có người vừa cập nhật phản hồi này. Tải lại để xem bản mới.' : 'Chưa lưu được. Thử lại.'); return; }
    setNotice('Đã lưu.'); onSaved();
  }}>
    {row.phone && <p className="qs-small">Khách để lại số gọi lại: <a href={`tel:${row.phone}`}><strong>{row.phone}</strong></a></p>}
    <label className="qs-field">Trạng thái<select value={status} onChange={event => setStatus(event.target.value)}>
      <option value="progress">Đang xử lý</option><option value="resolved">Đã xong</option><option value="new">Mới</option></select></label>
    <label className="qs-field">Ghi chú nội bộ <small>(khách không thấy)</small><textarea rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></label>
    <div className={styles.row}><span className="qs-small qs-muted" role="status">{notice}</span><button className="qs-btn small">Lưu</button></div>
  </form>;
}

function GoogleReply({ reply, fromMaps }: { reply: string | null; fromMaps: boolean }) {
  return <div className={styles.detail}>
    {reply ? <p className="qs-small"><strong>Quán đã trả lời:</strong> {reply}</p> : <p className="qs-small qs-muted">Chưa trả lời đánh giá này.</p>}
    <p className="qs-small qs-muted">{fromMaps ? 'Trả lời đánh giá này trên Google Maps. ' : ''}Trả lời đánh giá Google ngay tại đây sẽ mở khi Google cấp quyền API cho nền tảng. Trả lời mọi đánh giá, cả đánh giá chê, một cách lịch sự — đừng hứa quà hay nhờ khách sửa đánh giá.</p>
  </div>;
}
