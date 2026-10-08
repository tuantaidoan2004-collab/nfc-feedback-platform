'use client';
/**
 * Lõi của trang khách, dùng chung cho mọi trang canvas (đợt ②): lượt ghé, các sự kiện hành vi, nút Google (link của quán,
 * ghi lượt bấm, lời cảm ơn trước Google), thẻ góp ý riêng (sao + lời nhắn + số gọi lại), xoá dữ liệu của tôi, và ngôn ngữ.
 * Logic chuyển nguyên từ trang khách cũ (shop-feedback-v2.tsx, lát B3) — chỉ vỏ đổi: trang canvas vẽ các nút, lõi lo việc.
 *
 * Ba chế độ: `live` (trang thật, có lượt ghé), `demo` (xem thử template: không ghi gì, Google không mở), `still` (ảnh thu
 * nhỏ: không ghi gì, không chuyển động).
 */
import Link from 'next/link';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { copy, topics, type Language, type Topic } from '@/lib/copy';
import { FACES } from '@/lib/faces';
import { burstConfetti } from '../confetti';
import { documentFeedbackService, type DocumentFeedbackService } from '@/lib/client/document-feedback-service';
import { useDocumentFeedback } from '@/lib/client/use-document-feedback';
import type { CoordinatorResult } from '@/lib/client/visit-coordinator';
import { normalizeFeedback, normalizePhone } from '@/lib/domain/private-feedback';
import type { RenderBinding } from '@/lib/client/visit-fetch-transport';
import type { GuestEventName } from '@/lib/client/page-events';
import { THANKS_COPY, ThanksCard, useThanks } from '../effects/thanks';
import '../effects/effects.css';
import './plane.css';

export type GuestMode = 'live' | 'demo' | 'still';
type EraseResult = { kind: 'erased' | 'nothing' | 'error' };
export type Guest = {
  mode: GuestMode; lang: Language; setLang: (lang: Language) => void; reduced: boolean;
  google: { href: string | null; target?: string; rel?: string; onClick: (event: MouseEvent<HTMLAnchorElement>) => void };
  openFeedback: () => void; feedbackOpen: boolean;
  event: (name: GuestEventName, detail?: Record<string, string | number | boolean>) => void;
  erase: () => Promise<EraseResult>; ready: boolean;
};
const GuestContext = createContext<Guest | null>(null);
/** The guest's session where there is one (a live page); null in the editor and in still pictures. */
export const useGuestIfAny = (): Guest | null => useContext(GuestContext);
export function useGuest(): Guest {
  const guest = useContext(GuestContext);
  if (!guest) throw new Error('useGuest outside GuestCore');
  return guest;
}

