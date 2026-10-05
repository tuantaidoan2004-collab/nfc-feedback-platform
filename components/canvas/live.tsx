'use client';
/**
 * Phần chạm được của trang canvas: nút Google (đích và chữ của nền tảng), máy bay giấy góp ý riêng (bản gốc, giữ nguyên),
 * chọn ngôn ngữ, dòng pháp lý, thẻ bài (bấm rút thẻ, bấm lần nữa mới đi), nút wifi, mũi tên gợi ý kéo xuống, và cái canh khúc
 * nào đã lọt vào màn hình.
 *
 * Luật 0.1 ở phía trình duyệt: những thứ nổi cố định (máy bay giấy, mũi tên gợi ý) tự lùi đúng lúc chúng có thể đè lên nút
 * Google, nên không gì che được nút — cả hình lẫn vùng bấm.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { DeckCard, FeedbackEl, GoogleEl, LangEl, LegalEl } from '@/lib/canvas/doc';
import { paint } from '@/lib/canvas/paint';
import CanvasIcon from './icons';
import { LegalLine, guestCopy, useGuest } from '../guest/core';
import { WordsView } from './words';

const FEEDBACK_ICONS: Record<FeedbackEl['icon'], string> = {
  plane: 'M3.5 11.2 20.6 3.6c.6-.3 1.2.3 1 .9l-5.2 15.8c-.2.6-1 .7-1.4.2l-3.9-4.4-4.2 3.2c-.4.3-.9 0-.9-.5v-4.5L3.3 12.6c-.6-.3-.5-1.2.2-1.4ZM11.1 15.3l8.3-10.4',
  chat: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.6 3.7c-.4.3-.9 0-.9-.5V16A2.5 2.5 0 0 1 4 13.5Z',
  mail: 'M3.5 6.5A1.5 1.5 0 0 1 5 5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5ZM4 6.5l8 6.5 8-6.5',
};
type Vars = CSSProperties & Record<`--${string}`, string | number | undefined>;

/** True while this fixed element's box crosses the Google button's: then it steps aside. */
function useAwayFromGoogle(ref: RefObject<HTMLElement | null>, active = true) {
  const [away, setAway] = useState(false);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const own = ref.current?.getBoundingClientRect(), google = document.querySelector('[data-google]')?.getBoundingClientRect();
      if (!own || !google) { setAway(false); return; }
      const pad = 8, hit = own.left < google.right + pad && own.right > google.left - pad && own.top < google.bottom + pad && own.bottom > google.top - pad;
      setAway(hit);
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(check); };
    later();
    const timer = window.setInterval(later, 700);
    window.addEventListener('scroll', later, { passive: true }); window.addEventListener('resize', later);
    return () => { cancelAnimationFrame(frame); window.clearInterval(timer); window.removeEventListener('scroll', later); window.removeEventListener('resize', later); };
  }, [ref, active]);
  return away;
}

function GoogleG() { return <CanvasIcon icon="google" id="g" />; }

/** The review button. The words are the platform's (the same for every guest); the look is the template's. */
export function GoogleButton({ el }: { el: Omit<GoogleEl, 'x' | 'y' | 'w'> & { w?: number } }) {
  const guest = useGuest(), label = guestCopy[guest.lang].google;
  const style: Vars = { '--bg': el.bg ? paint(el.bg) : undefined, '--fg': el.fg, '--bar': el.bar };
  const content = el.look === 'maps' ? <>{el.bar && <span className="cv-bar" aria-hidden="true" />}<span className="cv-google-label">{label}</span>
    <span className="cv-gicon"><CanvasIcon icon="maps" id={`${el.id}-pin`} /></span></>
    : el.look === 'g' ? <><span className="cv-gdisc"><GoogleG /></span><span className="cv-google-label">{label}</span></>
    : el.look === 'glass' ? <><span className="cv-gicon"><GoogleG /></span><span className="cv-google-label">{label}</span>
      <span className="cv-hand" aria-hidden="true"><CanvasIcon icon="hand" id={`${el.id}-hand`} /></span></>
    : <RingFace label={label} color={el.ring ?? '#ffffff'} id={el.id} />;
  const common = { className: `cv-google cv-google-${el.look}`, style, 'data-google': '', 'data-shadow': el.shadow ?? (el.look === 'maps' ? 'soft' : undefined), 'aria-label': label };
  if (!guest.google.href) return <span {...common} role="link" aria-disabled="true">{content}</span>;
  return <a {...common} href={guest.google.href} target={guest.google.target} rel={guest.google.rel} onClick={guest.google.onClick}>{content}</a>;
}

