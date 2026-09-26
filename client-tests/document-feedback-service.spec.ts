import { test, expect } from '@playwright/test';
import { createDocumentFeedbackRegistry, type FeedbackServiceConfig, type FeedbackServiceState } from '../lib/client/document-feedback-service';
import { createBrowserIdentity } from '../lib/client/browser-identity';
import { createOpenLifecycle } from '../lib/client/open-lifecycle';
const id = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const stamp = '2026-09-12T00:00:00.000Z';
const win = () => ({ document: {} }) as Window;
// The published page's proof, which every service now carries (lát A3b).
const RENDER = { proof: 'fixture.release0.signature', preview: false };
function harness() {
  let generated = 0, resolved = 0, subscriptions = 0, unsubscriptions = 0;
  const sources = new Map<Window, ReturnType<typeof createOpenLifecycle>>();
  const calls: Array<{ url: string; body: Record<string, unknown>; authorization: string | null }> = [];
  const controls = { fetch: async (_url: string, body: Record<string, unknown>): Promise<Response> => Response.json({
    visit: { id, sessionId: session, openedAt: stamp, navigationKind: body.navigationKind },
    session: { id: session, lastActivity: stamp, active: true }, experience: null,
  }) };
  const registry = createDocumentFeedbackRegistry(window => {
    resolved++;
    const uuid = () => `${String(++generated).padStart(8, '0')}-1111-4111-8111-111111111111`;
    const source = createOpenLifecycle(uuid, 'load'); sources.set(window, source);
    const identity = createBrowserIdentity({ storage: () => ({ getItem: () => 'a'.repeat(64), setItem: () => {} }), crypto: crypto });
    return { identity, uuid,
      lifecycle: { subscribe: listener => { subscriptions++; const off = source.subscribe(listener); return () => { unsubscriptions++; off(); }; } },
      fetch: async (url, init) => { const body = JSON.parse(String(init!.body));
        calls.push({ url: String(url), body, authorization: new Headers(init!.headers).get('authorization') }); return controls.fetch(String(url), body); },
      timer: { set: () => 42, clear: () => {} },
    };
  });
  return { registry, sources, calls, controls, counts: () => ({ resolved, subscriptions, unsubscriptions }) };
}

test('server import needs no window/document; repeated factory returns same instance and one initial request', async () => {
  expect(typeof window).toBe('undefined'); expect(typeof document).toBe('undefined');
  const h = harness(), w = win();
  const a = h.registry.get(w, { shop: 'Shop-A', render: RENDER }), b = h.registry.get(w, { shop: 'shop-a', render: RENDER });
  expect(a).toBe(b); expect(h.calls).toHaveLength(0);
  a.start(); b.start(); await h.registry.settledForTests(w);
  expect(h.calls).toHaveLength(1); expect(h.counts()).toEqual({ resolved: 1, subscriptions: 1, unsubscriptions: 0 });
  expect(h.calls[0].authorization).toBe(`Bearer ${'a'.repeat(64)}`);
});

test('different documents get separate service and lifecycle', async () => {
  const h = harness(), a = win(), b = win();
  const first = h.registry.get(a, { shop: 'shop', render: RENDER }), second = h.registry.get(b, { shop: 'shop', render: RENDER });
  expect(first).not.toBe(second); first.start(); second.start();
  await Promise.all([h.registry.settledForTests(a), h.registry.settledForTests(b)]);
  expect(h.calls).toHaveLength(2); expect(h.calls[0].body.loadKey).not.toBe(h.calls[1].body.loadKey);
});

test('remount unsubscribe does not stop service; resume exactly once per lifecycle boundary', async () => {
  const h = harness(), w = win(), service = h.registry.get(w, { shop: 'shop', render: RENDER });
  service.start(); await h.registry.settledForTests(w);
  const off = service.subscribe(() => {}); off(); off();
  const same = h.registry.get(w, { shop: 'shop', render: RENDER }); same.start();
  h.sources.get(w)!.hide(); h.sources.get(w)!.show(); h.sources.get(w)!.show();
  await h.registry.settledForTests(w);
  expect(h.calls.map(c => c.body.navigationKind)).toEqual(['load', 'resume']);
  expect(h.counts().subscriptions).toBe(1);
});

