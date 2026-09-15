import { canReuseSession, rateSession, type PageVisit, type RatingExperience, type RatingIntent,
  type RatingReceipt, type Rejection, type SessionState, type VisitContext } from './visit-rating';

export type PrivateFeedback = Readonly<{ topic: string; message: string; submittedAt: string; updatedAt: string }>;
/** One shared revision for both writes. feedback has no independent concurrency token. */
export type FeedbackExperience = RatingExperience & Readonly<{ feedback: PrivateFeedback | null }>;
export type FeedbackIntent = VisitContext & Readonly<{ intentId: string; expectedRevision: number; topic: string; message: string }>;
export type FeedbackReceipt = Readonly<{ intent: FeedbackIntent; experience: FeedbackExperience }>;
export type SharedRatingReceipt = Omit<RatingReceipt, 'experience'> & Readonly<{ experience: FeedbackExperience }>;
export type FeedbackSessionState = Omit<SessionState, 'experience' | 'receipts'> & Readonly<{
  experience: FeedbackExperience | null;
  receipts: readonly SharedRatingReceipt[];
  feedbackReceipts: readonly FeedbackReceipt[];
}>;
type Result<R> = { kind: 'applied' | 'replayed'; state: FeedbackSessionState; receipt: R }
  | { kind: 'rejected'; state: FeedbackSessionState; code: Rejection | 'RATING_REQUIRED' };
const sameContext = (a: VisitContext | RatingExperience, b: RatingExperience | VisitContext | FeedbackSessionState['session']) =>
  a.shopId === b.shopId && a.scope === b.scope && a.entryKey === b.entryKey && a.sessionId === b.sessionId;
const latest = (a: string, b: string) => new Date(Math.max(Date.parse(a), Date.parse(b))).toISOString();

/** Plain text only. NFC and line-ending canonicalization define idempotent payload equality. */
export function normalizeFeedback(topic: string, message: string): { topic: string; message: string } | null {
  if (typeof topic !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(topic) || typeof message !== 'string') return null;
  // Reject malformed UTF-16 instead of silently storing replacement characters.
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(message)) return null;
  const normalized = message.replace(/\r\n?/g, '\n').normalize('NFC').trim();
  const length = Array.from(normalized).length;
  if (length < 1 || length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(normalized)) return null;
  return { topic, message: normalized };
}

/** Aggregate boundary for rating once private feedback exists; legacy rateSession is unchanged. */
export function rateFeedbackExperience(state: FeedbackSessionState, visit: PageVisit, intent: RatingIntent, at: string): Result<SharedRatingReceipt> {
  if (!sameContext(visit, state.session) || !sameContext(intent, state.session) || visit.visitId !== intent.visitId ||
      (state.experience && !sameContext(state.experience, state.session))) return { kind: 'rejected', state, code: 'CONTEXT_MISMATCH' };
  if (state.feedbackReceipts.some(r => r.intent.intentId === intent.intentId)) return { kind: 'rejected', state, code: 'INTENT_CONFLICT' };
  const rated = rateSession(state, visit, intent, at);
  if (rated.kind === 'rejected') return { kind: 'rejected', state, code: rated.code };
  if (rated.kind === 'replayed') {
    return { kind: 'replayed', state, receipt: state.receipts.find(r => r.intent.intentId === intent.intentId)! };
  }
  const experience: FeedbackExperience = { ...rated.receipt.experience, feedback: state.experience?.feedback ?? null };
  const receipt = { intent: rated.receipt.intent, experience };
  return { kind: 'applied', receipt, state: { ...state, session: rated.state.session, experience, receipts: [...state.receipts, receipt] } };
}

export function submitPrivateFeedback(state: FeedbackSessionState, visit: PageVisit, intent: FeedbackIntent, receivedAt: string): Result<FeedbackReceipt> {
  const reject = (code: Rejection | 'RATING_REQUIRED'): Result<FeedbackReceipt> => ({ kind: 'rejected', state, code });
  if (!sameContext(visit, state.session) || !sameContext(intent, state.session) || visit.visitId !== intent.visitId ||
      (state.experience && !sameContext(state.experience, state.session))) return reject('CONTEXT_MISMATCH');
  const content = normalizeFeedback(intent.topic, intent.message);
  if (!content || typeof intent.intentId !== 'string' || !intent.intentId.trim() ||
      !Number.isSafeInteger(intent.expectedRevision) || intent.expectedRevision < 0 || intent.expectedRevision >= Number.MAX_SAFE_INTEGER ||
      !Number.isFinite(Date.parse(receivedAt))) return reject('INVALID_INPUT');
  if (state.receipts.some(r => r.intent.intentId === intent.intentId)) return reject('INTENT_CONFLICT');
  const normalized: FeedbackIntent = { ...intent, ...content };
  const prior = state.feedbackReceipts.find(r => r.intent.intentId === intent.intentId);
  if (prior) {
    if (prior.intent.visitId !== intent.visitId || prior.intent.expectedRevision !== intent.expectedRevision ||
        prior.intent.topic !== content.topic || prior.intent.message !== content.message) return reject('INTENT_CONFLICT');
    return { kind: 'replayed', state, receipt: prior };
  }
  if (!state.experience) return reject('RATING_REQUIRED');
  if (!canReuseSession(state.session, state.session, receivedAt)) return reject('SESSION_EXPIRED');
  if (intent.expectedRevision !== state.experience.revision) return reject('REVISION_CONFLICT');
  const at = new Date(receivedAt).toISOString();
  const updatedAt = latest(state.experience.updatedAt, at);
  const feedback: PrivateFeedback = { ...content, submittedAt: state.experience.feedback?.submittedAt ?? updatedAt,
    updatedAt };
  const experience: FeedbackExperience = { ...state.experience, feedback, revision: state.experience.revision + 1,
    updatedAt: latest(state.experience.updatedAt, at) };
  const receipt: FeedbackReceipt = { intent: normalized, experience };
  return { kind: 'applied', receipt, state: { ...state, experience,
    session: { ...state.session, lastActivity: latest(state.session.lastActivity, at) }, feedbackReceipts: [...state.feedbackReceipts, receipt] } };
}
