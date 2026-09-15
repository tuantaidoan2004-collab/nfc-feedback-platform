import { test, expect } from '@playwright/test';
import { canReuseSession, openVisit, rateSession, IDLE_WINDOW_MS, type BrowserContext, type SessionState, type NavigationKind } from '../../lib/domain/visit-rating';
const start = Date.parse('2026-09-11T00:00:00Z');
const at = (ms: number) => new Date(start + ms).toISOString();
const context: BrowserContext = { shopId: 'shop-a', scope: 'live', entryKey: 'direct:shop', browserHash: 'browser-a' };
const first = () => openVisit(null, context, { visitId: 'open-a', newSessionId: 'session-a' }, 'load', at(0));
const state = (): SessionState => ({ session: first().session, experience: null, receipts: [] });
const intent = (revision = 0, score = 5, id = 'first') => ({ ...first().visit, intentId: id, expectedRevision: revision, score });

test('open has session and event but no experience; reload/back-forward/resume each has a new event', () => {
  const base = first();
  expect(state().experience).toBeNull();
  for (const kind of ['reload','back_forward','resume'] as NavigationKind[]) {
    const opened = openVisit(base.session, context, { visitId: `open-${kind}`, newSessionId: 'unused' }, kind, at(1));
    expect(opened.session.sessionId).toBe(base.session.sessionId);
    expect(opened.visit.visitId).not.toBe(base.visit.visitId);
    expect(opened.visit.navigationKind).toBe(kind);
  }
});
for (const [idle, reuse] of [[IDLE_WINDOW_MS-1,true],[IDLE_WINDOW_MS,false],[IDLE_WINDOW_MS+1,false]] as const) {
  test(`half-open inactivity ${idle} ms => reuse ${reuse}`, () => {
    expect(canReuseSession(first().session, context, at(idle))).toBe(reuse);
    expect(openVisit(first().session, context, { visitId: 'new-open', newSessionId: 'new-session' }, 'resume', at(idle)).reused).toBe(reuse);
  });
}
for (const field of ['shopId','scope','entryKey','browserHash'] as const) {
  test(`different ${field} starts separate session`, () => {
    const other = { ...context, [field]: field === 'scope' ? 'test' : 'other' } as BrowserContext;
    expect(canReuseSession(first().session, other, at(1))).toBe(false);
  });
}
for (const score of [1,2,3,4,5]) test(`first rating ${score} creates session experience`, () => {
  const result = rateSession(state(), first().visit, intent(0,score), at(100));
  expect(result.kind).toBe('applied');
  expect(result.state.experience).toMatchObject({ sessionId: 'session-a', rating: score, revision: 1 });
  expect(result.state.session.lastActivity).toBe(at(100));
});
test('5→2 via a different open changes one session experience', () => {
  const rated = rateSession(state(), first().visit, intent(), at(1));
  const next = openVisit(rated.state.session, context, { visitId: 'open-b', newSessionId: 'unused' }, 'reload', at(2));
  const result = rateSession({ ...rated.state, session: next.session }, next.visit,
    { ...next.visit, intentId: 'edit', expectedRevision: 1, score: 2 }, at(3));
  expect(result.state.experience).toMatchObject({ sessionId: 'session-a', rating: 2, revision: 2, firstInteractionAt: at(1) });
});
test('replay after idle returns original receipt without extending activity; fresh intent is expired', () => {
  const rated = rateSession(state(), first().visit, intent(), at(1));
  const replay = rateSession(rated.state, first().visit, intent(), at(IDLE_WINDOW_MS+1));
  expect(replay.kind).toBe('replayed');
  expect(replay.state.session.lastActivity).toBe(at(1));
  expect(rateSession(rated.state, first().visit, intent(1,2,'new'), at(IDLE_WINDOW_MS+1))).toMatchObject({ kind: 'rejected', code: 'SESSION_EXPIRED' });
});
for (const [name, patch, code] of [
  ['old revision',{ intentId:'new' },'REVISION_CONFLICT'],
  ['changed score',{ score:2 },'INTENT_CONFLICT'],
  ['changed expected revision',{ expectedRevision:1 },'INTENT_CONFLICT'],
  ['other shop',{ shopId:'other' },'CONTEXT_MISMATCH'],
  ['other session',{ sessionId:'other' },'CONTEXT_MISMATCH'],
  ['other entry',{ entryKey:'other' },'CONTEXT_MISMATCH'],
  ['invalid score',{ score:6 },'INVALID_INPUT'],
  ['invalid revision',{ expectedRevision:-1 },'INVALID_INPUT'],
] as const) test(`rejects ${name} without mutation`, () => {
  const rated = rateSession(state(), first().visit, intent(), at(1));
  const result = rateSession(rated.state, first().visit, { ...intent(), ...patch }, at(2));
  expect(result).toMatchObject({ kind:'rejected', code }); expect(result.state).toBe(rated.state);
});
test('closed session never reopens and a clock moving backwards cannot reduce activity', () => {
  const original = first().session;
  expect(canReuseSession({ ...original, closedAt: at(1) }, context, at(2))).toBe(false);
  const opened = openVisit(original, context, { visitId:'new', newSessionId:'unused' }, 'reload', at(-1));
  expect(opened.session.lastActivity).toBe(at(0));
});
