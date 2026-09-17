'use client';
/* eslint-disable @next/next/no-img-element -- media URLs are shop-configured https or built-in paths; next/image would need every host listed in advance. */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { copy, topics, type Language, type Topic } from '@/lib/copy';
import { defaultConfig, STEM_BACKGROUND, type LinkIcon, type MediaRef } from '@/lib/publishing/config';
import { burstConfetti } from './confetti';
import './guest-page.css';
import { documentFeedbackService, type DocumentFeedbackService } from '@/lib/client/document-feedback-service';
import { useDocumentFeedback } from '@/lib/client/use-document-feedback';
import type { CoordinatorResult } from '@/lib/client/visit-coordinator';
import { normalizeFeedback } from '@/lib/domain/private-feedback';

import type { RenderBinding } from '@/lib/client/visit-fetch-transport';
import type { PageConfig } from '@/lib/publishing/config';
type Props = { render?: RenderBinding; pageConfig?: PageConfig; slug: string; name: string; googleUrl: string | null; heroUrl: string | null; heroKind: 'image' | 'video' | null };
const messages = {
  vi: {
    loading: 'Đang kết nối…', ready: 'Bạn có thể chọn sao để chia sẻ trải nghiệm.',
    saving: 'Đang lưu. Vui lòng giữ trang mở.', saved: 'Đã lưu trên máy chủ.',
    feedbackSaved: 'Đã gửi góp ý riêng. Nội dung đã được xóa khỏi ô nhập.',
    pending: 'Chưa xác nhận lưu. Giữ trang mở và thử lại để kiểm tra đúng lần gửi này.',
    conflict: 'Đánh giá đã thay đổi ở lần thao tác khác. Đã cập nhật sao hiện tại; hãy kiểm tra rồi chọn hoặc gửi lại.',
    expired: 'Phiên đã hết hạn. Hãy chọn sao lại để bắt đầu phiên mới; góp ý cũ chưa được gửi lại.',
    unavailable: 'Chưa kết nối được. Bạn có thể tải lại trang để thử lại.',
    waiting: 'Chờ thao tác hiện tại được xác nhận trước khi gửi góp ý.',
    recovery: 'Hãy thử lại thao tác đang chờ trước khi tiếp tục.',
    changed: 'Trang vừa được mở lại. Thao tác chờ chưa được chuyển sang lần mở mới; hãy kiểm tra trước khi gửi tiếp.',
    invalid: 'Góp ý cần từ 1 đến 2.000 ký tự văn bản hợp lệ.', retry: 'Thử lại lần gửi', retryOpen: 'Thử kết nối lại',
  },
  en: {
    loading: 'Connecting…', ready: 'Choose a star rating to share your experience.',
    saving: 'Saving. Please keep this page open.', saved: 'Saved on the server.',
    feedbackSaved: 'Private feedback sent. The text has been cleared from the form.',
    pending: 'Save not confirmed. Keep this page open and retry to check this same submission.',
    conflict: 'The rating changed in another action. The current stars are now shown; review them before choosing or submitting again.',
    expired: 'This session expired. Choose stars again to start a new session; previous feedback has not been resubmitted.',
    unavailable: 'Could not connect. You can reload this page to try again.',
    waiting: 'Wait for the current action to be confirmed before sending feedback.',
    recovery: 'Retry the pending action before continuing.',
    changed: 'The page reopened. Queued actions were not moved to this opening; review before submitting again.',
    invalid: 'Feedback needs 1 to 2,000 valid text characters.', retry: 'Retry submission', retryOpen: 'Retry connection',
  },
} as const;
type MessageKey = keyof typeof messages.vi;
const pageCopy = {
  vi: { google: 'Đánh giá trên Google', poster: 'POSTER SỰ KIỆN', thanksTitle: 'Cảm ơn bạn đã góp ý!', thanksBody: 'Góp ý đã được gửi riêng cho quản lý.', close: 'Đóng', links: 'Kết nối với shop' },
  en: { google: 'Review us on Google', poster: 'EVENT POSTER', thanksTitle: 'Thank you for your feedback!', thanksBody: 'Your feedback went privately to the manager.', close: 'Close', links: 'Connect with the shop' },
} as const;
const THANKS_MS = 2800;

const noop = () => () => {};
function subscribeReducedMotion(change: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', change);
  return () => query.removeEventListener('change', change);
}
function useReducedMotion() {
  return useSyncExternalStore(typeof window === 'undefined' ? noop : subscribeReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => false);
}

