'use client';
import { useCallback, useEffect, useState } from 'react';
import type { FeedbackButton, LinkIcon, MediaRef, PageConfig } from '@/lib/publishing/config';
import { STEM_BACKGROUND } from '@/lib/publishing/config';
import styles from './owner-app.module.css';

/**
 * Design & Link editor (lát D). Works on the saved draft: Save keeps it, Preview opens the saved draft in a new tab
 * exactly as it would publish, Publish makes it the live page. Media are https links until per-shop uploads exist.
 */
type State = { draft: { revision: number; config: PageConfig }; live: { releaseId: string; config: PageConfig } | null; uploads: boolean };
const ICONS: [LinkIcon, string][] = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['zalo', 'Zalo'], ['phone', 'Gọi điện'], ['booking', 'Đặt lịch'], ['link', 'Liên kết']];
const PLANES: [FeedbackButton['icon'], string][] = [['plane', 'Máy bay giấy'], ['chat', 'Bong bóng chat'], ['mail', 'Phong bì']];
const ERRORS: Record<string, string> = {
  INVALID_CONFIG: 'Có ô chưa hợp lệ. Link phải bắt đầu bằng https:// (nút Gọi điện dùng tel: kèm số), màu dạng #RRGGBB, tối đa 6 nút.',
  DRAFT_CONFLICT: 'Bản nháp vừa được sửa ở nơi khác. Đã tải lại bản mới nhất; hãy kiểm tra rồi làm lại.',
  SUPPORT_NOT_GRANTED: 'Chủ shop chưa cho phép sửa giao diện (cần khấc 2 hoặc 3).',
  IMPERSONATION_SCOPE: 'Phiên này chỉ để xem. Mở phiên "Sửa giao diện" để chỉnh.',
  SHOP_SUSPENDED: 'Shop đang bị tạm khoá nên chưa phát hành được.',
};
const mediaOf = (value: string, kind: MediaRef['kind']): MediaRef | null => value.trim() ? { kind, url: value.trim() } : null;
const UPLOAD_ERRORS: Record<string, string> = {
  UNSUPPORTED_MEDIA: 'Chỉ nhận ảnh JPG, PNG, WebP hoặc video MP4.', MEDIA_TOO_LARGE: 'Ảnh tối đa 5 MB, video tối đa 30 MB.',
  UPLOADS_NOT_CONFIGURED: 'Kho lưu trữ chưa được bật.', SUPPORT_NOT_GRANTED: 'Chủ shop chưa cho phép sửa giao diện.',
};

/**
 * Picks a file, asks the app for a signed upload, and sends the file straight to R2. The page keeps only the
 * public link that comes back; nothing is published until Publish.
 */
/**
 * The first frame of a video the shop is uploading, as a JPEG no wider than 1280px (lát F5). Taken from the local file,
 * before upload, so no cross-origin rule gets in the way. The guest page shows it when a phone refuses to play video.
 */
