'use client';
/* eslint-disable @next/next/no-img-element -- media URLs are shop-configured https or built-in paths; next/image would need every host listed in advance. */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from 'react';
import { copy, topics, type Language, type Topic } from '@/lib/copy';
import { DEFAULT_FEEDBACK_BUTTON, defaultConfig, STEM_BACKGROUND, type FeedbackButton, type LinkIcon, type MediaRef, type PageConfig } from '@/lib/publishing/config';
import { burstConfetti } from './confetti';
import { settingsOnPage } from '@/lib/publishing/settings';
import { FACES } from '@/lib/faces';
import './guest-styles';
import { documentFeedbackService, type DocumentFeedbackService } from '@/lib/client/document-feedback-service';
import { useDocumentFeedback } from '@/lib/client/use-document-feedback';
import type { CoordinatorResult } from '@/lib/client/visit-coordinator';
import { normalizeFeedback, normalizePhone } from '@/lib/domain/private-feedback';
import type { RenderBinding } from '@/lib/client/visit-fetch-transport';
import { effectsOf } from '@/lib/publishing/templates';

/**
 * Guest page v2 (lát B3, 2026-09-18). The page itself asks for nothing but the Google review: the Google invitation is
 * the same for every visitor because no rating is asked before it. Private feedback lives behind a floating button
 * and opens a spotlight card with its own stars; the stars and the text are saved only when the customer presses Send.
 */
type Props = { render?: RenderBinding; pageConfig?: PageConfig; template?: string; templateVersion?: number;
  /** A picture of the page for the dashboard's page list (lát P3): no visit is recorded, nothing moves, nothing plays. */
  still?: boolean; slug: string; name: string; googleUrl: string | null; heroUrl: string | null; heroKind: 'image' | 'video' | null };
const messages = {
  vi: {
    loading: 'Đang kết nối…', ready: 'Chọn sao, viết góp ý, hoặc cả hai.',
    saving: 'Đang gửi. Vui lòng giữ trang mở.', saved: 'Đã gửi.',
    pending: 'Chưa xác nhận đã gửi. Giữ trang mở và thử lại để kiểm tra đúng lần gửi này.',
    conflict: 'Đánh giá đã thay đổi ở lần thao tác khác. Đã cập nhật sao hiện tại; hãy kiểm tra rồi gửi lại.',
    expired: 'Phiên đã hết hạn. Chọn sao rồi bấm Gửi để bắt đầu phiên mới; góp ý chưa được gửi.',
    unavailable: 'Chưa kết nối được. Bạn có thể tải lại trang để thử lại.',
    waiting: 'Chờ thao tác hiện tại được xác nhận trước khi gửi.',
    recovery: 'Hãy thử lại thao tác đang chờ trước khi tiếp tục.',
    changed: 'Trang vừa được mở lại. Thao tác chờ chưa được chuyển sang lần mở mới; hãy kiểm tra trước khi gửi tiếp.',
    empty: 'Hãy chọn sao hoặc viết vài dòng trước khi gửi.',
    phoneNeedsText: 'Hãy viết vài dòng để quản lý biết cần gọi lại về việc gì.', phoneInvalid: 'Số điện thoại cần 8 đến 15 chữ số.',
    invalid: 'Góp ý cần từ 1 đến 2.000 ký tự văn bản hợp lệ.', retry: 'Thử lại lần gửi', retryOpen: 'Thử kết nối lại',
  },
  en: {
    loading: 'Connecting…', ready: 'Choose stars, write feedback, or both.',
    saving: 'Sending. Please keep this page open.', saved: 'Sent.',
    pending: 'Not confirmed yet. Keep this page open and retry to check this same submission.',
    conflict: 'The rating changed in another action. The current stars are now shown; review them and send again.',
    expired: 'This session expired. Choose stars and press Send to start a new session; your feedback was not sent.',
    unavailable: 'Could not connect. You can reload this page to try again.',
    waiting: 'Wait for the current action to be confirmed before sending.',
    recovery: 'Retry the pending action before continuing.',
    changed: 'The page reopened. Queued actions were not moved to this opening; review before submitting again.',
    empty: 'Choose stars or write a few words before sending.',
    phoneNeedsText: 'Write a few words so the manager knows what to call about.', phoneInvalid: 'A phone number needs 8 to 15 digits.',
    invalid: 'Feedback needs 1 to 2,000 valid text characters.', retry: 'Retry submission', retryOpen: 'Retry connection',
  },
} as const;
type MessageKey = keyof typeof messages.vi;
const pageCopy = {
  vi: { google: 'Đánh giá trên Google', poster: 'POSTER SỰ KIỆN', links: 'Kết nối với shop', close: 'Đóng',
    hint: 'Có điều gì muốn nhắn riêng cho quán?', title: 'Gửi góp ý riêng cho quản lý', feeling: 'Bạn cảm thấy thế nào?',
    phone: 'Số điện thoại, nếu muốn quản lý gọi lại', phoneHint: 'Chỉ người của quán được cấp quyền mới thấy số này',
    thanks: 'Cảm ơn bạn nhé, chúng tôi biết ơn vì đóng góp từ phản hồi của bạn',
    phonePolicy: 'Cách số này được giữ và xoá', privacy: 'Quyền riêng tư', terms: 'Điều khoản', erase: 'Xoá dữ liệu của tôi',
    eraseAsk: 'Xoá lời nhắn, số điện thoại và thao tác của bạn trên trang này? Số sao vẫn được giữ, không kèm tên.',
    eraseYes: 'Xoá', eraseNo: 'Thôi', erasing: 'Đang xoá…', erased: 'Đã xoá.', eraseNothing: 'Không có gì để xoá.',
    eraseFailed: 'Chưa xoá được. Thử lại sau nhé.' },
  en: { google: 'Review us on Google', poster: 'EVENT POSTER', links: 'Connect with the shop', close: 'Close',
    hint: 'Anything to tell us privately?', title: 'Send private feedback to the manager', feeling: 'How do you feel?',
    phone: 'Phone, if you would like the manager to call back', phoneHint: 'Only the shop’s own people with permission see this number',
    thanks: 'Thank you — we are grateful for your feedback',
    phonePolicy: 'How this number is kept and erased', privacy: 'Privacy', terms: 'Terms', erase: 'Erase my data',
    eraseAsk: 'Erase your words, phone number and what you did on this page? Your star stays, with no name attached.',
    eraseYes: 'Erase', eraseNo: 'Cancel', erasing: 'Erasing…', erased: 'Erased.', eraseNothing: 'Nothing to erase.',
    eraseFailed: 'Could not erase yet. Please try again later.' },
} as const;
const HINT_DELAY_MS = 2000;

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