const messages = {
  vi: {
    loading: 'Đang kết nối…', ready: 'Chọn sao, viết góp ý, hoặc cả hai.', saving: 'Đang gửi. Vui lòng giữ trang mở.', saved: 'Đã gửi.',
    pending: 'Chưa xác nhận đã gửi. Giữ trang mở và thử lại để kiểm tra đúng lần gửi này.',
    conflict: 'Đánh giá đã thay đổi ở lần thao tác khác. Đã cập nhật sao hiện tại; hãy kiểm tra rồi gửi lại.',
    expired: 'Phiên đã hết hạn. Chọn sao rồi bấm Gửi để bắt đầu phiên mới; góp ý chưa được gửi.',
    unavailable: 'Chưa kết nối được. Bạn có thể tải lại trang để thử lại.', waiting: 'Chờ thao tác hiện tại được xác nhận trước khi gửi.',
    recovery: 'Hãy thử lại thao tác đang chờ trước khi tiếp tục.',
    changed: 'Trang vừa được mở lại. Thao tác chờ chưa được chuyển sang lần mở mới; hãy kiểm tra trước khi gửi tiếp.',
    empty: 'Hãy chọn sao hoặc viết vài dòng trước khi gửi.', phoneNeedsText: 'Hãy viết vài dòng để quản lý biết cần gọi lại về việc gì.',
    phoneInvalid: 'Số điện thoại cần 8 đến 15 chữ số.', invalid: 'Góp ý cần từ 1 đến 2.000 ký tự văn bản hợp lệ.',
    retry: 'Thử lại lần gửi', retryOpen: 'Thử kết nối lại', demo: 'Bản xem thử — trang thật sẽ gửi góp ý cho quán.',
  },
  en: {
    loading: 'Connecting…', ready: 'Choose stars, write feedback, or both.', saving: 'Sending. Please keep this page open.', saved: 'Sent.',
    pending: 'Not confirmed yet. Keep this page open and retry to check this same submission.',
    conflict: 'The rating changed in another action. The current stars are now shown; review them and send again.',
    expired: 'This session expired. Choose stars and press Send to start a new session; your feedback was not sent.',
    unavailable: 'Could not connect. You can reload this page to try again.', waiting: 'Wait for the current action to be confirmed before sending.',
    recovery: 'Retry the pending action before continuing.',
    changed: 'The page reopened. Queued actions were not moved to this opening; review before submitting again.',
    empty: 'Choose stars or write a few words before sending.', phoneNeedsText: 'Write a few words so the manager knows what to call about.',
    phoneInvalid: 'A phone number needs 8 to 15 digits.', invalid: 'Feedback needs 1 to 2,000 valid text characters.',
    retry: 'Retry submission', retryOpen: 'Retry connection', demo: 'Preview — the real page sends feedback to the shop.',
  },
} as const;
type MessageKey = keyof typeof messages.vi;
export const guestCopy = {
  vi: { google: 'Đánh giá trên Google', close: 'Đóng', hint: 'Có điều gì muốn nhắn riêng cho quán?', title: 'Gửi góp ý riêng cho quản lý', feeling: 'Bạn cảm thấy thế nào?',
    phone: 'Số điện thoại, nếu muốn quản lý gọi lại', phoneHint: 'Chỉ người của quán được cấp quyền mới thấy số này',
    thanks: 'Cảm ơn bạn nhé, chúng tôi biết ơn vì đóng góp từ phản hồi của bạn', phonePolicy: 'Cách số này được giữ và xoá',
    privacy: 'Quyền riêng tư', terms: 'Điều khoản', erase: 'Xoá dữ liệu của tôi', language: 'Ngôn ngữ / Language',
    eraseAsk: 'Xoá lời nhắn, số điện thoại và thao tác của bạn trên trang này? Số sao vẫn được giữ, không kèm tên.',
    eraseYes: 'Xoá', eraseNo: 'Thôi', erasing: 'Đang xoá…', erased: 'Đã xoá.', eraseNothing: 'Không có gì để xoá.', eraseFailed: 'Chưa xoá được. Thử lại sau nhé.',
    more: 'Kéo xuống để khám phá thêm', wifi: 'Wifi của quán', wifiName: 'Tên mạng', wifiPass: 'Mật khẩu', copy: 'Sao chép', copied: 'Đã sao chép',
    demoGoogle: 'Bản xem thử: trang thật mở trang đánh giá Google của quán.' },
  en: { google: 'Review us on Google', close: 'Close', hint: 'Anything to tell us privately?', title: 'Send private feedback to the manager', feeling: 'How do you feel?',
    phone: 'Phone, if you would like the manager to call back', phoneHint: 'Only the shop’s own people with permission see this number',
    thanks: 'Thank you — we are grateful for your feedback', phonePolicy: 'How this number is kept and erased',
    privacy: 'Privacy', terms: 'Terms', erase: 'Erase my data', language: 'Ngôn ngữ / Language',
    eraseAsk: 'Erase your words, phone number and what you did on this page? Your star stays, with no name attached.',
    eraseYes: 'Erase', eraseNo: 'Cancel', erasing: 'Erasing…', erased: 'Erased.', eraseNothing: 'Nothing to erase.', eraseFailed: 'Could not erase yet. Please try again later.',
    more: 'Scroll down to see more', wifi: 'The shop’s wifi', wifiName: 'Network', wifiPass: 'Password', copy: 'Copy', copied: 'Copied',
    demoGoogle: 'Preview: the real page opens the shop’s Google review page.' },
} as const;

const noop = () => () => {};
function subscribeReducedMotion(change: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', change); return () => query.removeEventListener('change', change);
}
export function useReducedMotion() {
  return useSyncExternalStore(typeof window === 'undefined' ? noop : subscribeReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => false);
}
function resultMessage(result: CoordinatorResult | null | undefined): MessageKey | null {
  if (!result) return null;
  if (result.kind === 'saved') return 'saved'; if (result.kind === 'conflict') return 'conflict'; if (result.kind === 'pending') return 'pending';
  if (result.kind === 'error') {
    if (result.code === 'SESSION_EXPIRED') return 'expired'; if (result.code === 'INVALID_INPUT') return 'invalid';
    if (['RATING_RECOVERY_REQUIRED', 'REVISION_RECONCILIATION_REQUIRED'].includes(result.code)) return 'recovery';
    return 'unavailable';
  }
  return null;
}

