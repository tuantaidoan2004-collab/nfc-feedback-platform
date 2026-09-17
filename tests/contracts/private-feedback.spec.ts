import { test, expect } from '@playwright/test';
import { openVisit, rateSession, IDLE_WINDOW_MS, type RatingIntent } from '../../lib/domain/visit-rating';
import { normalizeFeedback, rateFeedbackExperience, submitPrivateFeedback, type FeedbackSessionState, type FeedbackIntent } from '../../lib/domain/private-feedback';
const at = (ms: number) => new Date(Date.parse('2026-09-12T00:00:00Z') + ms).toISOString();
const opened = openVisit(null, { shopId: 'shop', scope: 'live', entryKey: 'direct:shop', browserHash: 'browser' },
  { visitId: 'visit', newSessionId: 'session' }, 'load', at(0));
const empty = (): FeedbackSessionState => ({ session: opened.session, experience: null, receipts: [], feedbackReceipts: [] });
const rating = (expectedRevision = 0, score = 5, intentId = 'rating'): RatingIntent => ({ ...opened.visit, expectedRevision, score, intentId });
const feedback = (expectedRevision = 1, message = ' Góp ý chất lượng ', intentId = 'feedback'): FeedbackIntent => ({ ...opened.visit, expectedRevision, message, topic: 'service', intentId });
const rated = () => rateFeedbackExperience(empty(), opened.visit, rating(), at(1)).state;

