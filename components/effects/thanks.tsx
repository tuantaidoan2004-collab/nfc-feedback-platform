'use client';
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';

/**
 * Effect module (lát M2): lời cảm ơn trước khi sang Google — `effects.thankYouSeconds` in a template's manifest.
 *
 * Tài chốt 27/09 (docs/ui-ux-nguon-tham-khao.md mục 3, ý 1 và ý 3): a tap on the Google button shows the shop's thanks,
 * hearts burst and fade like fireworks, a countdown runs, and after the full count Google opens in a **new tab** while
 * this page stays as it was, for the guest to come back to. No "go now" button (Tài: count the full time).
 *
 * The rules it keeps (docs/google-policy.md): the same for every visitor, whatever they did on the page; no gift, no
 * offer, no stars, no word about what to write; the button itself and its words are untouched.
 *
 * A browser only lets a page open a tab while the tap is still fresh. Chromium keeps it about five seconds, so the
 * count is capped at four (template-manifest.ts). Where the new tab is held back anyway -- iPhone may be stricter --
 * `window.open` answers null and the card offers one tap on "Mở Google": a link the guest presses, not a way to skip
 * the count. Only a plain tap is held; a long-press or a modified click keeps the browser's own behaviour.
 */
export type ThanksCopy = { title: string; body: string; blocked: string; open: string };
export const THANKS_COPY: Record<'vi' | 'en', ThanksCopy> = {
  vi: { title: 'Cảm ơn quý khách đã ghé!',
    body: 'Trang sẽ tự động chuyển sang Google. Quý khách thân mến hãy quay lại trang này để khám phá thêm nhé — Merci beaucoup!',
    blocked: 'Trình duyệt chưa cho mở tab mới.', open: 'Mở Google' },
  en: { title: 'Thank you for stopping by!',
    body: 'Google opens in a new tab in a moment. Do come back to this page to see what else is on — merci beaucoup!',
    blocked: 'Your browser held the new tab back.', open: 'Open Google' },
};
type State = { href: string; left: number; blocked: boolean } | null;
const HEARTS = 14;

/** Reduced motion keeps the thanks and the wait -- a wait is not motion -- and drops the hearts and the moving ring (ThanksCard, effects.css). */
export function useThanks(seconds: number, beforeLeave: () => void) {
  const [state, setState] = useState<State>(null);
  const timers = useRef({ tick: 0, open: 0 });
  const stop = () => { window.clearInterval(timers.current.tick); window.clearTimeout(timers.current.open); };
  useEffect(() => stop, []);
  const start = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!seconds || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const href = event.currentTarget.href;
    stop();
    setState({ href, left: seconds, blocked: false });
    timers.current.tick = window.setInterval(() => {
      setState(current => current && { ...current, left: current.left - 1 });
    }, 1000);
    timers.current.open = window.setTimeout(() => {
      window.clearInterval(timers.current.tick);
      // The tap is recorded before the tab opens: this tab may stay visible and never signal that the guest left.
      beforeLeave();
      const tab = window.open(href, '_blank');
      if (tab) { try { tab.opener = null; } catch { /* Cross-origin already: nothing to cut. */ } setState(null); }
      else setState(current => current && { ...current, left: 0, blocked: true });
    }, seconds * 1000);
  };
  return { state, start };
}

export function ThanksCard({ state, copy, reduced, seconds }: { state: NonNullable<State>; copy: ThanksCopy; reduced: boolean; seconds: number }) {
  return <div className="thanks-layer" data-thanks-countdown={state.blocked ? 'blocked' : state.left}>
    <div className="thanks-card" role="dialog" aria-modal="true" aria-labelledby="thanks-title">
      {!reduced && <span className="thanks-hearts" aria-hidden="true">{Array.from({ length: HEARTS }, (_, i) =>
        <span key={i} style={{ '--i': i, '--n': HEARTS } as CSSProperties}>♥</span>)}</span>}
      <p id="thanks-title" className="thanks-title">{copy.title}</p>
      <p className="thanks-body">{copy.body}</p>
      {state.blocked
        ? <p className="thanks-blocked">{copy.blocked} <a href={state.href} target="_blank" rel="noopener noreferrer" data-thanks-open>{copy.open}</a></p>
        : <span className="thanks-count" style={{ '--s': `${seconds}s` } as CSSProperties} aria-hidden="true">{Math.max(1, state.left)}</span>}
    </div>
  </div>;
}