test('stop/start retains every resume rather than only latest event', async () => {
  const h = harness(), w = win(), service = h.registry.get(w, { shop: 'shop', render: RENDER });
  service.start(); await h.registry.settledForTests(w); service.stop(); service.stop();
  const lifecycle = h.sources.get(w)!;
  lifecycle.hide(); lifecycle.show(); lifecycle.hide(); lifecycle.show();
  expect(h.calls).toHaveLength(1); expect(service.state().queue.waiting).toHaveLength(2);
  service.start(); service.start(); await h.registry.settledForTests(w);
  expect(h.calls).toHaveLength(3); expect(new Set(h.calls.map(c => c.body.loadKey)).size).toBe(3);
});

test('open pending error is returned and observable, not silently swallowed', async () => {
  const h = harness(), w = win(); let release!: (response: Response) => void;
  h.controls.fetch = () => new Promise(resolve => { release = resolve; });
  const service = h.registry.get(w, { shop: 'shop', render: RENDER }); const observations: FeedbackServiceState[] = [];
  service.subscribe(value => { observations.push(value); }); service.start();
  await Promise.resolve(); await Promise.resolve();
  expect(await service.rate(5)).toEqual({ kind: 'error', code: 'OPEN_PENDING' });
  expect(service.state().lastAction).toEqual({ kind: 'error', code: 'OPEN_PENDING' });
  release(Response.json({ visit: { id, sessionId: session, openedAt: stamp, navigationKind: 'load' },
    session: { id: session, lastActivity: stamp, active: true }, experience: null }));
  await h.registry.settledForTests(w);
  expect(observations.some(s => s.queue.coordinator.opens.some(o => o.running))).toBe(true);
  expect(service.state().queue.coordinator.current?.snapshot?.session.id).toBe(session);
});

test('rating pending, retry and conflict pass through state without blocking lifecycle', async () => {
  const h = harness(), w = win(), service = h.registry.get(w, { shop: 'shop', render: RENDER });
  service.start(); await h.registry.settledForTests(w);
  const register = h.controls.fetch;
  h.controls.fetch = async (url, body) => url.endsWith('/rating') ? Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 }) : register(url, body);
  expect((await service.rate(5)).kind).toBe('pending');
  expect(service.state().queue.coordinator.rating.pending?.visitId).toBe(id);
  h.sources.get(w)!.hide(); h.sources.get(w)!.show(); await h.registry.settledForTests(w);
  expect(service.state().queue.coordinator.current?.event.navigationKind).toBe('resume');
  expect(service.state().queue.coordinator.notice).toBe('DESIRED_CONTEXT_CHANGED');
  h.controls.fetch = async (url, body) => url.endsWith('/rating') ? Response.json({ outcome: 'replayed',
    experience: { rating: 2, revision: 4, firstInteractionAt: stamp, updatedAt: stamp },
    receipt: { intentId: body.intentId, score: body.score, revision: 1, firstInteractionAt: stamp, updatedAt: stamp } }) : register(url, body);
  expect((await service.retry()).kind).toBe('conflict'); expect(service.state().lastAction?.kind).toBe('conflict');
});

test('config rejects URLs/context fields and refuses shop switching without constructing another service', () => {
  const h = harness(), w = win();
  for (const config of [{ shop: '//elsewhere' }, { shop: '../x' }, { shop: 'api' }, { shop: 'shop', scope: 'test' }, { shop: 'shop', base: 'https://elsewhere' }]) {
    expect(() => h.registry.get(w, config as FeedbackServiceConfig)).toThrow('INVALID_SERVICE_CONFIG');
  }
  expect(h.counts().resolved).toBe(0);
  h.registry.get(w, { shop: 'shop', render: RENDER });
  expect(() => h.registry.get(w, { shop: 'other', render: RENDER })).toThrow('DOCUMENT_CONFIG_MISMATCH');
  expect(h.counts().resolved).toBe(1);
});