/**
 * The image shown under (or instead of) a video: the built-in video's still, or the first frame the editor captured
 * when the shop uploaded its video (lát F5). Older uploads without one fall back to colour.
 */
const stillFor = (media: MediaRef) => media.kind === 'image' ? media.url : media.still ?? (media.url === STEM_BACKGROUND.video ? STEM_BACKGROUND.still : null);
/**
 * Phones may refuse to play: iPhone in Low Power Mode, Android with Battery or Data Saver. play() then rejects, and
 * iOS would draw its ▶ button over a frozen frame. When that happens the video is removed and the still stays.
 */
function useVideoPlays() {
  const [blocked, setBlocked] = useState(false);
  const ref = useCallback((video: HTMLVideoElement | null) => {
    if (!video) return;
    video.muted = true;
    const attempt = video.play();
    if (attempt) attempt.catch((error: DOMException) => { if (error?.name !== 'AbortError') setBlocked(true); });
    video.addEventListener('error', () => setBlocked(true), { once: true });
  }, []);
  return [blocked, ref] as const;
}

/**
 * The page's own colours as skin tokens (--c-c1 --c-c2 --c-angle), so a template that paints its own scene -- the
 * glass one, which must repaint that scene inside every pane -- builds it from the shop's colours. A media background
 * gives no colours and the skin defaults stand.
 */
function sceneTokens(b: PageConfig['background']) {
  if (b.kind === 'solid') return { '--c-c1': b.color, '--c-c2': b.color, '--c-angle': '180deg' };
  if (b.kind === 'gradient') return { '--c-c1': b.colors[0], '--c-c2': b.colors[1], '--c-angle': `${b.angle}deg` };
  return {};
}

/**
 * Khuôn 3: where each glass pane sits on the page. A pane repaints the scene behind it, shifted by its own offset, and
 * the scene scrolls with the page, so pane and scene never slide past each other: the refraction filter runs once and
 * the browser keeps the result. Measured again only when something changes size (a poster loading, a language switch,
 * turning the phone). A pane can move without changing size -- a line above it rewraps -- so every block that can push
 * a pane is watched too, not only the panes. `data-glass` marks the copies as aligned; until then only the frosted
 * tint shows.
 */
const GLASS_PANES = '.guest-body, .guest-links a';
function useGlassPlacement(enabled: boolean) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const main = root.current; if (!enabled || !main) return;
    const place = () => {
      const page = main.getBoundingClientRect();
      main.style.setProperty('--gw', `${page.width}px`); main.style.setProperty('--gh', `${page.height}px`);
      for (const pane of main.querySelectorAll<HTMLElement>(GLASS_PANES)) {
        const box = pane.getBoundingClientRect();
        pane.style.setProperty('--gx', `${box.left - page.left}px`); pane.style.setProperty('--gy', `${box.top - page.top}px`);
      }
      main.dataset.glass = 'ready';
    };
    place();
    const watch = new ResizeObserver(place);
    watch.observe(main); main.querySelectorAll(`${GLASS_PANES}, .guest-sheet > *, .guest-body > *`).forEach(block => watch.observe(block));
    return () => watch.disconnect();
  }, [enabled]);
  return root;
}

