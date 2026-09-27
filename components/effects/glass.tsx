'use client';
import { useEffect, useRef } from 'react';

// Effect module (lát M2): kính khúc xạ — `effects.glass` in a template's manifest. Moved unchanged from the guest page.
/**
 * Template 3: where each glass pane sits on the page. A pane repaints the scene behind it, shifted by its own offset, and
 * the scene scrolls with the page, so pane and scene never slide past each other: the refraction filter runs once and
 * the browser keeps the result. Measured again only when something changes size (a poster loading, a language switch,
 * turning the phone). A pane can move without changing size -- a line above it rewraps -- so every block that can push
 * a pane is watched too, not only the panes. `data-glass` marks the copies as aligned; until then only the frosted
 * tint shows.
 */
const GLASS_PANES = '.guest-body, .guest-links a';
export function useGlassPlacement(enabled: boolean) {
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
 * image and no script. Rules learned making it agree across engines (thiet-ke-va-template.md mục 15):
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
export function GlassFilters() {
  return <svg className="guest-glass-filters" width="0" height="0" aria-hidden="true" focusable="false">
    <GlassFilter id="nfc-glass-lg" bezel={12} gain={7} bend={46} frost={1.2} />
    <GlassFilter id="nfc-glass-sm" bezel={6} gain={4} bend={24} frost={0.8} />
  </svg>;
}