/** Built-in videos have a matching still for Low Power Mode and reduced motion; uploaded videos fall back to colour. */
const stillFor = (media: MediaRef) => media.kind === 'image' ? media.url : media.url === STEM_BACKGROUND.video ? STEM_BACKGROUND.still : null;

function Background({ config, reduced }: { config: ReturnType<typeof defaultConfig>; reduced: boolean }) {
  const b = config.background;
  const style = b.kind === 'solid' ? { background: b.color }
    : b.kind === 'gradient' ? { background: `linear-gradient(${b.angle}deg, ${b.colors[0]}, ${b.colors[1]})` } : undefined;
  const still = b.kind === 'media' ? stillFor(b.media) : null;
  return <div className="guest-bg" style={style} aria-hidden="true">
    {still && <img className="guest-bg-media" src={still} alt="" />}
    {b.kind === 'media' && b.media.kind === 'video' && !reduced &&
      <video className="guest-bg-media" src={b.media.url} poster={still ?? undefined} autoPlay muted loop={b.loop} playsInline preload="auto" />}
    {config.watermark.enabled && <div className="guest-watermark">
      <div className="guest-watermark-track">{Array.from({ length: 48 }, (_, i) => <span key={i}>{config.watermark.text}</span>)}</div>
    </div>}
  </div>;
}

function Poster({ poster, label }: { poster: MediaRef | null; label: string }) {
  if (!poster) return <div className="guest-poster guest-poster-empty"><span>{label}</span></div>;
  return poster.kind === 'video'
    ? <video className="guest-poster" src={poster.url} autoPlay muted loop playsInline preload="metadata" aria-hidden="true" />
    : <img className="guest-poster" src={poster.url} alt="" />;
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] ?? '').join('').toUpperCase();

const ICON_PATHS: Record<LinkIcon, string> = {
  instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.5-1.5h.01',
  facebook: 'M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v7h4v-7h3l1-4h-4V8Z',
  zalo: 'M4 5h16v11H9l-4 3v-3H4V5Zm4 3h5l-5 5h5',
  phone: 'M6 3h3l2 5-2 1a11 11 0 0 0 6 6l1-2 5 2v3a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2Z',
  booking: 'M4 6h16v14H4V6Zm0 4h16M8 3v5m8-5v5',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1m2 4a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
};
function LinkGlyph({ icon }: { icon: LinkIcon }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICON_PATHS[icon]} /></svg>;
}
function GoogleMark() {
  return <svg className="google-mark" viewBox="0 0 48 48" width="22" height="22" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5Z"/>
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6Z"/>
    <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1Z"/>
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48Z"/>
  </svg>;
}

function resultMessage(result: CoordinatorResult | null | undefined): MessageKey | null {
  if (!result) return null;
  if (result.kind === 'saved') return result.mutation === 'feedback' ? 'feedbackSaved' : 'saved';
  if (result.kind === 'conflict') return 'conflict';
  if (result.kind === 'pending') return 'pending';
  if (result.kind === 'error') {
    if (result.code === 'SESSION_EXPIRED') return 'expired';
    if (result.code === 'INVALID_INPUT') return 'invalid';
    if (['RATING_RECOVERY_REQUIRED', 'REVISION_RECONCILIATION_REQUIRED'].includes(result.code)) return 'recovery';
    return 'unavailable';
  }
  return null;
}

