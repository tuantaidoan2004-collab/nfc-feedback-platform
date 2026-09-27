import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { NavigationKind } from '../lib/domain/visit-rating';
import { VisitCapabilityConflict, VisitAccessDenied, VisitRatingRepository, type ResolvedShopContext, type VisitPolicy } from '../lib/repositories/visit-ratings';
import { GuestFlood, inspect, mark } from './guest-limits';
import { readBatch, record } from './page-events';
import { erase } from './erase';

/**
 * `resolve` binds a request to the page it came from -- in production the signed render proof (publishing-runtime.ts).
 * Required since lát A3b: the old way, trusting a shop slug in the URL, is gone with the routes that used it.
 */
type Dependencies = { enabled: boolean; origin: string | undefined; pool: () => Pool; resolve: (request: Request, pool: Pool) => Promise<{ context: ResolvedShopContext; policy?: VisitPolicy }> };
type Context = { visitId?: string };
type Operation = 'register' | 'rating' | 'feedback' | 'events' | 'erase';
class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
const uuid4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const response = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' },
});
const capabilityHash = (context: ResolvedShopContext, token: string) => createHash('sha256')
  .update(`nfc-browser-v1\0${context.shopId}\0${context.scope}\0${context.entryKey}\0${token}`).digest('hex');

async function readInput(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'JSON_REQUIRED');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_BODY');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ApiError(413, 'BODY_TOO_LARGE'); }
      chunks.push(value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_BODY');
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_BODY');
  } finally { reader.releaseLock(); }
}

/**
 * One line per refused guest write, so a refusal on someone's phone can be read in the host's log (27/09: every open
 * from Tài's Chrome on iPhone came back 403 and the log said only "403"). What is written is why, never who: the code,
 * the operation, whether the Origin matched, the Sec-Fetch-Site value and the browser family -- no address, no
 * secret, no body, no full user agent.
 */
function refused(request: Request, operation: Operation, code: string, status: number, origin: string | undefined, error: unknown) {
  const site = request.headers.get('sec-fetch-site');
  const agent = request.headers.get('user-agent') ?? '';
  const browser = /CriOS\//.test(agent) ? 'chrome-ios' : /FxiOS\//.test(agent) ? 'firefox-ios' : /(iPhone|iPad)/.test(agent) ? 'ios-other'
    : /Android/.test(agent) ? 'android' : agent ? 'desktop' : 'none';
  console.warn('GUEST_REFUSED', JSON.stringify({ operation, status, code,
    origin: !request.headers.has('origin') ? 'absent' : request.headers.get('origin') === origin ? 'match' : 'other',
    site: site === null ? 'absent' : ['same-origin', 'same-site', 'cross-site', 'none'].includes(site) ? site : 'other', browser,
    ...(status === 503 && error instanceof Error ? { error: error.name } : {}) }));
}

