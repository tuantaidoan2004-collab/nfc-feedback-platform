'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BrandLine, Eyebrow, buttonClass } from '../platform/ui';
import { TEMPLATE_KEYS, TEMPLATE_NAMES, type TemplateKey } from '@/lib/publishing/templates';
import { BUSY_HOURS, DRAFT_NAME_MAX, GOALS, SHOP_KINDS, type BusyHour, type Goal, type ShopKind } from '@/lib/start/draft';
import styles from './builder.module.css';

/**
 * Building a page before there is an account (lát D4; docs/ui-ux-nguon-tham-khao.md mục 1f, 5A–B, 6): the name, a
 * template picked from live pictures, the page on the owner's own phone through a QR code, three quick questions, and
 * "Lưu trang của tôi". Give first, ask later: nothing here asks who the owner is.
 *
 * Saving makes the owner's account at once, with the password they choose; the page waits for an administrator in /gov
 * (lát D4b, Tài 27/09: chờ duyệt), and signing in after approval opens the shop's dashboard.
 */
type Step = 'name' | 'template' | 'phone' | 'intro' | 'kind' | 'hours' | 'goals' | 'save';
type DraftLink = { url: string; token: string; qr: string; expiresAt: string };
type State = { step: Step; name: string; template: TemplateKey; kind: ShopKind | null; hours: BusyHour[]; goals: Goal[] };
const START: State = { step: 'name', name: '', template: 'standard', kind: null, hours: [], goals: [] };
const STORE = 'qs_start_draft';
const KIND_ICONS: Record<ShopKind, string> = { cafe: '☕', food: '🍜', spa: '💆', bar: '🍸', other: '✨' };
// Five segments; building the page is the first, so the three questions never start from nothing (mục 1b).
const SEGMENT: Record<Step, number> = { name: 0.4, template: 0.7, phone: 1, intro: 1, kind: 2, hours: 3, goals: 4, save: 5 };
const QUESTION: Partial<Record<Step, number>> = { kind: 1, hours: 2, goals: 3 };
const BACK: Partial<Record<Step, Step>> = { template: 'name', phone: 'template', intro: 'phone', kind: 'intro', hours: 'kind', goals: 'hours', save: 'goals' };

/** What the viewer had built, if this browser kept it. A convenience only: the page works the same without it. */
function restore(): State {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORE) ?? 'null');
    if (!saved || typeof saved !== 'object') return START;
    const state = { ...START, ...saved } as State;
    if (!TEMPLATE_KEYS.includes(state.template) || !(state.step in SEGMENT) || typeof state.name !== 'string') return START;
    return { ...state, step: state.name.trim() ? state.step : 'name' };
  } catch { return START; }
}

async function sign(state: State): Promise<DraftLink> {
  const response = await fetch('/api/start/drafts', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: state.name, template: state.template, kind: state.kind, hours: state.hours, goals: state.goals }) });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'SERVICE_UNAVAILABLE');
  return response.json();
}
const saveProblem = (code: string) => ({
  OWNER_ALREADY_EXISTS: '@handle hoặc email này đã có tài khoản. Chọn @handle khác, hoặc đăng nhập.',
  INVALID_USERNAME: '@handle cần 3–64 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.',
  INVALID_EMAIL: 'Email chưa đúng.', WEAK_PASSWORD: 'Mật khẩu cần ít nhất 12 ký tự.', INVALID_ZALO: 'Số Zalo cần 8 đến 15 chữ số.',
  TOO_MANY_ATTEMPTS: 'Đang có nhiều lượt lưu cùng lúc. Thử lại sau ít phút.',
  SIGNUPS_FULL: 'Hôm nay chúng tôi đã nhận đủ trang chờ duyệt. Thử lại sau nhé.',
} as Record<string, string>)[code] ?? 'Chưa lưu được. Thử lại sau giây lát.';
const problem = (code: string) => code === 'DRAFT_POLICY'
  ? 'Tên quán không được nhắc tới quà hay ưu đãi đổi lấy đánh giá. Hãy dùng đúng tên quán.'
  : code === 'INVALID_DRAFT' ? `Tên quán cần từ 1 đến ${DRAFT_NAME_MAX} ký tự, không có dấu < hay >.` : 'Chưa kết nối được. Thử lại sau giây lát.';

/** A guest page drawn at phone width and shrunk to the card, however wide the card is. */
function Shot({ src, title }: { src: string | null; title: string }) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = box.current; if (!element) return;
    const observer = new ResizeObserver(([entry]) => element.style.setProperty('--shot-scale', String(entry.contentRect.width / 390)));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  return <span ref={box} className={styles.shot}>{src && <iframe src={src} title={title} loading="lazy" tabIndex={-1} />}</span>;
}