test('feedback before any rating starts the experience with no star; a later rating keeps the feedback', () => {
  const state = empty();
  const stale = submitPrivateFeedback(state, opened.visit, feedback(1), at(1));
  expect(stale).toMatchObject({ kind: 'rejected', code: 'REVISION_CONFLICT' }); expect(stale.state).toBe(state);
  const result = submitPrivateFeedback(state, opened.visit, feedback(0), at(1));
  expect(result.kind).toBe('applied');
  expect(result.state.experience).toMatchObject({ rating: null, revision: 1, firstInteractionAt: at(1), updatedAt: at(1),
    feedback: { topic: 'service', message: 'Góp ý chất lượng', submittedAt: at(1), updatedAt: at(1) } });
  const later = rateFeedbackExperience(result.state, opened.visit, rating(1, 2, 'later'), at(2)).state;
  expect(later.experience).toMatchObject({ rating: 2, revision: 2, firstInteractionAt: at(1), updatedAt: at(2) });
  expect(later.experience!.feedback).toEqual(result.state.experience!.feedback);
});
for (const score of [1, 2, 3, 4, 5]) test(`private feedback permitted after rating ${score}`, () => {
  const state = rateFeedbackExperience(empty(), opened.visit, rating(0, score), at(1)).state;
  const result = submitPrivateFeedback(state, opened.visit, feedback(), at(2));
  expect(result.kind).toBe('applied'); expect(result.state.experience).toMatchObject({ rating: score, revision: 2,
    firstInteractionAt: at(1), updatedAt: at(2), feedback: { topic: 'service', message: 'Góp ý chất lượng', submittedAt: at(2), updatedAt: at(2) } });
});
test('rating remains compatible without feedback; original rating contract is untouched', () => {
  const old = rateSession(empty(), opened.visit, rating(), at(1));
  const result = rateFeedbackExperience(empty(), opened.visit, rating(), at(1));
  expect(result.state.session).toEqual(old.state.session);
  const { feedback: content, ...rest } = result.state.experience!;
  expect(content).toBeNull(); expect(rest).toEqual(old.state.experience);
});
test('shared revision prevents interleaved lost update;5→2 preserves feedback', () => {
  const withFeedback = submitPrivateFeedback(rated(), opened.visit, feedback(), at(2)).state;
  expect(rateFeedbackExperience(withFeedback, opened.visit, rating(1, 2, 'stale'), at(3))).toMatchObject({ kind: 'rejected', code: 'REVISION_CONFLICT' });
  const changed = rateFeedbackExperience(withFeedback, opened.visit, rating(2, 2, 'change'), at(3)).state;
  expect(changed.experience).toMatchObject({ rating: 2, revision: 3, firstInteractionAt: at(1) });
  expect(changed.experience!.feedback).toEqual(withFeedback.experience!.feedback);
  expect(submitPrivateFeedback(changed, opened.visit, feedback(2, 'stale', 'stale-f'), at(4))).toMatchObject({ kind: 'rejected', code: 'REVISION_CONFLICT' });
  const edited = submitPrivateFeedback(changed, opened.visit, feedback(3, 'Cập nhật', 'edit'), at(4)).state;
  expect(edited.experience).toMatchObject({ rating: 2, revision: 4, feedback: { message: 'Cập nhật', submittedAt: at(2), updatedAt: at(4) } });
});
test('feedback replay returns original receipt after newer rating, expiry and closure', () => {
  const result = submitPrivateFeedback(rated(), opened.visit, feedback(), at(2)); if (result.kind === 'rejected') throw Error('setup');
  const newer = rateFeedbackExperience(result.state, opened.visit, rating(2, 2, 'edit'), at(3)).state;
  const closed = { ...newer, session: { ...newer.session, closedAt: at(4) } };
  const replay = submitPrivateFeedback(closed, opened.visit, feedback(), at(IDLE_WINDOW_MS + 10));
  expect(replay.kind).toBe('replayed'); expect(replay.state).toBe(closed);
  if (replay.kind !== 'rejected') expect(replay.receipt).toBe(result.receipt);
  expect(replay.state.experience!.rating).toBe(2); expect(replay.state.feedbackReceipts).toHaveLength(1);
});
test('rating replay never reverts feedback or updates activity', () => {
  const state = submitPrivateFeedback(rated(), opened.visit, feedback(), at(2)).state;
  const replay = rateFeedbackExperience(state, opened.visit, rating(), at(IDLE_WINDOW_MS + 10));
  expect(replay.kind).toBe('replayed'); expect(replay.state).toBe(state);
  if (replay.kind !== 'rejected') expect(replay.receipt.experience.feedback).toBeNull();
  expect(replay.state.experience!.feedback).not.toBeNull();
});
for (const patch of [{ message: 'different' }, { topic: 'quality' }, { expectedRevision: 2 }, { visitId: 'other-visit' }]) {
  test(`same intent changed payload rejected ${JSON.stringify(patch)}`, () => {
    const state = submitPrivateFeedback(rated(), opened.visit, feedback(), at(2)).state;
    const request = { ...feedback(), ...patch };
    const visit = { ...opened.visit, visitId: request.visitId };
    const result = submitPrivateFeedback(state, visit, request, at(3));
    expect(result).toMatchObject({ kind: 'rejected', code: 'INTENT_CONFLICT' }); expect(result.state).toBe(state);
  });
}
for (const field of ['shopId', 'sessionId', 'scope', 'entryKey'] as const) test(`${field} mismatch cannot read receipt or mutate`, () => {
  const state = submitPrivateFeedback(rated(), opened.visit, feedback(), at(2)).state;
  const request = { ...feedback(), [field]: field === 'scope' ? 'test' : 'other' } as FeedbackIntent;
  expect(submitPrivateFeedback(state, opened.visit, request, at(3))).toMatchObject({ kind: 'rejected', code: 'CONTEXT_MISMATCH' });
  expect(submitPrivateFeedback(state, { ...opened.visit, ...request }, request, at(3))).toMatchObject({ kind: 'rejected', code: 'CONTEXT_MISMATCH' });
});
test('intent IDs share a namespace across rating and feedback', () => {
  expect(submitPrivateFeedback(rated(), opened.visit, feedback(1, 'message', 'rating'), at(2))).toMatchObject({ kind: 'rejected', code: 'INTENT_CONFLICT' });
  const state = submitPrivateFeedback(rated(), opened.visit, feedback(), at(2)).state;
  expect(rateFeedbackExperience(state, opened.visit, rating(2, 2, 'feedback'), at(3))).toMatchObject({ kind: 'rejected', code: 'INTENT_CONFLICT' });
});
test('expired new feedback is rejected; applied feedback activity is monotonic, retry is not activity', () => {
  expect(submitPrivateFeedback(rated(), opened.visit, feedback(), at(IDLE_WINDOW_MS + 1))).toMatchObject({ kind: 'rejected', code: 'SESSION_EXPIRED' });
  const state = submitPrivateFeedback(rated(), opened.visit, feedback(), at(2)).state;
  const edited = submitPrivateFeedback(state, opened.visit, feedback(2, 'edit', 'edit'), at(1)).state;
  expect(edited.session.lastActivity).toBe(at(2)); expect(edited.experience!.updatedAt).toBe(at(2));
  expect(edited.experience!.feedback!.updatedAt).toBe(at(2));
});
test('Unicode NFC, line endings and trimmed equivalent payload replay identically', () => {
  const first = submitPrivateFeedback(rated(), opened.visit, feedback(1, ' e\u0301\r\n好 '), at(2));
  const replay = submitPrivateFeedback(first.state, opened.visit, feedback(1, 'é\n好'), at(3));
  expect(replay.kind).toBe('replayed'); expect(replay.state.experience!.feedback!.message).toBe('é\n好');
});
test('code point boundaries, malformed Unicode and neutral topic limits', () => {
  expect(normalizeFeedback('general', '😀'.repeat(2000))?.message).toBe('😀'.repeat(2000));
  expect(normalizeFeedback('general', '😀'.repeat(2001))).toBeNull();
  expect(normalizeFeedback('general', 'e\u0301'.repeat(2000))?.message).toHaveLength(2000);
  expect(normalizeFeedback('general', '好')).not.toBeNull();
  for (const message of ['', ' \n\t ', '\uD800', '\uDC00', 'a\u0000b', 'a\u007Fb']) expect(normalizeFeedback('general', message)).toBeNull();
  for (const topic of ['', 'A', 'a/b', 'a'.repeat(33), '../x', 'a b']) expect(normalizeFeedback(topic, 'ok')).toBeNull();
  expect(normalizeFeedback('a'.repeat(32), 'ok')).not.toBeNull();
});
test('invalid inputs rejected and inputs remain unchanged', () => {
  const state = rated(), before = structuredClone(state);
  for (const patch of [{ expectedRevision: -1 }, { expectedRevision: Number.MAX_SAFE_INTEGER }, { message: '' }, { intentId: '' }]) {
    expect(submitPrivateFeedback(state, opened.visit, { ...feedback(), ...patch }, at(2))).toMatchObject({ kind: 'rejected', code: 'INVALID_INPUT' });
  }
  expect(submitPrivateFeedback(state, opened.visit, feedback(), 'invalid')).toMatchObject({ kind: 'rejected', code: 'INVALID_INPUT' });
  expect(state).toEqual(before);
});

test('first feedback cannot precede rating timestamp when server clock moves backwards', () => {
  const result = submitPrivateFeedback(rated(), opened.visit, feedback(), at(0));
  expect(result.state.experience!.feedback!.submittedAt).toBe(at(1));
  expect(result.state.experience!.feedback!.updatedAt).toBe(at(1));
});
