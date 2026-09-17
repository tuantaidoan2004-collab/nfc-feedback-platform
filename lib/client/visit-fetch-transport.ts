import type { CoordinatorPorts, OpenSnapshot, RatingReply, TransportReply } from './visit-coordinator';

export type RenderBinding = Readonly<{ proof: string; preview: boolean }>;
export type FeedbackCommand = Readonly<{ intentId: string; expectedRevision: number; topic: string; message: string }>;
export type FeedbackReply = Readonly<{ outcome: 'applied' | 'replayed';
  experience: { rating: number | null; revision: number; firstInteractionAt: string; updatedAt: string };
  receipt: { intentId: string; revision: number; updatedAt: string } }>;
type FeedbackTransport = { feedback: (secret: string, visitId: string, command: FeedbackCommand) => Promise<TransportReply<FeedbackReply>> };
type Timer = { set: (callback: () => void, milliseconds: number) => unknown; clear: (handle: unknown) => void };
type Ports = { fetch: typeof fetch; timer: Timer; timeoutMs?: number };
const unknownReply = { kind: 'unknown' } as const;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const time = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const revision = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const score = (v: unknown) => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 5;
const timestamps = (v: Record<string, unknown>) => time(v.firstInteractionAt) && time(v.updatedAt);
const rating = (v: unknown) => object(v) && (v.rating === null || score(v.rating)) && revision(v.revision) && timestamps(v);
function openSnapshot(v: unknown): v is OpenSnapshot & { visit: { navigationKind: string } } {
  return object(v) && object(v.visit) && object(v.session) && uuid(v.visit.id) && uuid(v.session.id) &&
    v.visit.sessionId === v.session.id && time(v.visit.openedAt) && time(v.session.lastActivity) &&
    typeof v.session.active === 'boolean' && ['load', 'reload', 'back_forward', 'resume'].includes(String(v.visit.navigationKind)) &&
    (v.experience === null || rating(v.experience));
}
function ratingReply(v: unknown): v is RatingReply {
  return object(v) && (v.outcome === 'applied' || v.outcome === 'replayed') && object(v.experience) && rating(v.experience) && score(v.experience.rating) &&
    object(v.receipt) && uuid(v.receipt.intentId) && score(v.receipt.score) && revision(v.receipt.revision) && timestamps(v.receipt);
}
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
function feedbackReply(v: unknown, command: FeedbackCommand): v is FeedbackReply {
  return object(v) && exactKeys(v, ['outcome', 'experience', 'receipt']) &&
    (v.outcome === 'applied' || v.outcome === 'replayed') && object(v.experience) && rating(v.experience) &&
    exactKeys(v.experience, ['rating', 'revision', 'firstInteractionAt', 'updatedAt']) && object(v.receipt) &&
    exactKeys(v.receipt, ['intentId', 'revision', 'updatedAt']) && uuid(v.receipt.intentId) &&
    v.receipt.intentId === command.intentId && revision(v.receipt.revision) &&
    v.receipt.revision === command.expectedRevision + 1 && Number(v.experience.revision) >= Number(v.receipt.revision) && time(v.receipt.updatedAt);
}
const errorStatus: Record<string, number> = {
  INVALID_BODY: 400, INVALID_INPUT: 400, VISIT_NOT_AUTHORIZED: 401, ORIGIN_NOT_ALLOWED: 403,
  NOT_FOUND: 404, SHOP_NOT_FOUND: 404, METHOD_NOT_ALLOWED: 405,
  VISIT_CONFLICT: 409, INTENT_CONFLICT: 409, REVISION_CONFLICT: 409, SESSION_EXPIRED: 409,
  BODY_TOO_LARGE: 413, JSON_REQUIRED: 415,
  INVALID_RENDER_PROOF: 403, RENDER_CONTEXT_MISMATCH: 403, PAGE_UNAVAILABLE: 403, TAG_UNAVAILABLE: 403, PREVIEW_UNAVAILABLE: 403, PREVIEW_EXPIRED: 403,
};

/** Same-origin browser transport. Caller supplies only a public slug, never an origin or API URL. */
export function createVisitFetchTransport(shop: string, ports: Ports, render?: RenderBinding): Pick<CoordinatorPorts, 'register' | 'rating'> & FeedbackTransport {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(shop) || ['api', 'zzz', 't', 'demo'].includes(shop.toLowerCase())) throw Error('INVALID_SHOP_SLUG');
  if (render && (typeof render.proof !== 'string' || render.proof.length > 1500 || !/^[A-Za-z0-9_.-]+$/.test(render.proof) || typeof render.preview !== 'boolean')) throw Error('INVALID_RENDER_BINDING');
  const timeoutMs = ports.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw Error('INVALID_TIMEOUT');
  const base = render ? `/api/v2/pages/visits` : `/api/v2/shops/${encodeURIComponent(shop)}/visits`;
  async function post<T>(url: string, secret: string, body: unknown, valid: (v: unknown) => v is T): Promise<TransportReply<T>> {
    const controller = new AbortController();
    let handle: unknown;
    let timerSet = false;
    try {
      const timeout = new Promise<TransportReply<T>>(resolve => {
        handle = ports.timer.set(() => { resolve(unknownReply); controller.abort(); }, timeoutMs);
        timerSet = true;
      });
      const request = async (): Promise<TransportReply<T>> => {
        try {
          const response = await ports.fetch(url, { method: 'POST', mode: 'same-origin', credentials: render?.preview ? 'same-origin' : 'omit',
            redirect: 'error', cache: 'no-store', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${secret}`, ...(render ? { 'X-NFC-Render': render.proof } : {}) },
            body: JSON.stringify(body) });
          if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return unknownReply;
          const data: unknown = await response.json();
          if (response.status === 200 && valid(data)) return { kind: 'ok', data };
          if (object(data) && typeof data.error === 'string' && Object.hasOwn(errorStatus, data.error) && errorStatus[data.error] === response.status) {
            return { kind: 'rejected', code: data.error };
          }
          return unknownReply;
        } catch { return unknownReply; }
      };
      // Race also bounds stalled JSON bodies or a fetch implementation that ignores abort.
      return await Promise.race([timeout, request()]);
    } catch { return unknownReply; }
    finally { if (timerSet) ports.timer.clear(handle); }
  }
  return {
    feedback: (secret, visitId, command) => {
      if (!uuid(visitId)) return Promise.resolve({ kind: 'rejected', code: 'INVALID_INPUT' });
      return post(`${base}/${visitId}/feedback`, secret,
        { intentId: command.intentId, expectedRevision: command.expectedRevision, topic: command.topic, message: command.message },
        (v): v is FeedbackReply => feedbackReply(v, command));
    },
    register: (secret, event) => post(base, secret, { loadKey: event.loadKey, navigationKind: event.navigationKind },
      (v): v is OpenSnapshot => openSnapshot(v) && object(v) && object(v.visit) && v.visit.navigationKind === event.navigationKind),
    rating: (secret, visitId, command) => {
      if (!uuid(visitId)) return Promise.resolve({ kind: 'rejected', code: 'INVALID_INPUT' });
      return post(`${base}/${visitId}/rating`, secret,
        { intentId: command.intentId, expectedRevision: command.expectedRevision, score: command.score }, ratingReply);
    },
  };
}
