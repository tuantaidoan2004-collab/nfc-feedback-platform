import { StrictMode, useState, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useDocumentFeedback } from '../../lib/client/use-document-feedback';
import { createDocumentFeedbackRegistry } from '../../lib/client/document-feedback-service';
import { createOpenLifecycle } from '../../lib/client/open-lifecycle';
import type { CoordinatorResult } from '../../lib/client/visit-coordinator';
let ids = 0, opens = 0, ratings = 0, stopCalls = 0, renders = 0;
const uuid = () => `${String(++ids).padStart(8, '0')}-1111-4111-8111-111111111111`;
const lifecycle = createOpenLifecycle(uuid, 'load');
const session = '22222222-2222-4222-8222-222222222222';
const visit = '33333333-3333-4333-8333-333333333333';
const time = '2026-09-12T00:00:00.000Z';
let revision = 0;
let mode = 'saved';
const registry = createDocumentFeedbackRegistry(() => ({
  identity: async () => ({ secret: 'a'.repeat(64), persistence: 'memory' }), uuid, lifecycle,
  timer: { set: (cb, ms) => window.setTimeout(cb, ms), clear: handle => window.clearTimeout(handle as number) },
  fetch: async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).endsWith('/rating')) {
      ratings++;
      if (mode === 'pending') return Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
      if (mode === 'error') return Response.json({ error: 'VISIT_NOT_AUTHORIZED' }, { status: 401 });
      if (mode === 'conflict') { revision = 4; return Response.json({ error: 'REVISION_CONFLICT' }, { status: 409 }); }
      revision = body.expectedRevision + 1;
      return Response.json({ outcome: 'applied', experience: { rating: body.score, revision, firstInteractionAt: time, updatedAt: time },
        receipt: { intentId: body.intentId, score: body.score, revision, firstInteractionAt: time, updatedAt: time } });
    }
    opens++;
    return Response.json({ visit: { id: visit, sessionId: session, openedAt: time, navigationKind: body.navigationKind },
      session: { id: session, active: true, lastActivity: time }, experience: revision ? { rating: 2, revision, firstInteractionAt: time, updatedAt: time } : null });
  },
}));
let root: Root | undefined;
let enabled = true;
let lastResult: CoordinatorResult | undefined;
let latest: ReturnType<typeof useDocumentFeedback>;
// Same facade across remounts, with real document composition behind it.
const service = registry.get(window, { shop: 'testshop' });
const facade = { ...service, stop: () => { stopCalls++; service.stop(); } };
function Boundary() {
  const [, redraw] = useState(0);
  const feedback = useDocumentFeedback(enabled ? facade : null);
  useLayoutEffect(() => { latest = feedback; renders++; });
  const current = feedback.state?.queue.coordinator;
  const status = current?.rating.result?.kind ?? (current?.current?.snapshot ? 'ready' : 'disabled');
  return <><output id="status">{status}</output><output id="last">{feedback.state?.lastAction?.kind ?? '-'}</output>
    <button onClick={() => redraw(n => n + 1)}>rerender</button></>;
}
export function mount(on = true) { enabled = on; root = createRoot(document.getElementById('root')!); root.render(<StrictMode><Boundary /></StrictMode>); }
export function unmount() { root?.unmount(); root = undefined; }
export function setMode(next: string) { mode = next; }
export async function rate(score: number) { return lastResult = await latest.rate(score); }
export async function retry() { return lastResult = await latest.retry(); }
export async function retryOpen() { return lastResult = await latest.retryOpen(lifecycle.current().loadKey); }
export function resume() { lifecycle.hide(); lifecycle.show(); }
export function counts() { return { opens, ratings, stopCalls, renders, lastResult }; }
