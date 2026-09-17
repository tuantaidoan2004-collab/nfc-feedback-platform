import type { FeedbackCommand, FeedbackReply } from './visit-fetch-transport';
import type { BrowserIdentity } from './browser-identity';
import type { OpenEvent } from './open-lifecycle';
/** rating is null while the session holds private feedback but no star yet. */
export type RatingSnapshot = Readonly<{ rating: number | null; revision: number }>;
export type OpenSnapshot = Readonly<{
  visit: { id: string; sessionId: string };
  session: { id: string; active: boolean };
  experience: RatingSnapshot | null;
}>;
export type RatingCommand = Readonly<{ intentId: string; expectedRevision: number; score: number }>;
export type RatingReply = Readonly<{ outcome: 'applied' | 'replayed'; experience: RatingSnapshot & { rating: number };
  receipt: { intentId: string; score: number; revision: number } }>;
/** HTTP adapter (later slice) must map network/timeout/5xx/malformed responses to unknown. */
export type TransportReply<T> = { kind: 'ok'; data: T } | { kind: 'rejected'; code: string } | { kind: 'unknown' };
export type CoordinatorPorts = {
  identity: () => Promise<BrowserIdentity>;
  uuid: () => string;
  register: (secret: string, event: OpenEvent) => Promise<TransportReply<OpenSnapshot>>;
  rating: (secret: string, visitId: string, command: RatingCommand) => Promise<TransportReply<RatingReply>>;
  feedback?: (secret: string, visitId: string, command: FeedbackCommand) => Promise<TransportReply<FeedbackReply>>;
  attempts?: number;
  pause?: (attempt: number) => Promise<void>;
};
export type CoordinatorResult =
  | { kind: 'ready'; snapshot: OpenSnapshot }
  | { kind: 'saved'; snapshot: OpenSnapshot; reply: RatingReply; mutation?: 'rating' }
  | { kind: 'saved'; snapshot: OpenSnapshot; reply: FeedbackReply; mutation: 'feedback' }
  | { kind: 'conflict'; snapshot: OpenSnapshot }
  | { kind: 'pending'; operation: 'open' | 'rating' | 'feedback' }
  | { kind: 'error'; code: string }
  | { kind: 'busy' };
type Entry = { event: OpenEvent; snapshot?: OpenSnapshot; result?: CoordinatorResult; flight?: Promise<CoordinatorResult> };
type Target = { loadKey: string; sessionId: string };
type Desired = Target & ({ kind: 'rating'; score: number } | { kind: 'feedback'; topic: string; message: string });
type MutationWork = { secret: string; entry: Entry; snapshot: OpenSnapshot; phase: 'rating' | 'feedback' | 'refresh' } &
  ({ kind: 'rating'; command: RatingCommand } | { kind: 'feedback'; command: FeedbackCommand });
const validScore = (score: unknown) => Number.isInteger(score) && Number(score) >= 1 && Number(score) <= 5;
const validRating = (r: RatingSnapshot) => r && (r.rating === null || validScore(r.rating)) && Number.isSafeInteger(r.revision) && r.revision > 0;
const validOpen = (s: OpenSnapshot) => s && typeof s.visit?.id === 'string' && !!s.visit.id &&
  typeof s.session?.id === 'string' && !!s.session.id && s.visit.sessionId === s.session.id &&
  typeof s.session.active === 'boolean' && (s.experience === null || validRating(s.experience));

