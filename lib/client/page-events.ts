/**
 * Sending behaviour to the server without ever making the customer wait (lát mục 7, Tài chốt 21/09/2026).
 *
 * Three rules, and each one is the difference between measurement and a bug:
 *
 *   - **never awaited.** Nothing on the page reads the result. A row that never arrives costs nobody anything; a
 *     customer watching a spinner costs the shop the customer;
 *   - **never throws.** A failed beacon is not an error the page should know about, so every path swallows;
 *   - **batched, and flushed when the page is going away.** `visibilitychange` to hidden is the one signal a phone
 *     reliably gives before it kills the tab; `pagehide` covers the rest. `fetch` with `keepalive` survives both,
 *     which `sendBeacon` also does -- but sendBeacon cannot set a header, and moving the capability into the body
 *     just to please it would give this one call a different way of authenticating than everything else.
 */
export type GuestEventName = 'page_opened' | 'google_tapped' | 'card_opened' | 'star_chosen' | 'feedback_sent' | 'card_abandoned';
type Queued = { name: GuestEventName; sinceOpenMs: number; detail?: Record<string, string | number | boolean> };
type Ports = { fetch?: typeof fetch; now?: () => number; listen?: (event: string, run: () => void) => void };
/** The server refuses more than twenty in one call, so the queue flushes before it can build one. */
const MAX_BATCH = 20;

export type EventSink = {
  send: (name: GuestEventName, detail?: Record<string, string | number | boolean>) => void;
  flush: () => void;
};
/** Does nothing, for a page with no visit yet. Callers never branch on whether recording is available. */
export const NO_EVENTS: EventSink = { send: () => {}, flush: () => {} };

export function createEventSink(shop: string, visitId: string, secret: string, ports: Ports = {}): EventSink {
  const send: typeof globalThis.fetch | undefined = ports.fetch ?? (typeof fetch === 'function' ? fetch : undefined);
  const now = ports.now ?? (() => Date.now());
  const listen = ports.listen ?? ((event: string, run: () => void) => {
    if (typeof document !== 'undefined') document.addEventListener(event, run);
  });
  if (!send || !/^[0-9a-f-]{36}$/.test(visitId)) return NO_EVENTS;
  const post = send;
  const opened = now();
  let queue: Queued[] = [];

  function flush() {
    if (!queue.length) return;
    const batch = queue; queue = [];
    try {
      void post(`/api/v2/shops/${encodeURIComponent(shop)}/visits/${visitId}/events`, {
        method: 'POST', keepalive: true, cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ events: batch }),
      }).catch(() => {});
    } catch { /* A page that cannot measure itself still works. */ }
  }
  listen('visibilitychange', () => { if (typeof document === 'undefined' || document.visibilityState === 'hidden') flush(); });
  listen('pagehide', flush);

  return {
    send(name, detail) {
      // Clamped to the day the server accepts, so a clock that jumps cannot make the whole batch be refused.
      const sinceOpenMs = Math.min(86_400_000, Math.max(0, Math.round(now() - opened)));
      queue.push(detail ? { name, sinceOpenMs, detail } : { name, sinceOpenMs });
      if (queue.length >= MAX_BATCH) flush();
    },
    flush,
  };
}
