import { test, expect } from '@playwright/test';
import { createVisitCoordinator, type CoordinatorPorts, type RatingCommand, type TransportReply, type RatingReply } from '../lib/client/visit-coordinator';
import type { FeedbackCommand, FeedbackReply } from '../lib/client/visit-fetch-transport';
const time = '2026-09-12T00:00:00.000Z';
const event = (loadKey: string) => ({ loadKey, navigationKind: 'load' as const });
const unknown = { kind: 'unknown' } as const;
function fixture() {
  let ids = 0, revision = 1, rating: number | null = 5, session = 's1';
  const calls: Array<{ kind: string; visit: string; secret: string; command: RatingCommand | FeedbackCommand }> = [];
  const controls = {
    rating: async (command: RatingCommand): Promise<TransportReply<RatingReply>> => {
      revision = command.expectedRevision + 1; rating = command.score;
      return { kind: 'ok', data: { outcome: 'applied', experience: { rating, revision }, receipt: { intentId: command.intentId, score: rating, revision } } };
    },
    feedback: async (command: FeedbackCommand): Promise<TransportReply<FeedbackReply>> => {
      revision = command.expectedRevision + 1;
      return { kind: 'ok', data: { outcome: 'applied', experience: { rating, revision, firstInteractionAt: time, updatedAt: time },
        receipt: { intentId: command.intentId, revision, updatedAt: time } } };
    },
  };
  const ports: CoordinatorPorts = { attempts: 1, uuid: () => `intent-${++ids}`, identity: async () => ({ secret: 'a'.repeat(64), persistence: 'shared' }),
    register: async () => ({ kind: 'ok', data: { visit: { id: `visit-${session}`, sessionId: session },
      session: { id: session, active: true }, experience: revision ? { rating, revision } : null } }),
    rating: async (secret, visit, command) => { calls.push({ kind: 'rating', secret, visit, command }); return controls.rating(command); },
    feedback: async (secret, visit, command) => { calls.push({ kind: 'feedback', secret, visit, command }); return controls.feedback(command); },
  };
  return { coordinator: createVisitCoordinator(ports), controls, calls, setRevision: (r: number) => { revision = r; }, setRating: (r: number | null) => { rating = r; }, rollover: () => { session = 's2'; revision = 0; } };
}

test('rating unknown then feedback uses confirmed next revision; original rating retry unchanged', async () => {
  const h = fixture(); await h.coordinator.open(event('a')); const saved = h.controls.rating;
  h.controls.rating = async () => unknown; await h.coordinator.rate(2);
  expect((await h.coordinator.feedback('general', 'PRIVATE_A')).kind).toBe('pending'); expect(h.calls).toHaveLength(1);
  h.controls.rating = saved; expect((await h.coordinator.retry()).kind).toBe('saved');
  expect(h.calls.map(c => [c.kind, c.command.expectedRevision])).toEqual([['rating', 1], ['rating', 1], ['feedback', 2]]);
  expect(h.calls[0]).toEqual(h.calls[1]);
});

test('feedback unknown then rapid rating5→2→3 serializes only latest3 after replay', async () => {
  const h = fixture(); await h.coordinator.open(event('a')); const saved = h.controls.feedback;
  h.controls.feedback = async () => unknown; await h.coordinator.feedback('general', 'PRIVATE_A');
  await h.coordinator.rate(5); await h.coordinator.rate(2); await h.coordinator.rate(3);
  h.controls.feedback = saved; await h.coordinator.retry();
  expect(h.calls.map(c => [c.kind, c.command.expectedRevision])).toEqual([['feedback', 1], ['feedback', 1], ['rating', 2]]);
  expect((h.calls[2].command as RatingCommand).score).toBe(3); expect(h.calls[1]).toEqual(h.calls[0]);
});

test('latest explicit feedback resubmit replaces only buffered text and preserves first intent', async () => {
  const h = fixture(); await h.coordinator.open(event('a')); const saved = h.controls.feedback;
  h.controls.feedback = async () => unknown; await h.coordinator.feedback('first', 'PRIVATE_A');
  await h.coordinator.feedback('second', 'PRIVATE_B'); await h.coordinator.feedback('last', 'PRIVATE_C');
  expect(h.calls).toHaveLength(1);
  for (const text of ['PRIVATE_A', 'PRIVATE_B', 'PRIVATE_C', 'first', 'second']) expect(JSON.stringify(h.coordinator.state())).not.toContain(text);
  h.controls.feedback = saved; const result = await h.coordinator.retry();
  expect(h.calls.map(c => (c.command as FeedbackCommand).message)).toEqual(['PRIVATE_A', 'PRIVATE_A', 'PRIVATE_C']);
  expect(h.calls[2].command.expectedRevision).toBe(2);
  expect(result).toMatchObject({ kind: 'saved', mutation: 'feedback' });
  expect(h.coordinator.state().rating.pending).toBeNull(); expect(h.coordinator.state().rating.buffered).toEqual([]);
  expect(JSON.stringify([result, h.coordinator.state()])).not.toContain('PRIVATE_');
});

