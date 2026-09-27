'use client';
import { useEffect, useState, type MouseEvent } from 'react';

// Effect module (lát M2): lớp sương trước khi sang Google, cùng tab — `effects.leaveTransitionMs`. Moved unchanged.
/**
 * Template 6's way out (thiet-ke-va-template.md mục 12): the tap covers this page for `ms`, then the same tab goes to Google.
 * Only a plain tap is held back -- a long-press, a modified click or reduced motion get the browser's own behaviour at
 * once. Coming back with the Back button restores the page from the cache with the cover still on, so `pageshow`
 * takes it off; and if the navigation never happens (offline), the cover lifts by itself.
 */
export function useLeaveTransition(ms: number, reduced: boolean) {
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

