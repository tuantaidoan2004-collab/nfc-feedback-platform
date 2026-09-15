/** Pure contract. Server resolves context/time; browser/session is never a unique person or NFC tap. */
export const IDLE_WINDOW_MS = 15 * 60 * 1000;
export type DataScope = 'live' | 'test';
export type NavigationKind = 'load' | 'reload' | 'back_forward' | 'resume';
export type BrowserContext = Readonly<{ shopId: string; scope: DataScope; entryKey: string; browserHash: string }>;
export type SessionContext = Readonly<{ shopId: string; scope: DataScope; entryKey: string; sessionId: string }>;
export type VisitContext = SessionContext & Readonly<{ visitId: string }>;
export type VisitSession = SessionContext & Readonly<{
  browserHash: string; startedAt: string; lastActivity: string; closedAt: string | null;
}>;
export type PageVisit = VisitContext & Readonly<{ openedAt: string; navigationKind: NavigationKind }>;
export type RatingExperience = SessionContext & Readonly<{
  firstInteractionAt: string; updatedAt: string; rating: number; revision: number;
}>;
export type RatingIntent = VisitContext & Readonly<{ intentId: string; expectedRevision: number; score: number }>;
export type RatingReceipt = Readonly<{ intent: RatingIntent; experience: RatingExperience }>;
export type SessionState = Readonly<{ session: VisitSession; experience: RatingExperience | null; receipts: readonly RatingReceipt[] }>;
export type Rejection = 'CONTEXT_MISMATCH' | 'INVALID_INPUT' | 'INTENT_CONFLICT' | 'REVISION_CONFLICT' | 'SESSION_EXPIRED';
export type RatingResult =
  | { kind: 'applied' | 'replayed'; state: SessionState; receipt: RatingReceipt }
  | { kind: 'rejected'; state: SessionState; code: Rejection };
const timestamp = (t: string) => Number.isFinite(Date.parse(t));
const nonempty = (s: string) => typeof s === 'string' && !!s.trim();
const latest = (a: string, b: string) => new Date(Math.max(Date.parse(a), Date.parse(b))).toISOString();
const sameSession = (a: SessionContext, b: SessionContext) => a.shopId === b.shopId && a.scope === b.scope &&
  a.entryKey === b.entryKey && a.sessionId === b.sessionId;

export function canReuseSession(session: VisitSession, context: BrowserContext, at: string): boolean {
  return timestamp(at) && session.closedAt === null && session.shopId === context.shopId &&
    session.scope === context.scope && session.entryKey === context.entryKey && session.browserHash === context.browserHash &&
    Date.parse(at) - Date.parse(session.lastActivity) < IDLE_WINDOW_MS;
}

/** Each accepted open gets a new visit. Transport deduplication is the repository's job. */
export function openVisit(previous: VisitSession | null, context: BrowserContext,
  ids: { visitId: string; newSessionId: string }, navigationKind: NavigationKind, at: string) {
  if (!timestamp(at) || !nonempty(context.shopId) || !nonempty(context.entryKey) || !nonempty(context.browserHash) ||
      !['live', 'test'].includes(context.scope) || !nonempty(ids.visitId) || !nonempty(ids.newSessionId) ||
      !['load', 'reload', 'back_forward', 'resume'].includes(navigationKind)) throw new Error('INVALID_OPEN');
  const openedAt = new Date(at).toISOString();
  const reused = previous !== null && canReuseSession(previous, context, openedAt);
  const session: VisitSession = reused ? { ...previous!, lastActivity: latest(previous!.lastActivity, openedAt) } : {
    ...context, sessionId: ids.newSessionId, startedAt: openedAt, lastActivity: openedAt, closedAt: null,
  };
  const visit: PageVisit = { shopId: context.shopId, scope: context.scope, entryKey: context.entryKey,
    sessionId: session.sessionId, visitId: ids.visitId, navigationKind, openedAt };
  return { session, visit, reused };
}

export function rateSession(state: SessionState, visit: PageVisit, intent: RatingIntent, receivedAt: string): RatingResult {
  const reject = (code: Rejection): RatingResult => ({ kind: 'rejected', state, code });
  const { session } = state;
  if (!sameSession(session, visit) || !sameSession(session, intent) || visit.visitId !== intent.visitId ||
      (state.experience && !sameSession(session, state.experience))) return reject('CONTEXT_MISMATCH');
  if (!nonempty(intent.intentId) || !Number.isInteger(intent.score) || intent.score < 1 || intent.score > 5 ||
      !Number.isSafeInteger(intent.expectedRevision) || intent.expectedRevision < 0 ||
      intent.expectedRevision >= Number.MAX_SAFE_INTEGER || !timestamp(receivedAt)) return reject('INVALID_INPUT');
  const prior = state.receipts.find(r => r.intent.intentId === intent.intentId);
  if (prior) {
    if (prior.intent.score !== intent.score || prior.intent.expectedRevision !== intent.expectedRevision ||
        prior.intent.visitId !== intent.visitId) return reject('INTENT_CONFLICT');
    // Retry is not new activity and may replay even after a session has expired/closed.
    return { kind: 'replayed', state, receipt: prior };
  }
  if (!canReuseSession(session, session, receivedAt)) return reject('SESSION_EXPIRED');
  if (intent.expectedRevision !== (state.experience?.revision ?? 0)) return reject('REVISION_CONFLICT');
  const at = new Date(receivedAt).toISOString();
  const experience: RatingExperience = { shopId: session.shopId, scope: session.scope, entryKey: session.entryKey,
    sessionId: session.sessionId, rating: intent.score, revision: intent.expectedRevision + 1,
    firstInteractionAt: state.experience?.firstInteractionAt ?? at,
    updatedAt: state.experience ? latest(state.experience.updatedAt, at) : at };
  const receipt: RatingReceipt = { intent: { ...intent }, experience };
  return { kind: 'applied', receipt, state: { session: { ...session, lastActivity: latest(session.lastActivity, at) },
    experience, receipts: [...state.receipts, receipt] } };
}
