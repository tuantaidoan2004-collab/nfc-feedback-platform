'use client';
/**
 * Trang của quán, không có trình sửa (Tài 05/10: "nhìn phát là khách ấn luôn"). Chọn một mẫu → xem nó mang tên quán trong
 * khung điện thoại → **Phát hành luôn**, hoặc **Nhờ admin sửa** (ghi điều muốn đổi, gửi ảnh/video qua Zalo; trang chờ ở /gov,
 * admin sửa rồi phát hành lại). Library và My Card dùng chung các mảnh ở đây.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TemplateCard } from '@/lib/canvas/templates';
import type { PageSummary } from '@/lib/owner/pages';
import { pageLabel } from '@/lib/owner/page-names';
import { ZALO } from '@/lib/contact';
import Icon from '../icons';
import styles from './pages.module.css';

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);

export function usePages(slug: string) {
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/owner/v2/${slug}/pages`, { cache: 'no-store' }).catch(() => null);
    setPages(response?.ok ? (await response.json()).pages : []);
  }, [slug]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return { pages, reload: load };
}

/** Publishes the page's draft. `review`: the shop's first publish went to Tài instead (kịch bản mục 4). */
async function publish(slug: string, page: string, revision: number): Promise<'live' | 'review' | 'error'> {
  const response = await post(`/api/owner/v2/${slug}/design`, { action: 'publish', expectedRevision: revision, page });
  if (!response?.ok) return 'error';
  return (await response.json()).review === 'pending' ? 'review' : 'live';
}
async function askEdit(slug: string, page: string, message: string) {
  return !!(await post(`/api/owner/v2/${slug}/edit-requests`, { page, message }))?.ok;
}

/** What a page is doing now, in a word or two, and how it reads (green: guests see it; amber: someone is on it; red: stopped). */
export function pageState(page: PageSummary): { text: string; tone: 'live' | 'wait' | 'stop' | 'idle' } {
  if (page.state === 'closed') return { text: 'Đã đóng', tone: 'stop' };
  if (page.state === 'paused') return { text: 'Tạm dừng', tone: 'stop' };
  if (page.editRequest) return { text: 'Chờ admin sửa', tone: 'wait' };
  if (page.review?.state === 'pending') return { text: 'Chờ duyệt lần đầu', tone: 'wait' };
  if (page.review?.state === 'rejected') return { text: 'Chưa được duyệt', tone: 'stop' };
  if (page.state === 'active') return page.unpublished ? { text: 'Có bản mới chưa phát hành', tone: 'wait' } : { text: 'Đang chạy', tone: 'live' };
  return { text: 'Chưa phát hành', tone: 'idle' };
}
export function StateTag({ page }: { page: PageSummary }) {
  const state = pageState(page);
  return <span className={styles.state} data-tone={state.tone} data-page-state={state.text}>{state.text}</span>;
}

function ZaloCard() {
  return <div className={styles.zalo}>
    <span className={styles.zaloMark} aria-hidden="true">Zalo</span>
    <div><b>Gửi ảnh, video, logo qua Zalo</b><small>{ZALO.number} · gửi kèm tên quán</small></div>
    <a className="qs-btn small" href={ZALO.url} target="_blank" rel="noreferrer">Mở Zalo</a>
  </div>;
}

/** "Bạn muốn sửa gì?": a few words (optional) and the files over Zalo. */
function EditForm({ busy, onSend, onBack }: { busy: boolean; onSend: (message: string) => void; onBack?: () => void }) {
  const [message, setMessage] = useState('');
  return <div className={styles.form} data-edit-form>
    <label className="qs-field">Bạn muốn sửa gì?<small>Không bắt buộc. Viết ngắn cũng được, admin sẽ nhắn lại qua Zalo.</small>
      <textarea value={message} maxLength={1000} onChange={event => setMessage(event.target.value)} autoFocus
        placeholder="Ví dụ: thay ảnh bìa bằng ảnh quán, đổi màu sang xanh lá, thêm số điện thoại 09…" /></label>
    <ZaloCard />
    <div className={styles.actions}>
      <button type="button" className="qs-btn" disabled={busy} onClick={() => onSend(message)}><Icon name="send" size={18} /> {busy ? 'Đang gửi…' : 'Gửi yêu cầu'}</button>
      {onBack && <button type="button" className="qs-btn ghost" disabled={busy} onClick={onBack}>Quay lại</button>}
    </div>
  </div>;
}