export default function Builder() {
  const [state, setState] = useState<State>(START);
  const [link, setLink] = useState<DraftLink | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [savedAs, setSavedAs] = useState<string | null>(null), [accented, setAccented] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null), first = useRef(true);

  // Read what this browser kept before writing anything back: the first render's empty state must not overwrite it.
  const restored = useRef(false);
  useEffect(() => { queueMicrotask(() => { restored.current = true; setState(restore()); }); }, []);
  useEffect(() => {
    if (!restored.current) return;
    try { window.localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* Private window: nothing to keep. */ }
    // Say where the viewer is now, for a screen reader, on every step but the first paint.
    if (first.current) first.current = false; else heading.current?.focus();
  }, [state]);
  // The link travels with what it was signed for; anything that changes the page asks for a new one.
  const signedFor = useRef('');
  const needs = (s: State) => JSON.stringify([s.name, s.template, s.kind, s.hours, s.goals]);

  const go = (step: Step, change: Partial<State> = {}) => { setError(''); setState(current => ({ ...current, ...change, step })); };
  const signed = async (next: State) => {
    if (link && signedFor.current === needs(next)) return link;
    const fresh = await sign(next); signedFor.current = needs(next); setLink(fresh); return fresh;
  };
  const advance = async (step: Step, change: Partial<State> = {}) => {
    const next = { ...state, ...change, step };
    setBusy(true); setError('');
    try { await signed(next); go(step, change); } catch (failure) { setError(problem((failure as Error).message)); } finally { setBusy(false); }
  };
  // Back on a later step from an earlier visit: the pictures and the QR code need a link again.
  useEffect(() => {
    if (link || busy || state.step === 'name' || !state.name.trim()) return;
    let live = true;
    sign(state).then(fresh => { if (live) { signedFor.current = needs(state); setLink(fresh); } }, () => { if (live) go('name'); });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per restored visit, not on every keystroke
  }, [state.step]);
  // Kept in the list's own order, whatever order they were tapped in: the summary reads like the question.
  const toggle = <T extends string>(list: T[], value: T, order: Record<T, string>) =>
    (Object.keys(order) as T[]).filter(key => key === value ? !list.includes(value) : list.includes(key));
  const save = async (form: FormData) => {
    setBusy(true); setError('');
    try {
      // A fresh signature for exactly what the summary shows, so a draft left open for days still saves.
      signedFor.current = ''; const fresh = await signed(state);
      const response = await fetch('/api/start/signup', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: fresh.token, username: form.get('username'), email: form.get('email'), password: form.get('password'), zalo: form.get('zalo') }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(saveProblem(body.error)); return; }
      setSavedAs(body.username); setState(START); setLink(null);
    } catch (failure) { setError(problem((failure as Error).message)); } finally { setBusy(false); }
  };

  const { step } = state, question = QUESTION[step], progress = savedAs ? 5 : SEGMENT[step];
  const frame = (key: TemplateKey) => link ? `/thu/${link.token}?khung=1&t=${key}` : null;
  const skip = <button type="button" className={styles.skip} onClick={() => go('save')}>Bỏ qua cho bây giờ</button>;

  return <div className={styles.page} data-start-step={step}>
    <header className={styles.top}>
      <Link href="/" className={styles.home} aria-label="Về trang chính"><BrandLine /></Link>
      <span className={styles.signIn}><span className={styles.signInAsk}>Đã có tài khoản? </span><Link href="/owner/login">Đăng nhập</Link></span>
    </header>

    <div className={styles.progress} role="progressbar" aria-label="Tiến độ" aria-valuemin={0} aria-valuemax={5} aria-valuenow={progress}>
      {[0, 1, 2, 3, 4].map(index => <span key={index} className={styles.segment}>
        <span style={{ width: `${Math.max(0, Math.min(1, progress - index)) * 100}%` }} /></span>)}
    </div>

    <main className={styles.main}>
      {!savedAs && BACK[step] && <button type="button" className={styles.back} aria-label="Quay lại" onClick={() => go(BACK[step]!)}>←</button>}

      {savedAs && <section className={styles.panel} data-start-done>
        <Eyebrow>Đã lưu</Eyebrow>
        <h1 ref={heading} tabIndex={-1}>Trang của bạn đang chờ duyệt</h1>
        <p className={styles.lead}>Tài khoản <strong>@{savedAs}</strong> đã sẵn sàng. Chúng tôi xem trang và báo bạn khi mở; sau đó đăng
          nhập là vào thẳng dashboard của quán.</p>
        <div className={styles.actions}><Link href="/owner/login" className={buttonClass('primary')}>Đăng nhập</Link></div>
      </section>}

      {!savedAs && step === 'name' && <section className={styles.panel} data-start-name>
        <Eyebrow>Bước 1 · Dựng trang</Eyebrow>
        <h1 ref={heading} tabIndex={-1}>Quán của bạn tên gì?</h1>
        <p className={styles.lead}>Tên này nằm to nhất trên trang khách thấy khi chạm thẻ. Chưa cần tài khoản.</p>
        <form className={styles.form} onSubmit={event => { event.preventDefault(); void advance('template'); }}>
          <label className={styles.field}>Tên quán
            <input name="name" value={state.name} maxLength={DRAFT_NAME_MAX} autoComplete="organization" placeholder="Cà Phê Ban Mai" autoFocus
              onChange={event => setState(current => ({ ...current, name: event.target.value }))} /></label>
          <button className={buttonClass('primary')} disabled={busy || !state.name.trim()}>{busy ? 'Đang dựng…' : 'Tiếp tục →'}</button>
        </form>
      </section>}

      {step === 'template' && <section className={styles.panel} data-start-template>
        <Eyebrow>Bước 1 · Dựng trang</Eyebrow>
        <h1 ref={heading} tabIndex={-1}>Chọn một template</h1>
        <p className={styles.lead}>Mỗi hình là trang thật của <strong>{state.name}</strong>. Đổi template sau này không mất nội dung.</p>
        <div className={styles.grid} role="radiogroup" aria-label="Template">
          {TEMPLATE_KEYS.map(key => <button key={key} type="button" role="radio" aria-checked={state.template === key} data-template-card={key}
            className={styles.template} onClick={() => setState(current => ({ ...current, template: key }))}>
            <Shot src={frame(key)} title={`Trang ${state.name} với template ${TEMPLATE_NAMES[key]}`} />
            <span className={styles.templateName}>{TEMPLATE_NAMES[key]}{state.template === key && <span className={styles.tick} aria-hidden="true">✓</span>}</span>
          </button>)}
        </div>
        <div className={`${styles.actions} ${styles.sticky}`}>
          <button type="button" className={buttonClass('primary')} disabled={busy} onClick={() => void advance('phone')}>{busy ? 'Đang dựng…' : 'Dùng template này →'}</button>
        </div>
      </section>}

      {step === 'phone' && link && <section className={`${styles.panel} ${styles.split}`} data-start-phone>
        <div>
          <Eyebrow>Bước 1 · Xong</Eyebrow>
          <h1 ref={heading} tabIndex={-1}>Quét bằng điện thoại của bạn</h1>
          <p className={styles.lead}>Đây là đúng trang khách của bạn sẽ thấy khi chạm thẻ. Mở bằng camera điện thoại.</p>
          <div className={styles.qr} data-start-qr dangerouslySetInnerHTML={{ __html: link.qr }} />
          <p className={styles.note}>Chỉ người có link mới mở được. Bản xem thử hết hạn sau 7 ngày và không ghi lại lượt mở nào.</p>
          <div className={styles.actions}>
            <button type="button" className={buttonClass('primary')} onClick={() => go('intro')}>Tiếp tục →</button>
            {/* Most owners build on their phone (PRODUCT.md): a code on the same screen cannot be scanned, a tap can. */}
            <a className={buttonClass('secondary')} href={link.url} target="_blank" rel="noreferrer" data-start-open>Mở trên máy này</a>
          </div>
        </div>
        <div className={styles.phone} aria-hidden="true"><iframe src={frame(state.template)!} title="" tabIndex={-1} /></div>
      </section>}

      {step === 'intro' && <section className={styles.panel} data-start-intro>
        <Eyebrow>Trước khi lưu</Eyebrow>
        <h1 ref={heading} tabIndex={-1}>Ba câu hỏi nhanh</h1>
        <p className={styles.lead}>Để trang và dashboard của bạn bắt đầu đúng với quán. Mỗi câu một chạm, bỏ qua được.</p>
        <ol className={styles.pills}>
          <li><span>1</span>Loại quán</li><li><span>2</span>Giờ đông khách</li><li><span>3</span>Điều muốn cải thiện</li>
        </ol>
        <div className={styles.actions}>
          <button type="button" className={buttonClass('primary')} onClick={() => go('kind')}>Bắt đầu →</button>
          {skip}
        </div>
      </section>}

      {step === 'kind' && <section className={styles.panel} data-start-question="kind">
        <Eyebrow>{`Câu ${question} / 3`}</Eyebrow>
        <h1 ref={heading} tabIndex={-1}>Quán của bạn là loại nào?</h1>
        <div className={styles.cards} role="radiogroup" aria-label="Loại quán">
          {(Object.keys(SHOP_KINDS) as ShopKind[]).map(kind => <button key={kind} type="button" role="radio" aria-checked={state.kind === kind}
            className={styles.choice} onClick={() => setState(current => ({ ...current, kind }))}>
            <span className={styles.icon} aria-hidden="true">{KIND_ICONS[kind]}</span>{SHOP_KINDS[kind]}</button>)}
        </div>
        <div className={styles.actions}>
          <button type="button" className={buttonClass('primary')} disabled={!state.kind} onClick={() => go('hours')}>Tiếp tục →</button>
          {skip}
        </div>
      </section>}

      {(step === 'hours' || step === 'goals') && (() => {
        const options = step === 'hours' ? BUSY_HOURS : GOALS, chosen: string[] = step === 'hours' ? state.hours : state.goals;
        const pick = (value: string) => setState(current => step === 'hours'
          ? { ...current, hours: toggle(current.hours, value as BusyHour, BUSY_HOURS) } : { ...current, goals: toggle(current.goals, value as Goal, GOALS) });
        return <section className={styles.panel} data-start-question={step}>
          <Eyebrow>{`Câu ${question} / 3`}</Eyebrow>
          <h1 ref={heading} tabIndex={-1}>{step === 'hours' ? 'Quán đông khách lúc nào?' : 'Bạn muốn điều gì tốt lên?'}</h1>
          <p className={styles.lead}>Chọn bao nhiêu cũng được. <span className={styles.count} aria-live="polite">{chosen.length} đã chọn</span></p>
          <div className={styles.chips} role="group" aria-label={step === 'hours' ? 'Giờ đông khách' : 'Điều muốn cải thiện'}>
            {Object.entries(options).map(([value, label]) => <button key={value} type="button" aria-pressed={chosen.includes(value)}
              className={styles.chip} onClick={() => pick(value)}><span className={styles.ring} aria-hidden="true">{chosen.includes(value) ? '✓' : ''}</span>{label}</button>)}
          </div>
          <div className={styles.actions}>
            <button type="button" className={buttonClass('primary')} disabled={!chosen.length} onClick={() => go(step === 'hours' ? 'goals' : 'save')}>Tiếp tục →</button>
            {skip}
          </div>
        </section>;
      })()}

      {step === 'save' && <section className={styles.panel} data-start-save>
        <Eyebrow>Gần xong</Eyebrow>
        <h1 ref={heading} tabIndex={-1}>Lưu trang của bạn</h1>
        <div className={styles.summary}>
          <div><span>Tên quán</span><strong>{state.name}</strong></div>
          <div><span>Template</span><strong>{TEMPLATE_NAMES[state.template]}</strong></div>
          <div><span>Loại quán</span><strong>{state.kind ? SHOP_KINDS[state.kind] : 'Chưa trả lời'}</strong></div>
          <div><span>Giờ đông khách</span><strong>{state.hours.length ? state.hours.map(hour => BUSY_HOURS[hour]).join(', ') : 'Chưa trả lời'}</strong></div>
          <div><span>Muốn tốt lên</span><strong>{state.goals.length ? state.goals.map(goal => GOALS[goal]).join(', ') : 'Chưa trả lời'}</strong></div>
        </div>
        <form className={styles.form} data-start-account onSubmit={event => { event.preventDefault(); void save(new FormData(event.currentTarget)); }}>
          <p className={styles.note}>Tạo tài khoản để giữ trang này. Chúng tôi xem từng trang trước khi mở cho khách; khi được duyệt,
            đăng nhập là vào thẳng dashboard của quán.</p>
          <label className={styles.field}>@handle<input name="username" required maxLength={64} autoComplete="username" autoCapitalize="none"
            autoCorrect="off" spellCheck={false} placeholder="caphe-banmai" onChange={event => setAccented(/[^ -~]/.test(event.target.value))} /></label>
          {accented && <p className={styles.note} data-accent-hint>@handle không có dấu. Nếu đang bật bộ gõ tiếng Việt, chuyển sang bàn phím tiếng Anh (🌐) rồi gõ lại.</p>}
          <label className={styles.field}>Email<input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="ban@example.com" /></label>
          <label className={styles.field}>Mật khẩu (ít nhất 12 ký tự)<input name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /></label>
          <label className={styles.field}>Số Zalo, để chúng tôi báo khi trang được duyệt (không bắt buộc)<input name="zalo" type="tel" inputMode="tel" maxLength={20} autoComplete="tel" placeholder="0961 036 265" /></label>
          <button className={buttonClass('primary')} disabled={busy} data-start-keep>{busy ? 'Đang lưu…' : 'Lưu trang của tôi'}</button>
          <span className={styles.note}>Không cần trả tiền để bắt đầu.</span>
        </form>
      </section>}

      {error && <p role="alert" className={styles.error}>{error}</p>}
    </main>
  </div>;
}