test('mutations arriving in flight serialize across types and preserve explicit order', async () => {
  const h = fixture(); await h.coordinator.open(event('a'));
  let release!: (r: TransportReply<RatingReply>) => void;
  h.controls.rating = () => new Promise(resolve => { release = resolve; });
  const first = h.coordinator.rate(2); await Promise.resolve(); await Promise.resolve();
  await h.coordinator.feedback('general', 'PRIVATE_A'); await h.coordinator.rate(3);
  expect(h.calls).toHaveLength(1);
  const command = h.calls[0].command as RatingCommand;
  h.controls.rating = async c => ({ kind: 'ok', data: { outcome: 'applied', experience: { rating: c.score, revision: c.expectedRevision + 1 },
    receipt: { intentId: c.intentId, score: c.score, revision: c.expectedRevision + 1 } } });
  release({ kind: 'ok', data: { outcome: 'applied', experience: { rating: 2, revision: 2 }, receipt: { intentId: command.intentId, score: 2, revision: 2 } } });
  await first;
  expect(h.calls.map(c => [c.kind, c.command.expectedRevision])).toEqual([['rating', 1], ['feedback', 2], ['rating', 3]]);
});

test('external revision refresh returns conflict without sending buffered actions', async () => {
  const h = fixture(); await h.coordinator.open(event('a')); h.controls.feedback = async () => unknown;
  await h.coordinator.feedback('general', 'PRIVATE_A'); await h.coordinator.rate(2); await h.coordinator.feedback('general', 'PRIVATE_B');
  h.setRevision(5);
  h.controls.feedback = async c => ({ kind: 'ok', data: { outcome: 'replayed', experience: { rating: 4, revision: 5, firstInteractionAt: time, updatedAt: time },
    receipt: { intentId: c.intentId, revision: 2, updatedAt: time } } });
  expect((await h.coordinator.retry()).kind).toBe('conflict'); expect(h.calls).toHaveLength(2);
  expect(h.coordinator.state().rating.buffered).toEqual([]); expect(h.coordinator.state().rating.pending).toBeNull();
});

test('revision rejection refreshes source context; no implicit overwrite', async () => {
  const h = fixture(); await h.coordinator.open(event('a'));
  h.controls.feedback = async () => ({ kind: 'rejected', code: 'REVISION_CONFLICT' }); h.setRevision(3);
  expect((await h.coordinator.feedback('general', 'PRIVATE_A')).kind).toBe('conflict'); expect(h.calls).toHaveLength(1);
  expect(h.coordinator.state().current?.snapshot?.experience?.revision).toBe(3);
});

for (const rollover of [false, true]) test(`load change clears buffered feedback/rating; rollover=${rollover}`, async () => {
  const h = fixture(); await h.coordinator.open(event('a')); const saved = h.controls.feedback;
  h.controls.feedback = async () => unknown; await h.coordinator.feedback('general', 'PRIVATE_A');
  await h.coordinator.feedback('general', 'PRIVATE_B'); await h.coordinator.rate(2);
  if (rollover) h.rollover(); await h.coordinator.open(event('b'));
  expect(h.coordinator.state().rating.buffered).toEqual([]);
  h.controls.feedback = saved; await h.coordinator.retry(); expect(h.calls).toHaveLength(2); expect(h.calls[0]).toEqual(h.calls[1]);
  expect(h.coordinator.state().current?.event.loadKey).toBe('b');
});

test('feedback before any star starts at revision 0; expired feedback does not resume old recovery', async () => {
  const h = fixture(); h.setRevision(0); h.setRating(null); await h.coordinator.open(event('a'));
  expect(await h.coordinator.feedback('general', 'PRIVATE_FIRST')).toMatchObject({ kind: 'saved', mutation: 'feedback',
    snapshot: { experience: { rating: null, revision: 1 } } });
  expect(h.calls.map(c => [c.kind, c.command.expectedRevision])).toEqual([['feedback', 0]]);
  await h.coordinator.rate(5);
  expect(h.calls.map(c => [c.kind, c.command.expectedRevision])).toEqual([['feedback', 0], ['rating', 1]]);
  expect(h.coordinator.state().current?.snapshot?.experience).toEqual({ rating: 5, revision: 2 }); h.controls.feedback = async () => unknown;
  await h.coordinator.feedback('general', 'PRIVATE_A'); await h.coordinator.rate(2);
  h.controls.feedback = async () => ({ kind: 'rejected', code: 'SESSION_EXPIRED' });
  expect(await h.coordinator.retry()).toEqual({ kind: 'error', code: 'SESSION_EXPIRED' });
  expect(h.coordinator.state().opens).toHaveLength(1); expect(h.coordinator.state().rating.buffered).toEqual([]);
  expect(await h.coordinator.feedback('general', 'PRIVATE_B')).toEqual({ kind: 'error', code: 'SESSION_EXPIRED' });
});

test('definitive feedback error discards buffered intent visibly, no subsequent silent write', async () => {
  const h = fixture(); await h.coordinator.open(event('a')); h.controls.feedback = async () => unknown;
  await h.coordinator.feedback('general', 'PRIVATE_A'); await h.coordinator.feedback('general', 'PRIVATE_B');
  h.controls.feedback = async () => ({ kind: 'rejected', code: 'INVALID_INPUT' });
  expect(await h.coordinator.retry()).toEqual({ kind: 'error', code: 'INVALID_INPUT' });
  expect(h.coordinator.state().notice).toBe('BUFFERED_MUTATIONS_DISCARDED');
  expect(h.coordinator.state().mutation).toEqual(h.coordinator.state().rating);
  expect(h.coordinator.state().mutation.buffered).toEqual([]);
  expect(JSON.stringify(h.coordinator.state())).not.toContain('PRIVATE_'); expect(h.calls).toHaveLength(2);
});