/**
 * The glass itself: bend the pane's copy of the scene at its rim, frost it, add a rim light. Built from the pane's own
 * shape (a blurred alpha is the height of the glass, its slope is the bend), so one filter fits every size with no
 * image and no script. Rules learned making it agree across engines (thiet-ke-va-khuon.md mục 15):
 * feConvolveMatrix with preserveAlpha keeps every intermediate opaque, because engines disagree on half-transparent
 * displacement maps; the kernel reads right-minus-left written as `g 0 -g`, because convolution flips it; and the
 * region reaches past the pane, because engines disagree on what lies beyond a region's edge.
 * Hidden by size, never `display: none`: Safari ignores a filter inside a display-none element.
 */
function GlassFilter({ id, bezel, gain, bend, frost }: { id: string; bezel: number; gain: number; bend: number; frost: number }) {
  return <filter id={id} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation={bezel} result="soft" />
    <feColorMatrix in="soft" type="matrix" values="0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 0 1" result="h" />
    <feConvolveMatrix in="h" order="3 1" kernelMatrix={`${gain} 0 -${gain}`} divisor="1" bias="0.5" preserveAlpha="true" edgeMode="duplicate" result="gx" />
    <feConvolveMatrix in="h" order="1 3" kernelMatrix={`${gain} 0 -${gain}`} divisor="1" bias="0.5" preserveAlpha="true" edgeMode="duplicate" result="gy" />
    <feColorMatrix in="gx" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1" result="mx" />
    <feColorMatrix in="gy" type="matrix" values="0 0 0 0 0  1 0 0 0 0  0 0 0 0 0  0 0 0 0 1" result="my" />
    <feBlend in="mx" in2="my" mode="lighten" result="raw" />
    <feGaussianBlur in="raw" stdDeviation="1.5" result="map" />
    <feGaussianBlur in="SourceGraphic" stdDeviation={frost} result="frosted" />
    <feDisplacementMap in="frosted" in2="map" scale={bend} xChannelSelector="R" yChannelSelector="G" result="bent" />
    <feColorMatrix in="map" type="matrix" values="1.6 1.6 0 0 -1.6  1.6 1.6 0 0 -1.6  1.6 1.6 0 0 -1.6  0 0 0 0 1" result="lit" />
    <feComposite in="bent" in2="lit" operator="arithmetic" k2="1" k3="0.55" result="shine" />
    <feComposite in="shine" in2="SourceAlpha" operator="in" />
  </filter>;
}
function GlassFilters() {
  return <svg className="guest-glass-filters" width="0" height="0" aria-hidden="true" focusable="false">
    <GlassFilter id="nfc-glass-lg" bezel={12} gain={7} bend={46} frost={1.2} />
    <GlassFilter id="nfc-glass-sm" bezel={6} gain={4} bend={24} frost={0.8} />
  </svg>;
}

/**
 * Khuôn 6's Google button (`effects.googleButton` in its manifest): a raised orb holding the "G", with the label running round it. The ring and
 * the orb are decoration (aria-hidden); the label itself stays in the button, hidden only from sight, so the link's
 * name and the words every visitor is offered are exactly those of every other template.
 * The "G" is the four-part mark below used as a mask over a conic blend, so it takes Google's own colours, unaltered.
 */
const G_MASK = `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><g fill="white"><path d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5Z"/><path d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6Z"/><path d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1Z"/><path d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48Z"/></g></svg>')}")`;
function GoogleOrb({ label }: { label: string }) {
  const ring = `${label.toLocaleUpperCase('vi')} · `.repeat(2);
  return <>
    <span className="google-orb" aria-hidden="true">
      <svg className="google-ring" viewBox="0 0 300 300">
        <defs><path id="google-ring-path" d="M150 150m-128 0a128 128 0 1 1 256 0a128 128 0 1 1-256 0" /></defs>
        <text><textPath href="#google-ring-path" textLength="800" lengthAdjust="spacing">{ring}</textPath></text>
      </svg>
      <span className="google-orb-face"><span className="google-g" style={{ WebkitMaskImage: G_MASK, maskImage: G_MASK }} /></span>
    </span>
    <span className="google-label">{label}</span>
  </>;
}

/**
 * On Android, tilting the phone moves the light on the orb (Tài, 24/09). The page only listens; it never calls
 * `requestPermission`, so no visitor is ever asked for anything. iPhone delivers no motion events without that
 * permission, so there the light keeps its own slow sweep. (Detecting iPhone by the presence of `requestPermission`
 * does not work: desktop Chrome has it too.) Reduced motion: no tilt. One frame's work per event at most.
 */
