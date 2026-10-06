'use client';
/**
 * Trang của quán (Tài 06/10): một mẫu chỉ là bố cục; trang thật phải khớp quán — link, chữ trên nút, wifi, ảnh — nên mọi
 * trang đi qua Admin Tài. Chủ quán chọn mẫu, để lại số Zalo, rồi theo dõi ba bước: đã gửi → Admin Tài đang chỉnh → đang chạy.
 * Không có nút phát hành phía chủ quán. Library và My Card dùng chung các mảnh ở đây.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TemplateCard } from '@/lib/canvas/templates';
import type { PageSummary } from '@/lib/owner/pages';
import { vnPhone } from '@/lib/shop/profile';
import { ZALO } from '@/lib/contact';
import Icon from '../icons';
import styles from './pages.module.css';

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
const spaced = (phone: string) => phone.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');

export function usePages(slug: string) {
  const [pages, setPages] = useState<PageSummary[] | null>(null), [contact, setContact] = useState('');
  const load = useCallback(async () => {
    const response = await fetch(`/api/owner/v2/${slug}/pages`, { cache: 'no-store' }).catch(() => null);
    const body = response?.ok ? await response.json() : null;
    setPages(body?.pages ?? []); if (body?.contact) setContact(body.contact);
  }, [slug]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return { pages, contact, reload: load };
}

/** Where a page stands, in a few words, and how it reads (green: guests see it; amber: Tài is on it; red: stopped). */
export function pageState(page: PageSummary): { text: string; tone: 'live' | 'wait' | 'stop' | 'idle' } {
  if (page.state === 'closed') return { text: 'Đã đóng', tone: 'stop' };
  if (page.state === 'paused') return { text: 'Tạm dừng', tone: 'stop' };
  if (page.request) return page.request.contacted ? { text: 'Admin đang chỉnh', tone: 'wait' } : { text: 'Chờ Admin Tài', tone: 'wait' };
  if (page.state === 'active') return { text: 'Đang chạy', tone: 'live' };
  return { text: 'Chưa phát hành', tone: 'idle' };
}
export function StateTag({ page }: { page: PageSummary }) {
  const state = pageState(page);
  return <span className={styles.state} data-tone={state.tone} data-page-state={state.text}>{state.text}</span>;
}

/** The three steps every page goes through, the current one lit: picked → Tài matching it to the shop → live. */
export function Steps({ at }: { at: 1 | 2 | 3 }) {
  const steps = ['Bạn chọn mẫu', 'Admin Tài nhắn Zalo, khớp mẫu với quán', 'Trang lên mạng'];
  return <ol className={styles.steps} aria-label="Các bước">{steps.map((text, i) => <li key={text} data-done={i + 1 < at || undefined} data-now={i + 1 === at || undefined}>
    <span className={styles.stepDot} aria-hidden="true">{i + 1 < at ? <Icon name="check" size={14} /> : i + 1}</span>{text}</li>)}</ol>;
}

/** Why a template cannot simply go live: said once, plainly, where the shop decides (Tài 06/10). */
function WhyAdmin() {
  return <div className={styles.why}>
    <span className={styles.whyMark} aria-hidden="true"><Icon name="sparkle" size={20} /></span>
    <div><b>Mẫu cần khớp với quán của bạn</b>
      <p>Link Zalo, Facebook, số điện thoại, wifi, ảnh, logo, chữ trên từng nút… phải đúng của quán. Vì vậy Admin Tài sẽ nhắn Zalo lấy
        thông tin, chỉnh theo ý bạn rồi phát hành — bạn không cần tự làm gì.</p></div>
  </div>;
}

/**
 * The shop's Zalo (Tài messages it) and a note; the number the shop left last time is already there. The one button sits outside
 * the fields, on a band pinned to the foot of the sheet that the rest scrolls under, so it is in sight from the first screen on a
 * phone; a failed send says so just above it.
 */
function RequestForm({ contact, busy, cta, note, error, onSend }:
  { contact: string; busy: boolean; cta: string; note: string; error: string; onSend: (contact: string, message: string) => void }) {
  const [phone, setPhone] = useState(contact ? spaced(contact) : ''), [message, setMessage] = useState(''), [tried, setTried] = useState(false);
  const valid = vnPhone(phone), id = useId(), field = useRef<HTMLInputElement>(null);
  // A wrong number with the field out of sight (the button is pinned below): bring the field to the eye and the cursor into it.
  const submit = (event: React.FormEvent) => { event.preventDefault(); setTried(true); if (valid) onSend(valid, message); else field.current?.focus(); };
  return <><form id={id} className={styles.form} data-request-form onSubmit={submit}>
    <label className="qs-field">Số Zalo của bạn
      <input ref={field} className="qs-input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="0912 345 678"
        aria-invalid={tried && !valid ? true : undefined} required />
      <small>{tried && !valid ? <span className="qs-error">Số điện thoại Việt Nam, 10 số (vd 0912 345 678).</span> : 'Admin Tài nhắn bạn qua số này. Chỉ dùng để dựng trang.'}</small>
    </label>
    <label className="qs-field">{note}<small>Không bắt buộc — nói chuyện tiếp trên Zalo cũng được.</small>
      <textarea value={message} maxLength={1000} rows={3} onChange={event => setMessage(event.target.value)}
        placeholder="Ví dụ: quán cà phê muối, màu chủ đạo xanh lá, có wifi riêng cho khách…" /></label>
  </form>
  <div className={styles.ctaBar}>
    {error && <p className="qs-error" role="alert">{error}</p>}
    <button type="submit" form={id} className="qs-btn" disabled={busy}><Icon name="send" size={18} /> {busy ? 'Đang gửi…' : cta}</button>
  </div></>;
}