type Props = { mode: GuestMode; slug: string; render?: RenderBinding; googleUrl: string | null; thanksSeconds?: number; layout: string; className?: string; style?: CSSProperties; children: ReactNode };

export default function GuestCore({ mode, slug, render, googleUrl, thanksSeconds = 0, layout, className, style, children }: Props) {
  const [lang, setLang] = useState<Language>('vi'); const t = copy[lang], m = messages[lang], p = guestCopy[lang];
  const [service, setService] = useState<DocumentFeedbackService | null>(null), [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active || mode !== 'live' || !render) return;
      try { setService(documentFeedbackService(window, { shop: slug, render })); } catch { setUnavailable(true); }
    });
    return () => { active = false; };
  }, [slug, render, mode]);
  const client = useDocumentFeedback(service);
  const state = client.state?.queue.coordinator, current = state?.current;
  const snapshot = current?.snapshot, mutation = state?.mutation;
  const opening = state?.opens.find(entry => entry.event.loadKey === current?.event.loadKey);
  const reduced = useReducedMotion() || mode === 'still';
  const thanks = useThanks(mode === 'live' ? thanksSeconds : 0, client.flushEvents);

  const [open, setOpen] = useState(false), [phase, setPhase] = useState<'form' | 'thanks'>('form'), [choice, setChoice] = useState(0);
  const [message, setMessage] = useState(''), [topic, setTopic] = useState<Topic>('other'), [phone, setPhone] = useState('');
  const [validationState, setValidationState] = useState<{ key: MessageKey; loadKey?: string } | null>(null);
  const validation = validationState?.loadKey === current?.event.loadKey ? validationState?.key : null;
  const setValidation = (key: MessageKey | null) => setValidationState(key ? { key, loadKey: current?.event.loadKey } : null);
  const [sending, setSending] = useState(false), [demoNote, setDemoNote] = useState(false);
  const submitted = useRef(false), queued = useRef<{ topic: string; message: string; phone?: string } | null>(null);
  const opener = useRef<HTMLElement | null>(null), modalRef = useRef<HTMLDivElement>(null), cardRef = useRef<HTMLDivElement>(null);

  const busy = !!mutation?.running || !!mutation?.pending || !!client.state?.actionsRunning;
  const crossContext = !!mutation?.pending && mutation.pending.loadKey !== current?.event.loadKey;
  const disabledStars = mode === 'live' && (!snapshot || !!opening?.running || sending || crossContext || mutation?.pending?.phase === 'refresh');
  const canSend = mode === 'live' && !!snapshot && !busy && !opening?.running && !sending && !crossContext;
  const locked = sending || !!mutation?.pending;
  const completed = mutation?.result;
  const resultHere = completed && 'snapshot' in completed && completed.snapshot.visit.id === snapshot?.visit.id ? completed : null;
  let status: MessageKey = validation ?? resultMessage(resultHere) ?? 'ready';
  if (!validation) {
    if (mode !== 'live') status = 'demo';
    else if (unavailable) status = 'unavailable';
    else if (!snapshot) status = opening?.running || !opening ? 'loading' : resultMessage(opening.result) ?? 'unavailable';
    else if (mutation?.running || opening?.running) status = 'saving';
    else if (mutation?.pending) status = 'pending';
    else if (state?.notice) status = state.notice === 'DESIRED_CONTEXT_CHANGED' ? 'changed' : 'conflict';
    if (status === 'saved' && phase === 'form') status = 'ready';
  }
  const connectionProblem = mode === 'live' && (unavailable || (!snapshot && !!opening && !opening.running));

  const emit = useRef(client.event); emit.current = client.event;
  const announced = useRef('');
  useEffect(() => {
    const id = snapshot?.visit.id; if (!id || announced.current === id) return;
    announced.current = id; emit.current('page_opened', { layout });
  }, [snapshot?.visit.id, layout]);
  const sent = useRef(false);
  useEffect(() => { if (phase === 'thanks') sent.current = true; }, [phase]);
  useEffect(() => { if (!open) return; return () => { if (!sent.current) emit.current('card_abandoned', { layout }); }; }, [open, layout]);
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement, previous = root.style.overflow; root.style.overflow = 'hidden';
    cardRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => { root.style.overflow = previous; document.removeEventListener('keydown', onKey); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase === 'thanks' && !reduced && modalRef.current) burstConfetti(modalRef.current);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function close() { setOpen(false); setPhase('form'); opener.current?.focus({ preventScroll: true }); }
  function finish(result: CoordinatorResult) {
    if (result.kind === 'saved') {
      const next = queued.current;
      if (result.mutation !== 'feedback' && next) { queued.current = null; void client.feedback(next.topic, next.message, next.phone).then(finish); return; }
      submitted.current = false; setSending(false); setMessage(''); setTopic('other'); setPhone(''); setChoice(0); setPhase('thanks'); return;
    }
    if (result.kind === 'pending') return;
    submitted.current = false; setSending(false); queued.current = null;
    if (result.kind === 'conflict') setChoice(result.snapshot.experience?.rating ?? 0);
    if (result.kind === 'error') setValidation(resultMessage(result));
  }
  function send() {
    if (mode !== 'live') { setPhase('thanks'); return; }
    if (!canSend || submitted.current) return;
    const text = message.trim(), number = normalizePhone(phone);
    if (number === undefined) { setValidation('phoneInvalid'); return; }
    if (number && !text) { setValidation('phoneNeedsText'); return; }
    if (!choice && !text) { setValidation('empty'); return; }
    if (text && !normalizeFeedback(topic, message)) { setValidation('invalid'); return; }
    submitted.current = true; setSending(true); setValidation(null);
    client.event('feedback_sent', { stars: choice ?? 0, words: !!text, calledBack: !!number, layout });
    const note = text ? { topic, message, ...(number ? { phone: number } : {}) } : null;
    if (choice) { queued.current = note; void client.rate(choice).then(finish); }
    else void client.feedback(topic, message, note?.phone).then(finish);
  }

  const guest: Guest = {
    mode, lang, setLang, reduced,
    google: {
      href: mode === 'still' ? null : googleUrl,
      ...(thanksSeconds && mode === 'live' ? {} : { target: '_blank', rel: 'noopener noreferrer' }),
      onClick: event => {
        if (mode !== 'live') { event.preventDefault(); setDemoNote(true); window.setTimeout(() => setDemoNote(false), 2600); return; }
        client.event('google_tapped', { layout }); thanks.start(event);
      },
    },
    openFeedback: () => {
      opener.current = document.activeElement as HTMLElement | null;
      setPhase('form'); setValidation(null); setOpen(true); if (mode === 'live') client.event('card_opened', { layout });
    },
    feedbackOpen: open, event: (name, detail) => { if (mode === 'live') client.event(name, detail ?? {}); },
    erase: async () => mode === 'live' ? client.erase() : { kind: 'nothing' }, ready: mode !== 'live' || !!snapshot,
  };
  const retryButtons = mode === 'live' && <>
    {mutation?.pending && !mutation.running && <button type="button" className="guest-send" onClick={() => { setValidation(null); void client.retry().then(finish); }}>{m.retry}</button>}
    {state?.opens.filter(entry => entry.result?.kind === 'pending' && !entry.running).map((entry, index) => <button type="button" key={entry.event.loadKey} className="guest-send"
      onClick={() => { setValidation(null); void client.retryOpen(entry.event.loadKey); }}>{m.retryOpen}{index > 0 ? ` (${index + 1})` : ''}</button>)}
  </>;
  const statusLine = <p role="status" className="guest-status">{m[status]}</p>;

  return <GuestContext.Provider value={guest}>
    <main className={`cv ${className ?? ''}`} style={style} lang={lang} data-lang={lang} data-mode={mode} data-ready={guest.ready ? '' : undefined}>
      <div className="cv-page" aria-hidden={open || undefined}>{children}</div>
      {connectionProblem && !open && <div className="cv-connection">{statusLine}{retryButtons}</div>}
      {demoNote && <p className="cv-toast" role="status">{p.demoGoogle}</p>}
      {/* The private card of the original guest page, kept as it was (Tài 05/10): components/guest/plane.css. */}
      {open && <div ref={modalRef} className="guest-modal" onPointerDown={event => { if (event.target === event.currentTarget) close(); }}>
        <div ref={cardRef} id="private-card" className="guest-card" role="dialog" aria-modal="true" aria-labelledby="private-card-title" tabIndex={-1} data-phase={phase}>
          <button type="button" className="guest-close" aria-label={p.close} onClick={close}>×</button>
          {phase === 'thanks'
            ? <div className="guest-thanks" data-thanks>
                <p id="private-card-title">{p.thanks}</p>
                <button type="button" className="guest-send" onClick={close}>{p.close}</button>
              </div>
            : <form id="private-form" onSubmit={e => { e.preventDefault(); send(); }}>
                <h2 id="private-card-title">{p.title}</h2>
                <p className="guest-note">{t.privateNote}</p>
                <p className="guest-feeling">{p.feeling}</p>
                <div className="guest-stars" role="group" aria-label={p.feeling}>{[1, 2, 3, 4, 5].map(n => {
                  const face = n <= choice ? FACES[choice - 1] : null;
                  return <button type="button" key={n} disabled={disabledStars} aria-label={`${n} ${t.stars}`} aria-pressed={choice === n}
                    data-filled={!!face} onClick={() => { setValidation(null); setChoice(n); if (mode === 'live') client.event('star_chosen', { stars: n }); }}>
                    <span key={face ?? 'star'} className={face ? 'guest-face' : 'guest-star'} style={face && !reduced ? { animationDelay: `${(n - 1) * 40}ms` } : undefined}>{face ?? '★'}</span>
                  </button>;
                })}</div>
                <label htmlFor="topic">{t.topic}</label>
                <select id="topic" disabled={locked} value={topic} onChange={e => setTopic(e.target.value as Topic)}>{topics.map(key => <option key={key} value={key}>{t[key]}</option>)}</select>
                <label htmlFor="message">{t.message}</label>
                <textarea id="message" rows={4} disabled={locked} value={message} placeholder={t.placeholder} onChange={e => { setMessage(e.target.value); setValidation(null); }} />
                <label htmlFor="phone">{p.phone}</label>
                <input id="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} disabled={locked} value={phone} placeholder={p.phoneHint}
                  onChange={e => { setPhone(e.target.value); setValidation(null); }} />
                <p className="guest-fineprint"><Link href="/quyen-rieng-tu#so-dien-thoai" prefetch={false}>{p.phonePolicy}</Link></p>
                <button className="guest-send" disabled={mode === 'live' && !canSend}>{t.send}</button>
                {statusLine}{retryButtons}
              </form>}
        </div>
      </div>}
      {thanks.state && <div className="cv-thanks-layer"><ThanksCard state={thanks.state} copy={THANKS_COPY[lang]} reduced={reduced} seconds={thanksSeconds} /></div>}
    </main>
  </GuestContext.Provider>;
}

