import { browserIdentity, type BrowserIdentity } from './browser-identity';
import { documentLifecycle, type OpenEvent } from './open-lifecycle';
import { createEventSink, NO_EVENTS, sinceOpen, type EventSink, type GuestEventName } from './page-events';
import { createVisitCoordinator, type CoordinatorResult } from './visit-coordinator';
import { createLifecycleQueue, type QueueState } from './lifecycle-queue';
import { createVisitFetchTransport, type RenderBinding } from './visit-fetch-transport';

type ReadonlyTree<T> = T extends object ? { readonly [K in keyof T]: ReadonlyTree<T[K]> } : T;
export type FeedbackServiceState = ReadonlyTree<{ queue: QueueState; actionsRunning: number; lastAction: CoordinatorResult | null }>;
export type FeedbackServiceConfig = Readonly<{ shop: string; render?: RenderBinding }>;
type Ports = {
  identity: () => Promise<BrowserIdentity>;
  lifecycle: { subscribe: (listener: (event: OpenEvent) => void) => () => void };
  uuid: () => string;
  fetch: typeof fetch;
  timer: { set: (callback: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
};
export type DocumentFeedbackService = Readonly<{
  state: () => FeedbackServiceState;
  subscribe: (listener: (state: FeedbackServiceState) => void) => () => void;
  start: () => void;
  stop: () => void;
  rate: (score: number) => Promise<CoordinatorResult>;
  feedback: (topic: string, message: string, phone?: string) => Promise<CoordinatorResult>;
  retry: () => Promise<CoordinatorResult>;
  retryOpen: (loadKey: string) => Promise<CoordinatorResult>;
  /** Fire-and-forget behaviour. Returns nothing, throws nothing, and is never awaited (lát mục 7). */
  event: (name: GuestEventName, detail?: Record<string, string | number | boolean>) => void;
}>;
function shopConfig(config: FeedbackServiceConfig): string {
  if (!config || Object.keys(config).some(key => !['shop', 'render'].includes(key)) || typeof config.shop !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(config.shop) || ['api', 'zzz', 't', 'demo'].includes(config.shop.toLowerCase())) throw Error('INVALID_SERVICE_CONFIG');
  return config.shop.toLowerCase();
}

/** Injectable registry. disposeForTests is deliberately absent from the production service API. */
export function createDocumentFeedbackRegistry(resolvePorts: (win: Window) => Ports) {
  const registry = new WeakMap<Document, { win: Window; shop: string; binding: string; service: DocumentFeedbackService; dispose: () => void; settled: () => Promise<void> }>();
  function get(win: Window, config: FeedbackServiceConfig): DocumentFeedbackService {
    const shop = shopConfig(config);
    const binding = JSON.stringify(config.render ?? null);
    const existing = registry.get(win.document);
    if (existing) {
      if (existing.win !== win || existing.shop !== shop || existing.binding !== binding) throw Error('DOCUMENT_CONFIG_MISMATCH');
      return existing.service;
    }
    const ports = resolvePorts(win);
    const transport = createVisitFetchTransport(shop, ports, config.render);
    const coordinator = createVisitCoordinator({ ...transport, identity: ports.identity, uuid: ports.uuid });
    const queue = createLifecycleQueue(coordinator);
    const listeners = new Set<(state: FeedbackServiceState) => void>();
    let actionsRunning = 0;
    let lastAction: CoordinatorResult | null = null;
    let disposed = false;
    let actionSequence = 0;
    const state = (): FeedbackServiceState => structuredClone({ queue: queue.state(), actionsRunning, lastAction });
    /**
     * Behaviour goes out from here, not from the page, because the capability lives here and has no business in
     * the React tree (lát mục 7). Bound lazily to whichever visit is current, rebuilt when that changes, and
     * entirely fire-and-forget: the caller gets nothing back and never waits.
     */
    let sink: Promise<EventSink> = Promise.resolve(NO_EVENTS), sinkVisit = '', openedAt = 0;
    function event(name: GuestEventName, eventDetail?: Record<string, string | number | boolean>) {
      const visitId = queue.state().coordinator.current?.snapshot?.visit.id;
      if (!visitId) return;
      // The visit is claimed before the first await, or two events arriving together each build their own sink
      // and the first one's queue is lost. The moment is taken here too, for the same reason: later is wrong.
      if (sinkVisit !== visitId) {
        sinkVisit = visitId; openedAt = Date.now();
        sink = (async () => createEventSink(shop, visitId, (await ports.identity()).secret, config.render, { fetch: ports.fetch }))()
          .catch(() => NO_EVENTS);
      }
      const at = sinceOpen(openedAt, Date.now());
      // One promise, so `then` runs the sends in the order they were called. Never awaited by the caller.
      void sink.then(ready => ready.send(name, at, eventDetail)).catch(() => {});
    }
    function notify() { for (const listener of [...listeners]) { try { listener(state()); } catch { /* Observer isolation. */ } } }
    const stopQueueObservation = queue.subscribe(notify);
    // Stay subscribed while stopped: preserve every event, not merely latest current on restart.
    const stopLifecycle = ports.lifecycle.subscribe(event => { if (!disposed) queue.enqueue(event); });
    async function action(call: () => Promise<CoordinatorResult>): Promise<CoordinatorResult> {
      if (disposed) return { kind: 'error', code: 'SERVICE_DISPOSED' };
      const sequence = ++actionSequence;
      actionsRunning++; notify();
      try {
        const result = await call();
        // A slow earlier action cannot hide the result of a more recent user command.
        if (sequence === actionSequence) lastAction = structuredClone(result);
        return result;
      } finally { actionsRunning--; notify(); }
    }
    const service: DocumentFeedbackService = Object.freeze({
      state,
      subscribe(listener: (value: FeedbackServiceState) => void) {
        if (disposed) throw Error('SERVICE_DISPOSED');
        const existing = listeners.has(listener); listeners.add(listener);
        if (!existing) { try { listener(state()); } catch { /* Observer isolation. */ } }
        return () => { listeners.delete(listener); };
      },
      start() { if (!disposed) queue.start(); },
      stop() { if (!disposed) queue.stop(); },
      rate: score => action(() => queue.rate(score)),
      feedback: (topic, message, phone) => action(() => queue.feedback(topic, message, phone)),
      retry: () => action(() => queue.retry()),
      retryOpen: key => action(() => queue.retryOpen(key)),
      event,
    });
    registry.set(win.document, { win, shop, binding, service, settled: queue.settled,
      dispose() { disposed = true; void sink.then(ready => ready.flush()).catch(() => {}); queue.stop(); stopLifecycle(); stopQueueObservation(); listeners.clear(); },
    });
    return service;
  }
  return {
    get,
    async settledForTests(win: Window) { await registry.get(win.document)?.settled(); },
    disposeForTests(win: Window) { registry.get(win.document)?.dispose(); registry.delete(win.document); },
  };
}

// No browser globals are accessed during module import. Browser dependencies are resolved lazily.
const productionRegistry = createDocumentFeedbackRegistry(win => ({
  identity: () => browserIdentity(win), lifecycle: documentLifecycle(win), uuid: () => win.crypto.randomUUID(),
  fetch: win.fetch.bind(win), timer: { set: (callback, ms) => win.setTimeout(callback, ms), clear: handle => win.clearTimeout(handle as number) },
}));
export function documentFeedbackService(win: Window, config: FeedbackServiceConfig): DocumentFeedbackService {
  return productionRegistry.get(win, config);
}