/** Sent: what happens next, and the quickest way to start it -- messaging Tài with the page's code. */
function Sent({ code, contact, onClose, next }: { code: string; contact: string; onClose: () => void; next?: { label: string; href: string } }) {
  const [copied, setCopied] = useState(false);
  return <div className={styles.sent} role="status" data-sent={code}>
    <span className={styles.sentMark} aria-hidden="true"><Icon name="check" size={26} /></span>
    <strong>Đã gửi cho Admin Tài</strong>
    <p className="qs-muted">Admin Tài sẽ nhắn Zalo cho bạn qua số {spaced(contact)} để lấy thông tin quán. Trang lên mạng ngay khi chỉnh xong.</p>
    <Steps at={2} />
    <div className={styles.zalo}>
      <span className={styles.zaloMark} aria-hidden="true">Zalo</span>
      <div><b>Muốn nhanh hơn? Nhắn Admin Tài ngay</b><small>{ZALO.number} · gửi kèm mã trang <code>{code}</code></small></div>
      <div className={styles.zaloActions}>
        <a className="qs-btn small" href={ZALO.url} target="_blank" rel="noreferrer">Mở Zalo</a>
        <button type="button" className="qs-btn ghost small" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); } catch { /* the code is shown */ } }}>
          {copied ? 'Đã chép mã' : 'Chép mã'}</button>
      </div>
    </div>
    {next ? <a className="qs-btn" href={next.href}>{next.label} <Icon name="arrow" size={18} /></a> : <button type="button" className="qs-btn" onClick={onClose}>Xong</button>}
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
 * A template chosen in the Library: it in a phone with the shop's name, why Tài makes it the shop's, and one way on -- leave a
 * Zalo and ask him to build it. A shop that has pages says which one takes the new look, or that it is a new page; a page live
 * today stays as it is until Tài publishes the new one. `onboarding`: the Template step of the start (kịch bản mục 4) closes.
 */
