'use client';
import { useCallback, useEffect, useState } from 'react';
import type { FeedbackButton, LinkIcon, MediaRef, PageConfig } from '@/lib/publishing/config';
import { STEM_BACKGROUND } from '@/lib/publishing/config';
import styles from './owner-app.module.css';

/**
 * Design & Link editor (lát D). Works on the saved draft: Save keeps it, Preview opens the saved draft in a new tab
 * exactly as it would publish, Publish makes it the live page. Media are https links until per-shop uploads exist.
 */
type State = { draft: { revision: number; config: PageConfig }; live: { releaseId: string; config: PageConfig } | null };
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
      if (what === 'save') { setNotice('Đã lưu bản nháp.'); return; }
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
        <p className={styles.hint} data-draft-state>{dirty ? 'Có thay đổi chưa lưu.' : `Bản nháp số ${state.draft.revision}.`} Trang khách: <a href={customerUrl} target="_blank" rel="noreferrer">mở trang đang chạy</a></p>
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
      <label>Loại poster<select value={config.poster?.kind ?? 'image'} onChange={e => change({ poster: config.poster ? { ...config.poster, kind: e.target.value as MediaRef['kind'] } : null })} disabled={!config.poster}>
        <option value="image">Ảnh</option><option value="video">Video</option></select></label>
      <label>Link poster (bỏ trống để hiện khung “POSTER SỰ KIỆN”)<input type="url" value={config.poster?.url ?? ''} onChange={e => change({ poster: mediaOf(e.target.value, config.poster?.kind ?? 'image') })} placeholder="https://…" /></label>
      <label>Link logo (bỏ trống để hiện chữ cái đầu)<input type="url" value={config.logo?.url ?? ''} onChange={e => change({ logo: e.target.value.trim() ? { kind: 'image', url: e.target.value.trim() } : null })} placeholder="https://…" /></label>
    </div><p className={styles.hint}>Tải ảnh và video lên trực tiếp sẽ có khi bật kho lưu trữ; hiện dán link https của ảnh hoặc video.</p></fieldset>

    <fieldset className={styles.panel}><legend>Nền và watermark</legend><div className={styles.grid2}>
      <label>Kiểu nền<select value={b.kind === 'media' ? 'video' : b.kind} onChange={e => {
        const kind = e.target.value;
        change({ background: kind === 'solid' ? { kind: 'solid', color: '#214034' } : kind === 'gradient' ? { kind: 'gradient', colors: ['#214034', '#EFF2E8'], angle: 135 }
          : { kind: 'media', media: { kind: 'video', url: STEM_BACKGROUND.video }, loop: true } });
      }}><option value="video">Video mặc định</option><option value="gradient">Chuyển màu</option><option value="solid">Một màu</option></select></label>
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