function useTiltLight(enabled: boolean) {
  useEffect(() => {
    const main = document.querySelector<HTMLElement>('main.guest');
    if (!enabled || !main || !('DeviceOrientationEvent' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const clamp = (n: number) => Math.max(-1, Math.min(1, n));
    const tilt = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      const x = clamp(event.gamma / 30) * 14, y = clamp((event.beta - 45) / 30) * 14;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { main.style.setProperty('--tilt-x', `${x.toFixed(1)}%`); main.style.setProperty('--tilt-y', `${y.toFixed(1)}%`); });
    };
    window.addEventListener('deviceorientation', tilt);
    return () => { window.removeEventListener('deviceorientation', tilt); cancelAnimationFrame(frame); };
  }, [enabled]);
}

/**
 * Whether the poster video may start (E6/E9, 26/09). Not in the server's HTML and not before the page has loaded: a
 * video in the first HTML is fetched while the HTML is still being read, and on 4G it shares the line with the
 * scripts that make the stars work (measured with a 3 MB clip: stars usable at 2.5 s, 2.0 s once it waited). The
 * video's first frame shows meanwhile. Never when the visitor asked their phone to save data. `settled` says the
 * choice is made, so a test can tell "no video" from "no video yet".
 */
function useLateVideo() {
  const [state, setState] = useState({ allowed: false, settled: false });
  useEffect(() => {
    const saveData = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    let timer = 0;
    const go = () => { timer = window.setTimeout(() => setState({ allowed: !saveData, settled: true }), 0); };
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
    return () => { window.removeEventListener('load', go); window.clearTimeout(timer); };
  }, []);
  return state;
}

function Background({ config, scene }: { config: ReturnType<typeof defaultConfig>; scene: boolean }) {
  const b = config.background;
  // A template that paints its own scene owns this layer entirely: no inline colour, no picture to download.
  if (scene) return <div className="guest-bg" aria-hidden="true" />;
  const style = b.kind === 'solid' ? { background: b.color }
    : b.kind === 'gradient' ? { background: `linear-gradient(${b.angle}deg, ${b.colors[0]}, ${b.colors[1]})` } : undefined;
  // A background is a picture, never a video (Tài 26/09): a page published earlier with a video shows its first frame.
  const still = b.kind === 'media' ? stillFor(b.media) : null;
  return <div className="guest-bg" style={style} aria-hidden="true">
    {still && <img className="guest-bg-media" src={still} alt="" />}
    {config.watermark.enabled && <div className="guest-watermark">
      <div className="guest-watermark-track">{Array.from({ length: 48 }, (_, i) => <span key={i}>{config.watermark.text}</span>)}</div>
    </div>}
  </div>;
}

function Poster({ poster, label }: { poster: MediaRef | null; label: string }) {
  const [blocked, plays] = useVideoPlays();
  // The poster's video waits like the background's (E6/E9): an owner's Full HD clip must not share the guest's 4G with
  // the scripts, nor play at all on a phone saving data. Meanwhile its first frame, or an empty frame of the same size.
  const late = useLateVideo();
  if (!poster) return <div className="guest-poster guest-poster-empty"><span>{label}</span></div>;
  if (poster.kind === 'video' && (blocked || !late.allowed)) return poster.still
    ? <img className="guest-poster" src={poster.still} alt="" data-poster-still data-video-settled={late.settled || undefined} data-video-blocked={blocked || undefined} />
    : <div className="guest-poster" aria-hidden="true" data-poster-waiting data-video-settled={late.settled || undefined} />;
  return poster.kind === 'video'
    ? <video ref={plays} className="guest-poster" src={poster.url} poster={poster.still} autoPlay muted loop playsInline preload="metadata" aria-hidden="true" />
    : <img className="guest-poster" src={poster.url} alt="" />;
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] ?? '').join('').toUpperCase();

