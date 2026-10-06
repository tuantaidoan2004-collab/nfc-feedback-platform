'use client';
/**
 * Tab Data (kịch bản mục 7): nơi thành viên tương tác thật với khách — góp ý riêng và đánh giá Google trong **một hộp thư**.
 * Từ 05/10 tối là trang "Đánh giá" của tool Google Maps (Tài: "lấy hầu hết đem từ tool qua"): các tab Cần xử lý / Mới /
 * Đã xem / Đã xử lý có số đếm, ô tìm, lọc sao, đã trả lời hay chưa, có nội dung hay không, đang hiện hay đã bị xoá trên
 * Maps, sắp xếp, chọn nhiều để đánh dấu, khung chi tiết trượt từ phải có trạng thái và ghi chú nội bộ, xuất CSV. Thêm của
 * nền tảng: nguồn (góp ý riêng hay Google) và khoảng thời gian (7/30/90 ngày, Tất cả). Lọc, sắp xếp và chia trang chạy
 * ngay trong trình duyệt để rê chuột, bấm lọc đều tức thì.
 *
 * Trạng thái chung cho hai nguồn: góp ý riêng new/progress/resolved hiện là Mới/Đã xem/Đã xử lý như đánh giá Google.
 * Trước khi có kết nối, chủ quán dán link Google Maps của quán (MapsLinkCard); ngày đăng từ Google Maps là ước đoán.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TabProps } from './index';
import type { ReviewItem, ReviewStatus } from '@/lib/google/business';
import { fold } from '@/lib/text-fold';
import { relativeTime } from '@/lib/relative-time';
import { dayOf, ESTIMATE, GOOGLE_ERRORS, momentOf, useGoogleBusiness, waitingForTool } from './google-business';
import MapsLinkCard from './maps-link';
import { Avatar, Badge, Drawer, Empty, LOW, Pagination, Segmented, Stars } from './reviews-ui';
import Icon from '../icons';
import styles from './data.module.css';

type Experience = { session_id: string; first_rated_at: string; updated_at: string; rating: number | null; experience_revision: string;
  message: string | null; phone: string | null; status: string | null; note: string; case_revision: number; source_label: string; topic: string | null };
type Viewer = { kind: 'owner'; role: string; permissions: string[] } | { kind: 'admin' };
type Item = { key: string; kind: 'private' | 'google'; at: string; estimated: boolean; name: string; photo: string | null; stars: number | null;
  text: string | null; reply: string | null; status: ReviewStatus; note: string | null; needs: boolean; removed: boolean;
  review: ReviewItem | null; raw: Experience | null };

const RANGES = [[7, '7 ngày'], [30, '30 ngày'], [90, '90 ngày'], [0, 'Tất cả']] as const;
type Range = typeof RANGES[number][0];
const STATUS_LABEL: Record<ReviewStatus, string> = { new: 'Mới', seen: 'Đã xem', handled: 'Đã xử lý' };
/** Private feedback's own words for the same three steps (lib/owner/dashboard.ts). */
const PRIVATE_STATUS: Record<string, ReviewStatus> = { new: 'new', progress: 'seen', resolved: 'handled' };
const PRIVATE_VALUE: Record<ReviewStatus, string> = { new: 'new', seen: 'progress', handled: 'resolved' };
const PAGE = 20;
const day = (back: number) => new Date(Date.now() + 7 * 3600000 - back * 86400000).toISOString().slice(0, 10);
const fromOf = (range: Range) => range ? day(range - 1) : '2000-01-01';
/** A day from Google Maps is an estimate: today's says "hôm nay", not "3 giờ trước". */
const ago = (item: Item) => item.estimated && Date.now() - Date.parse(item.at) < 86400000 ? 'hôm nay' : relativeTime(item.at);

type Tab = 'all' | 'needs' | ReviewStatus;
type Filters = { search: string; stars: number[]; source: '' | 'private' | 'google'; replied: '' | 'no' | 'yes'; text: '' | 'yes' | 'no'; scope: '' | 'removed' | 'all';
  sort: '' | 'oldest' | 'rating_asc' | 'rating_desc' };
const NO_FILTERS: Filters = { search: '', stars: [], source: '', replied: '', text: '', scope: '', sort: '' };