/** Standard Request/Response boundary; actual Next routes delegate here. No credential loading. */
export function createVisitV2Api(dependencies: Dependencies) {
  return async function handle(request: Request, context: Context, operation: Operation): Promise<Response> {
    try {
      if (!dependencies.enabled) throw new ApiError(404, 'NOT_FOUND');
      if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED');
      const configured = dependencies.origin;
      if (!configured || new URL(configured).origin !== configured) throw new ApiError(503, 'SERVICE_UNAVAILABLE');
      if (request.headers.get('origin') !== configured ||
          (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) {
        throw new ApiError(403, 'ORIGIN_NOT_ALLOWED');
      }
      if (new URL(request.url).search) throw new ApiError(400, 'INVALID_INPUT');
      const bearer = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '');
      if (!bearer) throw new ApiError(401, 'VISIT_NOT_AUTHORIZED');
      const input = await readInput(request, operation === 'feedback' ? 16 * 1024 : 4096);
      // The call-back number is the one optional field; every other field is required.
      const keys = operation === 'register' ? ['loadKey', 'navigationKind'] : operation === 'events' ? ['events']
        : operation === 'erase' ? []
        : operation === 'rating' ? ['intentId', 'expectedRevision', 'score']
        : ['intentId', 'expectedRevision', 'topic', 'message', ...(Object.hasOwn(input, 'phone') ? ['phone'] : [])];
      if (Object.keys(input).length !== keys.length || Object.keys(input).some(k => !keys.includes(k))) {
        throw new ApiError(400, 'INVALID_INPUT');
      }
      if (operation === 'erase') {
        if (!context.visitId || !uuid4.test(context.visitId)) throw new ApiError(400, 'INVALID_INPUT');
      } else if (operation === 'events') {
        if (!context.visitId || !uuid4.test(context.visitId) || !readBatch(input.events)) throw new ApiError(400, 'INVALID_INPUT');
      } else if (operation === 'register') {
        if (typeof input.loadKey !== 'string' || !uuid4.test(input.loadKey) ||
            typeof input.navigationKind !== 'string' || !['load','reload','back_forward','resume'].includes(input.navigationKind)) throw new ApiError(400, 'INVALID_INPUT');
      } else if (!context.visitId || !uuid4.test(context.visitId) || typeof input.intentId !== 'string' ||
          !uuid4.test(input.intentId) || !Number.isSafeInteger(input.expectedRevision) ||
          Number(input.expectedRevision) < 0 || Number(input.expectedRevision) >= Number.MAX_SAFE_INTEGER ||
          (operation === 'rating' ? !Number.isInteger(input.score) || Number(input.score) < 1 || Number(input.score) > 5
            : typeof input.topic !== 'string' || typeof input.message !== 'string' || (input.phone !== undefined && typeof input.phone !== 'string'))) {
        throw new ApiError(400, 'INVALID_INPUT');
      }
      const pool = dependencies.pool();
      const { context: resolved, policy } = await dependencies.resolve(request, pool);
      const hash = capabilityHash(resolved, bearer[1]);
      // Counted before the write, so a machine past the ceiling is turned away before it costs a row; at the
      // marking threshold the answer is taken as it always was and the session is marked once it exists (lát A1).
      const verdict = await inspect(pool, request, resolved, operation, context.visitId);
      const remember = async (sessionId: string | null) => {
        if (verdict.suspected && sessionId) await mark(pool, sessionId, verdict.reason);
      };
      if (operation === 'erase' || operation === 'events') {
        // The capability must belong to this visit. For events it stops one page writing another's history; for
        // erasure it is the whole proof of ownership -- the secret the browser holds is what makes this theirs.
        const owned = await pool.query('SELECT v.session_id FROM page_visits v JOIN visit_sessions s ON s.id=v.session_id AND s.browser_hash=$2 WHERE v.id=$1',
          [context.visitId, hash]);
        if (!owned.rows[0]) throw new ApiError(401, 'VISIT_NOT_AUTHORIZED');
        if (operation === 'erase') return response(await erase(pool, { ...resolved, browserHash: hash }));
        await record(pool, resolved, { sessionId: owned.rows[0].session_id, visitId: context.visitId }, readBatch(input.events)!);
        await remember(owned.rows[0].session_id);
        // Measurement is answered and forgotten: nothing to read back, so nothing to wait for.
        return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
      }
      const repository = new VisitRatingRepository(pool, undefined, policy);
      if (operation === 'register') {
        const opened = await repository.registerVisit(resolved,
          input.loadKey as string, input.navigationKind as NavigationKind, hash);
        const { visit, session, experience } = opened;
        await remember(session.sessionId);
        return response({ visit: { id: visit.visitId, sessionId: visit.sessionId, openedAt: visit.openedAt, navigationKind: visit.navigationKind },
          session: { id: session.sessionId, lastActivity: session.lastActivity, active: opened.active },
          experience: experience ? { rating: experience.rating, revision: experience.revision,
            firstInteractionAt: experience.firstInteractionAt, updatedAt: experience.updatedAt } : null });
      }
      if (operation === 'feedback') {
        const result = await repository.recordPrivateFeedback({ ...resolved, visitId: context.visitId! }, {
          intentId: input.intentId as string, expectedRevision: input.expectedRevision as number,
          topic: input.topic as string, message: input.message as string, phone: (input.phone as string | undefined) ?? null,
        }, hash);
        if (result.kind === 'rejected') {
          if (result.code === 'CONTEXT_MISMATCH') throw new ApiError(401, 'VISIT_NOT_AUTHORIZED');
          throw new ApiError(result.code === 'INVALID_INPUT' ? 400 : 409, result.code);
        }
        await remember(verdict.sessionId);
        // Acknowledge only; do not echo private content, even through the original receipt.
        return response({ outcome: result.kind,
          experience: { rating: result.experience.rating, revision: result.experience.revision,
            firstInteractionAt: result.experience.firstInteractionAt, updatedAt: result.experience.updatedAt },
          receipt: { intentId: result.receipt.intent.intentId, revision: result.receipt.experience.revision,
            updatedAt: result.receipt.experience.updatedAt },
        });
      }
      const result = await repository.recordRating({ ...resolved, visitId: context.visitId! }, {
        intentId: input.intentId as string, expectedRevision: input.expectedRevision as number, score: input.score as number,
      }, hash);
      if (result.kind === 'rejected') {
        if (result.code === 'CONTEXT_MISMATCH') throw new ApiError(401, 'VISIT_NOT_AUTHORIZED');
        throw new ApiError(result.code === 'INVALID_INPUT' ? 400 : 409, result.code);
      }
      await remember(verdict.sessionId);
      const { experience, receipt } = result;
      return response({ outcome: result.kind,
        experience: { rating: experience.rating, revision: experience.revision,
          firstInteractionAt: experience.firstInteractionAt, updatedAt: experience.updatedAt },
        receipt: { intentId: receipt.intent.intentId, score: receipt.intent.score,
          revision: receipt.experience.revision, firstInteractionAt: receipt.experience.firstInteractionAt,
          updatedAt: receipt.experience.updatedAt },
      });
    } catch (error) {
      // The shop's page and its Google button never depend on this; only the write path can be refused.
      const [code, status] = error instanceof GuestFlood ? ['TOO_MANY_REQUESTS', 429]
        : error instanceof VisitAccessDenied ? [error.code, 403]
        : error instanceof VisitCapabilityConflict ? ['VISIT_CONFLICT', 409]
        : error instanceof ApiError ? [error.code, error.status] : ['SERVICE_UNAVAILABLE', 503];
      refused(request, operation, code, status, dependencies.origin, error);
      return response({ error: code }, status);
    }
  };
}
