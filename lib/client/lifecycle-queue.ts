import type { OpenEvent } from './open-lifecycle';
import type { createVisitCoordinator, CoordinatorResult } from './visit-coordinator';

type Coordinator = ReturnType<typeof createVisitCoordinator>;
export type QueueState = { started: boolean; waiting: readonly OpenEvent[]; coordinator: ReturnType<Coordinator['state']> };

/** Document-owned composition. The coordinator owns BOTH lanes; this wrapper never serializes them. */
export function createLifecycleQueue(coordinator: Coordinator) {
  const seen = new Map<string, OpenEvent>();
  const waiting = new Map<string, OpenEvent>();
  const flights = new Set<Promise<unknown>>();
  const listeners = new Set<(state: QueueState) => void>();
  let started = false;
  const state = (): QueueState => structuredClone({ started, waiting: [...waiting.values()], coordinator: coordinator.state() });
  function notify() { for (const listener of [...listeners]) { try { listener(state()); } catch { /* Isolate observers. */ } } }
  function track(work: Promise<CoordinatorResult>): Promise<CoordinatorResult> {
    const tracked = work.finally(() => { flights.delete(tracked); notify(); });
    flights.add(tracked); notify(); return tracked;
  }
  function dispatch() {
    if (!started) return;
    for (const [key, event] of waiting) {
      waiting.delete(key);
      void track(coordinator.open(event));
    }
  }
  return {
    state,
    enqueue(event: OpenEvent): 'queued' | 'duplicate' | 'key-conflict' {
      const existing = seen.get(event.loadKey);
      if (existing) return existing.navigationKind === event.navigationKind ? 'duplicate' : 'key-conflict';
      const immutable = Object.freeze({ ...event });
      seen.set(event.loadKey, immutable); waiting.set(event.loadKey, immutable);
      dispatch(); notify(); return 'queued';
    },
    start() { if (started) return; started = true; dispatch(); notify(); },
    stop() { if (!started) return; started = false; notify(); },
    rate(score: number): Promise<CoordinatorResult> {
      return started ? track(coordinator.rate(score)) : Promise.resolve({ kind: 'error', code: 'QUEUE_STOPPED' });
    },
    feedback(topic: string, message: string, phone?: string): Promise<CoordinatorResult> {
      return started ? track(coordinator.feedback(topic, message, phone)) : Promise.resolve({ kind: 'error', code: 'QUEUE_STOPPED' });
    },
    retry(): Promise<CoordinatorResult> {
      return started ? track(coordinator.retry()) : Promise.resolve({ kind: 'error', code: 'QUEUE_STOPPED' });
    },
    retryOpen(key: string): Promise<CoordinatorResult> {
      return started ? track(coordinator.retryOpen(key)) : Promise.resolve({ kind: 'error', code: 'QUEUE_STOPPED' });
    },
    subscribe(listener: (state: QueueState) => void): () => void {
      const exists = listeners.has(listener); listeners.add(listener);
      if (!exists) { try { listener(state()); } catch { /* Isolate observers. */ } }
      return () => { listeners.delete(listener); };
    },
    async settled() { while (flights.size) await Promise.allSettled([...flights]); },
  };
}