/** Two lanes share one owner. Local event order selects UI context, never the server session. */
export function createVisitCoordinator(ports: CoordinatorPorts) {
  const attempts = ports.attempts ?? 2;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) throw Error('INVALID_RETRY_BUDGET');
  const entries = new Map<string, Entry>();
  const experiences = new Map<string, RatingSnapshot>();
  let identity: Promise<BrowserIdentity> | undefined;
  let head: Entry | undefined;
  let pending: MutationWork | undefined;
  let buffered: Desired[] = [];
  let starting: Desired | undefined;
  let mutationFlight: Promise<CoordinatorResult> | undefined;
  let preparing = false;
  let lastMutation: CoordinatorResult | null = null;
  let notice: string | null = null;
  const token = () => (identity ??= ports.identity());
  const error = (code: string): CoordinatorResult => ({ kind: 'error', code });
  const wait = (): CoordinatorResult => ({ kind: 'pending', operation: pending?.phase === 'refresh' ? 'open' : pending?.kind ?? starting?.kind ?? 'rating' });
  function remember(snapshot: OpenSnapshot): OpenSnapshot {
    const id = snapshot.session.id, old = experiences.get(id), incoming = snapshot.experience;
    if (incoming && (!old || incoming.revision > old.revision)) experiences.set(id, { rating: incoming.rating, revision: incoming.revision });
    return structuredClone({ visit: { id: snapshot.visit.id, sessionId: snapshot.visit.sessionId },
      session: { id: snapshot.session.id, active: snapshot.session.active }, experience: experiences.get(id) ?? null });
  }
  const current = () => head?.snapshot ? remember(head.snapshot) : undefined;
  function sameTarget(target: Target): boolean {
    return head?.event.loadKey === target.loadKey && head.snapshot?.session.id === target.sessionId;
  }
  async function exchange<T>(call: () => Promise<TransportReply<T>>, valid: (data: T) => boolean): Promise<TransportReply<T>> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try { const reply = await call(); if (reply.kind === 'rejected' || (reply.kind === 'ok' && valid(reply.data))) return reply; } catch { /* Unknown, never assume rollback. */ }
      if (attempt < attempts) { try { await ports.pause?.(attempt); } catch { break; } }
    }
    return { kind: 'unknown' };
  }
  function register(entry: Entry, refresh = false): Promise<CoordinatorResult> {
    if (entry.flight) return entry.flight;
    if (!refresh && entry.result && entry.result.kind !== 'pending') return Promise.resolve(structuredClone(entry.result));
    entry.flight = Promise.resolve().then(async (): Promise<CoordinatorResult> => {
      try {
        const secret = (await token()).secret;
        const reply = await exchange(() => ports.register(secret, entry.event), validOpen);
        if (reply.kind === 'unknown') return { kind: 'pending', operation: 'open' };
        if (reply.kind === 'rejected') return error(reply.code);
        entry.snapshot = remember(reply.data);
        return { kind: 'ready', snapshot: structuredClone(entry.snapshot) };
      } catch { return error('CLIENT_UNAVAILABLE'); }
    }).then(result => { entry.result = result; return structuredClone(result); }).finally(() => { entry.flight = undefined; });
    return entry.flight;
  }
  function open(event: OpenEvent): Promise<CoordinatorResult> {
    let entry = entries.get(event.loadKey);
    if (entry) return entry.event.navigationKind === event.navigationKind
      ? (entry.flight ?? Promise.resolve(structuredClone(entry.result ?? { kind: 'pending', operation: 'open' })))
      : Promise.resolve(error('OPEN_KEY_CONFLICT'));
    entry = { event: Object.freeze({ ...event }) };
    entries.set(event.loadKey, entry); head = entry;
    if (buffered.length || pending || starting) { buffered = []; notice = 'DESIRED_CONTEXT_CHANGED'; }
    return register(entry);
  }
  async function makeMutation(target: Desired): Promise<void> {
    const snapshot = current();
    if (!snapshot || !sameTarget(target)) throw Error('CONTEXT_CHANGED');
    const secret = (await token()).secret;
    if (!sameTarget(target)) throw Error('CONTEXT_CHANGED');
    const base = { secret, entry: head!, snapshot };
    const intent = { intentId: ports.uuid(), expectedRevision: snapshot.experience?.revision ?? 0 };
    pending = target.kind === 'rating'
      ? { ...base, kind: 'rating', phase: 'rating', command: Object.freeze({ ...intent, score: target.score }) }
      : { ...base, kind: 'feedback', phase: 'feedback', command: Object.freeze({ ...intent, topic: target.topic, message: target.message }) };
  }
  function reconcile(request: MutationWork) {
    if (buffered.length) notice = 'BUFFERED_MUTATIONS_DISCARDED';
    buffered = [];
    if (request.kind === 'feedback') request.command = Object.freeze({ intentId: request.command.intentId,
      expectedRevision: request.command.expectedRevision, topic: '', message: '' });
    request.phase = 'refresh';
  }
  async function drive(): Promise<CoordinatorResult> {
    while (pending) {
      const request = pending;
      if (request.phase === 'refresh') {
        const refreshed = await register(request.entry, true);
        if (refreshed.kind === 'pending') return wait();
        pending = undefined;
        return refreshed.kind === 'ready' ? { kind: 'conflict', snapshot: refreshed.snapshot } : refreshed;
      }
      const reply = request.kind === 'rating'
        ? await exchange(() => ports.rating(request.secret, request.snapshot.visit.id, request.command), data =>
          data && ['applied', 'replayed'].includes(data.outcome) && validRating(data.experience) && validScore(data.experience.rating) &&
          data.receipt?.intentId === request.command.intentId && data.receipt.score === request.command.score &&
          data.receipt.revision === request.command.expectedRevision + 1 && data.experience.revision >= data.receipt.revision &&
          (data.experience.revision !== data.receipt.revision || data.experience.rating === data.receipt.score))
        : await exchange(() => ports.feedback!(request.secret, request.snapshot.visit.id, request.command), data =>
          data && ['applied', 'replayed'].includes(data.outcome) && validRating(data.experience) &&
          data.receipt?.intentId === request.command.intentId && data.receipt.revision === request.command.expectedRevision + 1 &&
          data.experience.revision >= data.receipt.revision && Number.isFinite(Date.parse(data.receipt.updatedAt)));
      if (reply.kind === 'unknown') return wait();
      if (reply.kind === 'rejected') {
        if (buffered.length) notice = 'BUFFERED_MUTATIONS_DISCARDED';
        buffered = [];
        if (reply.code === 'REVISION_CONFLICT') { reconcile(request); continue; }
        pending = undefined;
        if (reply.code === 'SESSION_EXPIRED' && request.entry.snapshot) {
          request.entry.snapshot = { ...request.entry.snapshot, session: { ...request.entry.snapshot.session, active: false } };
        }
        return error(reply.code); // No recovery intent may migrate to a new session.
      }
      const snapshot = remember({ ...(request.entry.snapshot ?? request.snapshot), experience: reply.data.experience });
      request.entry.snapshot = snapshot;
      if (snapshot.experience!.revision > reply.data.receipt.revision) {
        reconcile(request); continue;
      }
      pending = undefined; // Drop immutable private command after a definitive success.
      let next = buffered.shift();
      while (next && (!sameTarget(next) || (next.kind === 'rating' && next.score === snapshot.experience!.rating))) next = buffered.shift();
      if (next) { await makeMutation(next); continue; }
      if (request.kind === 'feedback') {
        const data = reply.data as FeedbackReply;
        return { kind: 'saved', mutation: 'feedback', snapshot, reply: {
          outcome: data.outcome, experience: { rating: data.experience.rating, revision: data.experience.revision,
            firstInteractionAt: data.experience.firstInteractionAt, updatedAt: data.experience.updatedAt },
          receipt: { intentId: data.receipt.intentId, revision: data.receipt.revision, updatedAt: data.receipt.updatedAt },
        } };
      }
      return { kind: 'saved', snapshot, reply: structuredClone(reply.data as RatingReply) };

    }
    return lastMutation ?? error('NOTHING_TO_SEND');
  }
  function runMutation(start?: Desired): Promise<CoordinatorResult> {
    if (mutationFlight) return mutationFlight;
    starting = start;
    mutationFlight = Promise.resolve().then(async () => {
      try { if (start) { await makeMutation(start); start = undefined; } starting = undefined; return await drive(); }
      catch { return pending ? wait() : error('CLIENT_CONTEXT_UNAVAILABLE'); }
      finally { starting = undefined; }
    }).then(result => { lastMutation = result; return structuredClone(result); }).finally(() => { mutationFlight = undefined; });
    return mutationFlight;
  }
  function buffer(action: Desired): CoordinatorResult {
    const original = pending ? { loadKey: pending.entry.event.loadKey, sessionId: pending.snapshot.session.id } : starting;
    if (!original || original.loadKey !== action.loadKey || original.sessionId !== action.sessionId) return error('RATING_RECOVERY_REQUIRED');
    if (pending?.phase === 'refresh') return error('REVISION_RECONCILIATION_REQUIRED');
    // Latest explicit submission of each kind; replacement moves to its last submission order.
    buffered = buffered.filter(value => value.kind !== action.kind);
    buffered.push(action);
    return wait();
  }
  function feedback(topic: string, message: string): Promise<CoordinatorResult> {
    if (typeof topic !== 'string' || typeof message !== 'string') return Promise.resolve(error('INVALID_INPUT'));
    if (!ports.feedback) return Promise.resolve(error('FEEDBACK_UNAVAILABLE'));
    const snapshot = current();
    if (preparing || !snapshot || !head) return Promise.resolve(error(head ? 'OPEN_PENDING' : 'OPEN_REQUIRED'));
    const action: Desired = { kind: 'feedback', topic, message, loadKey: head.event.loadKey, sessionId: snapshot.session.id };
    if (pending || mutationFlight) return Promise.resolve(buffer(action));
    if (!snapshot.session.active) return Promise.resolve(error('SESSION_EXPIRED'));
    notice = null;
    return runMutation(action);
  }
  async function rate(score: number): Promise<CoordinatorResult> {
    if (!Number.isInteger(score) || score < 1 || score > 5) return error('INVALID_SCORE');
    if (preparing) return error('OPEN_PENDING');
    let snapshot = current();
    if (!snapshot || !head) return error(head ? 'OPEN_PENDING' : 'OPEN_REQUIRED');
    if (pending || mutationFlight) return buffer({ kind: 'rating', score, loadKey: head.event.loadKey, sessionId: snapshot.session.id });
    if (!snapshot.session.active) {
      // Only this NEW user action can create resume. Retry never enters this branch.
      preparing = true;
      try {
        const event: OpenEvent = { loadKey: ports.uuid(), navigationKind: 'resume' };
        const opened = await open(event);
        if (opened.kind !== 'ready') return opened;
        if (head?.event.loadKey !== event.loadKey) return error('DESIRED_CONTEXT_CHANGED');
        snapshot = current()!;
        if (!snapshot.session.active) return error('SESSION_EXPIRED');
      } catch { return error('CLIENT_UNAVAILABLE'); }
      finally { preparing = false; }
    }
    notice = null;
    return runMutation({ kind: 'rating', score, loadKey: head.event.loadKey, sessionId: snapshot.session.id });
  }
  const mutationState = () => ({ running: !!mutationFlight, result: lastMutation, pending: pending ? {
        loadKey: pending.entry.event.loadKey, visitId: pending.snapshot.visit.id, sessionId: pending.snapshot.session.id,
        intentId: pending.command.intentId, phase: pending.phase, kind: pending.kind,
      } : null, desired: buffered.find(a => a.kind === 'rating') ?? null,
        buffered: buffered.map(a => a.kind === 'rating' ? { kind: a.kind, score: a.score, loadKey: a.loadKey, sessionId: a.sessionId }
          : { kind: a.kind, loadKey: a.loadKey, sessionId: a.sessionId }) });
  return {
    open, rate, feedback,
    retry: () => runMutation(),
    retryOpen: (loadKey: string) => {
      const entry = entries.get(loadKey);
      return entry ? register(entry) : Promise.resolve(error('OPEN_REQUIRED'));
    },
    state: () => structuredClone({ current: head ? { event: head.event, snapshot: current() ?? null } : null,
      opens: [...entries.values()].map(e => ({ event: e.event, running: !!e.flight, result: e.result ?? null })),
      rating: mutationState(), mutation: mutationState(), notice }),
  };
}
