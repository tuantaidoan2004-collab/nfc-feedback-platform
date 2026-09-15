import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { canReuseSession, openVisit, type DataScope, type NavigationKind, type PageVisit,
  type VisitSession, type SessionContext, type RatingExperience, type RatingIntent, type RatingReceipt, type Rejection } from '../domain/visit-rating';

import { rateFeedbackExperience, submitPrivateFeedback, type FeedbackIntent, type FeedbackExperience,
  type FeedbackReceipt, type SharedRatingReceipt, type PrivateFeedback } from '../domain/private-feedback';

/** Context/entry is resolved by server. Browser hash alone never supplies shop/scope/entry authority. */
export type ResolvedShopContext = Readonly<{ shopId: string; scope: DataScope; entryKey: string }>;
export type ResolvedVisitContext = ResolvedShopContext & Readonly<{ visitId: string }>;
export type RatingCommand = Pick<RatingIntent, 'intentId' | 'expectedRevision' | 'score'>;
export type RegisteredVisit = { visit: PageVisit; session: VisitSession; experience: RatingExperience | null; active: boolean };
export type StoredRatingResult =
 | { kind: 'applied' | 'replayed'; experience: RatingExperience; receipt: RatingReceipt }
 | { kind: 'rejected'; code: Rejection };
export interface VisitPolicy {
  guard(client: PoolClient, context: ResolvedShopContext): Promise<Date | undefined>;
  registered(client: PoolClient, visit: PageVisit, fresh: boolean): Promise<void>;
  applied(client: PoolClient, visit: PageVisit, firstRating: boolean): Promise<void>;
}
export class VisitAccessDenied extends Error { constructor(public readonly code: string) { super(code); } }
export class VisitCapabilityConflict extends Error { constructor() { super('VISIT_CONFLICT'); } }

export type FeedbackCommand = Pick<FeedbackIntent, 'intentId' | 'expectedRevision' | 'topic' | 'message'>;
export type StoredFeedbackResult =
 | { kind: 'applied' | 'replayed'; experience: FeedbackExperience; receipt: FeedbackReceipt }
 | { kind: 'rejected'; code: Rejection | 'RATING_REQUIRED' };
type FeedbackRow = { feedback_topic: string | null; feedback_message: string | null;
  feedback_submitted_at: Date | null; feedback_updated_at: Date | null };
type SessionRow = { id: string; shop_id: string; scope: DataScope; entry_key: string; browser_hash: string;
  started_at: Date; last_activity: Date; closed_at: Date | null };
type OpenRow = SessionRow & { visit_id: string; opened_at: Date; navigation_kind: NavigationKind };
type ExperienceRow = FeedbackRow & { rating: number; revision: string; first_interaction_at: Date; updated_at: Date };
type ReceiptRow = FeedbackRow & { operation: 'rating' | 'feedback'; visit_id: string; intent_id: string; expected_revision: string; score: number;
  applied_revision: string; first_interaction_at: Date; applied_at: Date };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid = (c: ResolvedShopContext, hash: string) => uuid.test(c.shopId) && ['live','test'].includes(c.scope) &&
  typeof c.entryKey === 'string' && c.entryKey.trim().length > 0 && c.entryKey.length <= 128 && /^[a-f0-9]{64}$/.test(hash);
const sessionFrom = (r: SessionRow): VisitSession => ({ sessionId: r.id, shopId: r.shop_id, scope: r.scope,
  entryKey: r.entry_key, browserHash: r.browser_hash, startedAt: r.started_at.toISOString(),
  lastActivity: r.last_activity.toISOString(), closedAt: r.closed_at?.toISOString() ?? null });
const sessionKey = (c: SessionContext) => [c.shopId, c.scope, c.entryKey, c.sessionId];
const expFrom = (c: SessionContext, r: Pick<ExperienceRow, 'rating' | 'revision' | 'first_interaction_at' | 'updated_at'>): RatingExperience => ({ shopId: c.shopId, scope: c.scope,
  entryKey: c.entryKey, sessionId: c.sessionId, rating: r.rating, revision: Number(r.revision),
  firstInteractionAt: r.first_interaction_at.toISOString(), updatedAt: r.updated_at.toISOString() });
const feedbackFrom = (r: FeedbackRow): PrivateFeedback | null => r.feedback_topic === null ? null : ({
  topic: r.feedback_topic, message: r.feedback_message!, submittedAt: r.feedback_submitted_at!.toISOString(), updatedAt: r.feedback_updated_at!.toISOString(),
});
const publicExperience = (e: FeedbackExperience): RatingExperience => ({ shopId: e.shopId, scope: e.scope, entryKey: e.entryKey,
  sessionId: e.sessionId, rating: e.rating, revision: e.revision, firstInteractionAt: e.firstInteractionAt, updatedAt: e.updatedAt });
const feedbackValues = (e: FeedbackExperience) => [e.feedback?.topic ?? null, e.feedback?.message ?? null,
  e.feedback?.submittedAt ?? null, e.feedback?.updatedAt ?? null];