async function firstFrame(file: File): Promise<Blob | null> {
  const source = URL.createObjectURL(file), video = document.createElement('video');
  try {
    video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = source;
    await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(); setTimeout(reject, 10000); });
    video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
    await new Promise<void>(resolve => { video.onseeked = () => resolve(); setTimeout(resolve, 3000); });
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  } catch { return null; }
  finally { video.removeAttribute('src'); URL.revokeObjectURL(source); }
}
/** Asks for a signed upload and sends the file straight to R2; returns the public link. */
async function put(endpoint: string, file: Blob, type: string) {
  const signed = await fetch(`${endpoint}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, size: file.size }) });
  const body = await signed.json().catch(() => ({}));
  if (!signed.ok) return { error: UPLOAD_ERRORS[body.error] ?? 'Chưa tải lên được.' };
  const sent = await fetch(body.upload, { method: 'PUT', headers: body.headers, body: file });
  return sent.ok ? { url: body.url as string, kind: body.kind as MediaRef['kind'] } : { error: 'Kho lưu trữ từ chối tệp. Thử lại.' };
}

function Upload({ endpoint, accept, label, enabled, onDone }: { endpoint: string; accept: string; label: string; enabled: boolean; onDone: (media: MediaRef) => void }) {
  const [state, setState] = useState('');
  if (!enabled) return <span className="upload-off" data-upload-off>Tải lên cần bật kho lưu trữ R2.</span>;
  return <label className={styles.upload} data-upload={label}>
    <input type="file" accept={accept} onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = '';
      if (!file) return;
      setState('Đang tải lên…');
      try {
        const uploaded = await put(endpoint, file, file.type);
        if ('error' in uploaded) { setState(uploaded.error ?? 'Chưa tải lên được.'); return; }
        // A video also gets its first frame as a still, for phones that will not play it.
        let still: string | undefined;
        if (uploaded.kind === 'video') {
          setState('Đang tạo ảnh tĩnh từ video…');
          const frame = await firstFrame(file), frameUpload = frame ? await put(endpoint, frame, 'image/jpeg') : null;
          if (frameUpload && 'url' in frameUpload) still = frameUpload.url;
        }
        onDone(still ? { kind: 'video', url: uploaded.url, still } : { kind: uploaded.kind, url: uploaded.url });
        setState(uploaded.kind === 'video' && !still ? 'Đã tải video lên, nhưng chưa tạo được ảnh tĩnh: điện thoại tiết kiệm pin sẽ thấy màu nền. Bấm Phát hành để khách thấy.'
          : 'Đã tải lên. Bấm Phát hành để khách thấy; Xem trước để xem thử.');
      } catch { setState('Không thể kết nối tới kho lưu trữ.'); }
    }} />
    <span>{label}</span>{state && <small data-upload-state>{state}</small>}
  </label>;
}

export default function DesignEditor({ endpoint, customerUrl }: { endpoint: string; customerUrl: string }) {
  const [state, setState] = useState<State | null>(null);
  const [config, setConfig] = useState<PageConfig | null>(null);
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${endpoint}/design`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(ERRORS[body.error] ?? (response.status === 401 ? 'Phiên đã hết hạn. Đăng nhập lại.' : 'Chưa tải được thiết kế.')); return; }
      setState(body); setConfig(body.draft.config); setDirty(false);
    } catch { setNotice('Không thể kết nối. Vui lòng thử lại.'); }
  }, [endpoint]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const change = (patch: Partial<PageConfig>) => { setConfig(current => current && { ...current, ...patch }); setDirty(true); setNotice(''); };

  const send = async (method: string, body: unknown) => {
    const response = await fetch(`${endpoint}/design`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(ERRORS[data.error] ?? 'Chưa lưu được. Thử lại.');
      if (data.error === 'DRAFT_CONFLICT') await load();
      return null;
    }
    return data;
  };
  /** Saves first when there are unsaved changes, so Preview and Publish always act on what is on screen. */
  const saved = async (): Promise<number | null> => {
    if (!state || !config) return null;
    if (!dirty) return state.draft.revision;
    const result = await send('PUT', { expectedRevision: state.draft.revision, config });
    if (!result) return null;
    setState({ ...state, draft: { revision: result.revision, config } }); setDirty(false);
    return result.revision;
  };
  const act = async (what: 'save' | 'preview' | 'publish') => {
    setBusy(true); setNotice('');
    // Opened now, inside the click, so the browser does not treat it as a pop-up; filled once the preview exists.
    const tab = what === 'preview' ? window.open('', '_blank') : null;
    try {
      const revision = await saved();
      if (revision === null) { tab?.close(); return; }
      // A saved draft is not what customers see; say so, since that is the natural thing to expect.
      if (what === 'save') { setNotice('Đã lưu bản nháp. Khách chưa thấy thay đổi này; bấm Phát hành để đưa lên trang khách.'); return; }
      if (what === 'preview') {
        const result = await send('POST', { action: 'preview', expectedRevision: revision });
        if (!result) { tab?.close(); return; }
        if (tab) tab.location.href = result.preview; else window.location.href = result.preview;
        setNotice('Đã mở bản xem trước ở tab mới. Bản này chưa phát hành.');
        return;
      }
      if (!window.confirm('Phát hành bản này? Khách sẽ thấy ngay trang mới.')) return;
      const result = await send('POST', { action: 'publish', expectedRevision: revision });
      if (result) { setNotice('Đã phát hành. Khách thấy trang mới từ lần mở tiếp theo.'); await load(); }
    } catch { tab?.close(); setNotice('Không thể kết nối. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  };

  if (!config || !state) return <section className={styles.panel} data-design-editor><h2>Thiết kế & Link</h2><p className={styles.hint}>{notice || 'Đang tải…'}</p></section>;
  const b = config.background, button = config.feedbackButton!;
  const setLink = (index: number, patch: Partial<PageConfig['links'][number]>) =>
    change({ links: config.links.map((link, i) => i === index ? { ...link, ...patch } : link) });
  const move = (index: number, by: number) => {
    const links = [...config.links], [item] = links.splice(index, 1); links.splice(index + by, 0, item); change({ links });
  };
  return <section aria-label="Thiết kế & Link" data-design-editor>
    <div className={styles.panel}>
      <div className={styles.editorBar}>
        <p className={styles.hint} data-draft-state>{dirty ? 'Có thay đổi chưa lưu.' : `Bản nháp số ${state.draft.revision}.`} Khách chỉ thấy bản đã <strong>Phát hành</strong>. Trang khách: <a href={customerUrl} target="_blank" rel="noreferrer">mở trang đang chạy</a></p>
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={() => void act('save')}>Lưu nháp</button>
          <button type="button" disabled={busy} onClick={() => void act('preview')}>Xem trước</button>
          <button type="button" disabled={busy} onClick={() => void act('publish')}>Phát hành</button>
        </div>
      </div>
      <p role="status" className={styles.notice} data-design-notice>{notice}</p>
    </div>

    <fieldset className={styles.panel}><legend>Thông tin</legend><div className={styles.grid2}>
      <label>Tên hiển thị<input value={config.name} maxLength={100} onChange={e => change({ name: e.target.value })} /></label>
      <label>Link đánh giá Google<input type="url" value={config.googleUrl} onChange={e => change({ googleUrl: e.target.value })} placeholder="https://g.page/r/…" /></label>
    </div></fieldset>

    <fieldset className={styles.panel}><legend>Bố cục</legend>
      <div className={styles.choices} role="radiogroup" aria-label="Bố cục">{([['full-bleed', 'Tràn màn hình'], ['card', 'Dạng thẻ']] as const).map(([value, label]) =>
        <label key={value} className={styles.choice}><input type="radio" name="layout" checked={config.layout === value} onChange={() => change({ layout: value })} />{label}</label>)}</div>
    </fieldset>

    <fieldset className={styles.panel}><legend>Poster và logo</legend><div className={styles.grid2}>
      <label>Loại poster<select value={config.poster?.kind ?? 'image'} onChange={e => change({ poster: config.poster ? { kind: e.target.value as MediaRef['kind'], url: config.poster.url } : null })} disabled={!config.poster}>
        <option value="image">Ảnh</option><option value="video">Video</option></select></label>
      <label>Link poster (bỏ trống để hiện khung “POSTER SỰ KIỆN”)<input type="url" value={config.poster?.url ?? ''} onChange={e => change({ poster: mediaOf(e.target.value, config.poster?.kind ?? 'image') })} placeholder="https://…" /></label>
      <label>Link logo (bỏ trống để hiện chữ cái đầu)<input type="url" value={config.logo?.url ?? ''} onChange={e => change({ logo: e.target.value.trim() ? { kind: 'image', url: e.target.value.trim() } : null })} placeholder="https://…" /></label>
      <div className={styles.uploads}>
        <Upload endpoint={endpoint} accept="image/jpeg,image/png,image/webp,video/mp4" label="Tải poster lên" enabled={state.uploads} onDone={media => change({ poster: media })} />
        <Upload endpoint={endpoint} accept="image/jpeg,image/png,image/webp" label="Tải logo lên" enabled={state.uploads} onDone={media => change({ logo: { kind: 'image', url: media.url } })} />
      </div>
    </div><p className={styles.hint}>Tải lên: ảnh JPG, PNG, WebP tối đa 5 MB; video MP4 tối đa 30 MB. Cũng có thể dán link https.</p></fieldset>

    <fieldset className={styles.panel}><legend>Nền và watermark</legend><div className={styles.grid2}>
      <label>Kiểu nền<select value={b.kind !== 'media' ? b.kind : b.media.url === STEM_BACKGROUND.video ? 'video' : 'upload'} onChange={e => {
        const kind = e.target.value;
        change({ background: kind === 'solid' ? { kind: 'solid', color: '#214034' } : kind === 'gradient' ? { kind: 'gradient', colors: ['#214034', '#EFF2E8'], angle: 135 }
          : kind === 'upload' ? { kind: 'media', media: { kind: 'image', url: 'https://' }, loop: true }
          : { kind: 'media', media: { kind: 'video', url: STEM_BACKGROUND.video }, loop: true } });
      }}><option value="video">Video mặc định</option><option value="upload">Ảnh hoặc video của shop</option><option value="gradient">Chuyển màu</option><option value="solid">Một màu</option></select></label>
      {b.kind === 'media' && b.media.url !== STEM_BACKGROUND.video && <>
        <label>Link ảnh hoặc video nền<input type="url" value={b.media.url} onChange={e => change({ background: { ...b, media: { kind: b.media.kind, url: e.target.value.trim() } } })} /></label>
        <label>Loại<select value={b.media.kind} onChange={e => change({ background: { ...b, media: { kind: e.target.value as MediaRef['kind'], url: b.media.url } } })}><option value="image">Ảnh</option><option value="video">Video (chạy lặp, không tiếng)</option></select></label>
        <Upload endpoint={endpoint} accept="image/jpeg,image/png,image/webp,video/mp4" label="Tải nền lên" enabled={state.uploads} onDone={media => change({ background: { kind: 'media', media, loop: true } })} />
      </>}
      {b.kind === 'solid' && <label>Màu nền<input type="color" value={b.color} onChange={e => change({ background: { kind: 'solid', color: e.target.value.toUpperCase() } })} /></label>}
      {b.kind === 'gradient' && <>
        <label>Màu đầu<input type="color" value={b.colors[0]} onChange={e => change({ background: { ...b, colors: [e.target.value.toUpperCase(), b.colors[1]] } })} /></label>
        <label>Màu cuối<input type="color" value={b.colors[1]} onChange={e => change({ background: { ...b, colors: [b.colors[0], e.target.value.toUpperCase()] } })} /></label>
        <label>Góc ({b.angle}°)<input type="range" min={0} max={359} value={b.angle} onChange={e => change({ background: { ...b, angle: Number(e.target.value) } })} /></label>
      </>}
      <label className={styles.choice}><input type="checkbox" checked={config.watermark.enabled} onChange={e => change({ watermark: { ...config.watermark, enabled: e.target.checked } })} />Hiện watermark &quot;YOUR LOGO&quot; chạy chéo</label>
    </div></fieldset>

    <fieldset className={styles.panel}><legend>Nút góp ý riêng (góc dưới trái)</legend><div className={styles.grid2}>
      <label>Hình<select value={button.icon} onChange={e => change({ feedbackButton: { ...button, icon: e.target.value as FeedbackButton['icon'] } })}>
        {PLANES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Màu<input type="color" value={button.color} onChange={e => change({ feedbackButton: { ...button, color: e.target.value.toUpperCase() } })} /></label>
      <label>Màu viền<input type="color" value={button.outline} onChange={e => change({ feedbackButton: { ...button, outline: e.target.value.toUpperCase() } })} /></label>
    </div></fieldset>

    <fieldset className={styles.panel}><legend>Nút link ({config.links.length}/6)</legend>
      <ol className={styles.linkList}>{config.links.map((link, index) => <li key={index} data-link-row={index}>
        <label>Loại<select value={link.icon} onChange={e => setLink(index, { icon: e.target.value as LinkIcon })}>{ICONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Chữ trên nút<input value={link.label.vi} maxLength={180} onChange={e => setLink(index, { label: { ...link.label, vi: e.target.value } })} /></label>
        <label>Chữ tiếng Anh<input value={link.label.en} maxLength={180} onChange={e => setLink(index, { label: { ...link.label, en: e.target.value } })} /></label>
        <label>{link.icon === 'phone' ? 'Số điện thoại (tel:…)' : 'Link'}<input value={link.url} onChange={e => setLink(index, { url: e.target.value.trim() })} placeholder={link.icon === 'phone' ? 'tel:0901234567' : 'https://…'} /></label>
        <div className={styles.rowButtons}>
          <button type="button" aria-label={`Đưa nút ${index + 1} lên`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
          <button type="button" aria-label={`Đưa nút ${index + 1} xuống`} disabled={index === config.links.length - 1} onClick={() => move(index, 1)}>↓</button>
          <button type="button" onClick={() => change({ links: config.links.filter((_, i) => i !== index) })}>Xoá</button>
        </div>
      </li>)}</ol>
      <button type="button" className={styles.addButton} disabled={config.links.length >= 6}
        onClick={() => change({ links: [...config.links, { label: { vi: 'Liên kết', en: 'Link' }, url: 'https://', icon: 'link' }] })}>Thêm nút</button>
    </fieldset>
  </section>;
}
