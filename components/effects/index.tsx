'use client';
import type { CSSProperties, MouseEvent, ReactNode, RefObject } from 'react';
import type { TemplateEffects } from '@/lib/publishing/template-manifest';
import { GlassFilters, useGlassPlacement } from './glass';
import { GoogleOrb, useTiltLight } from './orb';
import { useLeaveTransition } from './leave';
import { THANKS_COPY, ThanksCard, useThanks } from './thanks';

/**
 * The registry of the guest page's effect modules (lát M2, `docs/kien-truc-nen-tang.md` M2). A template switches effects
 * on in its manifest (`effects`); the guest page asks this one hook what the switched-on effects add, and puts each
 * contribution in a fixed slot: the page element, the Google button, what happens on the tap, a layer over the page.
 * A new effect is a new module plus one entry here and in template-manifest.ts -- the guest page itself does not change.
 *
 * Hooks run in the same order on every render (React's rule), so every effect's hook is called and told whether it is on.
 */
export type EffectSlots = {
  /** Ref for <main>: the glass measures its panes from it. */
  pageRef: RefObject<HTMLElement | null>;
  /** Attributes and custom properties for <main>. */
  pageAttributes: Record<string, string | undefined>;
  pageStyle: CSSProperties;
  /** Whether the template paints its own scene (the page background draws nothing of its own). */
  scene: boolean;
  /** The Google button's inside, when an effect draws it; otherwise the page draws the standard mark and words. */
  googleContent: ((label: string) => ReactNode) | null;
  /** The link's own target: a new tab, except where an effect leaves in the same tab. */
  googleTarget: { target?: string; rel?: string };
  onGoogleTap: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Drawn last inside <main>. */
  layers: ReactNode;
};

/** `beforeLeave`: what the page must do before an effect takes the guest away in a way the browser may not announce. */
export function useTemplateEffects(effects: TemplateEffects, { reduced, lang, beforeLeave }: { reduced: boolean; lang: 'vi' | 'en'; beforeLeave: () => void }): EffectSlots {
  const glass = !!effects.glass, orb = effects.googleButton === 'orb';
  const leaveMs = effects.leaveTransitionMs ?? 0, thankSeconds = effects.thankYouSeconds ?? 0;
  const pageRef = useGlassPlacement(glass);
  useTiltLight(orb);
  const [leaving, leave] = useLeaveTransition(leaveMs, reduced);
  const thanks = useThanks(thankSeconds, beforeLeave);
  return {
    pageRef,
    pageAttributes: { 'data-leaving': leaving ? '' : undefined, 'data-button': orb ? 'orb' : undefined },
    pageStyle: leaving ? { '--leave-x': `${leaving.x}px`, '--leave-y': `${leaving.y}px` } as CSSProperties : {},
    scene: glass,
    googleContent: orb ? label => <GoogleOrb label={label} /> : null,
    googleTarget: leaveMs ? {} : { target: '_blank', rel: 'noopener noreferrer' },
    onGoogleTap: event => { leave(event); thanks.start(event); },
    layers: <>
      {thanks.state && <ThanksCard state={thanks.state} copy={THANKS_COPY[lang]} reduced={reduced} seconds={thankSeconds} />}
      {glass && <GlassFilters />}
    </>,
  };
}