test('state copies contain no secret and subscriber mutation/errors do not corrupt service', async () => {
  const h = harness(), w = win(), service = h.registry.get(w, { shop: 'shop', render: RENDER });
  let count = 0; const listener = () => { count++; };
  const off = service.subscribe(listener); service.subscribe(listener); expect(count).toBe(1); off();
  service.subscribe(() => { throw Error('observer'); }); service.start(); await h.registry.settledForTests(w);
  const state = service.state(); expect(JSON.stringify(state)).not.toContain('a'.repeat(64));
  (state as { actionsRunning: number }).actionsRunning = 999;
  expect(service.state().actionsRunning).toBe(0); expect(count).toBe(1);
});

test('test disposal detaches lifecycle; production surface exposes no destructive cleanup', async () => {
  const h = harness(), w = win(), service = h.registry.get(w, { shop: 'shop', render: RENDER });
  service.start(); await h.registry.settledForTests(w); h.registry.disposeForTests(w); h.registry.disposeForTests(w);
  h.sources.get(w)!.hide(); h.sources.get(w)!.show(); expect(h.calls).toHaveLength(1);
  expect(h.counts().unsubscriptions).toBe(1); expect('dispose' in service).toBe(false);
  expect(await service.rate(5)).toEqual({ kind: 'error', code: 'SERVICE_DISPOSED' });
});

test('retryOpen resolves only requested pending key; stopped actions return explicit error', async () => {
  const h = harness(), w = win(); const register = h.controls.fetch;
  h.controls.fetch = async () => Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
  const service = h.registry.get(w, { shop: 'shop', render: RENDER }); service.start(); await h.registry.settledForTests(w);
  const key = service.state().queue.coordinator.current!.event.loadKey;
  h.controls.fetch = register; expect((await service.retryOpen(key)).kind).toBe('ready');
  service.stop(); expect(await service.rate(3)).toEqual({ kind: 'error', code: 'QUEUE_STOPPED' });
  expect(service.state().lastAction).toEqual({ kind: 'error', code: 'QUEUE_STOPPED' });
});

test('feedback service action preserves result and exposes no submitted private content', async () => {
  const h = harness(), w = win();
  h.controls.fetch = async (_url, body) => 'message' in body ? Response.json({ outcome: 'applied',
    experience: { rating: 5, revision: 2, firstInteractionAt: stamp, updatedAt: stamp }, receipt: { intentId: body.intentId, revision: 2, updatedAt: stamp } })
    : Response.json({ visit: { id, sessionId: session, openedAt: stamp, navigationKind: body.navigationKind },
      session: { id: session, lastActivity: stamp, active: true }, experience: { rating: 5, revision: 1, firstInteractionAt: stamp, updatedAt: stamp } });
  const service = h.registry.get(w, { shop: 'shop', render: RENDER }); service.start(); await h.registry.settledForTests(w);
  const result = await service.feedback('general', 'PRIVATE_SERVICE_PAYLOAD');
  expect(result).toMatchObject({ kind: 'saved', mutation: 'feedback' });
  expect(service.state().lastAction).toEqual(result);
  expect(JSON.stringify(service.state())).not.toContain('PRIVATE_SERVICE_PAYLOAD');
  expect(h.calls[1].body.message).toBe('PRIVATE_SERVICE_PAYLOAD');
});

test('one document cannot switch release or preview binding; new document can', async () => {
  const h = harness(), w = win(), render = { proof: 'fixture.release1.signature', preview: false };
  const service = h.registry.get(w, { shop: 'shop', render });
  expect(h.registry.get(w, { shop: 'shop', render: { ...render } })).toBe(service);
  expect(() => h.registry.get(w, { shop: 'shop', render: { ...render, proof: 'fixture.release2.signature' } })).toThrow();
  expect(() => h.registry.get(w, { shop: 'shop' } as unknown as FeedbackServiceConfig)).toThrow();
  const other = h.registry.get(win(), { shop: 'shop', render: { ...render, preview: true } });
  expect(other).not.toBe(service);
  service.start(); await h.registry.settledForTests(w);
  expect(h.calls[0].url).toBe('/api/v2/pages/visits');
});