const ICON_PATHS: Record<LinkIcon, string> = {
  instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.5-1.5h.01',
  facebook: 'M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v7h4v-7h3l1-4h-4V8Z',
  zalo: 'M4 5h16v11H9l-4 3v-3H4V5Zm4 3h5l-5 5h5',
  phone: 'M6 3h3l2 5-2 1a11 11 0 0 0 6 6l1-2 5 2v3a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2Z',
  tiktok: 'M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.6 2.2 4.4 5 4.6',
  booking: 'M4 6h16v14H4V6Zm0 4h16M8 3v5m8-5v5',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1m2 4a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
};
/** Brand marks for the common buttons, drawn simply; other icons use a line glyph. */
function LinkGlyph({ icon }: { icon: LinkIcon }) {
  if (icon === 'instagram') return <svg className="brand-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <defs><radialGradient id="ig-grad" cx="30%" cy="107%" r="150%"><stop offset="0" stopColor="#fdf497"/><stop offset=".05" stopColor="#fdf497"/><stop offset=".45" stopColor="#fd5949"/><stop offset=".6" stopColor="#d6249f"/><stop offset=".9" stopColor="#285AEB"/></radialGradient></defs>
    <rect width="24" height="24" rx="6.5" fill="url(#ig-grad)"/><rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" strokeWidth="1.8"/>
    <circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.8"/><circle cx="16.1" cy="7.9" r="1" fill="#fff"/></svg>;
  if (icon === 'zalo') return <svg className="brand-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <rect width="24" height="24" rx="6.5" fill="#0068FF"/><path d="M5.2 6.6h13.6v8.6H11l-3.6 2.6v-2.6H5.2Z" fill="#fff"/>
    <text x="12" y="13.2" textAnchor="middle" fontSize="5.2" fontWeight="800" fontFamily="Arial, sans-serif" fill="#0068FF">Zalo</text></svg>;
  if (icon === 'tiktok') return <svg className="brand-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <rect width="24" height="24" rx="6.5" fill="#111"/>
    <path d="M13.6 5.5v8.7a2.6 2.6 0 1 1-2.6-2.6" fill="none" stroke="#25F4EE" strokeWidth="2" strokeLinecap="round" transform="translate(-.6 -.4)"/>
    <path d="M13.6 5.5v8.7a2.6 2.6 0 1 1-2.6-2.6" fill="none" stroke="#FE2C55" strokeWidth="2" strokeLinecap="round" transform="translate(.6 .4)"/>
    <path d="M13.6 5.5v8.7a2.6 2.6 0 1 1-2.6-2.6M13.6 5.5c.3 2 1.7 3.4 3.8 3.6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>;
  if (icon === 'facebook') return <svg className="brand-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#1877F2"/><path d="M13.3 19v-5.6h1.9l.3-2.2h-2.2V9.8c0-.6.2-1.1 1.1-1.1h1.2V6.8a15 15 0 0 0-1.7-.1c-1.7 0-2.9 1-2.9 3v1.5H9.1v2.2H11V19Z" fill="#fff"/></svg>;
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICON_PATHS[icon]} /></svg>;
}
const FEEDBACK_ICONS: Record<FeedbackButton['icon'], string> = {
  plane: 'M3.5 11.2 20.6 3.6c.6-.3 1.2.3 1 .9l-5.2 15.8c-.2.6-1 .7-1.4.2l-3.9-4.4-4.2 3.2c-.4.3-.9 0-.9-.5v-4.5L3.3 12.6c-.6-.3-.5-1.2.2-1.4ZM11.1 15.3l8.3-10.4',
  chat: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.6 3.7c-.4.3-.9 0-.9-.5V16A2.5 2.5 0 0 1 4 13.5Z',
  mail: 'M3.5 6.5A1.5 1.5 0 0 1 5 5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5ZM4 6.5l8 6.5 8-6.5',
};
/** No disc behind it: the glyph itself, filled with the shop colour and outlined, floats over the page. */
function FeedbackGlyph({ button }: { button: FeedbackButton }) {
  return <svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true">
    <path d={FEEDBACK_ICONS[button.icon]} fill={button.color} stroke={button.outline} strokeWidth="1.6" strokeLinejoin="round" paintOrder="stroke" />
  </svg>;
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
  if (result.kind === 'saved') return 'saved';
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

/** The hint appears once the visitor has reached the bottom of the page and stayed two seconds, then stays. */
/**
 * Khuôn 6's way out (thiet-ke-va-khuon.md mục 12): the tap covers this page for `ms`, then the same tab goes to Google.
 * Only a plain tap is held back -- a long-press, a modified click or reduced motion get the browser's own behaviour at
 * once. Coming back with the Back button restores the page from the cache with the cover still on, so `pageshow`
 * takes it off; and if the navigation never happens (offline), the cover lifts by itself.
 */
function useLeaveTransition(ms: number, reduced: boolean) {
  const [leaving, setLeaving] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const back = (event: PageTransitionEvent) => { if (event.persisted) setLeaving(null); };
    window.addEventListener('pageshow', back); return () => window.removeEventListener('pageshow', back);
  }, []);
  useEffect(() => {
    if (!leaving) return;
    const lift = window.setTimeout(() => setLeaving(null), ms + 2500); return () => window.clearTimeout(lift);
  }, [leaving, ms]);
  const leave = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!ms || reduced || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect(), href = event.currentTarget.href;
    setLeaving({ x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) });
    window.setTimeout(() => window.location.assign(href), ms);
  };
  return [leaving, leave] as const;
}

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
 * One small line at the foot of the page (A5, Tài chốt 21/09): no banner, no popup, nothing over the Google button.
 * The page sets no cookie, so a consent banner would be saying something untrue. Erasing asks once, inline.
 */
