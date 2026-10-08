'use client';
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import styles from './desk.module.css';
import { buttonClass } from './platform/ui';
import type { Desk, DeskFile } from '@/lib/admin/desk';
import { FILE_ROLES, type FileRole } from '@/lib/admin/file-roles';
import type { Knobs } from '@/lib/canvas/knobs';
import { GOOGLE_SHADOWS, LINK_SLOTS, type LinkSlot, type PageDoc } from '@/lib/canvas/doc';
import { walk } from '@/lib/canvas/validate';
import CHOICES from '@/lib/canvas/prompt-choices.json' with { type: 'json' };

/**
 * Bàn dựng (Tài 06/10, kịch bản 9b): one request, one screen, made for Tài's phone while he talks to the shop on Zalo. The page's
 * draft on the left (on top on a phone), and under it, in the order of the work: Nhờ Claude, what the shop wrote, its files, the
 * template and its knobs, the shop's details, the links to send, the line for Claude Code, Phát hành.
 */
export type DeskTemplate = { key: string; name: string; knobs: Knobs | null };

const ERRORS: Record<string, string> = {
  CLAUDE_NOT_CONFIGURED: 'Chưa có khoá Claude (ANTHROPIC_API_KEY) trên máy chủ này.', CLAUDE_KEY_REJECTED: 'Khoá Claude bị từ chối — kiểm lại khoá trên Vercel.',
  CLAUDE_KEY_NO_WORKSPACE: 'Khoá Claude chưa thuộc workspace nào — tạo khoá mới trong workspace Default.',
  CLAUDE_BUSY: 'Claude đang bận, thử lại sau ít phút.', CLAUDE_REFUSED: 'Claude từ chối yêu cầu này.', CLAUDE_PAGE_REFUSED: 'Claude dựng 3 lần vẫn chưa qua kiểm — giao cho Claude Code.',
  CLAUDE_BAD_JSON: 'Claude trả lời sai dạng, thử lại.', CLAUDE_TOO_LONG: 'Trang Claude viết quá dài, thử lại.',
  MEDIA_TOO_LARGE: 'Tệp quá lớn (ảnh tối đa 5 MB, video 4 MB).', UNSUPPORTED_MEDIA: 'Chỉ nhận JPG, PNG, WebP, MP4.', STORE_REFUSED: 'Kho ảnh từ chối tệp, thử lại.',
  UPLOADS_NOT_CONFIGURED: 'Máy chủ chưa có kho ảnh.', NO_KNOBS: 'Mẫu này chưa có núm.', NO_GOOGLE_LINK: 'Quán chưa có Place ID: điền ở "Thông tin quán".',
  PAGE_NOT_SYNCED: 'Trang còn link mẫu ở chỗ khách bấm được.', DRAFT_CONFLICT: 'Bản nháp vừa đổi ở nơi khác — tải lại trang.',
  POLICY_GOOGLE_NOT_FIRST_SCREEN: 'Nút Google bị đẩy khỏi màn hình đầu.', POLICY_GOOGLE_EVENT_NEAR: 'Chỗ báo hiệu sự kiện sát nút Google.', POLICY_GOOGLE_EXCHANGE: 'Có chữ đổi quà lấy đánh giá.', MEDIA_PENDING: 'Có ảnh chưa duyệt.',
  NOT_FOUND: 'Yêu cầu này đã đóng hoặc không còn.', SERVICE_UNAVAILABLE: 'Máy chủ đang gián đoạn, thử lại.',
};
const explain = (code: string) => {
  const [head, at] = code.split(':');
  if (head === 'INVALID_PROFILE') return `Thông tin quán sai ở "${at}".`;
  return ERRORS[head] ? `${ERRORS[head]}${at ? ` (${at})` : ''}` : `Chưa làm được (${code}).`;
};
const SLOT_NAMES: Record<LinkSlot, string> = { zalo: 'Zalo (số hoặc link)', facebook: 'Facebook', instagram: 'Instagram (@tên hoặc link)', tiktok: 'TikTok (@tên hoặc link)',
  youtube: 'YouTube', website: 'Website', menu: 'Menu', booking: 'Đặt lịch', phone: 'Số điện thoại', maps: 'Chỉ đường (link Google Maps)', email: 'Email' };
const WHO = { khach: 'Khách', tai: 'Tài', claude: 'Claude' } as const;
const time = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

