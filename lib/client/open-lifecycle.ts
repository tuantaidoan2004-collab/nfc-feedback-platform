import type { NavigationKind } from '../domain/visit-rating';
export type OpenEvent = Readonly<{ loadKey: string; navigationKind: NavigationKind }>;
/** No clocks/session decisions here. The server owns the 15-minute window. */
export function createOpenLifecycle(uuid: () => string, initial: NavigationKind) {
  let current: OpenEvent = Object.freeze({ loadKey: uuid(), navigationKind: initial });
  let away = false;
  const listeners = new Set<(event: OpenEvent) => void>();
  return {
    current: () => current,
    hide: () => { away = true; },
    show: () => {
      if (!away) return current;
      away = false;
      current = Object.freeze({ loadKey: uuid(), navigationKind: 'resume' });
      for (const listener of listeners) listener(current);
      return current;
    },
    subscribe: (listener: (event: OpenEvent) => void) => {
      listeners.add(listener);
      // Remount gets the same event/key, not a second open. Future transport must deduplicate by key.
      listener(current);
      return () => { listeners.delete(listener); };
    },
  };
}
const documents = new WeakMap<Document, ReturnType<typeof createOpenLifecycle>>();
/** Document-owned, not React-mount-owned. No unload listeners (preserve BFCache eligibility). */
export function documentLifecycle(win: Window = window) {
  const existing = documents.get(win.document);
  if (existing) return existing;
  const navigation = win.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const kind = navigation?.type === 'reload' ? 'reload' : navigation?.type === 'back_forward' ? 'back_forward' : 'load';
  const lifecycle = createOpenLifecycle(() => win.crypto.randomUUID(), kind);
  win.addEventListener('pagehide', lifecycle.hide);
  win.addEventListener('pageshow', event => { if (event.persisted) lifecycle.show(); });
  win.document.addEventListener('visibilitychange', () => {
    if (win.document.visibilityState === 'hidden') lifecycle.hide(); else lifecycle.show();
  });
  documents.set(win.document, lifecycle);
  return lifecycle;
}
