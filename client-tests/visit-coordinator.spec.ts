import { test, expect } from '@playwright/test';
import { createVisitCoordinator, type CoordinatorPorts, type OpenSnapshot, type RatingCommand, type RatingReply, type TransportReply } from '../lib/client/visit-coordinator';
import type { OpenEvent } from '../lib/client/open-lifecycle';
export const event = (loadKey: string): OpenEvent => ({ loadKey, navigationKind: 'resume' });
export const snapshot = (id = 's1', revision = 0, active = true): OpenSnapshot => ({
  visit: { id: `visit-${id}`, sessionId: id }, session: { id, active }, experience: revision ? { rating: 4, revision } : null,
});
const ok = <T>(data: T): TransportReply<T> => ({ kind: 'ok', data });
const unknown = { kind: 'unknown' } as const;
const rejected = (code: string) => ({ kind: 'rejected', code } as const);
const saved = (c: RatingCommand, revision = c.expectedRevision + 1): RatingReply => ({ outcome: 'replayed',
  experience: { rating: c.score, revision }, receipt: { intentId: c.intentId, score: c.score, revision: c.expectedRevision + 1 } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function harness(overrides: Partial<CoordinatorPorts> = {}) {
  let ids = 0;
  const opens: Array<{ secret: string; event: OpenEvent }> = [];
  const ratings: Array<{ secret: string; visit: string; command: RatingCommand }> = [];
  const ports: CoordinatorPorts = { identity: async () => ({ secret: 'a'.repeat(64), persistence: 'shared' }),
    uuid: () => `id-${++ids}`, attempts: 1, register: async () => ok(snapshot()),
    rating: async (_s, _v, c) => ok(saved(c)), ...overrides };
  const coordinator = createVisitCoordinator({ ...ports,
    register: async (secret, event) => { opens.push({ secret, event }); return ports.register(secret, event); },
    rating: async (secret, visit, command) => { ratings.push({ secret, visit, command }); return ports.rating(secret, visit, command); },
  });
  return { coordinator, ports, opens, ratings };
}

test('open success gates rating; dedup remount and safe snapshots', async () => {
  const h = harness(); expect(await h.coordinator.rate(5)).toEqual({ kind: 'error', code: 'OPEN_REQUIRED' });
  await h.coordinator.open(event('a')); await h.coordinator.open(event('a'));
  const state = h.coordinator.state(); state.current!.snapshot!.visit.id = 'tampered';
  await h.coordinator.rate(5); expect(h.opens).toHaveLength(1); expect(h.ratings[0].visit).toBe('visit-s1');
});

test('00:00 lost rating response,14:50 resume registers before15:10 replay', async () => {
  let databaseMinute = 0, lastActivity = 0;
  const h = harness({ register: async () => { const id = databaseMinute - lastActivity < 15 ? 's1' : 's2'; lastActivity = databaseMinute; return ok(snapshot(id)); }, rating: async () => unknown });
  await h.coordinator.open(event('a')); await h.coordinator.rate(5);
  databaseMinute = 14 + 50 / 60;
  await h.coordinator.open(event('b'));
  expect(h.coordinator.state().current!.snapshot!.session.id).toBe('s1');
  expect(h.opens).toHaveLength(2);
  databaseMinute = 15 + 10 / 60; h.ports.rating = async (_s, _v, c) => ok(saved(c));
  await h.coordinator.retry();
  expect(lastActivity).toBe(14 + 50 / 60); // Simulated server replay does not touch activity.
  expect(h.ratings[1]).toEqual(h.ratings[0]); expect(h.opens).toHaveLength(2);
});

test('unknown/error open does not block later key; only explicit retry reuses unknown key', async () => {
  const h = harness({ register: async (_s, e) => e.loadKey === 'a' ? unknown : e.loadKey === 'b' ? rejected('SHOP_NOT_FOUND') : ok(snapshot()) });
  await h.coordinator.open(event('a')); await h.coordinator.open(event('a'));
  await h.coordinator.open(event('b')); await h.coordinator.open(event('c'));
  expect(h.opens.map(x => x.event.loadKey)).toEqual(['a', 'b', 'c']);
  h.ports.register = async () => ok(snapshot()); await h.coordinator.retryOpen('a');
  expect(h.opens[3]).toEqual(h.opens[0]); expect(h.coordinator.state().current!.event.loadKey).toBe('c');
});

test('out-of-order completions cannot change latest event or roll revision backwards', async () => {
  const first = deferred<TransportReply<OpenSnapshot>>();
  const h = harness({ register: async (_s, e) => e.loadKey === 'a' ? first.promise : ok(snapshot('s1', 4)) });
  const a = h.coordinator.open(event('a')); await h.coordinator.open(event('b'));
  first.resolve(ok(snapshot('s1', 1))); await a;
  expect(h.coordinator.state().current!.event.loadKey).toBe('b');
  expect(h.coordinator.state().current!.snapshot!.experience!.revision).toBe(4);
});

test('same key concurrent calls share one request', async () => {
  const wait = deferred<TransportReply<OpenSnapshot>>(); const h = harness({ register: () => wait.promise });
  const a = h.coordinator.open(event('a')); const duplicate = h.coordinator.open(event('a'));
  await Promise.resolve(); await Promise.resolve(); expect(h.opens).toHaveLength(1);
  wait.resolve(ok(snapshot())); await Promise.all([a, duplicate]);
  expect(await h.coordinator.open({ loadKey: 'a', navigationKind: 'load' })).toEqual({ kind: 'error', code: 'OPEN_KEY_CONFLICT' });
});

test('rapid5→2→3 preserves immutable first intent then applies only latest3', async () => {
  const wait = deferred<TransportReply<RatingReply>>(); const h = harness({ rating: () => wait.promise });
  await h.coordinator.open(event('a'));
  const first = h.coordinator.rate(5); await Promise.resolve(); await Promise.resolve();
  await h.coordinator.rate(2); await h.coordinator.rate(3);
  h.ports.rating = async (_s, _v, c) => ok(saved(c));
  wait.resolve(ok(saved(h.ratings[0].command))); await first;
  expect(h.ratings.map(r => r.command.score)).toEqual([5, 3]);
  expect(h.ratings[1].command.expectedRevision).toBe(1);
  expect(h.ratings[1].command.intentId).not.toBe(h.ratings[0].command.intentId);
});

test('latest desired after unknown waits for original replay', async () => {
  const h = harness({ rating: async () => unknown }); await h.coordinator.open(event('a'));
  await h.coordinator.rate(5); await h.coordinator.rate(2); await h.coordinator.rate(3);
  expect(h.ratings).toHaveLength(1);
  h.ports.rating = async (_s, _v, c) => ok(saved(c)); await h.coordinator.retry();
  expect(h.ratings.map(r => r.command.score)).toEqual([5, 5, 3]); expect(h.ratings[1]).toEqual(h.ratings[0]);
});

test('new load even in same session invalidates desired and keeps recovery source', async () => {
  const h = harness({ rating: async () => unknown }); await h.coordinator.open(event('a'));
  await h.coordinator.rate(5); await h.coordinator.rate(3); await h.coordinator.open(event('b'));
  expect(await h.coordinator.rate(2)).toEqual({ kind: 'error', code: 'RATING_RECOVERY_REQUIRED' });
  h.ports.rating = async (_s, _v, c) => ok(saved(c)); await h.coordinator.retry();
  expect(h.ratings.map(r => r.command.score)).toEqual([5, 5]);
  expect(h.coordinator.state().notice).toBe('DESIRED_CONTEXT_CHANGED');
});

test('rollover during unknown cannot migrate old intent or overwrite new snapshot', async () => {
  const h = harness({ rating: async () => unknown }); await h.coordinator.open(event('a')); await h.coordinator.rate(5);
  h.ports.register = async () => ok(snapshot('s2')); await h.coordinator.open(event('b'));
  h.ports.rating = async () => rejected('SESSION_EXPIRED');
  expect(await h.coordinator.retry()).toEqual({ kind: 'error', code: 'SESSION_EXPIRED' });
  expect(h.opens).toHaveLength(2); expect(h.ratings[1]).toEqual(h.ratings[0]);
  expect(h.coordinator.state().current!.snapshot!.session).toEqual({ id: 's2', active: true });
});

test('expired recovery stops; only next fresh user action may resume and create intent', async () => {
  const h = harness({ rating: async () => unknown }); await h.coordinator.open(event('a')); await h.coordinator.rate(5);
  h.ports.rating = async () => rejected('SESSION_EXPIRED'); await h.coordinator.retry();
  expect(h.opens).toHaveLength(1);
  h.ports.register = async () => ok(snapshot('s2')); h.ports.rating = async (_s, _v, c) => ok(saved(c));
  await h.coordinator.rate(2);
  expect(h.opens[1].event.navigationKind).toBe('resume'); expect(h.ratings[2].visit).toBe('visit-s2');
  expect(h.ratings[2].command.score).toBe(2); expect(h.ratings[2].command.intentId).not.toBe(h.ratings[0].command.intentId);
});

test('external revision in replay drops buffered desire and returns conflict', async () => {
  const h = harness({ rating: async () => unknown }); await h.coordinator.open(event('a')); await h.coordinator.rate(5); await h.coordinator.rate(3);
  h.ports.rating = async (_s, _v, c) => ok(saved(c, 4));
  expect((await h.coordinator.retry()).kind).toBe('conflict'); expect(h.ratings).toHaveLength(2);
  expect(h.coordinator.state().rating.desired).toBeNull();
});

test('revision conflict refresh unknown keeps reconciliation pending without blocking open lane', async () => {
  const h = harness({ rating: async () => rejected('REVISION_CONFLICT') }); await h.coordinator.open(event('a'));
  h.ports.register = async (_s, e) => e.loadKey === 'a' ? unknown : ok(snapshot('s2'));
  expect((await h.coordinator.rate(3)).kind).toBe('pending'); await h.coordinator.open(event('b'));
  h.ports.register = async () => ok(snapshot('s1', 4)); expect((await h.coordinator.retry()).kind).toBe('conflict');
  expect(h.ratings).toHaveLength(1); expect(h.coordinator.state().current!.snapshot!.session.id).toBe('s2');
});

test('malformed receipt stays pending, retry budget bounded, invalid inputs do not write', async () => {
  const h = harness({ attempts: 2, rating: async () => ok({} as RatingReply) });
  await h.coordinator.open(event('a')); expect((await h.coordinator.rate(5)).kind).toBe('pending'); expect(h.ratings).toHaveLength(2);
  expect(await h.coordinator.rate(8)).toEqual({ kind: 'error', code: 'INVALID_SCORE' });
  expect(() => harness({ attempts: 4 })).toThrow('INVALID_RETRY_BUDGET');
});

test('new load while rating in flight discards desired without overwriting new session', async () => {
  const wait = deferred<TransportReply<RatingReply>>(); const h = harness({ rating: () => wait.promise });
  await h.coordinator.open(event('a')); const first = h.coordinator.rate(5);
  await Promise.resolve(); await Promise.resolve(); await h.coordinator.rate(3);
  h.ports.register = async () => ok(snapshot('s2', 2)); await h.coordinator.open(event('b'));
  wait.resolve(ok(saved(h.ratings[0].command))); await first;
  expect(h.ratings).toHaveLength(1); expect(h.coordinator.state().current!.snapshot!.session.id).toBe('s2');
  expect(h.coordinator.state().current!.snapshot!.experience!.revision).toBe(2);
});

test('equal final desired score avoids redundant write; same revision contradictory receipt is unknown', async () => {
  const h = harness({ rating: async () => unknown }); await h.coordinator.open(event('a'));
  await h.coordinator.rate(5); await h.coordinator.rate(2); await h.coordinator.rate(5);
  h.ports.rating = async (_s, _v, c) => ok({ ...saved(c), experience: { rating: 2, revision: 1 } });
  expect((await h.coordinator.retry()).kind).toBe('pending');
  h.ports.rating = async (_s, _v, c) => ok(saved(c)); await h.coordinator.retry();
  expect(h.ratings.every(r => r.command.intentId === h.ratings[0].command.intentId)).toBe(true);
});

test('fresh resume unknown needs explicit open retry and another fresh choice, never hidden reapply', async () => {
  const h = harness({ register: async () => ok(snapshot('s1', 0, false)) }); await h.coordinator.open(event('a'));
  h.ports.register = async () => unknown;
  expect((await h.coordinator.rate(2)).kind).toBe('pending'); expect(h.ratings).toHaveLength(0);
  const resumeKey = h.opens[1].event.loadKey;
  h.ports.register = async () => ok(snapshot('s2')); await h.coordinator.retryOpen(resumeKey);
  expect(h.ratings).toHaveLength(0); await h.coordinator.rate(3); expect(h.ratings[0].command.score).toBe(3);
});