/** A picture made small enough to send (and to show fast on a guest's phone): at most 1600 px, JPEG; a PNG stays PNG for a logo's transparency. */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  const png = file.type === 'image/png', max = png ? 1200 : 1600;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('shrink')), png ? 'image/png' : 'image/jpeg', .85));
}

function Card({ title, hint, children, className }: { title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`${styles.card}${className ? ` ${className}` : ''}`}><h2>{title}</h2>{hint && <p className={styles.hint}>{hint}</p>}{children}</section>;
}
function Copy({ text, plain }: { text: string; plain?: boolean }) {
  const [done, setDone] = useState(false);
  return <div className={styles.copy}>{plain ? <p className={styles.message}>{text}</p> : <code>{text}</code>}<button type="button" className={buttonClass('secondary')}
    onClick={() => { void navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>{done ? 'Đã chép' : 'Chép'}</button></div>;
}

export default function AdminDesk({ initial, templates, origin }: { initial: Desk; templates: DeskTemplate[]; origin: string }) {
  const [desk, setDesk] = useState(initial), [busy, setBusy] = useState(''), [error, setError] = useState(''), [stamp, setStamp] = useState(0);
  const [note, setNote] = useState(''), [who, setWho] = useState<'khach' | 'tai'>('khach'), [over, setOver] = useState('');
  const [preview, setPreview] = useState(''), [published, setPublished] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const id = desk.request.id, template = templates.find(t => t.key === desk.draft.templateKey);
  const claude = desk.claude as { summary?: string; reply?: string; questions?: string[]; at?: string; tries?: number } | null;

  async function call(label: string, url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setBusy(label); setError('');
    try {
      const response = await fetch(url, { credentials: 'same-origin', ...init });
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) { setError(explain(String(body.error ?? response.status))); return null; }
      if (body.desk) { setDesk(body.desk as Desk); setStamp(s => s + 1); }
      return body;
    } catch { setError('Không thể kết nối. Thử lại.'); return null; } finally { setBusy(''); }
  }
  const act = (label: string, body: Record<string, unknown>) =>
    call(label, `/gov/api/ban-dung/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  async function upload(list: FileList | File[], role: FileRole) {
    for (const file of Array.from(list)) {
      // A font or a song often comes with no type from the browser: its name says what it is.
      const ext = file.name.toLowerCase().split('.').pop() ?? '';
      const type = file.type || ({ woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', mp3: 'audio/mpeg', m4a: 'audio/mp4' } as Record<string, string>)[ext] || '';
      let body: Blob;
      try { body = type.startsWith('image/') ? await shrink(file) : file; } catch { setError(`Không đọc được ${file.name}.`); continue; }
      const ok = await call(`tệp ${role}`, `/gov/api/ban-dung/${id}/tep?vai=${role}&ten=${encodeURIComponent(file.name)}`,
        { method: 'POST', headers: { 'Content-Type': body.type || type }, body });
      if (!ok) return;
    }
  }


  if (published) return <Card title="Đã phát hành">
    <p>Trang /{desk.page.slug} của {desk.shop.name} đã lên mạng, yêu cầu đã đóng.</p>
    <div className={styles.row}><a className={buttonClass('primary')} href={`/${desk.page.slug}`} target="_blank" rel="noreferrer">Mở trang</a>
      <Link className={buttonClass('secondary')} href="/gov">Về Trang chờ dựng</Link></div>
  </Card>;

  const images = desk.files.filter(f => f.kind === 'image');
  return <div className={styles.layout} data-desk={desk.page.slug}>
    <div className={styles.previewCol}>
      <div className={styles.phone}><iframe key={stamp} src={`/gov/ban-dung/${id}/xem`} title={`Bản nháp /${desk.page.slug}`} /></div>
      <div className={styles.previewTools}>
        <button type="button" className={buttonClass('quiet')} onClick={() => setStamp(s => s + 1)}>Tải lại</button>
        <a className={buttonClass('quiet')} href={`/gov/ban-dung/${id}/xem`} target="_blank" rel="noreferrer">Mở to</a>
      </div>
    </div>

    <div style={{ display: 'grid', gap: 14 }}>
      <Card title="Nhờ Claude" className={styles.claude} hint="Claude đọc lời khách, ảnh, logo và cả thư viện mẫu, tự chọn mẫu hợp nhất, dựng trang và đọc thông tin quán trong tin nhắn. Kết quả vào bản nháp — bạn xem rồi mới phát hành.">
        <button type="button" className={`${buttonClass('primary')} ${styles.claudeBtn}`} disabled={!!busy} data-ask-claude
          onClick={() => void call('claude', `/gov/api/ban-dung/${id}/claude`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })}>
          {busy === 'claude' ? 'Claude đang dựng… (1–3 phút)' : claude ? 'Nhờ Claude dựng lại theo lời mới' : 'Nhờ Claude dựng trang'}</button>
        {claude?.summary && <>
          <p data-claude-summary><strong>Claude:</strong> {claude.summary}</p>
          {!!claude.questions?.length && <p className={styles.hint}>Còn thiếu: {claude.questions.join(' · ')}</p>}
          {claude.reply && <><p className={styles.hint}>Tin gửi khách (sửa nếu cần rồi gửi qua Zalo):</p><Copy text={claude.reply} plain /></>}
        </>}
      </Card>

      <Card title="Lời khách" hint="Dán nguyên tin Zalo của khách. Mỗi lần dán là một mục; Claude đọc hết nhật ký này.">
        <ul className={styles.log}>
          {desk.request.message && <li data-who="khach"><span className={styles.who}>Khách · lúc gửi yêu cầu</span>{desk.request.message}</li>}
          {desk.notes.map(n => <li key={n.id} data-who={n.who}><span className={styles.who}>{WHO[n.who]} · {time(n.at)}</span>{n.body}</li>)}
        </ul>
        <label className={styles.field}>{who === 'khach' ? 'Tin của khách' : 'Ghi chú của bạn'}
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={who === 'khach' ? 'Dán tin Zalo…' : 'vd: khách thích nút to, không dùng TikTok'} /></label>
        <QuickChoices add={line => setNote(n => (n.trim() ? `${n.trimEnd()}\n` : '') + line)} />
        <div className={styles.row}>
          <button type="button" className={buttonClass(who === 'khach' ? 'primary' : 'secondary')} onClick={() => setWho('khach')}>Khách</button>
          <button type="button" className={buttonClass(who === 'tai' ? 'primary' : 'secondary')} onClick={() => setWho('tai')}>Ghi chú</button>
          <button type="button" className={buttonClass('secondary')} disabled={!note.trim() || !!busy}
            onClick={() => void act('note', { op: 'note', who, body: note }).then(ok => { if (ok) setNote(''); })}>Thêm</button>
        </div>
      </Card>

      <Card title="Tệp của quán" hint="Mỗi ô một vai: thả tệp vào đúng ô, trang biết đặt nó ở đâu. Ảnh tự thu nhỏ; video MP4 và âm thanh tối đa 4 MB, font tối đa 2 MB. Tệp bỏ đi hay không dùng tới sẽ tự xoá khỏi kho.">
        <div className={styles.zones}>{(Object.keys(FILE_ROLES) as FileRole[]).filter(key => key !== 'video').map(key => <label key={key} className={styles.zone} data-over={over === key}
          onDragOver={e => { e.preventDefault(); setOver(key); }} onDragLeave={() => setOver('')}
          onDrop={e => { e.preventDefault(); setOver(''); void upload(e.dataTransfer.files, key); }}>
          <strong>{FILE_ROLES[key].name}</strong>
          <span>{busy === `tệp ${key}` ? 'Đang gửi…' : `${desk.files.filter(f => f.role === key).length || ''} ${ZONE_HINT[key]}`}</span>
          <input type="file" multiple={key === 'anh' || key === 'anh-phu'} accept={ACCEPT[key]} hidden onChange={e => { if (e.target.files) void upload(e.target.files, key); e.target.value = ''; }} />
        </label>)}</div>
        {desk.files.length > 0 && <div className={styles.files}>{desk.files.map((f: DeskFile) => <div key={f.mediaId} className={styles.file}>
          {f.kind === 'image' ? <img src={f.url} alt={f.name} /> : f.kind === 'video' ? <video src={f.url} muted playsInline />
            : <span className={styles.fileIcon}>{f.kind === 'font' ? 'Aa' : '♪'}</span>}
          <select value={f.role} onChange={e => void act('file', { op: 'file', mediaId: f.mediaId, role: e.target.value })}>
            {(Object.keys(FILE_ROLES) as FileRole[]).filter(key => (FILE_ROLES[key].kinds as readonly string[]).includes(f.kind)).map(key => <option key={key} value={key}>{FILE_ROLES[key].name}</option>)}</select>
          <button type="button" className={buttonClass('quiet')} onClick={() => void act('file', { op: 'file', mediaId: f.mediaId, remove: true })}>Bỏ</button>
        </div>)}</div>}
      </Card>

      <Card title="Mẫu và núm" hint="Đổi mẫu là làm lại bản nháp từ mẫu đó. Núm (màu, ảnh, câu chào) đổi ngay trên bản nháp, giữ nguyên những gì đã sửa tay.">
        <label className={styles.field}>Mẫu của bản nháp
          <select value={desk.draft.templateKey} disabled={!!busy} onChange={e => { if (confirm('Làm lại bản nháp từ mẫu này?')) void act('template', { op: 'template', key: e.target.value }); }}>
            {templates.map(t => <option key={t.key} value={t.key}>{t.name}{t.knobs ? ' · có núm' : ''}</option>)}</select></label>
        <GoogleKnob doc={desk.draft.config.doc} busy={!!busy} save={(shadow, shade) => void act('google', { op: 'google', shadow, shade })} />
        {template?.knobs && <>
          <div className={styles.swatches}>{template.knobs.palettes.map((p, i) => <button key={p.name} type="button" className={styles.swatch} aria-pressed={(desk.knobs.palette ?? 0) === i}
            disabled={!!busy} onClick={() => void act('knobs', { op: 'knobs', knobs: { palette: i } })}>
            <span className={styles.dots}>{p.colors.map(c => <i key={c} style={{ background: c }} />)}</span>{i + 1}. {p.name}</button>)}</div>
          {template.knobs.photos.map(photo => <label key={photo.id} className={styles.field}>{photo.name}
            <select value={images.find(f => f.url === desk.knobs.photos?.[photo.id]?.src)?.mediaId ?? ''} disabled={!images.length || !!busy}
              onChange={e => e.target.value && void act('knobs', { op: 'knobs', knobs: { photos: { ...Object.fromEntries(Object.entries(desk.knobs.photos ?? {}).flatMap(([k, v]) => {
                const file = images.find(f => f.url === v.src); return file ? [[k, { mediaId: file.mediaId, focus: v.focus }]] : []; })), [photo.id]: { mediaId: e.target.value } } } })}>
              <option value="">{images.length ? '— chọn một ảnh —' : '(chưa có ảnh)'}</option>
              {images.map(f => <option key={f.mediaId} value={f.mediaId}>{f.name}</option>)}</select></label>)}
          {template.knobs.texts.map(text => <TextKnob key={`${text.id}:${desk.knobs.texts?.[text.id]?.vi ?? ''}`} name={text.name} value={desk.knobs.texts?.[text.id]?.vi ?? ''} busy={!!busy}
            save={vi => void act('knobs', { op: 'knobs', knobs: { texts: { ...(desk.knobs.texts ?? {}), [text.id]: { vi } } } })} />)}
        </>}
      </Card>

      <Details key={JSON.stringify(desk.details)} desk={desk} busy={!!busy} save={details => act('details', { op: 'details', details })} />

      <Card title="Gửi khách xem" hint="Link xem thử: khách mở trên điện thoại, thấy đúng bản nháp này (7 ngày, hết hiệu lực khi phát hành).">
        <div className={styles.row}>
          <button type="button" className={buttonClass('secondary')} disabled={!!busy}
            onClick={() => void act('preview', { op: 'preview' }).then(body => { if (body?.preview) setPreview(`${origin}${body.preview}`); })}>Tạo link xem thử</button>
          <a className={buttonClass('secondary')} href={`https://zalo.me/${desk.request.contact}`} target="_blank" rel="noreferrer">Nhắn Zalo {desk.request.contact}</a>
        </div>
        {preview && <Copy text={preview} />}
        {template?.knobs && <><p className={styles.hint}>Link bảng màu (khách chọn một số):</p>
          <Copy text={`${origin}/templates/${template.key}/mau?ten=${encodeURIComponent(desk.details?.name ?? desk.shop.name)}`} /></>}
      </Card>

      <Card title="Giao cho Claude Code" hint="Việc Claude ở đây chưa làm được (sửa sâu, ảnh đặc biệt): chép dòng này cho Claude Code — nó lấy cả lời khách, tệp và bản nháp.">
        <Copy text={`node scripts/sua-trang.mjs lay ${desk.page.slug}`} />
      </Card>

      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.sticky}>
        <button type="button" className={`${buttonClass('primary')} ${styles.claudeBtn}`} disabled={!!busy} data-publish
          onClick={() => { if (confirm(`Phát hành bản nháp này cho ${desk.details?.name ?? desk.shop.name}?${desk.details ? ' Thông tin quán chờ lưu cũng được lưu, hiện trên mọi trang của quán.' : ''}`))
            void act('publish', { op: 'publish' }).then(body => { if (body) setPublished(true); }); }}>
          {busy === 'publish' ? 'Đang phát hành…' : 'Phát hành'}</button>
      </div>
    </div>
  </div>;
}

function TextKnob({ name, value, busy, save }: { name: string; value: string; busy: boolean; save: (vi: string) => void }) {
  const [text, setText] = useState(value);
  return <label className={styles.field}>{name}
    <span className={styles.row}><input value={text} maxLength={200} onChange={e => setText(e.target.value)} placeholder="(giữ chữ của mẫu)" style={{ flex: 1 }} />
      <button type="button" className={buttonClass('secondary')} disabled={busy || !text.trim() || text === value} onClick={() => save(text)}>Đổi</button></span></label>;
}

/** The shop's details waiting to be saved with the publish: prefilled with what is saved, or what Claude read in the messages. */
function Details({ desk, busy, save }: { desk: Desk; busy: boolean; save: (details: Record<string, unknown>) => Promise<unknown> }) {
  const base = desk.details ?? {}, profile = base.profile ?? desk.shop.profile;
  const [name, setName] = useState(base.name ?? desk.shop.name), [placeId, setPlaceId] = useState(base.placeId ?? '');
  const [links, setLinks] = useState<Record<string, string>>(Object.fromEntries(LINK_SLOTS.map(slot => [slot, profile.links[slot]?.url ?? ''])));
  const [labels, setLabels] = useState<Record<string, string>>(Object.fromEntries(LINK_SLOTS.map(slot => [slot, profile.links[slot]?.label ?? ''])));
  const [handle, setHandle] = useState(profile.handle ?? ''), [hours, setHours] = useState(profile.hours ?? ''), [address, setAddress] = useState(profile.address ?? '');
  const [wifi, setWifi] = useState(profile.wifi?.name ?? ''), [pass, setPass] = useState(profile.wifi?.pass ?? '');
  const submit = () => save({ name, placeId, profile: {
    links: Object.fromEntries(LINK_SLOTS.filter(slot => links[slot].trim()).map(slot => [slot, labels[slot].trim() ? { url: links[slot].trim(), label: labels[slot].trim() } : links[slot].trim()])),
    ...(handle.trim() ? { handle: handle.trim() } : {}), ...(hours.trim() ? { hours } : {}), ...(address.trim() ? { address } : {}),
    ...(wifi.trim() ? { wifi: { name: wifi, ...(pass ? { pass } : {}) } } : {}) } });
  return <Card title={`Thông tin quán${desk.details ? ' · chờ lưu' : ''}`} hint="Điền những gì khách gửi; ô trống thì phần tử đó tự ẩn trên trang. Lưu vào bản nháp trước, lưu thật cùng lúc bấm Phát hành (vì thông tin quán hiện trên mọi trang của quán).">
    <div className={styles.grid2}>
      <label className={styles.field}>Tên quán<input value={name} onChange={e => setName(e.target.value)} /></label>
      <label className={styles.field}>Place ID {desk.shop.hasGoogle ? '(đã có — để trống nếu không đổi)' : '(CHƯA có)'}<input value={placeId} onChange={e => setPlaceId(e.target.value)} placeholder="ChIJ…" /></label>
      {LINK_SLOTS.map(slot => <label key={slot} className={styles.field}>{SLOT_NAMES[slot]}<input value={links[slot]} onChange={e => setLinks({ ...links, [slot]: e.target.value })} />
        {slot === 'website' && <input value={labels[slot]} onChange={e => setLabels({ ...labels, [slot]: e.target.value })} placeholder="Chữ trên nút (vd 4rau.vn)" />}</label>)}
      <label className={styles.field}>@tên<input value={handle} onChange={e => setHandle(e.target.value)} /></label>
      <label className={styles.field}>Giờ mở cửa<input value={hours} onChange={e => setHours(e.target.value)} /></label>
      <label className={styles.field}>Địa chỉ<input value={address} onChange={e => setAddress(e.target.value)} /></label>
      <label className={styles.field}>Tên wifi<input value={wifi} onChange={e => setWifi(e.target.value)} /></label>
      <label className={styles.field}>Mật khẩu wifi<input value={pass} onChange={e => setPass(e.target.value)} /></label>
    </div>
    <div className={styles.row}><button type="button" className={buttonClass('secondary')} disabled={busy} onClick={() => void submit()}>Lưu vào bản nháp</button></div>
  </Card>;
}

const SHADOW_NAMES: Record<typeof GOOGLE_SHADOWS[number], string> = { none: 'Không bóng', soft: 'Bóng nhẹ', lift: 'Nổi hẳn lên', hard: 'Bóng khối (màu riêng)', halo: 'Phát sáng (màu riêng)' };
/** Bóng nút Google: một núm có ở mọi trang (lib/admin/desk.ts op 'google'). */
function GoogleKnob({ doc, busy, save }: { doc: PageDoc; busy: boolean; save: (shadow: string, shade?: string) => void }) {
  const google = [...walk(doc)].find(el => el.t === 'google');
  if (!google || google.t !== 'google') return null;
  const now = google.shadow ?? (google.look === 'maps' ? 'soft' : 'none');
  return <div className={styles.row}>
    <label className={styles.field}>Bóng nút Google
      <select value={now} disabled={busy} onChange={e => save(e.target.value, e.target.value === 'hard' || e.target.value === 'halo' ? google.shade ?? (e.target.value === 'halo' ? '#ffffff' : '#8c8c8c') : undefined)}>
        {GOOGLE_SHADOWS.map(key => <option key={key} value={key}>{SHADOW_NAMES[key]}</option>)}</select></label>
    {(now === 'hard' || now === 'halo') && <label className={styles.field}>Màu bóng
      <input type="color" defaultValue={google.shade ?? '#8c8c8c'} disabled={busy} onBlur={e => save(now, e.target.value)} /></label>}
  </div>;
}

/**
 * Chọn nhanh (Tài 07/10): what a page is usually decided by, from what was learnt building pages (lib/canvas/prompt-choices.json),
 * so whoever writes the note — Tài now, the shop later — picks instead of guessing what to say. A pick adds "Nhóm: lựa chọn".
 */
function QuickChoices({ add }: { add: (line: string) => void }) {
  return <details className={styles.choices}><summary>Chọn nhanh: ánh sáng, nền, chữ, nút, hiệu ứng, khúc B…</summary>
    {CHOICES.map(group => <div key={group.nhom} className={styles.choiceGroup}><span>{group.nhom}</span>
      <div className={styles.chips}>{group.chon.map(option => <button key={option} type="button" onClick={() => add(`${group.nhom}: ${option}`)}>{option}</button>)}</div></div>)}
  </details>;
}

const IMAGE = 'image/jpeg,image/png,image/webp', FONT = '.woff2,.ttf,.otf,font/woff2,font/ttf,font/otf', AUDIO = '.mp3,.m4a,audio/mpeg,audio/mp4';
const ACCEPT: Record<FileRole, string> = { poster: `${IMAGE},video/mp4`, nen: `${IMAGE},video/mp4`, logo: IMAGE, 'logo-phu': IMAGE, anh: IMAGE, 'anh-phu': IMAGE,
  video: 'video/mp4', 'font-chinh': FONT, 'font-dac-biet': FONT, 'am-thanh': AUDIO };
const ZONE_HINT: Record<FileRole, string> = { poster: 'ảnh/video lớn đầu trang', nen: 'ảnh/video nền', logo: 'logo chính', 'logo-phu': 'dấu nhỏ, biểu tượng',
  anh: 'ảnh quán', 'anh-phu': 'ảnh nhỏ để lật', video: 'video', 'font-chinh': 'không có thì tự chọn', 'font-dac-biet': 'chữ tên, tiêu đề', 'am-thanh': 'nếu có' };
