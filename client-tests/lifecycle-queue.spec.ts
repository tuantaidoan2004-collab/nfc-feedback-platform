import { test, expect } from '@playwright/test';
import { createLifecycleQueue } from '../lib/client/lifecycle-queue';
import { createVisitCoordinator, type OpenSnapshot, type TransportReply } from '../lib/client/visit-coordinator';
const event = (loadKey: string) => ({ loadKey, navigationKind: 'resume' as const });
const snapshot: OpenSnapshot = { visit: { id: 'visit', sessionId: 'session' }, session: { id: 'session', active: true }, experience: null };
function fixture() {
  const calls: string[] = []; let unknown = true;
  const coordinator = createVisitCoordinator({ attempts: 1, uuid: () => 'intent',
    identity: async () => ({ secret: 'a'.repeat(64), persistence: 'shared' }),
    register: async (_s, e) => { calls.push(e.loadKey); return unknown && e.loadKey === 'a' ? { kind: 'unknown' } : { kind: 'ok', data: snapshot }; },
    rating: async (_s, _v, c) => { calls.push(`rating:${c.score}`); return unknown ? { kind: 'unknown' } : { kind: 'ok', data: {
      outcome: 'replayed', experience: { rating: c.score, revision: c.expectedRevision + 1 },
      receipt: { intentId: c.intentId, score: c.score, revision: c.expectedRevision + 1 } } }; },
  });
  return { queue: createLifecycleQueue(coordinator), calls, recover: () => { unknown = false; } };
}

test('burst dispatches distinct keys despite unknown open; duplicate/remount does not retry', async () => {
  const { queue, calls } = fixture(); queue.enqueue(event('a')); queue.enqueue(event('b')); queue.enqueue(event('c'));
  queue.start(); await queue.settled(); expect(calls).toEqual(['a', 'b', 'c']);
  queue.stop(); queue.start(); queue.start(); expect(queue.enqueue(event('a'))).toBe('duplicate'); await queue.settled();
  expect(calls).toEqual(['a', 'b', 'c']); expect(queue.state().coordinator.opens[0].result?.kind).toBe('pending');
});

test('rating pending does not block open; replay still uses original score', async () => {
  const { queue, calls, recover } = fixture(); queue.start(); queue.enqueue(event('b')); await queue.settled();
  await queue.rate(5); await queue.rate(2); queue.enqueue(event('c')); await queue.settled();
  expect(calls).toEqual(['b', 'rating:5', 'c']); recover(); await queue.retry();
  expect(calls).toEqual(['b', 'rating:5', 'c', 'rating:5']);
});

test('stop buffers undispatched events; explicit retry is per key', async () => {
  const { queue, calls, recover } = fixture(); queue.start(); queue.enqueue(event('a')); await queue.settled();
  queue.stop(); queue.stop(); queue.enqueue(event('b')); expect((await queue.rate(3)).kind).toBe('error');
  expect(calls).toEqual(['a']); queue.start(); await queue.settled(); recover(); await queue.retryOpen('a');
  expect(calls).toEqual(['a', 'b', 'a']);
});

test('stop during in-flight does not abort or duplicate on restart', async () => {
  let resolve!: (value: TransportReply<OpenSnapshot>) => void; let calls = 0;
  const coordinator = createVisitCoordinator({ attempts: 1, uuid: () => 'id', identity: async () => ({ secret: 'a'.repeat(64), persistence: 'shared' }),
    register: async () => { calls++; return new Promise(r => { resolve = r; }); }, rating: async () => ({ kind: 'unknown' }) });
  const queue = createLifecycleQueue(coordinator); queue.start(); queue.enqueue(event('a'));
  await Promise.resolve(); await Promise.resolve(); queue.stop(); queue.start(); queue.enqueue(event('a'));
  resolve({ kind: 'ok', data: snapshot }); await queue.settled(); expect(calls).toBe(1);
});

test('subscriptions are idempotent, isolated and do not own service lifetime', async () => {
  const { queue, calls } = fixture(); let count = 0; const listener = () => { count++; };
  const off = queue.subscribe(listener); queue.subscribe(listener); expect(count).toBe(1); off(); off();
  queue.subscribe(() => { throw Error('observer'); }); queue.subscribe(s => { s.waiting = []; });
  queue.enqueue(event('b')); queue.start(); await queue.settled(); expect(calls).toEqual(['b']); expect(count).toBe(1);
});