export default function ShopFeedbackV2(shop: Props) {
  const [lang, setLang] = useState<Language>('vi'); const t = copy[lang], m = messages[lang];
  const question = shop.pageConfig?.text.question[lang] ?? t.question;
  const [service, setService] = useState<DocumentFeedbackService | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  // Initialize after hydration. StrictMode/remount resolves the same document-owned service.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try { setService(documentFeedbackService(window, { shop: shop.slug, ...(shop.render ? { render: shop.render } : {}) })); }
      catch { setUnavailable(true); }
    });
    return () => { active = false; };
  }, [shop.slug, shop.render]);
  const client = useDocumentFeedback(service);
  const state = client.state?.queue.coordinator, current = state?.current;
  const snapshot = current?.snapshot, mutation = state?.mutation;
  const opening = state?.opens.find(entry => entry.event.loadKey === current?.event.loadKey);
  const [selection, setSelection] = useState<{ loadKey: string; score: number } | null>(null);
  const [message, setMessage] = useState(''); const [topic, setTopic] = useState<Topic>('other');
  const [open, setOpen] = useState(false); const [pulse, setPulse] = useState(0);
  const [validationState, setValidationState] = useState<{ key: MessageKey; loadKey?: string } | null>(null);
  const validation = validationState?.loadKey === current?.event.loadKey ? validationState?.key : null;
  function setValidation(key: MessageKey | null) {
    setValidationState(key ? { key, loadKey: current?.event.loadKey } : null);
  }
  const submitted = useRef(false);
  const reduced = useReducedMotion();
  const p = pageCopy[lang];
  const config = shop.pageConfig ?? { ...defaultConfig(shop.name),
    poster: shop.heroUrl && shop.heroKind ? { kind: shop.heroKind, url: shop.heroUrl } : null };
  const googleRef = useRef<HTMLAnchorElement & HTMLButtonElement>(null);
  const panelRef = useRef<HTMLFormElement>(null), triggerRef = useRef<HTMLButtonElement>(null), starsRef = useRef<HTMLDivElement>(null), actionsRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [reveal, setReveal] = useState(0);
  const [thanks, setThanks] = useState(0);
  // A low score opens the panel and scrolls just enough to show it, never so far that the Google button leaves the screen.
  useEffect(() => {
    if (!reveal) return;
    const google = googleRef.current?.getBoundingClientRect(), panel = panelRef.current?.getBoundingClientRect();
    if (!google || !panel) return;
    const view = window.innerHeight, margin = 12;
    const showPanel = Math.min(panel.bottom - view + margin, google.top - margin);
    const keepGoogle = google.bottom - view + margin;
    const delta = Math.max(showPanel, keepGoogle);
    if (delta > 0) window.scrollBy({ top: delta, behavior: reduced ? 'auto' : 'smooth' });
  }, [reveal, reduced]);
  // Tapping outside the panel folds it back into its button. Stars, the button itself and the status/retry area do not count.
  useEffect(() => {
    if (!open) return;
    const fold = (event: PointerEvent) => {
      const target = event.target as Node;
      if ([panelRef, triggerRef, starsRef, actionsRef].some(ref => ref.current?.contains(target))) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', fold);
    return () => document.removeEventListener('pointerdown', fold);
  }, [open]);
  useEffect(() => {
    if (!thanks) return;
    if (!reduced && mainRef.current) burstConfetti(mainRef.current);
    const close = () => setThanks(0);
    const timer = window.setTimeout(close, THANKS_MS);
    document.addEventListener('pointerdown', close);
    return () => { window.clearTimeout(timer); document.removeEventListener('pointerdown', close); };
    // Confetti fires once per thank-you, not again when the motion preference changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thanks]);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const busy = !!mutation?.running || !!mutation?.pending || !!client.state?.actionsRunning;
  const crossContext = !!mutation?.pending && mutation.pending.loadKey !== current?.event.loadKey;
  const rating = busy && selection && selection.loadKey === current?.event.loadKey ? selection.score : snapshot?.experience?.rating ?? 0;
  const disabledStars = !snapshot || !!opening?.running || sendingFeedback || crossContext || mutation?.pending?.phase === 'refresh';
  const canSend = !!snapshot && snapshot.session.active && !busy && !opening?.running && !sendingFeedback;
  const feedbackLocked = sendingFeedback || mutation?.pending?.kind === 'feedback';
  const completed = mutation?.result;
  const resultHere = completed && 'snapshot' in completed && completed.snapshot.visit.id === snapshot?.visit.id ? completed : null;
  let status: MessageKey = validation ?? resultMessage(resultHere) ?? 'ready';
  if (!validation) {
    if (unavailable) status = 'unavailable';
    else if (!snapshot) status = opening?.running || !opening ? 'loading' : resultMessage(opening.result) ?? 'unavailable';
    else if (!snapshot.session.active) status = 'expired';
    else if (mutation?.running || opening?.running) status = 'saving';
    else if (mutation?.pending) status = 'pending';
    else if (state?.notice) status = state.notice === 'DESIRED_CONTEXT_CHANGED' ? 'changed' : 'conflict';
  }
  function accept(result: CoordinatorResult) {
    if (result.kind === 'saved' && result.mutation === 'feedback') {
      setMessage(''); setTopic('other'); submitted.current = false; setSendingFeedback(false); setThanks(n => n + 1);
    } else if (result.kind !== 'pending') {
      submitted.current = false; setSendingFeedback(false);
    }
    if (result.kind === 'error') setValidation(resultMessage(result));
  }
  function rate(score: number) {
    if (disabledStars || !current) return;
    setValidation(null); setSelection({ loadKey: current.event.loadKey, score });
    if (score <= 3) { setOpen(true); setPulse(value => value + 1); setReveal(value => value + 1); } else setPulse(0);
    void client.rate(score).then(accept);
  }
  function send() {
    // A disabled submit is explained inline; guard same-tick double clicks as well.
    if (!canSend || submitted.current) return;
    if (!normalizeFeedback(topic, message)) { setValidation('invalid'); return; }
    submitted.current = true; setSendingFeedback(true); setValidation(null);
    void client.feedback(topic, message).then(accept);
  }
  const links = config.links;
  return <main ref={mainRef} className="guest" lang={lang} data-layout={config.layout} data-schema={config.schemaVersion}>
    <Background config={config} reduced={reduced} />
    <article className="guest-sheet">
      <div className="guest-language"><label htmlFor="language">Ngôn ngữ / Language</label><select id="language" value={lang} onChange={e => setLang(e.target.value as Language)}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></div>
      <Poster poster={config.poster} label={p.poster} />
      <div className="guest-logo">{config.logo ? <img src={config.logo.url} alt="" /> : <span aria-hidden="true">{initials(config.name)}</span>}</div>
      <div className="guest-body">
        <h1>{shop.name}</h1><p className="question">{question}</p>
        <div ref={starsRef} className="stars guest-stars" role="group" aria-label={question}>{[1, 2, 3, 4, 5].map(n => <button key={n} disabled={disabledStars} aria-label={`${n} ${t.stars}`} aria-pressed={rating === n} data-filled={n <= rating} onClick={() => rate(n)}>★</button>)}</div>
        <p className="rating-receipt">{snapshot?.experience?.rating ? `${m.saved} ${snapshot.experience.rating}/5` : '\u00a0'}</p>
        <section className="google-invitation"><p>{t.invite}</p>
          {shop.googleUrl
            ? <a ref={googleRef} className="google-button" data-google href={shop.googleUrl} target="_blank" rel="noopener noreferrer"><GoogleMark /><span>{p.google}</span></a>
            : <button ref={googleRef} className="google-button" data-google disabled><GoogleMark /><span>{p.google}</span></button>}
          <p className="guest-note">{t.thanks}</p></section>
        <button ref={triggerRef} id="private-feedback" className={`feedback-trigger${rating > 0 && rating <= 3 ? ' needs-attention' : ''}`} aria-expanded={open} aria-controls="private-form" onClick={() => { setOpen(!open); setPulse(0); }}><span key={pulse} className={`pulse-fill${pulse ? '' : ' idle'}`} aria-hidden="true" /><span className="trigger-label">{t.private}<span aria-hidden="true">{open ? '−' : '+'}</span></span></button>
        {open && <form ref={panelRef} id="private-form" className="guest-panel" onSubmit={e => { e.preventDefault(); send(); }}>
          <p className="guest-note">{t.privateNote}</p><label htmlFor="topic">{t.topic}</label><select id="topic" disabled={feedbackLocked} value={topic} onChange={e => setTopic(e.target.value as Topic)}>{topics.map(key => <option key={key} value={key}>{t[key]}</option>)}</select>
          <label htmlFor="message">{t.message}</label><textarea id="message" rows={4} required disabled={feedbackLocked} value={message} placeholder={t.placeholder} onChange={e => { setMessage(e.target.value); setValidation(null); }} />
          {!canSend && <p id="feedback-wait" className="guest-note">{!snapshot ? m.loading : !snapshot.session.active ? m.expired : m.waiting}</p>}
          <button className="guest-send" disabled={!canSend} aria-describedby={!canSend ? 'feedback-wait' : undefined}>{t.send}</button>
        </form>}
        <div ref={actionsRef}><p role="status" className="guest-status">{m[status]}</p>
        {mutation?.pending && !mutation.running && <button className="guest-send" onClick={() => { setValidation(null); void client.retry().then(accept); }}>{m.retry}</button>}
        {state?.opens.filter(entry => entry.result?.kind === 'pending' && !entry.running).map((entry, index) => <button key={entry.event.loadKey} className="guest-send" onClick={() => { setValidation(null); void client.retryOpen(entry.event.loadKey); }}>{m.retryOpen}{index > 0 ? ` (${index + 1})` : ''}</button>)}</div>
        {links.length > 0 && <nav className="guest-links" aria-label={p.links}>{links.map(link => <a key={`${link.icon}:${link.url}`} href={link.url} data-icon={link.icon}
          {...(link.url.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}><LinkGlyph icon={link.icon} /><span>{link.label[lang]}</span></a>)}</nav>}
      </div>
    </article>
    {thanks > 0 && <div className="guest-thanks-layer"><div key={thanks} className="guest-thanks" role="dialog" aria-labelledby="thanks-title" data-thanks>
      <p id="thanks-title">{p.thanksTitle}</p><p>{p.thanksBody}</p><button type="button" onClick={() => setThanks(0)}>{p.close}</button>
    </div></div>}
  </main>;
}