function Done({ result, url, onClose, next }: { result: 'live' | 'review' | 'edit'; url: string; onClose: () => void; next?: { label: string; href: string } }) {
  const [copied, setCopied] = useState(false);
  return <div className={styles.done} role="status" data-done={result}>
    <span className={styles.mark} aria-hidden="true">{result === 'live' ? '🎉' : result === 'review' ? '⏳' : '🛠️'}</span>
    <strong>{result === 'live' ? 'Trang đã lên mạng' : result === 'review' ? 'Đã gửi duyệt' : 'Đã gửi yêu cầu sửa'}</strong>
    <p className="qs-muted">{result === 'live' ? 'Khách chạm thẻ hoặc quét QR là thấy ngay. Muốn đổi gì, bấm "Nhờ admin sửa" ở trang này.'
      : result === 'review' ? 'Lần phát hành đầu admin xem qua một lần, thường trong ngày. Duyệt xong trang lên mạng luôn.'
        : 'Trang đang chờ admin sửa. Nhớ gửi ảnh, video qua Zalo. Sửa xong admin phát hành, bạn thấy trạng thái đổi trong My Card.'}</p>
    {result === 'edit' && <ZaloCard />}
    <div className={styles.actions}>
      {next ? <a className="qs-btn" href={next.href}>{next.label} <Icon name="arrow" size={18} /></a> : <button type="button" className="qs-btn" onClick={onClose}>Xong</button>}
      {result === 'live' && <>
        <a className="qs-btn ghost" href={url} target="_blank" rel="noreferrer">Mở trang <Icon name="external" size={16} /></a>
        <button type="button" className="qs-btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* the link is on the page */ } }}>
          <Icon name="link" size={16} /> {copied ? 'Đã sao chép' : 'Sao chép link'}</button></>}
    </div>
  </div>;
}

function Sheet({ label, onClose, preview, children }: { label: string; onClose: () => void; preview: string; children: React.ReactNode }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const [height, setHeight] = useState(0);
  // Above the Orb and the tab bar: drawn at the root of the app's frame (.qs), which keeps the colours and the theme.
  const root = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.qs') ?? document.body;
  if (!root) return null;
  return createPortal(<div className={styles.overlay} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Đóng"><Icon name="close" size={18} /></button>
      <div className={styles.phone} ref={el => { if (el) { const h = el.clientHeight; if (h && h !== height) setHeight(h); } }}>
        {height > 0 && <PhoneFrame src={preview} height={height} />}
      </div>
      <div className={styles.side}>{children}</div>
    </div>
  </div>, root);
}
/** The page at a phone's width (390 units), shrunk to the frame: the frame's inner width decides the scale. */
function PhoneFrame({ src, height }: { src: string; height: number }) {
  const [scale, setScale] = useState(0);
  return <div style={{ position: 'absolute', inset: 0 }} ref={el => { if (el) { const s = el.clientWidth / 390; if (s && Math.abs(s - scale) > .002) setScale(s); } }}>
    {scale > 0 && <iframe src={src} title="Xem trước trang" style={{ height: height / scale, transform: `scale(${scale})` }} />}
  </div>;
}

/**
 * A template chosen in the Library: it in a phone with the shop's name, and the two ways on. Either way makes the page; only
 * "Phát hành luôn" puts it live. `onboarding`: the Template step of the start (kịch bản mục 4) closes, and the next step is offered.
 */