export default function DataTab({ slug, role, query }: TabProps) {
  const fromDashboard = query.xem === 'can-xu-ly';
  const [range, setRange] = useState<Range>(0), [tab, setTab] = useState<Tab>(fromDashboard ? 'needs' : 'all');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS), [draft, setDraft] = useState(''), [page, setPage] = useState(1);
  const [rows, setRows] = useState<Experience[] | null>(null), [since, setSince] = useState(0), [viewer, setViewer] = useState<Viewer | null>(null), [error, setError] = useState('');
  const [reviews, setReviews] = useState<{ reviews: ReviewItem[]; placeUrl: string | null; canHandle: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null), [picked, setPicked] = useState<Set<string>>(new Set()), [notice, setNotice] = useState('');
  const google = useGoogleBusiness(slug), [editing, setEditing] = useState(false);
  const connection = google.data?.connection;

  // Private feedback of the period: every page (fifty a page), at most a thousand.
  const loadPrivate = useCallback(async () => {
    try {
      const all: Experience[] = []; let cursor: string | null = null, first = true;
      for (let i = 0; i < 20 && (first || cursor); i++) {
        const response: Response = await fetch(`/api/owner/v2/${slug}?from=${fromOf(range)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { cache: 'no-store' });
        const body: { error?: string; viewer?: Viewer; records?: Experience[]; nextCursor?: string | null } = await response.json().catch(() => ({}));
        if (!response.ok) { setError(body.error === 'PERMISSION_REQUIRED' ? 'Bạn chưa được cấp quyền đọc góp ý.' : 'Chưa tải được dữ liệu.'); setRows([]); return; }
        if (first) setViewer(body.viewer ?? null);
        all.push(...body.records ?? []); cursor = body.nextCursor ?? null; first = false;
      }
      setRows(all); setError(''); setSince(range ? Date.now() - range * 86400000 : 0);
    } catch { setError('Không thể kết nối. Thử lại sau.'); }
  }, [slug, range]);
  const loadReviews = useCallback(async () => {
    const response = await fetch(`/api/owner/v2/${slug}/google-reviews`, { cache: 'no-store' }).catch(() => null);
    if (response?.ok) setReviews(await response.json());
  }, [slug]);
  useEffect(() => { void Promise.resolve().then(loadPrivate); }, [loadPrivate]);
  // The reviews again whenever the connection has news: a first reading, "Cập nhật ngay" answered.
  const synced = connection?.lastSyncedAt ?? null, connected = !!connection;
  useEffect(() => { if (connected) void Promise.resolve().then(loadReviews); }, [connected, synced, loadReviews]);
  // Search applies 350 ms after typing stops, like the tool.
  useEffect(() => { if (draft === filters.search) return; const timer = setTimeout(() => { setFilters(f => ({ ...f, search: draft })); setPage(1); }, 350); return () => clearTimeout(timer); }, [draft, filters.search]);

  const items = useMemo<Item[]>(() => {
    const privateItems: Item[] = (rows ?? []).filter(r => r.message || r.rating).map(r => {
      const status = r.status ? PRIVATE_STATUS[r.status] ?? 'seen' : 'seen';
      return { key: `p:${r.session_id}`, kind: 'private', at: r.updated_at, estimated: false, name: 'Khách của quán', photo: null, stars: r.rating, text: r.message,
        reply: null, status, note: r.note || null, needs: !!r.message && status !== 'handled', removed: false, review: null, raw: r };
    });
    const estimated = connection?.mode === 'maps';
    const googleItems: Item[] = (reviews?.reviews ?? []).filter(r => Date.parse(r.createdAt) >= since).map(r => ({ key: `g:${r.reviewId}`, kind: 'google', at: r.createdAt,
      estimated, name: r.reviewerName ?? 'Người dùng Google', photo: r.reviewerPhoto, stars: r.stars, text: r.comment, reply: r.reply, status: r.status, note: r.note,
      needs: !r.removedAt && r.stars <= LOW && !r.reply && r.status !== 'handled', removed: !!r.removedAt, review: r, raw: null }));
    return [...privateItems, ...googleItems];
  }, [rows, reviews, since, connection?.mode]);

  // Every filter but the tab, then the tab: the tabs count what the other filters leave (the tool's status_counts).
  const filtered = useMemo(() => {
    const words = fold(filters.search);
    const kept = items.filter(item => (!filters.source || item.kind === filters.source)
      && (!filters.stars.length || (item.stars !== null && filters.stars.includes(item.stars)))
      && (!filters.replied || (item.kind === 'google' && (filters.replied === 'yes') === !!item.reply))
      && (!filters.text || (filters.text === 'yes') === !!item.text)
      && (filters.scope === 'all' || (filters.scope === 'removed') === item.removed)
      && (!words || fold([item.name, item.text, item.note, item.reply].filter(Boolean).join(' ')).includes(words)));
    const by = filters.sort;
    return kept.sort((a, b) => by === 'oldest' ? a.at.localeCompare(b.at) : by === 'rating_asc' ? (a.stars ?? 9) - (b.stars ?? 9) || b.at.localeCompare(a.at)
      : by === 'rating_desc' ? (b.stars ?? 0) - (a.stars ?? 0) || b.at.localeCompare(a.at) : b.at.localeCompare(a.at));
  }, [items, filters]);
  const counts = useMemo(() => ({ all: filtered.length, needs: filtered.filter(i => i.needs).length, new: filtered.filter(i => i.status === 'new').length,
    seen: filtered.filter(i => i.status === 'seen').length, handled: filtered.filter(i => i.status === 'handled').length }), [filtered]);
  const shown = useMemo(() => filtered.filter(item => tab === 'all' || (tab === 'needs' ? item.needs : item.status === tab)), [filtered, tab]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE)), current = Math.min(page, pages), slice = shown.slice((current - 1) * PAGE, current * PAGE);
  const opened = items.find(item => item.key === open) ?? null;
  const canHandle = role !== 'support' && !!reviews?.canHandle;
  const canExport = viewer?.kind === 'owner' && viewer.permissions.includes('export');
  const active = (['search', 'source', 'replied', 'text', 'scope'] as const).filter(key => filters[key]).length + (filters.stars.length ? 1 : 0);
  const set = (patch: Partial<Filters>) => { setFilters(f => ({ ...f, ...patch })); setPage(1); setPicked(new Set()); };

  const mark = useCallback(async (ids: string[], change: { status?: ReviewStatus; note?: string }) => {
    const response = await fetch(`/api/owner/v2/${slug}/google-reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewIds: ids, ...change }) }).catch(() => null);
    if (!response?.ok) { setNotice('Chưa lưu được. Thử lại.'); return false; }
    // At once on screen, then the server's copy.
    setReviews(r => r && { ...r, reviews: r.reviews.map(x => ids.includes(x.reviewId) ? { ...x, ...(change.status ? { status: change.status } : {}),
      ...(change.note !== undefined ? { note: change.note.trim() || null } : {}) } : x) });
    void loadReviews(); return true;
  }, [slug, loadReviews]);
  const savePrivate = useCallback(async (row: Experience, status: ReviewStatus, note: string) => {
    const response = await fetch(`/api/owner/v2/${slug}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: row.session_id, status: PRIVATE_VALUE[status], note, expectedCaseRevision: row.case_revision, expectedExperienceRevision: row.experience_revision }) }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    await loadPrivate();
    if (!response?.ok) return body?.error === 'CASE_CONFLICT' ? 'Có người vừa cập nhật phản hồi này. Đã tải bản mới, thử lại.' : 'Chưa lưu được. Thử lại.';
    return '';
  }, [slug, loadPrivate]);

  const exportLink = (dataset: string) => `/api/owner/v2/${slug}/export?format=csv&dataset=${dataset}&from=${fromOf(range)}`;
  const pageGoogle = slice.filter(item => item.kind === 'google'), allPicked = pageGoogle.length > 0 && pageGoogle.every(item => picked.has(item.key));
  const tabs: [Tab, string, number][] = [['all', 'Tất cả', counts.all], ['needs', 'Cần xử lý', counts.needs], ['new', 'Mới', counts.new], ['seen', 'Đã xem', counts.seen], ['handled', 'Đã xử lý', counts.handled]];

  return <div className={styles.page}>
    {google.data && (!connection || editing) && (google.data.maps
      ? <MapsLinkCard canManage={google.data.canManage} busy={google.busy} current={connection?.mapsUrl}
        onSave={async url => { const ok = await google.act('maps-link', url); if (ok) { setEditing(false); setNotice('Đã lưu link. Đánh giá Google của quán sẽ về trong vài phút.'); } return ok; }}
        onCancel={connection ? () => setEditing(false) : undefined} />
      : <section className={styles.banner}><div><h2>Đánh giá Google của quán sẽ hiện ở đây</h2>
        <p>Kết nối Google Business một lần, hệ thống tự kéo đánh giá 1–5 sao về và bạn trả lời ngay tại đây.</p></div>
        <span className="qs-pill">Đang chờ Google cấp quyền API</span></section>)}
    {connection && !editing && <div className={styles.source}>
      <p><Icon name="google" size={16} /> <b>{connection.locationTitle ?? (connection.mode === 'maps' ? 'Google Maps' : 'Google Business')}</b>
        {connection.averageRating !== null && <> · {connection.averageRating.toFixed(1).replace('.', ',')}★</>}
        {connection.totalReviews !== null && <> · {connection.totalReviews} đánh giá <span className="qs-pill">{ESTIMATE}</span></>}
        {connection.lastSyncedAt && <> · {connection.mode === 'maps' ? 'Google Maps' : 'đồng bộ'} {momentOf(connection.lastSyncedAt)}</>}
        {waitingForTool(connection) && <> · <span className="qs-pill">{connection.lastSyncedAt ? 'đang cập nhật…' : 'đang lấy đánh giá lần đầu, thường vài phút…'}</span></>}</p>
      <div className={styles.actions}>
        {(connection.mode === 'google' || google.data?.maps) && <button type="button" className={styles.button} disabled={google.busy || waitingForTool(connection)}
          onClick={async () => { if (await google.act('sync') && connection.mode === 'maps') setNotice('Đã gửi yêu cầu. Đánh giá mới về trong vài phút.'); }}>
          {google.busy ? 'Đang gửi…' : 'Cập nhật ngay'}</button>}
        {connection.mode === 'maps' && google.data?.canManage && <button type="button" className={styles.button} onClick={() => setEditing(true)}>Đổi link</button>}
      </div>
    </div>}
    {connection?.lastError === 'MAPS_RUN_FAILED' && !editing && <p className="qs-error">{GOOGLE_ERRORS.MAPS_RUN_FAILED}</p>}
    {notice && <p className="qs-small" role="status">{notice}</p>}
    {(error || google.error) && <p className="qs-error">{error || google.error}</p>}

    {/* Tabs and period: the tool's status tabs with their counts. */}
    <div className={styles.top}>
      <div className={styles.tabs} role="tablist" aria-label="Trạng thái">
        {tabs.map(([key, label, n]) => <button key={key} type="button" role="tab" aria-selected={tab === key} data-tab={key} onClick={() => { setTab(key); setPage(1); setPicked(new Set()); }}>
          {label}{key !== 'all' && <span>{n}</span>}</button>)}
      </div>
      <div className={styles.actions}>
        <Segmented label="Khoảng thời gian" value={String(range)} onChange={value => { setRange(Number(value) as Range); setPage(1); }}
          options={RANGES.map(([key, label]) => ({ value: String(key), label }))} />
        {canExport && <ExportMenu google={filters.source !== 'private' && !!reviews} own={filters.source !== 'google'} link={exportLink} />}
      </div>
    </div>

    {/* Filters: one row above the list. */}
    <div className={styles.filters}>
      <label className={styles.search}><Icon name="search" size={16} /><input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Tìm tên, nội dung, ghi chú…" aria-label="Tìm" /></label>
      <div className={styles.starPick} role="group" aria-label="Lọc theo số sao">
        {[5, 4, 3, 2, 1].map(n => <button key={n} type="button" aria-pressed={filters.stars.includes(n)}
          onClick={() => set({ stars: filters.stars.includes(n) ? filters.stars.filter(s => s !== n) : [...filters.stars, n] })}>{n}★</button>)}
      </div>
      <Select label="Nguồn" value={filters.source} onChange={value => set({ source: value as Filters['source'] })} options={[['', 'Mọi nguồn'], ['private', 'Góp ý riêng'], ['google', 'Google']]} />
      <Select label="Phản hồi" value={filters.replied} onChange={value => set({ replied: value as Filters['replied'] })} options={[['', 'Mọi phản hồi'], ['no', 'Chưa trả lời'], ['yes', 'Đã trả lời']]} />
      <Select label="Nội dung" value={filters.text} onChange={value => set({ text: value as Filters['text'] })} options={[['', 'Mọi nội dung'], ['yes', 'Có nội dung'], ['no', 'Chỉ chấm sao']]} />
      <Select label="Phạm vi" value={filters.scope} onChange={value => set({ scope: value as Filters['scope'] })} options={[['', 'Đang hiển thị trên Maps'], ['removed', 'Đã bị xoá / ẩn'], ['all', 'Tất cả (gồm đã xoá)']]} />
      <Select label="Sắp xếp" value={filters.sort} onChange={value => set({ sort: value as Filters['sort'] })} options={[['', 'Mới nhất'], ['oldest', 'Cũ nhất'], ['rating_asc', 'Sao thấp → cao'], ['rating_desc', 'Sao cao → thấp']]} />
      {active > 0 && <button type="button" className={styles.clear} onClick={() => { setDraft(''); set(NO_FILTERS); }}><Icon name="close" size={14} /> Xoá lọc ({active})</button>}
    </div>

    <section className={styles.list}>
      <div className={styles.listHead}>
        {picked.size > 0 ? <>
          <span><b>Đã chọn {picked.size}</b></span>
          <div className={styles.actions}>
            <button type="button" className={styles.button} onClick={async () => { if (await mark([...picked].map(k => k.slice(2)), { status: 'seen' })) setPicked(new Set()); }}><Icon name="eye" size={16} /> Đã xem</button>
            <button type="button" className={`${styles.button} ${styles.primary}`} onClick={async () => { if (await mark([...picked].map(k => k.slice(2)), { status: 'handled' })) setPicked(new Set()); }}><Icon name="check" size={16} /> Đã xử lý</button>
            <button type="button" className={`${styles.button} ${styles.ghost}`} onClick={() => setPicked(new Set())}>Bỏ chọn</button>
          </div>
        </> : <label className={styles.count}>
          {canHandle && <input type="checkbox" checked={allPicked} disabled={!pageGoogle.length} aria-label="Chọn mọi đánh giá Google ở trang này"
            onChange={event => setPicked(event.target.checked ? new Set(pageGoogle.map(item => item.key)) : new Set())} />}
          <span>{rows === null ? 'Đang tải…' : `${shown.length} phản hồi`}</span>
        </label>}
      </div>
      {rows !== null && shown.length === 0 && (items.length === 0
        ? <Empty icon={<Icon name="data" size={30} />} title={range ? `Chưa có phản hồi nào trong ${range} ngày` : 'Chưa có phản hồi nào'}>Khi khách chấm sao, gửi góp ý riêng hay đánh giá trên Google, mọi thứ sẽ về đây.</Empty>
        : <Empty icon={<Icon name="filter" size={30} />} title="Không có phản hồi nào">{tab === 'needs' && !active ? 'Không còn gì cần xử lý 🎉' : 'Thử bỏ bớt bộ lọc.'}</Empty>)}
      {slice.map(item => <Row key={item.key} item={item} onOpen={() => setOpen(item.key)}
        picked={canHandle && item.kind === 'google' ? picked.has(item.key) : undefined}
        onPick={value => setPicked(p => { const next = new Set(p); if (value) next.add(item.key); else next.delete(item.key); return next; })} />)}
      {shown.length > PAGE && <div className={styles.listFoot}><Pagination page={current} size={PAGE} total={shown.length} onChange={value => { setPage(value); setPicked(new Set()); }} /></div>}
    </section>

    <Drawer open={!!opened} onClose={() => setOpen(null)} title={opened?.kind === 'private' ? 'Chi tiết góp ý riêng' : 'Chi tiết đánh giá'}
      footer={opened && <DrawerFooter item={opened} placeUrl={reviews?.placeUrl ?? null} canHandle={opened.kind === 'google' ? canHandle : role !== 'support' && !!opened.raw?.message}
        onStatus={async status => opened.kind === 'google' ? void await mark([opened.review!.reviewId], { status }) : void await savePrivate(opened.raw!, status, opened.raw!.note)} />}>
      {opened && <Detail key={opened.key} item={opened} support={role === 'support'} canHandle={opened.kind === 'google' ? canHandle : role !== 'support' && !!opened.raw?.message}
        onMark={change => mark([opened.review!.reviewId], change)} onSavePrivate={(status, note) => savePrivate(opened.raw!, status, note)} />}
    </Drawer>
  </div>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <select className={styles.select} aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
    {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select>;
}

function ExportMenu({ google, own, link }: { google: boolean; own: boolean; link: (dataset: string) => string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  if (!google && !own) return null;
  if (google !== own) return <a className={styles.button} href={link(google ? 'google_reviews' : 'experiences')} download><Icon name="download" size={16} /> Xuất CSV</a>;
  return <details ref={menu} className={styles.menu}>
    <summary className={styles.button}><Icon name="download" size={16} /> Xuất CSV</summary>
    <div onClick={() => menu.current?.removeAttribute('open')}>
      <a href={link('google_reviews')} download>Đánh giá Google</a>
      <a href={link('experiences')} download>Góp ý riêng</a>
    </div>
  </details>;
}

function ItemBadges({ item }: { item: Item }) {
  return <>
    {item.status === 'new' && <Badge tone="accent" icon={<Icon name="sparkle" />}>Mới</Badge>}
    {item.needs && <Badge tone="critical" icon={<Icon name="alert" />}>Cần xử lý</Badge>}
    {item.reply && <Badge tone="good" icon={<Icon name="reply" />}>Đã trả lời</Badge>}
    {item.status === 'handled' && <Badge icon={<Icon name="check" />}>Đã xử lý</Badge>}
    {item.removed && <Badge tone="warning" icon={<Icon name="trash" />}>Đã bị xoá</Badge>}
  </>;
}

/** One line of the inbox, as the tool's ReviewRow: whole line opens the detail; the box picks it for marking several at once. */
function Row({ item, onOpen, picked, onPick }: { item: Item; onOpen: () => void; picked?: boolean; onPick: (value: boolean) => void }) {
  return <div className={styles.row} data-item={item.kind} data-removed={item.removed} data-picked={!!picked} role="button" tabIndex={0}
    onClick={onOpen} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }}>
    {picked !== undefined && <input type="checkbox" className={styles.pick} checked={picked} onClick={event => event.stopPropagation()}
      onChange={event => onPick(event.target.checked)} aria-label={`Chọn đánh giá của ${item.name}`} />}
    <Avatar src={item.photo} name={item.name} kind={item.kind} />
    <div className={styles.rowBody}>
      <div className={styles.rowHead}>
        <span className={styles.name}>{item.name}</span>
        {item.stars ? <Stars value={item.stars} size={13} /> : null}
        <span className={styles.when} title={item.estimated ? `${dayOf(item.at)} (${ESTIMATE})` : momentOf(item.at)}>{ago(item)}</span>
        <span className={styles.source} data-kind={item.kind}>{item.kind === 'google' ? 'Google' : 'Góp ý riêng'}</span>
        <span className={styles.badges}><ItemBadges item={item} /></span>
      </div>
      {item.text ? <p className={styles.text}>{item.text}</p> : <p className={styles.textless}>{item.kind === 'private' ? 'Khách chỉ chấm sao, không gửi góp ý.' : 'Chỉ chấm sao, không có nội dung'}</p>}
      {item.reply && <p className={styles.reply}><b>Quán trả lời:</b> {item.reply}</p>}
      {item.note && <p className={styles.note}>📝 {item.note}</p>}
    </div>
  </div>;
}

function Meta({ k, v }: { k: string; v: ReactNode }) { return <div><dt>{k}</dt><dd>{v}</dd></div>; }

/** The detail panel: the whole review, the shop's reply, how the shop handles it, an internal note. */
function Detail({ item, support, canHandle, onMark, onSavePrivate }: { item: Item; support: boolean; canHandle: boolean;
  onMark: (change: { status?: ReviewStatus; note?: string }) => Promise<boolean>; onSavePrivate: (status: ReviewStatus, note: string) => Promise<string> }) {
  const [note, setNote] = useState(item.note ?? ''), [saving, setSaving] = useState(false), [message, setMessage] = useState('');
  const changed = note !== (item.note ?? '');
  const save = async (status: ReviewStatus, text: string) => {
    setSaving(true); setMessage('');
    if (item.kind === 'google') { if (await onMark(text === (item.note ?? '') ? { status } : { status, note: text })) setMessage('Đã lưu.'); }
    else { const failed = await onSavePrivate(status, text); setMessage(failed || 'Đã lưu.'); }
    setSaving(false);
  };
  return <>
    <div className={styles.who}>
      <Avatar src={item.photo} name={item.name} size={44} kind={item.kind} />
      <div>
        <strong>{item.name}</strong>
        <div className={styles.rowHead}>{item.stars ? <Stars value={item.stars} size={16} /> : null}<span className={styles.when}>{ago(item)}</span></div>
      </div>
    </div>
    <div className={styles.badges}><span className={styles.source} data-kind={item.kind}>{item.kind === 'google' ? 'Google' : 'Góp ý riêng'}</span><ItemBadges item={item} /></div>
    {item.text ? <p className={styles.full}>{item.text}</p> : <p className={styles.textless}>{item.kind === 'private' ? 'Khách chỉ chấm sao, không gửi góp ý.' : 'Khách chỉ chấm sao, không viết nội dung.'}</p>}
    {item.kind === 'google' ? <div className={styles.box}>
      <span>Phản hồi của quán</span>
      {item.reply ? <p>{item.reply}</p> : <p className="qs-muted">Chưa trả lời. Bấm “Trả lời trên Google Maps”, tìm đánh giá của <b>{item.name}</b> trong tab Bài đánh giá.
        Trả lời mọi đánh giá, cả đánh giá chê, một cách lịch sự — đừng hứa quà hay nhờ khách sửa đánh giá.</p>}
    </div> : item.raw?.phone && <div className={styles.box}><span>Khách để lại số gọi lại</span><p><a href={`tel:${item.raw.phone}`}><b>{item.raw.phone}</b></a></p></div>}
    {canHandle ? <>
      <div className={styles.field}><span>Trạng thái xử lý</span>
        <Segmented<ReviewStatus> label="Trạng thái xử lý" value={item.status} onChange={status => void save(status, note)}
          options={(['new', 'seen', 'handled'] as const).map(value => ({ value, label: STATUS_LABEL[value] }))} /></div>
      <label className={styles.field}><span>Ghi chú nội bộ</span>
        <textarea rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder="Thêm ghi chú…" />
        <small>Chỉ người trong quán thấy, khách không thấy. Ví dụ: đã gọi điện xin lỗi, đã mời quay lại.</small></label>
      {changed && <div className={styles.actions} style={{ justifyContent: 'flex-end' }}>
        <button type="button" className={`${styles.button} ${styles.ghost}`} onClick={() => setNote(item.note ?? '')}>Huỷ</button>
        <button type="button" className={`${styles.button} ${styles.primary}`} disabled={saving} onClick={() => void save(item.status, note)}>{saving ? 'Đang lưu…' : 'Lưu ghi chú'}</button>
      </div>}
      {message && <p className="qs-small" role="status">{message}</p>}
    </> : support ? <p className="qs-small qs-muted" data-read-only>Quản trị chỉ đọc, không đổi trạng thái hay ghi chú.</p>
      : item.note && <div className={styles.box}><span>Ghi chú nội bộ</span><p>{item.note}</p></div>}
    <dl className={styles.meta}>
      <Meta k={item.estimated ? 'Ngày đăng (ước đoán)' : 'Lúc gửi'} v={item.estimated ? dayOf(item.at) : momentOf(item.at)} />
      {item.review && <Meta k="Hệ thống thấy lần đầu" v={momentOf(item.review.firstSeenAt)} />}
      {item.review?.removedAt && <Meta k="Bị xoá / ẩn trên Maps" v={momentOf(item.review.removedAt)} />}
      {item.raw?.source_label && <Meta k="Từ" v={item.raw.source_label} />}
    </dl>
  </>;
}

function DrawerFooter({ item, placeUrl, canHandle, onStatus }: { item: Item; placeUrl: string | null; canHandle: boolean; onStatus: (status: ReviewStatus) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const go = async (status: ReviewStatus) => { setBusy(true); await onStatus(status); setBusy(false); };
  return <>
    {item.kind === 'google' && placeUrl ? <a className={styles.button} href={placeUrl} target="_blank" rel="noreferrer"><Icon name="reply" size={16} /> Trả lời trên Google Maps</a> : <span />}
    {canHandle && (item.status !== 'handled'
      ? <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={() => void go('handled')}><Icon name="check" size={16} /> Đánh dấu đã xử lý</button>
      : <button type="button" className={`${styles.button} ${styles.ghost}`} disabled={busy} onClick={() => void go('seen')}>Mở lại</button>)}
  </>;
}
