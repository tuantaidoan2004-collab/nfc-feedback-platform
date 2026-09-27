'use client';
import { useCallback, useEffect, useState } from 'react';
import { POSTER, shrinkImage, shrinkNotice } from '@/lib/client/shrink-image';
import { shrinkVideo } from '@/lib/client/shrink-video';
import { SERVICE_LABELS } from '@/lib/publishing/policy';
import type { FeedbackButton, LinkIcon, MediaRef, PageConfig } from '@/lib/publishing/config';
import { STEM_BACKGROUND } from '@/lib/publishing/config';
import { type TemplateRelease } from '@/lib/publishing/versions';
import type { SettingField } from '@/lib/publishing/settings';
import styles from './owner-app.module.css';
import { TEMPLATE_KEYS, isTemplateKey, TEMPLATE_NAMES } from '@/lib/publishing/templates';

/**
 * Design & Link editor (lát D). Works on the saved draft: Save keeps it, Preview opens the saved draft in a new tab
 * exactly as it would publish, Publish makes it the live page. Media are https links until per-shop uploads exist.
 */
type State = { page: { slug: string }; draft: { revision: number; config: PageConfig }; live: { releaseId: string; config: PageConfig } | null; uploads: boolean;
  template: { key: string; draft: number; live: number | null; versions: readonly TemplateRelease[]; settings: readonly SettingField[] } };