function LegalFooter({ p, ready, erase }: { p: (typeof pageCopy)[Language]; ready: boolean; erase: () => Promise<{ kind: 'erased' | 'nothing' | 'error' }> }) {
  const [step, setStep] = useState<'idle' | 'ask' | 'erasing' | 'erased' | 'nothing' | 'error'>('idle');
  async function confirm() {
    setStep('erasing');
    const result = await erase();
    setStep(result.kind === 'erased' ? 'erased' : result.kind === 'nothing' ? 'nothing' : 'error');
  }
  // No prefetch (E6): the two legal pages were fetched during start-up, on the guest's 4G, for a link few ever open.
  return <footer className="guest-legal" data-legal>
    <p><Link href="/quyen-rieng-tu" prefetch={false}>{p.privacy}</Link> · <Link href="/dieu-khoan" prefetch={false}>{p.terms}</Link>
      {step === 'idle' && <> · <button type="button" disabled={!ready} onClick={() => setStep('ask')}>{p.erase}</button></>}</p>
    {step === 'ask' && <p role="alertdialog" aria-label={p.erase}>{p.eraseAsk}{' '}
      <button type="button" data-erase-confirm onClick={() => void confirm()}>{p.eraseYes}</button> · <button type="button" onClick={() => setStep('idle')}>{p.eraseNo}</button></p>}
    {step !== 'idle' && step !== 'ask' && <p role="status" data-erase-result={step}>{
      step === 'erasing' ? p.erasing : step === 'erased' ? p.erased : step === 'nothing' ? p.eraseNothing : p.eraseFailed}</p>}
  </footer>;
}