export function TemplateSheet({ slug, name, card, pages, contact, onboarding, preferred, onClose, onMade }:
  { slug: string; name: string; card: TemplateCard; pages: PageSummary[]; contact: string; onboarding: boolean;
    /** The page the owner came from with "Đổi sang mẫu khác": it takes the look unless they choose otherwise. */
    preferred?: string | null; onClose: () => void; onMade: () => void }) {
  const open = pages.filter(page => page.state !== 'closed');
  const [target, setTarget] = useState<string>(open.find(page => page.slug === preferred)?.slug ?? open[0]?.slug ?? '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [sent, setSent] = useState<{ code: string; contact: string } | null>(null);
  const send = async (phone: string, message: string) => {
    setBusy(true); setError('');
    const response = await post(`/api/owner/v2/${slug}/edit-requests`, { ...(target ? { page: target } : {}), template: card.key, contact: phone, message });
    if (!response?.ok) {
      const code = (await response?.json().catch(() => null))?.error;
      setBusy(false); setError(code === 'OWNER_ROLE_REQUIRED' ? 'Chỉ chủ quán tạo được trang mới. Chọn một trang có sẵn để đổi giao diện.' : 'Chưa gửi được. Thử lại.'); return;
    }
    if (onboarding) await post(`/api/owner/v2/${slug}/onboarding`, { step: 'template', value: 'done' });
    setSent({ code: (await response.json()).page, contact: phone }); setBusy(false); onMade();
  };
  return <Sheet label={`Mẫu ${card.name}`} onClose={onClose} preview={`/templates/${card.key}?ten=${encodeURIComponent(name)}`}>
    <div style={{ display: 'grid', gap: 6 }}>
      <span className="qs-pill free">Free</span>
      <h2>{card.name}</h2>
      <p className={styles.lead}>{card.about}</p>
    </div>
    {sent ? <Sent code={sent.code} contact={sent.contact} onClose={onClose}
      next={onboarding ? { label: 'Tiếp tục: bước Dashboard', href: '/bat-dau/tien-trinh' } : undefined} /> : <>
      <WhyAdmin />
      {open.length > 0 && <fieldset className={styles.targets}>
        <legend>Dùng mẫu này cho</legend>
        {open.map(page => <label key={page.slug} className={styles.target}>
          <input type="radio" name="target" checked={target === page.slug} onChange={() => setTarget(page.slug)} />
          <span><b>Đổi giao diện “{page.label || page.slug}”</b><small>{page.state === 'active' ? 'Trang đang chạy giữ nguyên tới khi Admin Tài phát hành bản mới.' : `/${page.slug}`}</small></span>
        </label>)}
        <label className={styles.target}>
          <input type="radio" name="target" checked={target === ''} onChange={() => setTarget('')} />
          <span><b>Một trang mới</b><small>Link riêng, thẻ NFC riêng.</small></span>
        </label>
      </fieldset>}
      <RequestForm contact={contact} busy={busy} cta="Nhờ Admin Tài dựng trang này" note="Ghi chú cho Admin Tài" error={error}
        onSend={(phone, message) => void send(phone, message)} />
    </>}
  </Sheet>;
}

/**
 * One page of the shop, opened from Library or My Card: it as guests see it (or, while Tài works on it, the template picked),
 * where it stands among the three steps, and what the shop can do -- open it, ask Tài for changes or add to what it asked, or
 * pick another template for it.
 */
export function PageSheet({ slug, page, contact, origin, onClose, onChanged, onPickTemplate }:
  { slug: string; page: PageSummary; contact: string; origin: string; onClose: () => void; onChanged: () => void; onPickTemplate: () => void }) {
  const [asking, setAsking] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [sent, setSent] = useState<{ contact: string } | null>(null);
  const url = `${origin}/${page.slug}`, live = page.state === 'active';
  const send = async (phone: string, message: string) => {
    setBusy(true); setError('');
    const response = await post(`/api/owner/v2/${slug}/edit-requests`, { page: page.slug, contact: phone, message });
    setBusy(false);
    if (!response?.ok) { setError('Chưa gửi được. Thử lại.'); return; }
    setSent({ contact: phone }); onChanged();
  };
  return <Sheet label={page.label || page.slug} onClose={onClose} preview={`/ZZZ/${slug}/thumb/${page.slug}`}>
    <div style={{ display: 'grid', gap: 8 }}>
      <StateTag page={page} />
      <h2>{page.label || 'Trang chưa đặt tên'}</h2>
      <p className="qs-small qs-muted">{url.replace(/^https?:\/\//, '')}</p>
    </div>
    {sent ? <Sent code={page.slug} contact={sent.contact} onClose={onClose} /> : <>
      {page.request && <>
        <Steps at={2} />
        {page.request.message && <p className={styles.note}>Bạn đã nhắn: “{page.request.message}”</p>}
        {live && <p className="qs-small qs-muted">Trang đang chạy giữ nguyên tới khi Admin Tài phát hành bản mới.</p>}
      </>}
      {asking ? <RequestForm contact={contact} busy={busy} cta={page.request ? 'Gửi thêm cho Admin Tài' : 'Nhờ Admin Tài chỉnh trang này'}
        note={page.request ? 'Bạn muốn thêm gì?' : 'Bạn muốn chỉnh gì?'} error={error} onSend={(phone, message) => void send(phone, message)} />
        : <div className={styles.choices}>
          {live && <a className={styles.choice} data-kind="primary" href={url} target="_blank" rel="noreferrer">
            <span className={styles.mark} aria-hidden="true"><Icon name="eye" size={22} /></span>
            <div><strong>Mở trang</strong><span>Xem trang như khách đang thấy.</span></div>
            <Icon name="external" />
          </a>}
          {page.state !== 'closed' && <button type="button" className={styles.choice} data-kind={live ? undefined : 'primary'} onClick={() => setAsking(true)}>
            <span className={styles.mark} aria-hidden="true"><Icon name="send" size={22} /></span>
            <div><strong>{page.request ? 'Gửi thêm ghi chú cho Admin Tài' : 'Nhờ Admin Tài chỉnh trang này'}</strong>
              <span>{page.request ? 'Admin Tài đang lo trang này. Muốn thêm gì, ghi vào đây.' : 'Đổi link, chữ, ảnh, màu… Admin Tài chỉnh rồi phát hành.'}</span></div>
            <Icon name="arrow" />
          </button>}
          {page.state !== 'closed' && <button type="button" className={styles.choice} onClick={onPickTemplate}>
            <span className={styles.mark} aria-hidden="true"><Icon name="template" size={22} /></span>
            <div><strong>Đổi sang mẫu khác</strong><span>Chọn mẫu trong Library cho trang này.</span></div>
            <Icon name="arrow" />
          </button>}
          {page.request && <a className={styles.choice} href={ZALO.url} target="_blank" rel="noreferrer">
            <span className={styles.mark} aria-hidden="true">Zalo</span>
            <div><strong>Nhắn Admin Tài</strong><span>{ZALO.number} · mã trang <code>{page.slug}</code></span></div>
            <Icon name="external" />
          </a>}
          {page.state === 'paused' && <p className="qs-small qs-muted">Trang đang tạm dừng. Mở lại ở tab Quản lý.</p>}
        </div>}
    </>}
  </Sheet>;
}

/** The way a page comes to be, shown above the templates: nobody wonders what picking one will do. */
export function HowItWorks() {
  return <div className={styles.how} data-how-it-works>
    <Steps at={1} />
  </div>;
}