const ICONS: [LinkIcon, string][] = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['zalo', 'Zalo'], ['phone', 'Gọi điện'], ['booking', 'Đặt lịch'], ['link', 'Liên kết']];
const PLANES: [FeedbackButton['icon'], string][] = [['plane', 'Máy bay giấy'], ['chat', 'Bong bóng chat'], ['mail', 'Phong bì']];
const ERRORS: Record<string, string> = {
  INVALID_CONFIG: 'Có ô chưa hợp lệ. Link phải bắt đầu bằng https:// (nút Gọi điện dùng tel: kèm số), màu dạng #RRGGBB, tối đa 6 nút.',
  DRAFT_CONFLICT: 'Bản nháp vừa được sửa ở nơi khác. Đã tải lại bản mới nhất; hãy kiểm tra rồi làm lại.',
  SUPPORT_NOT_GRANTED: 'Chủ shop chưa cho phép sửa giao diện (cần khấc 2 hoặc 3).',
  IMPERSONATION_SCOPE: 'Phiên này chỉ để xem. Mở phiên "Sửa giao diện" để chỉnh.',
  SHOP_SUSPENDED: 'Shop đang bị tạm khoá nên chưa phát hành được.',
  INVALID_TEMPLATE_VERSION: 'Bản khuôn này không còn. Đã tải lại danh sách bản.',
  SETTING_LOCKED: 'Khuôn này không cho đổi phần diện mạo đó. Đã tải lại bản nháp.',
  INVALID_SETTING: 'Có một tuỳ chỉnh của khuôn không hợp lệ. Đã tải lại bản nháp.',
  OWNER_ROLE_REQUIRED: 'Chỉ tài khoản chủ shop đổi được khuôn, vì khuôn quyết định giá của trang.',
  PAGE_NOT_FOUND: 'Không tìm thấy trang này. Tải lại dashboard.',
  PAGE_CLOSED: 'Trang này đã đóng vĩnh viễn nên không sửa được nữa.',
  // Said in the shop's own interest, not as a scolding: the penalty for this lands on their Google listing.
  POLICY_LINK_LABEL: 'Chữ trên nút phải chọn từ danh sách có sẵn. Google cấm đổi quà lấy đánh giá và cấm nhờ khách nhắc tên nhân viên; hồ sơ Google bị phạt là hồ sơ của quán, nên nền tảng không cho đặt chữ tự do lên nút.',
  POLICY_GOOGLE_URL: 'Link đánh giá Google phải là link của Google: link "Nhận thêm đánh giá" trong Google Business Profile (g.page/r/…), link chia sẻ Google Maps (maps.app.goo.gl/…) hoặc trang của quán trên Google Maps. Không dùng link tới trang khác, và không thêm số sao hay câu mẫu vào link.',
  POLICY_GOOGLE_EXCHANGE: 'Tên quán hoặc câu hỏi đang nối việc đánh giá với quà, ưu đãi, số sao hay tên nhân viên. Google cấm điều này và phạt hồ sơ của quán. Sửa lại thành lời mời trung lập, ví dụ "Cảm nhận của bạn giúp quán tốt hơn".',
};
/** Which background choice a page is on. A video (only on pages from before 26/09) shows as a shop picture. */
const backgroundChoice = (b: PageConfig['background']) => b.kind !== 'media' ? b.kind : b.media.url === STEM_BACKGROUND.still ? 'default' : 'upload';
const mediaOf = (value: string, kind: MediaRef['kind']): MediaRef | null => value.trim() ? { kind, url: value.trim() } : null;
const UPLOAD_ERRORS: Record<string, string> = {
  MEDIA_PENDING: 'Ảnh hoặc video mới đang chờ nền tảng duyệt. Trang hiện tại vẫn chạy như cũ; phát hành lại sau khi ảnh được duyệt, hoặc bỏ ảnh đó ra để phát hành ngay.',
  MEDIA_REJECTED: 'Một ảnh hoặc video trên trang đã bị từ chối. Hãy thay bằng ảnh khác rồi phát hành lại.',
  MEDIA_UNKNOWN: 'Trang đang dùng một ảnh không tải lên qua nền tảng. Hãy tải ảnh lên từ trình chỉnh trang để được duyệt.',
  UNSUPPORTED_MEDIA: 'Chỉ nhận ảnh JPG, PNG, WebP hoặc video MP4.', MEDIA_TOO_LARGE: 'Ảnh tối đa 5 MB; video tối đa 50 MB sau khi nén về 720p.',
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
      setState('Đang chuẩn bị ảnh…');
      try {
        // A phone camera's picture is re-drawn to a size the guest page can actually use before it goes anywhere
        // (lát A6). A video is re-recorded at 720p in this tab (lát E9): it plays through once, so it takes as long
        // as the clip; a browser that cannot record MP4 sends the original.
        let body: { blob: Blob; type: string };
        if (file.type === 'video/mp4') {
          setState('Đang nén video về 720p… giữ tab này mở.');
          const video = await shrinkVideo(file, undefined, share => setState(`Đang nén video về 720p… ${Math.round(share * 100)}% · giữ tab này mở.`));
          body = video ?? { blob: file, type: file.type };
          setState(video ? `Đã nén video ${Math.round(video.from / 1048576)} MB → ${Math.max(1, Math.round(video.to / 1048576))} MB. Đang tải lên…` : 'Đang tải lên…');
        } else {
          const shrunk = await shrinkImage(file, POSTER);
          body = shrunk; setState(shrinkNotice(shrunk) || 'Đang tải lên…');
        }
        const uploaded = await put(endpoint, body.blob, body.type);
        if ('error' in uploaded) { setState(uploaded.error ?? 'Chưa tải lên được.'); return; }
        // A video also gets its first frame as a still, for phones that will not play it.
        let still: string | undefined;
        if (uploaded.kind === 'video') {
          setState('Đang tạo ảnh tĩnh từ video…');
          const frame = await firstFrame(file);
          const shrunkFrame = frame ? await shrinkImage(frame, POSTER) : null;
          const frameUpload = shrunkFrame ? await put(endpoint, shrunkFrame.blob, shrunkFrame.type) : null;
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

/** Content every page has, whatever its template (migration 022): what "Nhập dữ liệu từ trang khác" brings over. */
const CONTENT = ['name', 'googleUrl', 'text', 'links', 'logo', 'poster'] as const;
export default function DesignEditor({ endpoint, origin, page, pages = [], canManage = false, onChanged }: {
  endpoint: string; origin: string; page: string | null; pages?: { slug: string; label: string }[]; canManage?: boolean; onChanged?: () => void;
}) {
  // Reads name the page in the query; writes carry it in the body (server/owner-v2.ts ownerPage).
  const read = page ? `${endpoint}/design?page=${encodeURIComponent(page)}` : `${endpoint}/design`;
  const withPage = (body: Record<string, unknown>) => page ? { ...body, page } : body;
  const [state, setState] = useState<State | null>(null);
  const [config, setConfig] = useState<PageConfig | null>(null);
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch(read, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(ERRORS[body.error] ?? (response.status === 401 ? 'Phiên đã hết hạn. Đăng nhập lại.' : 'Chưa tải được thiết kế.')); return; }
      setState(body); setConfig(body.draft.config); setDirty(false);
    } catch { setNotice('Không thể kết nối. Vui lòng thử lại.'); }
  }, [read]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const change = (patch: Partial<PageConfig>) => { setConfig(current => current && { ...current, ...patch }); setDirty(true); setNotice(''); };

  const send = async (method: string, body: unknown) => {
    const response = await fetch(`${endpoint}/design`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(withPage(body as Record<string, unknown>)) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(ERRORS[data.error] ?? 'Chưa lưu được. Thử lại.');
      if (['DRAFT_CONFLICT', 'SETTING_LOCKED', 'INVALID_SETTING'].includes(data.error)) await load();
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
      if (result) { setNotice('Đã phát hành. Khách thấy trang mới từ lần mở tiếp theo.'); await load(); onChanged?.(); }
    } catch { tab?.close(); setNotice('Không thể kết nối. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  };

  /** Puts the page on another template, keeping its content; the guest page changes only on Publish. */
  const switchTemplate = async (template: string) => {
    if (!window.confirm('Đổi trang này sang khuôn khác? Nội dung giữ nguyên, diện mạo theo khuôn mới. Khách chỉ thấy sau khi Phát hành.')) return;
    setBusy(true); setNotice('');
    try {
      const revision = await saved();
      if (revision === null) return;
      const result = await send('POST', { action: 'template', expectedRevision: revision, template });
      await load(); onChanged?.();
      if (result) setNotice('Bản nháp đã sang khuôn mới. Bấm Xem trước để thử; khách chỉ thấy sau khi Phát hành.');
    } catch { setNotice('Không thể kết nối. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  };
  /** Copies another page's content into this draft, unsaved, for the owner to look over and save. */
  const importFrom = async (source: string) => {
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`${endpoint}/design?page=${encodeURIComponent(source)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(ERRORS[body.error] ?? 'Chưa tải được trang kia.'); return; }
      const from = body.draft.config as PageConfig;
      change(Object.fromEntries(CONTENT.map(key => [key, from[key]])) as Partial<PageConfig>);
      setNotice(`Đã chép tên, link Google, câu hỏi, nút link, logo và poster từ trang ${source}. Kiểm tra rồi bấm Lưu nháp.`);
    } catch { setNotice('Không thể kết nối. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  };
  /** Moves the draft to another version of its template; the guest page changes only on Publish (versions.ts). */
  const switchVersion = async (version: number) => {
    setBusy(true); setNotice('');
    try {
      const revision = await saved();
      if (revision === null) return;
      const result = await send('POST', { action: 'version', expectedRevision: revision, version });
      if (!result) { await load(); return; }
      await load();
      setNotice(`Bản nháp giờ dùng khuôn bản ${version}. Bấm Xem trước để thử; khách chỉ thấy sau khi Phát hành.`);
    } catch { setNotice('Không thể kết nối. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  };

  const customerUrl = state ? `${origin}/${state.page.slug}` : origin;
  if (!config || !state) return <section className={styles.panel} data-design-editor><h2>Thiết kế & Link</h2><p className={styles.hint}>{notice || 'Đang tải…'}</p></section>;
  const b = config.background, button = config.feedbackButton!;
  // What this template version lets the owner adjust (lib/publishing/settings.ts). Content is always editable.
  const fields = state.template.settings, offers = (kind: SettingField['kind']) => fields.some(field => field.kind === kind);
  const backgroundField = fields.find((field): field is Extract<SettingField, { kind: 'background' }> => field.kind === 'background');
  const ownFields = fields.filter((field): field is Extract<SettingField, { key: string }> => 'key' in field);
  const setting = (key: string, value: string | number | boolean) => change({ settings: { ...config.settings, [key]: value } });
  const setLink = (index: number, patch: Partial<PageConfig['links'][number]>) =>
    change({ links: config.links.map((link, i) => i === index ? { ...link, ...patch } : link) });
  const move = (index: number, by: number) => {
    const links = [...config.links], [item] = links.splice(index, 1); links.splice(index + by, 0, item); change({ links });
  };
  return <section aria-label="Thiết kế & Link" data-design-editor data-design-page={state.page.slug}>
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

    <fieldset className={styles.panel} data-template-panel><legend>Khuôn</legend>
      {/* A template version is frozen: the live page keeps its version until the shop chooses another and publishes. */}
      <p className={styles.hint} data-template-state>{isTemplateKey(state.template.key) ? TEMPLATE_NAMES[state.template.key] : state.template.key} ·
        bản nháp dùng <strong>bản {state.template.draft}</strong>{state.template.live === null ? '.'
          : state.template.live === state.template.draft ? ', trang khách cũng đang chạy bản này.'
          : `; trang khách vẫn chạy bản ${state.template.live} cho tới khi bạn Phát hành.`}</p>
      <ol className={styles.versionList}>{[...state.template.versions].reverse().map((release, index) =>
        <li key={release.version} data-template-version-row={release.version}>
          <p><strong>Bản {release.version}</strong>{index === 0 ? ' · mới nhất' : ''} · {release.date.split('-').reverse().join('/')}<br />{release.notes}</p>
          {release.version === state.template.draft
            ? <small>Bản nháp đang dùng</small>
            : <button type="button" disabled={busy} onClick={() => void switchVersion(release.version)}>Dùng bản {release.version}</button>}
        </li>)}</ol>
      {canManage && <div className={styles.toolRow} data-template-switch><label>Đổi sang khuôn khác<select value={state.template.key}
        disabled={busy} onChange={e => void switchTemplate(e.target.value)}>
        {TEMPLATE_KEYS.map(key => <option key={key} value={key}>{TEMPLATE_NAMES[key]}</option>)}
        {!isTemplateKey(state.template.key) && <option value={state.template.key}>{state.template.key}</option>}</select></label></div>}
      {pages.length > 1 && <div className={styles.toolRow} data-import><label>Nhập dữ liệu từ trang khác<select value="" disabled={busy}
        onChange={e => { if (e.target.value) void importFrom(e.target.value); }}><option value="">Chọn trang…</option>
        {pages.filter(other => other.slug !== state.page.slug).map(other => <option key={other.slug} value={other.slug}>{other.label || other.slug} ({other.slug})</option>)}
      </select></label></div>}
    </fieldset>

    <fieldset className={styles.panel}><legend>Thông tin</legend><div className={styles.grid2}>
      <label>Tên hiển thị<input value={config.name} maxLength={100} onChange={e => change({ name: e.target.value })} /></label>
      <label>Link đánh giá Google<input type="url" value={config.googleUrl} onChange={e => change({ googleUrl: e.target.value })} placeholder="https://g.page/r/…" /></label>
    </div>
      <p className={styles.hint} data-google-link-hint>Lấy trong Google Business Profile: <strong>Nhận thêm đánh giá</strong> (g.page/r/…), hoặc link
        chia sẻ của quán trên Google Maps. Chỉ nhận link của Google, không thêm số sao hay câu mẫu.</p>
    </fieldset>

    {!offers('layout') && !backgroundField && !offers('watermark') && !offers('feedbackButton') && !ownFields.length &&
      <p className={styles.panel} data-no-settings>Khuôn này không có tuỳ chỉnh diện mạo: chỉ cần điền nội dung bên dưới.</p>}

    {offers('layout') && <fieldset className={styles.panel} data-setting="layout"><legend>Bố cục</legend>
      <div className={styles.choices} role="radiogroup" aria-label="Bố cục">{([['full-bleed', 'Tràn màn hình'], ['card', 'Dạng thẻ']] as const).map(([value, label]) =>
        <label key={value} className={styles.choice}><input type="radio" name="layout" checked={config.layout === value} onChange={() => change({ layout: value })} />{label}</label>)}</div>
    </fieldset>}

    <fieldset className={styles.panel}><legend>Poster và logo</legend><div className={styles.grid2}>
      <label>Loại poster<select value={config.poster?.kind ?? 'image'} onChange={e => change({ poster: config.poster ? { kind: e.target.value as MediaRef['kind'], url: config.poster.url } : null })} disabled={!config.poster}>
        <option value="image">Ảnh</option><option value="video">Video</option></select></label>
      <label>Link poster (bỏ trống để hiện khung “POSTER SỰ KIỆN”)<input type="url" value={config.poster?.url ?? ''} onChange={e => change({ poster: mediaOf(e.target.value, config.poster?.kind ?? 'image') })} placeholder="https://…" /></label>
      <label>Link logo (bỏ trống để hiện chữ cái đầu)<input type="url" value={config.logo?.url ?? ''} onChange={e => change({ logo: e.target.value.trim() ? { kind: 'image', url: e.target.value.trim() } : null })} placeholder="https://…" /></label>
      <div className={styles.uploads}>
        <Upload endpoint={endpoint} accept="image/jpeg,image/png,image/webp,video/mp4" label="Tải poster lên" enabled={state.uploads} onDone={media => change({ poster: media })} />
        <Upload endpoint={endpoint} accept="image/jpeg,image/png,image/webp" label="Tải logo lên" enabled={state.uploads} onDone={media => change({ logo: { kind: 'image', url: media.url } })} />
      </div>
    </div><p className={styles.hint}>Tải lên: ảnh JPG, PNG, WebP tối đa 5 MB. Poster có thể là video MP4 quay thẳng từ điện thoại, dài bao nhiêu
      cũng được: trình duyệt nén về 720p trước khi tải lên (mất khoảng bằng độ dài video, giữ tab mở). Cũng có thể dán link https.</p></fieldset>

    {(backgroundField || offers('watermark')) && <fieldset className={styles.panel} data-setting="background"><legend>{backgroundField ? 'Nền' : 'Watermark'}</legend><div className={styles.grid2}>
      {/* A background is a picture, never a video (Tài 26/09): video belongs in the poster. An older page's video
          background is turned into its own first frame when the page is saved (withoutVideoBackground). */}
      {backgroundField && <label>Kiểu nền<select value={backgroundChoice(b)} onChange={e => {
        const kind = e.target.value;
        change({ background: kind === 'solid' ? { kind: 'solid', color: '#214034' } : kind === 'gradient' ? { kind: 'gradient', colors: ['#214034', '#EFF2E8'], angle: 135 }
          : kind === 'upload' ? { kind: 'media', media: { kind: 'image', url: 'https://' }, loop: true }
          : { kind: 'media', media: { kind: 'image', url: STEM_BACKGROUND.still }, loop: true } });
      }}>{([['default', 'Ảnh mặc định', 'media'], ['upload', 'Ảnh của shop', 'media'], ['gradient', 'Chuyển màu', 'gradient'], ['solid', 'Một màu', 'solid']] as const)
          .filter(([value, , kind]) => backgroundField.allow.includes(kind) || value === backgroundChoice(b))
          .map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      {backgroundField && backgroundChoice(b) === 'upload' && b.kind === 'media' && <>
        <label>Link ảnh nền<input type="url" value={b.media.url} onChange={e => change({ background: { ...b, media: { kind: 'image', url: e.target.value.trim() } } })} /></label>
        <Upload endpoint={endpoint} accept="image/jpeg,image/png,image/webp" label="Tải ảnh nền lên" enabled={state.uploads} onDone={media => change({ background: { kind: 'media', media, loop: true } })} />
      </>}
      {backgroundField && b.kind === 'solid' && <label>Màu nền<input type="color" value={b.color} onChange={e => change({ background: { kind: 'solid', color: e.target.value.toUpperCase() } })} /></label>}
      {backgroundField && b.kind === 'gradient' && <>
        <label>Màu đầu<input type="color" value={b.colors[0]} onChange={e => change({ background: { ...b, colors: [e.target.value.toUpperCase(), b.colors[1]] } })} /></label>
        <label>Màu cuối<input type="color" value={b.colors[1]} onChange={e => change({ background: { ...b, colors: [b.colors[0], e.target.value.toUpperCase()] } })} /></label>
        <label>Góc ({b.angle}°)<input type="range" min={0} max={359} value={b.angle} onChange={e => change({ background: { ...b, angle: Number(e.target.value) } })} /></label>
      </>}
      {offers('watermark') && <label className={styles.choice} data-setting="watermark"><input type="checkbox" checked={config.watermark.enabled} onChange={e => change({ watermark: { ...config.watermark, enabled: e.target.checked } })} />Hiện watermark &quot;YOUR LOGO&quot; chạy chéo</label>}
    </div></fieldset>}

    {ownFields.length > 0 && <fieldset className={styles.panel} data-setting="own"><legend>Tuỳ chỉnh của khuôn</legend><div className={styles.grid2}>
      {ownFields.map(field => {
        const value = config.settings?.[field.key] ?? field.default;
        if (field.kind === 'color') return <label key={field.key} data-setting={field.key}>{field.label}<input type="color" value={String(value)} onChange={e => setting(field.key, e.target.value.toUpperCase())} /></label>;
        if (field.kind === 'range') return <label key={field.key} data-setting={field.key}>{field.label} ({String(value)})<input type="range" min={field.min} max={field.max} step={field.step} value={Number(value)} onChange={e => setting(field.key, Number(e.target.value))} /></label>;
        if (field.kind === 'choice') return <label key={field.key} data-setting={field.key}>{field.label}<select value={String(value)} onChange={e => setting(field.key, e.target.value)}>
          {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
        return <label key={field.key} className={styles.choice} data-setting={field.key}><input type="checkbox" checked={value === true} onChange={e => setting(field.key, e.target.checked)} />{field.label}</label>;
      })}
    </div></fieldset>}

    {offers('feedbackButton') && <fieldset className={styles.panel} data-setting="feedbackButton"><legend>Nút góp ý riêng (góc dưới trái)</legend><div className={styles.grid2}>
      <label>Hình<select value={button.icon} onChange={e => change({ feedbackButton: { ...button, icon: e.target.value as FeedbackButton['icon'] } })}>
        {PLANES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Màu<input type="color" value={button.color} onChange={e => change({ feedbackButton: { ...button, color: e.target.value.toUpperCase() } })} /></label>
      <label>Màu viền<input type="color" value={button.outline} onChange={e => change({ feedbackButton: { ...button, outline: e.target.value.toUpperCase() } })} /></label>
    </div></fieldset>}

    <fieldset className={styles.panel}><legend>Nút link ({config.links.length}/6)</legend>
      {/* Said before the shop writes, not only after it is refused: most shops break this rule without knowing. */}
      <p className={styles.hint} data-policy-hint>Chữ trên nút chọn từ danh sách có sẵn. Google <strong>cấm</strong> đổi quà,
        giảm giá hay ưu đãi lấy đánh giá, và cấm nhờ khách nhắc tên nhân viên — hồ sơ Google bị phạt là hồ sơ của quán,
        không phải của nền tảng. Muốn mời khách thì dùng câu trung lập như “Cảm nhận của bạn giúp quán tốt hơn”.</p>
      <ol className={styles.linkList}>{config.links.map((link, index) => <li key={index} data-link-row={index}>
        <label>Loại<select value={link.icon} onChange={e => setLink(index, { icon: e.target.value as LinkIcon })}>{ICONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {/* A chosen label, not typed text. A button that names an action cannot also carry an offer, which is
            how "Đánh giá Google 5 sao để nhận quà" was publishable before (F-013, google-policy rules 4/5/7/8). */}
        <label>Chữ trên nút<select data-link-label value={SERVICE_LABELS.findIndex(l => l.vi === link.label.vi && l.en === link.label.en)}
          onChange={e => setLink(index, { label: { ...SERVICE_LABELS[Number(e.target.value)] } })}>
          {!SERVICE_LABELS.some(l => l.vi === link.label.vi && l.en === link.label.en) &&
            <option value={-1}>{link.label.vi} — chữ cũ, chọn lại để lưu được</option>}
          {SERVICE_LABELS.map((option, i) => <option key={option.en} value={i}>{option.vi} · {option.en}</option>)}
        </select></label>
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
