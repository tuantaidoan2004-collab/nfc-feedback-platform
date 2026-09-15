'use client';

import { useEffect, useRef, useState } from 'react';
import { copy, topics, type Language, type Topic } from '@/lib/copy';
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
    ratingRequired: 'Vui lòng chờ sao được lưu trước khi gửi góp ý.',
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
    ratingRequired: 'Please wait for your rating to be saved before sending feedback.',
    waiting: 'Wait for the current action to be confirmed before sending feedback.',
    recovery: 'Retry the pending action before continuing.',
    changed: 'The page reopened. Queued actions were not moved to this opening; review before submitting again.',
    invalid: 'Feedback needs 1 to 2,000 valid text characters.', retry: 'Retry submission', retryOpen: 'Retry connection',
  },
} as const;
type MessageKey = keyof typeof messages.vi;
function resultMessage(result: CoordinatorResult | null | undefined): MessageKey | null {
  if (!result) return null;
  if (result.kind === 'saved') return result.mutation === 'feedback' ? 'feedbackSaved' : 'saved';
  if (result.kind === 'conflict') return 'conflict';
  if (result.kind === 'pending') return 'pending';
  if (result.kind === 'error') {
    if (result.code === 'SESSION_EXPIRED') return 'expired';
    if (result.code === 'RATING_REQUIRED') return 'ratingRequired';
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
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const busy = !!mutation?.running || !!mutation?.pending || !!client.state?.actionsRunning;
  const crossContext = !!mutation?.pending && mutation.pending.loadKey !== current?.event.loadKey;
  const rating = busy && selection && selection.loadKey === current?.event.loadKey ? selection.score : snapshot?.experience?.rating ?? 0;
  const disabledStars = !snapshot || !!opening?.running || sendingFeedback || crossContext || mutation?.pending?.phase === 'refresh';
  const canSend = !!snapshot?.experience && snapshot.session.active && !busy && !opening?.running && !sendingFeedback;
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
      setMessage(''); setTopic('other'); submitted.current = false; setSendingFeedback(false);
    } else if (result.kind !== 'pending') {
      submitted.current = false; setSendingFeedback(false);
    }
    if (result.kind === 'error') setValidation(resultMessage(result));
  }
  function rate(score: number) {
    if (disabledStars || !current) return;
    setValidation(null); setSelection({ loadKey: current.event.loadKey, score });
    if (score <= 3) { setOpen(true); setPulse(value => value + 1); } else setPulse(0);
    void client.rate(score).then(accept);
  }
  function send() {
    // A disabled submit is explained inline; guard same-tick double clicks as well.
    if (!canSend || submitted.current) return;
    if (!normalizeFeedback(topic, message)) { setValidation('invalid'); return; }
    submitted.current = true; setSendingFeedback(true); setValidation(null);
    void client.feedback(topic, message).then(accept);
  }
  return <main className="customer-wrap" lang={lang} data-layout={shop.pageConfig?.layout}><article className="phone">
    <div className="language"><label htmlFor="language">Ngôn ngữ / Language</label><select id="language" value={lang} onChange={e => setLang(e.target.value as Language)}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></div>
    {shop.heroUrl ? shop.heroKind === 'video' ? <video className="shop-media" src={shop.heroUrl} controls playsInline preload="none" /> : <div className="shop-media" role="img" aria-label={shop.name} style={{ backgroundImage: `url(${JSON.stringify(shop.heroUrl)})` }} /> : <div className="cover"><strong>{shop.name}</strong></div>}
    <div className="customer-content"><h1>{shop.name}</h1><p className="question">{question}</p>
      <div className="stars" role="group" aria-label={question}>{[1, 2, 3, 4, 5].map(n => <button key={n} disabled={disabledStars} aria-label={`${n} ${t.stars}`} aria-pressed={rating === n} data-filled={n <= rating} onClick={() => rate(n)}>★</button>)}</div>
      <p className="rating-receipt">{snapshot?.experience ? `${m.saved} ${snapshot.experience.rating}/5` : '\u00a0'}</p>
      <section className="google-invitation"><p>{t.invite}</p>{shop.googleUrl ? <a className="google-button" href={shop.googleUrl} target="_blank" rel="noopener noreferrer">G · Google Maps ↗</a> : <button className="google-button" disabled>Google Maps</button>}<p className="muted small">{t.thanks}</p></section>
      <button id="private-feedback" className={`feedback-trigger${rating > 0 && rating <= 3 ? ' needs-attention' : ''}`} aria-expanded={open} aria-controls="private-form" onClick={() => { setOpen(!open); setPulse(0); }}><span key={pulse} className={`pulse-fill${pulse ? '' : ' idle'}`} aria-hidden="true" /><span className="trigger-label">{t.private}</span></button>
      {open && <form id="private-form" className="feedback-form" onSubmit={e => { e.preventDefault(); send(); }}>
        <p>{t.privateNote}</p><label htmlFor="topic">{t.topic}</label><select id="topic" disabled={feedbackLocked} value={topic} onChange={e => setTopic(e.target.value as Topic)}>{topics.map(key => <option key={key} value={key}>{t[key]}</option>)}</select>
        <label htmlFor="message">{t.message}</label><textarea id="message" rows={4} required disabled={feedbackLocked} value={message} placeholder={t.placeholder} onChange={e => { setMessage(e.target.value); setValidation(null); }} />
        {!canSend && <p id="feedback-wait" className="muted small">{!snapshot?.experience ? m.ratingRequired : !snapshot.session.active ? m.expired : m.waiting}</p>}
        <button className="primary" disabled={!canSend} aria-describedby={!canSend ? 'feedback-wait' : undefined}>{t.send}</button>
      </form>}
      <p role="status">{m[status]}</p>
      {mutation?.pending && !mutation.running && <button className="primary" onClick={() => { setValidation(null); void client.retry().then(accept); }}>{m.retry}</button>}
      {state?.opens.filter(entry => entry.result?.kind === 'pending' && !entry.running).map((entry, index) => <button key={entry.event.loadKey} className="primary" onClick={() => { setValidation(null); void client.retryOpen(entry.event.loadKey); }}>{m.retryOpen}{index > 0 ? ` (${index + 1})` : ''}</button>)}
    </div>
  </article></main>;
}