/** The legal line: privacy, terms, erase-my-data asked once inline, and the language switch when the page has none of its own. */
export function LegalLine({ withLanguage }: { withLanguage?: boolean }) {
  const guest = useGuest(), p = guestCopy[guest.lang];
  const [step, setStep] = useState<'idle' | 'ask' | 'erasing' | 'erased' | 'nothing' | 'error'>('idle');
  async function confirm() { setStep('erasing'); const result = await guest.erase(); setStep(result.kind === 'erased' ? 'erased' : result.kind === 'nothing' ? 'nothing' : 'error'); }
  return <div className="cv-legal-line" data-legal>
    <p><Link href="/quyen-rieng-tu" prefetch={false}>{p.privacy}</Link> · <Link href="/dieu-khoan" prefetch={false}>{p.terms}</Link>
      {step === 'idle' && <> · <button type="button" disabled={!guest.ready} onClick={() => setStep('ask')}>{p.erase}</button></>}
      {withLanguage && <> · <button type="button" onClick={() => guest.setLang(guest.lang === 'vi' ? 'en' : 'vi')}>{guest.lang === 'vi' ? 'English' : 'Tiếng Việt'}</button></>}</p>
    {step === 'ask' && <p role="alertdialog" aria-label={p.erase}>{p.eraseAsk}{' '}
      <button type="button" data-erase-confirm onClick={() => void confirm()}>{p.eraseYes}</button> · <button type="button" onClick={() => setStep('idle')}>{p.eraseNo}</button></p>}
    {step !== 'idle' && step !== 'ask' && <p role="status" data-erase-result={step}>{step === 'erasing' ? p.erasing : step === 'erased' ? p.erased : step === 'nothing' ? p.eraseNothing : p.eraseFailed}</p>}
  </div>;
}
