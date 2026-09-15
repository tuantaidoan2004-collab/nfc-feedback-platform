import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { NavigationKind } from '../lib/domain/visit-rating';
import { VisitCapabilityConflict, VisitAccessDenied, VisitRatingRepository, type ResolvedShopContext, type VisitPolicy } from '../lib/repositories/visit-ratings';

type Dependencies = { enabled: boolean; origin: string | undefined; pool: () => Pool; resolve?: (request: Request, pool: Pool) => Promise<{ context: ResolvedShopContext; policy: VisitPolicy }> };
type Context = { shop: string; visitId?: string };
type Operation = 'register' | 'rating' | 'feedback';
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
      const keys = operation === 'register' ? ['loadKey', 'navigationKind'] : operation === 'rating' ? ['intentId', 'expectedRevision', 'score'] : ['intentId', 'expectedRevision', 'topic', 'message'];
      if (Object.keys(input).length !== keys.length || Object.keys(input).some(k => !keys.includes(k))) {
        throw new ApiError(400, 'INVALID_INPUT');
      }
      if (operation === 'register') {
        if (typeof input.loadKey !== 'string' || !uuid4.test(input.loadKey) ||
            typeof input.navigationKind !== 'string' || !['load','reload','back_forward','resume'].includes(input.navigationKind)) throw new ApiError(400, 'INVALID_INPUT');
      } else if (!context.visitId || !uuid4.test(context.visitId) || typeof input.intentId !== 'string' ||
          !uuid4.test(input.intentId) || !Number.isSafeInteger(input.expectedRevision) ||
          Number(input.expectedRevision) < 0 || Number(input.expectedRevision) >= Number.MAX_SAFE_INTEGER ||
          (operation === 'rating' ? !Number.isInteger(input.score) || Number(input.score) < 1 || Number(input.score) > 5
            : typeof input.topic !== 'string' || typeof input.message !== 'string')) {
        throw new ApiError(400, 'INVALID_INPUT');
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(context.shop) ||
          ['api', 'zzz', 't', 'demo', '_next'].includes(context.shop.toLowerCase())) throw new ApiError(404, 'SHOP_NOT_FOUND');
      const pool = dependencies.pool();
      let resolved: ResolvedShopContext, policy: VisitPolicy | undefined;
      if (dependencies.resolve) { const bound = await dependencies.resolve(request, pool); resolved = bound.context; policy = bound.policy; }
      else {
        const shops = await pool.query<{ id: string }>('SELECT id FROM shops WHERE lower(slug)=lower($1)', [context.shop]);
        if (!shops.rows[0]) throw new ApiError(404, 'SHOP_NOT_FOUND');
        resolved = { shopId: shops.rows[0].id, scope: 'live', entryKey: 'direct:shop' };
      }
      const hash = capabilityHash(resolved, bearer[1]);
      const repository = new VisitRatingRepository(pool, undefined, policy);
      if (operation === 'register') {
        const opened = await repository.registerVisit(resolved,
          input.loadKey as string, input.navigationKind as NavigationKind, hash);
        const { visit, session, experience } = opened;
        return response({ visit: { id: visit.visitId, sessionId: visit.sessionId, openedAt: visit.openedAt, navigationKind: visit.navigationKind },
          session: { id: session.sessionId, lastActivity: session.lastActivity, active: opened.active },
          experience: experience ? { rating: experience.rating, revision: experience.revision,
            firstInteractionAt: experience.firstInteractionAt, updatedAt: experience.updatedAt } : null });
      }
      if (operation === 'feedback') {
        const result = await repository.recordPrivateFeedback({ ...resolved, visitId: context.visitId! }, {
          intentId: input.intentId as string, expectedRevision: input.expectedRevision as number,
          topic: input.topic as string, message: input.message as string,
        }, hash);
        if (result.kind === 'rejected') {
          if (result.code === 'CONTEXT_MISMATCH') throw new ApiError(401, 'VISIT_NOT_AUTHORIZED');
          throw new ApiError(result.code === 'INVALID_INPUT' ? 400 : 409, result.code);
        }
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
      const { experience, receipt } = result;
      return response({ outcome: result.kind,
        experience: { rating: experience.rating, revision: experience.revision,
          firstInteractionAt: experience.firstInteractionAt, updatedAt: experience.updatedAt },
        receipt: { intentId: receipt.intent.intentId, score: receipt.intent.score,
          revision: receipt.experience.revision, firstInteractionAt: receipt.experience.firstInteractionAt,
          updatedAt: receipt.experience.updatedAt },
      });
    } catch (error) {
      if (error instanceof VisitAccessDenied) return response({ error: error.code }, 403);
      if (error instanceof VisitCapabilityConflict) return response({ error: 'VISIT_CONFLICT' }, 409);
      if (error instanceof ApiError) return response({ error: error.code }, error.status);
      return response({ error: 'SERVICE_UNAVAILABLE' }, 503);
    }
  };
}