/** The round button of mẫu "Nút đơn": the words run around a ring, Google's G in the middle, a finger tapping. */
function RingFace({ label, color, id }: { label: string; color: string; id: string }) {
  const text = `${label.toUpperCase()} • ${label.toUpperCase()} • `;
  return <>
    <svg className="cv-ring-text" viewBox="0 0 200 200" aria-hidden="true"><defs><path id={`ring-${id}`} d="M100 100 m-84 0 a84 84 0 1 1 168 0 a84 84 0 1 1 -168 0" /></defs>
      <text fill={color} fontSize="14.5" fontWeight="700" letterSpacing="2.2" fontFamily="var(--font-qs), system-ui"><textPath href={`#ring-${id}`} textLength="520" lengthAdjust="spacing">{text}</textPath></text></svg>
    <span className="cv-ring-core"><span className="cv-g"><GoogleG /></span><span className="cv-ripple" aria-hidden="true" />
      <span className="cv-hand" aria-hidden="true"><CanvasIcon icon="hand" id={`${id}-hand`} /></span></span>
    <span className="cv-pin" aria-hidden="true"><CanvasIcon icon="maps" id={`${id}-pin`} /></span>
    <span className="cv-spark" aria-hidden="true"><CanvasIcon icon="sparkle" id={`${id}-sp`} /></span>
  </>;
}

const HINT_DELAY_MS = 2000;
/** The invitation appears once the visitor has reached the bottom of the page and stayed two seconds, then stays. */
function useBottomHint() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (shown) return;
    let timer: number | undefined;
    const check = () => {
      const bottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      if (bottom && timer === undefined) timer = window.setTimeout(() => setShown(true), HINT_DELAY_MS);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => { window.removeEventListener('scroll', check); window.removeEventListener('resize', check); window.clearTimeout(timer); };
  }, [shown]);
  return shown;
}
/**
 * The paper plane that opens the private-feedback card, and its invitation: the original guest page's, kept as they were
 * (Tài 05/10: "vẫn giữ như cũ nha, nó tuyệt đẹp và mượt rồi chứ đừng code máy bay giấy mới"; components/guest/plane.css).
 * The page chooses only the glyph and its two colours, as the page's settings always could.
 */
export function FeedbackPlane({ el }: { el: FeedbackEl }) {
  const guest = useGuest(), p = guestCopy[guest.lang], ref = useRef<HTMLDivElement>(null), away = useAwayFromGoogle(ref);
  const hint = useBottomHint();
  return <div ref={ref} className="guest-float" data-away={away || undefined}>
    <button type="button" id="private-feedback" className="guest-plane" aria-label={p.title} aria-haspopup="dialog" aria-expanded={guest.feedbackOpen}
      aria-controls="private-card" data-icon={el.icon} onClick={guest.openFeedback}>
      <svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true">
        <path d={FEEDBACK_ICONS[el.icon]} fill={el.color} stroke={el.edge} strokeWidth="1.6" strokeLinejoin="round" paintOrder="stroke" /></svg>
    </button>
    {hint && !guest.feedbackOpen && <button type="button" className="guest-hint" data-hint onClick={guest.openFeedback}>{p.hint}</button>}
  </div>;
}

export function LangSwitch({ el }: { el: Omit<LangEl, 'x' | 'y' | 'w'> & { w?: number } }) {
  const guest = useGuest();
  if (el.look === 'chip') return <div className="cv-lang cv-lang-chip" style={{ '--fg': el.color } as Vars}>
    <button type="button" onClick={() => guest.setLang(guest.lang === 'vi' ? 'en' : 'vi')}>{guest.lang === 'vi' ? 'English' : 'Tiếng Việt'}</button></div>;
  return <div className="cv-lang" style={{ '--fg': el.color, '--bg': el.bg ? paint(el.bg) : undefined } as Vars}>
    {el.label !== false && <label htmlFor={`lang-${el.id}`}>{guestCopy.vi.language}</label>}
    <select id={`lang-${el.id}`} value={guest.lang} onChange={event => guest.setLang(event.target.value as 'vi' | 'en')}>
      <option value="vi">Tiếng Việt</option><option value="en">English</option></select>
  </div>;
}

export function LegalSpot({ el }: { el: Omit<LegalEl, 'x' | 'y' | 'w'> & { w?: number } }) {
  return <div className="cv-legal" style={{ '--fg': el.color, '--fs': el.size } as Vars}><LegalLine /></div>;
}