export function TemplateSheet({ slug, name, card, pages, origin, onboarding, onClose, onMade }:
  { slug: string; name: string; card: TemplateCard; pages: number; origin: string; onboarding: boolean; onClose: () => void; onMade: () => void }) {
  const [mode, setMode] = useState<'choose' | 'edit'>('choose'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<{ kind: 'live' | 'review' | 'edit'; page: string } | null>(null);
  const make = async () => {
    const response = await post(`/api/owner/v2/${slug}/pages`, { template: card.key, label: pageLabel(pages) });
    return response?.ok ? await response.json() as { slug: string; revision: number } : null;
  };
  const finish = async (kind: 'live' | 'review' | 'edit', page: string) => {
    if (onboarding) await post(`/api/owner/v2/${slug}/onboarding`, { step: 'template', value: 'done' });
    setResult({ kind, page }); setBusy(false); onMade();
  };
  const goLive = async () => {
    setBusy(true); setError('');
    const made = await make();
    if (!made) { setBusy(false); setError('Chưa tạo được trang. Thử lại.'); return; }
    const outcome = await publish(slug, made.slug, made.revision);
    // Made but not live (a rule of the page, a lost connection): it waits in My Card with its own "Phát hành".
    if (outcome === 'error') { setBusy(false); setError('Đã tạo trang nhưng chưa phát hành được. Thử lại ở My Card.'); onMade(); return; }
    await finish(outcome, made.slug);
  };
  const askAdmin = async (message: string) => {
    setBusy(true); setError('');
    const made = await make();
    if (!made || !await askEdit(slug, made.slug, message)) { setBusy(false); setError('Chưa gửi được. Thử lại.'); if (made) onMade(); return; }
    await finish('edit', made.slug);
  };
  const preview = `/templates/${card.key}?ten=${encodeURIComponent(name)}`;
  return <Sheet label={`Mẫu ${card.name}`} onClose={onClose} preview={preview}>
    <div style={{ display: 'grid', gap: 6 }}>
      <span className="qs-pill free">Free</span>
      <h2>{card.name}</h2>
      <p className={styles.lead}>{card.about}</p>
    </div>
    {result ? <Done result={result.kind} url={`${origin}/${result.page}`} onClose={onClose}
      next={onboarding ? { label: 'Tiếp tục: bước Dashboard', href: '/bat-dau/tien-trinh' } : undefined} />
      : mode === 'choose' ? <div className={styles.choices}>
        <button type="button" className={styles.choice} data-kind="publish" disabled={busy} onClick={() => void goLive()}>
          <span className={styles.mark} aria-hidden="true">⚡</span>
          <div><strong>{busy ? 'Đang phát hành…' : 'Phát hành luôn'}</strong><span>Dùng mẫu này với tên quán và nút đánh giá Google của quán.</span></div>
          <Icon name="arrow" />
        </button>
        <button type="button" className={styles.choice} data-kind="edit" disabled={busy} onClick={() => setMode('edit')}>
          <span className={styles.mark} aria-hidden="true">🛠️</span>
          <div><strong>Nhờ admin sửa</strong><span>Thay ảnh, video, chữ, màu theo ý bạn. Admin sửa xong rồi phát hành.</span></div>
          <Icon name="arrow" />
        </button>
      </div> : <EditForm busy={busy} onSend={message => void askAdmin(message)} onBack={() => setMode('choose')} />}
    {error && <p className="qs-error" role="alert">{error}</p>}
  </Sheet>;
}

/**
 * One page of the shop, opened from Library or My Card: it as guests see it (or will), its state, and the same two ways:
 * publish what is there, or ask the admin for changes. A page already waiting for the admin can take more words.
 */
export function PageSheet({ slug, page, origin, onClose, onChanged }: { slug: string; page: PageSummary; origin: string; onClose: () => void; onChanged: () => void }) {
  const [mode, setMode] = useState<'choose' | 'edit'>('choose'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<'live' | 'review' | 'edit' | null>(null);
  const url = `${origin}/${page.slug}`;
  const canPublish = page.state !== 'closed' && page.state !== 'paused' && (page.state === 'draft' || page.unpublished)
    && page.review?.state !== 'pending' && !page.editRequest;
  const goLive = async () => {
    setBusy(true); setError('');
    const outcome = await publish(slug, page.slug, page.revision);
    setBusy(false);
    if (outcome === 'error') { setError('Chưa phát hành được. Thử lại.'); return; }
    setResult(outcome); onChanged();
  };
  const askAdmin = async (message: string) => {
    setBusy(true); setError('');
    const ok = await askEdit(slug, page.slug, message);
    setBusy(false);
    if (!ok) { setError('Chưa gửi được. Thử lại.'); return; }
    setResult('edit'); onChanged();
  };
  return <Sheet label={page.label || page.slug} onClose={onClose} preview={`/ZZZ/${slug}/thumb/${page.slug}`}>
    <div style={{ display: 'grid', gap: 8 }}>
      <StateTag page={page} />
      <h2>{page.label || 'Trang chưa đặt tên'}</h2>
      <p className="qs-small qs-muted">{url.replace(/^https?:\/\//, '')}</p>
      {page.editRequest?.message && <p className={styles.note}>Bạn đã nhắn: “{page.editRequest.message}”</p>}
      {page.review?.state === 'rejected' && page.review.reason && <p className={styles.note}>Admin nhắn: “{page.review.reason}”. Bấm “Nhờ admin sửa” để admin sửa giúp.</p>}
    </div>
    {result ? <Done result={result} url={url} onClose={onClose} />
      : mode === 'choose' ? <div className={styles.choices}>
        {canPublish && <button type="button" className={styles.choice} data-kind="publish" disabled={busy} onClick={() => void goLive()}>
          <span className={styles.mark} aria-hidden="true">⚡</span>
          <div><strong>{busy ? 'Đang phát hành…' : 'Phát hành luôn'}</strong><span>{page.state === 'active' ? 'Đưa bản mới nhất lên cho khách.' : 'Đưa trang này lên mạng ngay.'}</span></div>
          <Icon name="arrow" />
        </button>}
        {page.state === 'active' && !canPublish && <a className={styles.choice} data-kind="publish" href={url} target="_blank" rel="noreferrer">
          <span className={styles.mark} aria-hidden="true">👀</span>
          <div><strong>Mở trang</strong><span>Xem trang như khách đang thấy.</span></div>
          <Icon name="external" />
        </a>}
        {page.state !== 'closed' && <button type="button" className={styles.choice} data-kind="edit" disabled={busy} onClick={() => setMode('edit')}>
          <span className={styles.mark} aria-hidden="true">🛠️</span>
          <div><strong>{page.editRequest ? 'Gửi thêm ý cho admin' : 'Nhờ admin sửa'}</strong>
            <span>{page.editRequest ? 'Admin đang sửa trang này. Muốn thêm gì, ghi vào đây.' : 'Thay ảnh, video, chữ, màu. Admin sửa xong rồi phát hành.'}</span></div>
          <Icon name="arrow" />
        </button>}
        {page.state === 'paused' && <p className="qs-small qs-muted">Trang đang tạm dừng. Mở lại ở tab Quản lý.</p>}
      </div> : <EditForm busy={busy} onSend={message => void askAdmin(message)} onBack={() => setMode('choose')} />}
    {error && <p className="qs-error" role="alert">{error}</p>}
  </Sheet>;
}