const visitFrom = (r: OpenRow): PageVisit => ({ shopId: r.shop_id, scope: r.scope, entryKey: r.entry_key,
  sessionId: r.id, visitId: r.visit_id, openedAt: r.opened_at.toISOString(), navigationKind: r.navigation_kind });
const openSelect = `SELECT s.*,v.id AS visit_id,v.opened_at,v.navigation_kind FROM page_visits v
 JOIN visit_sessions s ON s.id=v.session_id WHERE v.shop_id=$1 AND v.scope=$2 AND v.entry_key=$3`;

export class VisitRatingRepository {
  /** Clock injection is for deterministic local tests only; runtime uses DB time after lock acquisition. */
  constructor(private readonly pool: Pool, private readonly testClock?: () => Date, private readonly policy?: VisitPolicy) {}
  private async transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const result = await run(client); await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  private async lockAndTime(client: PoolClient, context: ResolvedShopContext, browserHash: string) {
    // Lock exists even before the first session row. Hash collision only adds serialization.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [JSON.stringify([context.shopId, context.scope, context.entryKey, browserHash])]);
    const deadline = await this.policy?.guard(client, context);
    const date = this.testClock ? this.testClock() : (await client.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0].now;
    if (deadline && date >= deadline) throw new VisitAccessDenied('PREVIEW_EXPIRED');
    return date.toISOString();
  }
  private async experience(client: PoolClient, context: SessionContext) {
    const rows = await client.query<ExperienceRow>(
      'SELECT rating,revision,first_interaction_at,updated_at FROM rating_experiences WHERE shop_id=$1 AND scope=$2 AND entry_key=$3 AND session_id=$4', sessionKey(context));
    return rows.rows[0] ? expFrom(context, rows.rows[0]) : null;
  }
  async registerVisit(context: ResolvedShopContext, loadKey: string, navigationKind: NavigationKind, browserHash: string): Promise<RegisteredVisit> {
    if (!valid(context, browserHash) || typeof loadKey !== 'string' || !loadKey.trim() ||
        !['load','reload','back_forward','resume'].includes(navigationKind)) throw new Error('INVALID_OPEN');
    try {
      return await this.transaction(async client => {
        const at = await this.lockAndTime(client, context, browserHash);
        const group = [context.shopId, context.scope, context.entryKey];
        const retry = (await client.query<OpenRow>(`${openSelect} AND v.load_key=$4`, [...group, loadKey])).rows[0];
        if (retry) {
          if (retry.browser_hash !== browserHash || retry.navigation_kind !== navigationKind) throw new VisitCapabilityConflict();
          await this.policy?.registered(client, visitFrom(retry), false);
          const session = sessionFrom(retry);
          return { visit: visitFrom(retry), session, experience: await this.experience(client, session),
            active: canReuseSession(session, { ...context, browserHash }, at) };
        }
        const recent = (await client.query<SessionRow>(`SELECT * FROM visit_sessions
          WHERE shop_id=$1 AND scope=$2 AND entry_key=$3 AND browser_hash=$4 ORDER BY sequence DESC LIMIT 1 FOR UPDATE`,
          [...group, browserHash])).rows[0];
        const previous = recent ? sessionFrom(recent) : null;
        const opened = openVisit(previous, { ...context, browserHash },
          { visitId: randomUUID(), newSessionId: randomUUID() }, navigationKind, at);
        const session = opened.session;
        if (opened.reused) {
          await client.query('UPDATE visit_sessions SET last_activity=$2 WHERE id=$1', [session.sessionId, session.lastActivity]);
        } else {
          if (previous && previous.closedAt === null) await client.query(
            'UPDATE visit_sessions SET closed_at=GREATEST(last_activity,$2::timestamptz) WHERE id=$1', [previous.sessionId, at]);
          await client.query(`INSERT INTO visit_sessions(id,shop_id,scope,entry_key,browser_hash,started_at,last_activity)
            VALUES($1,$2,$3,$4,$5,$6,$6)`, [session.sessionId, ...group, browserHash, at]);
        }
        await client.query(`INSERT INTO page_visits(id,shop_id,scope,entry_key,session_id,load_key,navigation_kind,opened_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [opened.visit.visitId, ...group, session.sessionId, loadKey, navigationKind, at]);
        await this.policy?.registered(client, opened.visit, true);
        return { visit: opened.visit, session, experience: await this.experience(client, session), active: true };
      });
    } catch (error) {
      // Different browser tokens can race on one event key; the losing transaction is rolled back.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505' &&
          'constraint' in error && error.constraint === 'page_visits_shop_id_scope_entry_key_load_key_key') throw new VisitCapabilityConflict();
      throw error;
    }
  }
  async recordRating(context: ResolvedVisitContext, command: RatingCommand, browserHash: string): Promise<StoredRatingResult> {
    const result = await this.write(context, { kind: 'rating', command }, browserHash);
    if (result.kind === 'rejected') return { kind: 'rejected', code: result.code as Rejection };
    // Explicit projection for BOTH current snapshot and original receipt; never spread private aggregate.
    const receipt = result.receipt as SharedRatingReceipt;
    return { kind: result.kind, experience: publicExperience(result.experience), receipt: {
      intent: receipt.intent, experience: publicExperience(receipt.experience),
    } };
  }
  /** Private capability-scoped result, not an owner authorization or public API projection. */
  async recordPrivateFeedback(context: ResolvedVisitContext, command: FeedbackCommand, browserHash: string): Promise<StoredFeedbackResult> {
    return await this.write(context, { kind: 'feedback', command }, browserHash) as StoredFeedbackResult;
  }
  private async write(context: ResolvedVisitContext, action: { kind: 'rating'; command: RatingCommand } | { kind: 'feedback'; command: FeedbackCommand }, browserHash: string) {
    if (!valid(context, browserHash) || !uuid.test(context.visitId)) return { kind: 'rejected' as const, code: 'CONTEXT_MISMATCH' as const };
    return this.transaction(async client => {
      const at = await this.lockAndTime(client, context, browserHash);
      const row = (await client.query<OpenRow>(`${openSelect} AND v.id=$4 AND s.browser_hash=$5 FOR UPDATE OF s`,
        [context.shopId, context.scope, context.entryKey, context.visitId, browserHash])).rows[0];
      if (!row) return { kind: 'rejected' as const, code: 'CONTEXT_MISMATCH' as const };
      const session = sessionFrom(row), visit = visitFrom(row), key = sessionKey(session);
      const currentRow = (await client.query<ExperienceRow>(`SELECT * FROM rating_experiences
        WHERE shop_id=$1 AND scope=$2 AND entry_key=$3 AND session_id=$4`, key)).rows[0];
      const current: FeedbackExperience | null = currentRow ? { ...expFrom(session, currentRow), feedback: feedbackFrom(currentRow) } : null;
      const prior = (await client.query<ReceiptRow>(`SELECT * FROM rating_intent_receipts
        WHERE shop_id=$1 AND scope=$2 AND entry_key=$3 AND session_id=$4 AND intent_id=$5`, [...key, action.command.intentId])).rows[0];
      const receipts: SharedRatingReceipt[] = [], feedbackReceipts: FeedbackReceipt[] = [];
      if (prior) {
        const base = { shopId: session.shopId, scope: session.scope, entryKey: session.entryKey, sessionId: session.sessionId,
          visitId: prior.visit_id, intentId: prior.intent_id, expectedRevision: Number(prior.expected_revision) };
        const experience: FeedbackExperience = { ...expFrom(session, { rating: prior.score, revision: prior.applied_revision,
          first_interaction_at: prior.first_interaction_at, updated_at: prior.applied_at }), feedback: feedbackFrom(prior) };
        if (prior.operation === 'rating') receipts.push({ intent: { ...base, score: prior.score }, experience });
        else feedbackReceipts.push({ intent: { ...base, topic: prior.feedback_topic!, message: prior.feedback_message! }, experience });
      }
      const state = { session, experience: current, receipts, feedbackReceipts };
      const outcome = action.kind === 'rating'
        ? rateFeedbackExperience(state, visit, { ...visit, intentId: action.command.intentId, expectedRevision: action.command.expectedRevision, score: action.command.score }, at)
        : submitPrivateFeedback(state, visit, { ...visit, intentId: action.command.intentId, expectedRevision: action.command.expectedRevision, topic: action.command.topic, message: action.command.message }, at);
      if (outcome.kind === 'rejected') return { kind: 'rejected' as const, code: outcome.code };
      const exp = outcome.state.experience!;
      if (outcome.kind === 'applied') {
        await client.query(`INSERT INTO rating_experiences
          (shop_id,scope,entry_key,session_id,rating,revision,first_interaction_at,updated_at,
           feedback_topic,feedback_message,feedback_submitted_at,feedback_updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(session_id) DO UPDATE SET
          rating=EXCLUDED.rating,revision=EXCLUDED.revision,updated_at=EXCLUDED.updated_at,
          feedback_topic=EXCLUDED.feedback_topic,feedback_message=EXCLUDED.feedback_message,
          feedback_submitted_at=EXCLUDED.feedback_submitted_at,feedback_updated_at=EXCLUDED.feedback_updated_at`,
          [...key, exp.rating, exp.revision, exp.firstInteractionAt, exp.updatedAt, ...feedbackValues(exp)]);
        await client.query(`INSERT INTO rating_intent_receipts
          (shop_id,scope,entry_key,session_id,visit_id,intent_id,expected_revision,score,applied_revision,first_interaction_at,applied_at,
           operation,feedback_topic,feedback_message,feedback_submitted_at,feedback_updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [...key, visit.visitId, action.command.intentId, action.command.expectedRevision, exp.rating, exp.revision,
            exp.firstInteractionAt, exp.updatedAt, action.kind, ...feedbackValues(exp)]);
        await this.policy?.applied(client, visit, !currentRow && action.kind === 'rating');
        await client.query('UPDATE visit_sessions SET last_activity=$2 WHERE id=$1', [session.sessionId, outcome.state.session.lastActivity]);
      }
      return { kind: outcome.kind, experience: exp, receipt: outcome.receipt };
    });
  }
}
