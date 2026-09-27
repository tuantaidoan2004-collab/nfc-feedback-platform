'use client';
import { useEffect } from 'react';

// Effect module (lát M2): nút Google hạt ngọc và ánh sáng theo độ nghiêng — `effects.googleButton: "orb"`. Moved unchanged.
/**
 * Template 6's Google button (`effects.googleButton` in its manifest): a raised orb holding the "G", with the label running round it. The ring and
 * the orb are decoration (aria-hidden); the label itself stays in the button, hidden only from sight, so the link's
 * name and the words every visitor is offered are exactly those of every other template.
 * The "G" is the four-part mark below used as a mask over a conic blend, so it takes Google's own colours, unaltered.
 */
const G_MASK = `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><g fill="white"><path d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5Z"/><path d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6Z"/><path d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1Z"/><path d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48Z"/></g></svg>')}")`;
export function GoogleOrb({ label }: { label: string }) {
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
export function useTiltLight(enabled: boolean) {
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