export default function ShopFeedbackV2(shop: Props) {
  const [lang, setLang] = useState<Language>('vi'); const t = copy[lang], m = messages[lang], p = pageCopy[lang];
  const [service, setService] = useState<DocumentFeedbackService | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  // Initialize after hydration. StrictMode/remount resolves the same document-owned service.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      // No proof, no service: a still (the page list's thumbnail) never writes, and since lát A3b nothing else lacks one.
      if (!active || shop.still || !shop.render) return;
      try { setService(documentFeedbackService(window, { shop: shop.slug, render: shop.render })); }
      catch { setUnavailable(true); }
    });
    return () => { active = false; };
  }, [shop.slug, shop.render, shop.still]);
  const client = useDocumentFeedback(service);
  const state = client.state?.queue.coordinator, current = state?.current;
  const snapshot = current?.snapshot, mutation = state?.mutation;
  const opening = state?.opens.find(entry => entry.event.loadKey === current?.event.loadKey);
  const reduced = useReducedMotion() || !!shop.still;
  const hint = useBottomHint();
  // What the template's package declares (templates/<khoá>/manifest.json, lát M1).
  const effects = effectsOf(shop.template);
  const leaveMs = effects.leaveTransitionMs ?? 0;
  const glass = !!effects.glass;
  const orb = effects.googleButton === 'orb';
  useTiltLight(orb);
  const page = useGlassPlacement(glass);
  const [leaving, leave] = useLeaveTransition(leaveMs, reduced);
  const config = shop.pageConfig ?? { ...defaultConfig(shop.name),
    poster: shop.heroUrl && shop.heroKind ? { kind: shop.heroKind, url: shop.heroUrl } : null };
  const feedbackButton = config.feedbackButton ?? DEFAULT_FEEDBACK_BUTTON;
  // The template version's own fields (settings.ts): colours and numbers as --s-*, choices and switches as data-s-*.
  const own = settingsOnPage(config.settings);

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'form' | 'thanks'>('form');
  const [choice, setChoice] = useState(0);
  const [message, setMessage] = useState(''); const [topic, setTopic] = useState<Topic>('other'); const [phone, setPhone] = useState('');
  const [validationState, setValidationState] = useState<{ key: MessageKey; loadKey?: string } | null>(null);
  const validation = validationState?.loadKey === current?.event.loadKey ? validationState?.key : null;
  function setValidation(key: MessageKey | null) { setValidationState(key ? { key, loadKey: current?.event.loadKey } : null); }
  const [sending, setSending] = useState(false);
  const submitted = useRef(false);
  // Text waiting for its star to be confirmed: Send saves the star first, then the text.
  const queued = useRef<{ topic: string; message: string; phone?: string } | null>(null);
  const planeRef = useRef<HTMLButtonElement>(null), modalRef = useRef<HTMLDivElement>(null), cardRef = useRef<HTMLDivElement>(null);

  const busy = !!mutation?.running || !!mutation?.pending || !!client.state?.actionsRunning;
  const crossContext = !!mutation?.pending && mutation.pending.loadKey !== current?.event.loadKey;
  const disabledStars = !snapshot || !!opening?.running || sending || crossContext || mutation?.pending?.phase === 'refresh';
  const canSend = !!snapshot && !busy && !opening?.running && !sending && !crossContext;
  const locked = sending || !!mutation?.pending;
  const completed = mutation?.result;
  const resultHere = completed && 'snapshot' in completed && completed.snapshot.visit.id === snapshot?.visit.id ? completed : null;
  let status: MessageKey = validation ?? resultMessage(resultHere) ?? 'ready';
  if (!validation) {
    if (unavailable) status = 'unavailable';
    else if (!snapshot) status = opening?.running || !opening ? 'loading' : resultMessage(opening.result) ?? 'unavailable';
    else if (mutation?.running || opening?.running) status = 'saving';
    else if (mutation?.pending) status = 'pending';
    else if (state?.notice) status = state.notice === 'DESIRED_CONTEXT_CHANGED' ? 'changed' : 'conflict';
    if (status === 'saved' && phase === 'form') status = 'ready';
  }
  const connectionProblem = unavailable || (!snapshot && !!opening && !opening.running);

  // Reopening keeps whatever the customer chose or typed and has not sent yet.
  function openCard() {
    setPhase('form'); setValidation(null); setOpen(true);
    client.event('card_opened', { layout: config.layout });
  }
  function closeCard() {
    setOpen(false); setPhase('form');
    planeRef.current?.focus({ preventScroll: true });
  }
  function finish(result: CoordinatorResult) {
    if (result.kind === 'saved') {
      const next = queued.current;
      if (result.mutation !== 'feedback' && next) {
        queued.current = null;
        void client.feedback(next.topic, next.message, next.phone).then(finish);
        return;
      }
      submitted.current = false; setSending(false);
      setMessage(''); setTopic('other'); setPhone(''); setChoice(0); setPhase('thanks');
      return;
    }
    if (result.kind === 'pending') return;
    submitted.current = false; setSending(false); queued.current = null;
    if (result.kind === 'conflict') setChoice(result.snapshot.experience?.rating ?? 0);
    if (result.kind === 'error') setValidation(resultMessage(result));
  }
  function send() {
    if (!canSend || submitted.current) return;
    const text = message.trim();
    const number = normalizePhone(phone);
    if (number === undefined) { setValidation('phoneInvalid'); return; }
    if (number && !text) { setValidation('phoneNeedsText'); return; }
    if (!choice && !text) { setValidation('empty'); return; }
    if (text && !normalizeFeedback(topic, message)) { setValidation('invalid'); return; }
    submitted.current = true; setSending(true); setValidation(null);
    // Shape, never content: whether there were stars, whether there were words, whether a number was left --
    // never the words themselves and never the number (lát mục 7).
    client.event('feedback_sent', { stars: choice ?? 0, words: !!text, calledBack: !!number, layout: config.layout });
    const note = text ? { topic, message, ...(number ? { phone: number } : {}) } : null;
    if (choice) {
      queued.current = note;
      void client.rate(choice).then(finish);
    } else void client.feedback(topic, message, note?.phone).then(finish);
  }

  // The page is open for real once the visit exists; before that there is nothing to record it against, and the
  // sink would drop it. Once per visit, and a resumed tab is a new visit with its own row (lát mục 7).
  // Through a ref, because the hook hands back a fresh object every render: an effect that depended on it would
  // re-run on every render, and its cleanup would fire "abandoned" while the customer was still typing.
  const emit = useRef(client.event); emit.current = client.event;
  const shape = useRef({ layout: config.layout, schema: config.schemaVersion });
  shape.current = { layout: config.layout, schema: config.schemaVersion };

  const announced = useRef('');
  useEffect(() => {
    const id = snapshot?.visit.id;
    if (!id || announced.current === id) return;
    announced.current = id;
    emit.current('page_opened', shape.current);
  }, [snapshot?.visit.id]);

  // A customer who opened the card and left without sending is the most useful thing the log can hold: it is the
  // only signal that the shop nearly heard something and did not.
  const sent = useRef(false);
  useEffect(() => { if (phase === 'thanks') sent.current = true; }, [phase]);
  useEffect(() => {
    if (!open) return;
    return () => { if (!sent.current) emit.current('card_abandoned', { layout: shape.current.layout }); };
  }, [open]);

  // Spotlight: the page behind stops scrolling, Escape closes, focus moves into the card.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement, previous = root.style.overflow;
    root.style.overflow = 'hidden';
    cardRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeCard(); };
    document.addEventListener('keydown', onKey);
    return () => { root.style.overflow = previous; document.removeEventListener('keydown', onKey); };
  }, [open]);
  useEffect(() => {
    if (phase === 'thanks' && !reduced && modalRef.current) burstConfetti(modalRef.current);
    // Confetti fires once per thank-you, not again when the motion preference changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const statusLine = <p role="status" className="guest-status">{m[status]}</p>;
  const retryButtons = <>
    {mutation?.pending && !mutation.running && <button type="button" className="guest-send" onClick={() => { setValidation(null); void client.retry().then(finish); }}>{m.retry}</button>}
    {state?.opens.filter(entry => entry.result?.kind === 'pending' && !entry.running).map((entry, index) => <button type="button" key={entry.event.loadKey} className="guest-send" onClick={() => { setValidation(null); void client.retryOpen(entry.event.loadKey); }}>{m.retryOpen}{index > 0 ? ` (${index + 1})` : ''}</button>)}
  </>;

  return <main className="guest" lang={lang} data-template={shop.template} data-template-version={shop.template ? shop.templateVersion ?? 1 : undefined} data-layout={config.layout} data-schema={config.schemaVersion} data-ready={snapshot ? '' : undefined}
    ref={page} data-leaving={leaving ? '' : undefined} data-button={orb ? 'orb' : undefined}
    {...own.attributes}
    style={{ ...sceneTokens(config.background), ...own.style, ...(leaving ? { '--leave-x': `${leaving.x}px`, '--leave-y': `${leaving.y}px` } : {}) } as CSSProperties}>
    <Background config={config} scene={glass} />
    <article className="guest-sheet" aria-hidden={open || undefined}>
      <div className="guest-language"><label htmlFor="language">Ngôn ngữ / Language</label><select id="language" value={lang} onChange={e => setLang(e.target.value as Language)}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></div>
      <Poster poster={config.poster} label={p.poster} />
      <div className="guest-logo">{config.logo ? <img src={config.logo.url} alt="" /> : <span aria-hidden="true">{initials(config.name)}</span>}</div>
      <div className="guest-body">
        <h1>{shop.name}</h1>
        <section className="google-invitation"><p>{t.invite}</p>
          {shop.googleUrl
            ? <a className="google-button" data-google href={shop.googleUrl} {...(leaveMs ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                onClick={event => { client.event('google_tapped', { layout: config.layout }); leave(event); }}>{orb ? <GoogleOrb label={p.google} /> : <><GoogleMark /><span>{p.google}</span></>}</a>
            : <button className="google-button" data-google disabled>{orb ? <GoogleOrb label={p.google} /> : <><GoogleMark /><span>{p.google}</span></>}</button>}
          <p className="guest-note">{t.thanks}</p></section>
        {config.links.length > 0 && <nav className="guest-links" aria-label={p.links}>{config.links.map(link => <a key={`${link.icon}:${link.url}`} href={link.url} data-icon={link.icon}
          {...(link.url.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}><LinkGlyph icon={link.icon} /><span>{link.label[lang]}</span></a>)}</nav>}
        {!open && connectionProblem && <div className="guest-connection">{statusLine}{retryButtons}</div>}
        <LegalFooter p={p} ready={!!snapshot} erase={client.erase} />
      </div>
    </article>

    <div className="guest-float" aria-hidden={open || undefined}>
      <button ref={planeRef} type="button" id="private-feedback" className="guest-plane" aria-label={p.title} aria-haspopup="dialog" aria-expanded={open}
        aria-controls="private-card" data-icon={feedbackButton.icon} onClick={openCard}><FeedbackGlyph button={feedbackButton} /></button>
      {hint && !open && <button type="button" className="guest-hint" data-hint onClick={openCard}>{p.hint}</button>}
    </div>

    {open && <div ref={modalRef} className="guest-modal" onPointerDown={event => { if (event.target === event.currentTarget) closeCard(); }}>
      <div ref={cardRef} id="private-card" className="guest-card" role="dialog" aria-modal="true" aria-labelledby="private-card-title" tabIndex={-1} data-phase={phase}>
        <button type="button" className="guest-close" aria-label={p.close} onClick={closeCard}>×</button>
        {phase === 'thanks'
          ? <div className="guest-thanks" data-thanks>
              <p id="private-card-title">{p.thanks}</p>
              <button type="button" className="guest-send" onClick={closeCard}>{p.close}</button>
            </div>
          : <form id="private-form" onSubmit={e => { e.preventDefault(); send(); }}>
              <h2 id="private-card-title">{p.title}</h2>
              <p className="guest-note">{t.privateNote}</p>
              <p className="guest-feeling">{p.feeling}</p>
              <div className="guest-stars" role="group" aria-label={p.feeling}>{[1, 2, 3, 4, 5].map(n => {
                const face = n <= choice ? FACES[choice - 1] : null;
                return <button type="button" key={n} disabled={disabledStars} aria-label={`${n} ${t.stars}`} aria-pressed={choice === n}
                  data-filled={!!face} onClick={() => { setValidation(null); setChoice(n); client.event('star_chosen', { stars: n }); }}>
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
              <button className="guest-send" disabled={!canSend}>{t.send}</button>
              {statusLine}{retryButtons}
            </form>}
      </div>
    </div>}
    {glass && <GlassFilters />}
  </main>;
}
