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
type Ports = { fetch?: typeof fetch; listen?: (event: string, run: () => void) => void };
/** The server refuses more than twenty in one call, so the queue flushes before it can build one. */
const MAX_BATCH = 20;

export type EventSink = {
  /**
   * `sinceOpenMs` is passed in, not measured here, because the sink is built lazily -- after the first thing the
   * customer did. Measuring inside would date every event from whenever the sink happened to exist, which is the
   * one number this whole log is for.
   */
  send: (name: GuestEventName, sinceOpenMs: number, detail?: Record<string, string | number | boolean>) => void;
  flush: () => void;
  /** Throws away what has not gone out yet, and everything sent after. Called when the customer erases (A5). */
  drop: () => void;
};
/** Does nothing, for a page with no visit yet. Callers never branch on whether recording is available. */
export const NO_EVENTS: EventSink = { send: () => {}, flush: () => {}, drop: () => {} };
/** Clamped to the day the server accepts, so a clock that jumps cannot make a whole batch be refused. */
export const sinceOpen = (openedAt: number, at: number) => Math.min(86_400_000, Math.max(0, Math.round(at - openedAt)));

/**
 * The same rule the transport uses: a published page talks to `/api/v2/pages/…`, and the per-slug routes are
 * switched off whenever publishing is on. A sink that only knew the slug path would answer 404 to every real
 * customer -- found by probing production rather than by a test, because the harness runs the two modes as two
 * separate suites and neither crosses into the other (21/09).
 */
export function createEventSink(shop: string, visitId: string, secret: string, render: { proof: string } | undefined, ports: Ports = {}): EventSink {
  const send: typeof globalThis.fetch | undefined = ports.fetch ?? (typeof fetch === 'function' ? fetch : undefined);
  const listen = ports.listen ?? ((event: string, run: () => void) => {
    if (typeof document !== 'undefined') document.addEventListener(event, run);
  });
  if (!send || !/^[0-9a-f-]{36}$/.test(visitId)) return NO_EVENTS;
  const post = send;
  let queue: Queued[] = [], dropped = false;

  function flush() {
    if (!queue.length) return;
    const batch = queue; queue = [];
    try {
      const base = render ? '/api/v2/pages/visits' : `/api/v2/shops/${encodeURIComponent(shop)}/visits`;
      void post(`${base}/${visitId}/events`, {
        method: 'POST', keepalive: true, cache: 'no-store',
        // The published path refuses anything without the render proof, exactly as the rating and feedback calls
        // carry it. A sink that forgot it answered 403 to every beacon while every other test stayed green.
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}`, ...(render ? { 'X-NFC-Render': render.proof } : {}) },
        body: JSON.stringify({ events: batch }),
      }).catch(() => {});
    } catch { /* A page that cannot measure itself still works. */ }
  }
  listen('visibilitychange', () => { if (typeof document === 'undefined' || document.visibilityState === 'hidden') flush(); });
  listen('pagehide', flush);

  return {
    send(name, sinceOpenMs, detail) {
      if (dropped) return;
      queue.push(detail ? { name, sinceOpenMs, detail } : { name, sinceOpenMs });
      if (queue.length >= MAX_BATCH) flush();
    },
    flush,
    drop() { dropped = true; queue = []; },
  };
}