const SLOTS = [['left'], ['left', 'right'], ['left', 'right', 'below'], ['left', 'right', 'below', 'lower']] as const;
/** The cards behind the front card: where they sit depends on how many there are (Tài 05/10). A tap pulls one out; a second tap follows it. */
export function DeckCards({ cards }: { cards: DeckCard[] }) {
  const guest = useGuest(), [pulled, setPulled] = useState<number | null>(null);
  if (!cards.length) return null;
  const slots = SLOTS[cards.length - 1];
  return <div className="cv-cards">{cards.map((card, i) => <a key={i} className="cv-dcard" data-slot={slots[i]} data-pulled={pulled === i || undefined}
    href={card.link} target="_blank" rel="noopener noreferrer" aria-label={card.label.vi}
    style={{ '--fill': paint(card.fill), '--cfg': card.fg, '--delay': `${i * -1.4}s` } as Vars}
    onClick={event => { if (pulled !== i && !guest.reduced) { event.preventDefault(); setPulled(i); } }}>
    <span className="cv-dcard-face"><span className="cv-dcard-icon"><CanvasIcon icon={card.icon} id={`deck-${i}`} /></span>
      <span className="cv-dcard-label"><WordsView words={card.label} /></span></span>
  </a>)}</div>;
}

/** The shop's wifi: the network's name and password on a small sheet, the password one tap from the clipboard. */
export function WifiButton({ className, style, wifi, children }: { className: string; style: CSSProperties; wifi: { name: string; pass?: string }; children: ReactNode }) {
  const guest = useGuest(), p = guestCopy[guest.lang], [open, setOpen] = useState(false), [copied, setCopied] = useState(false);
  return <>
    <button type="button" className={className} style={style} onClick={() => setOpen(true)}>{children}</button>
    {open && <div className="cv-wifi" onPointerDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="cv-wifi-card" role="dialog" aria-modal="true" aria-label={p.wifi}>
        <h2>{p.wifi}</h2>
        <dl><div><dt>{p.wifiName}</dt><dd>{wifi.name}</dd></div>{wifi.pass && <div><dt>{p.wifiPass}</dt><dd>{wifi.pass}</dd></div>}</dl>
        {wifi.pass && <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(wifi.pass ?? ''); setCopied(true); } catch { setCopied(false); } }}>
          {copied ? p.copied : `${p.copy} ${p.wifiPass.toLowerCase()}`}</button>}
        <button type="button" onClick={() => setOpen(false)} style={{ background: '#f1f1f3', color: '#111' }}>{p.close}</button>
      </div>
    </div>}
  </>;
}

/** After `after` milliseconds without a scroll, an arrow says there is more below; it goes at the first scroll (mẫu Illustrate). */
export function ScrollHint({ after }: { after: number }) {
  const guest = useGuest(), ref = useRef<HTMLButtonElement>(null), [shown, setShown] = useState(false), away = useAwayFromGoogle(ref, shown);
  useEffect(() => {
    const timer = window.setTimeout(() => { if (window.scrollY < 12 && document.documentElement.scrollHeight > window.innerHeight + 40) setShown(true); }, after);
    const gone = () => { if (window.scrollY > 12) { setShown(false); window.clearTimeout(timer); } };
    window.addEventListener('scroll', gone, { passive: true });
    return () => { window.clearTimeout(timer); window.removeEventListener('scroll', gone); };
  }, [after]);
  if (!shown || guest.feedbackOpen) return null;
  return <button ref={ref} type="button" className="cv-hint" data-away={away || undefined} onClick={() => window.scrollBy({ top: window.innerHeight * .8, behavior: 'smooth' })}>
    <span>{guestCopy[guest.lang].more}</span>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  </button>;
}

/** Lower sections play their entrance once they are on screen (canvas.css `[data-wait]`). */
export function SectionWatch() {
  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>('.cv-sec[data-wait]')];
    if (!('IntersectionObserver' in window)) return;
    // Sections already on screen play now; the rest wait for the guest (canvas.css).
    const visible = (s: HTMLElement) => s.getBoundingClientRect().top < window.innerHeight;
    sections.filter(visible).forEach(s => s.setAttribute('data-seen', ''));
    document.documentElement.setAttribute('data-cv-watch', '');
    const watch = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.setAttribute('data-seen', ''); watch.unobserve(entry.target); } }),
      { threshold: .12 });
    sections.filter(s => !s.hasAttribute('data-seen')).forEach(s => watch.observe(s));
    return () => { watch.disconnect(); document.documentElement.removeAttribute('data-cv-watch'); };
  }, []);
  return null;
}
