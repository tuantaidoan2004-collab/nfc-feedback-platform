import { test, expect } from '@playwright/test';
import { createVisitFetchTransport } from '../lib/client/visit-fetch-transport';
import { createVisitCoordinator } from '../lib/client/visit-coordinator';

const id = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const secret = 'a'.repeat(64);
const event = { loadKey: id, navigationKind: 'reload' as const };
const command = { intentId: id, expectedRevision: 0, score: 5 };
const times = { firstInteractionAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T00:00:00.000Z' };
const opened = { visit: { id, sessionId, navigationKind: 'reload', openedAt: times.updatedAt },
  session: { id: sessionId, active: true, lastActivity: times.updatedAt }, experience: null };
const saved = { outcome: 'applied', experience: { rating: 5, revision: 1, ...times },
  receipt: { intentId: id, score: 5, revision: 1, ...times } };
function harness(implementation: typeof fetch = async () => Response.json(opened)) {
  let tick: (() => void) | undefined;
  let clears = 0;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const timer = { set: (callback: () => void, ms: number) => { expect(ms).toBe(100); tick = callback; return 42; },
    clear: (handle: unknown) => { expect(handle).toBe(42); clears++; } };
  const transport = createVisitFetchTransport('shop-A', { timeoutMs: 100, timer,
    fetch: async (url, init) => { requests.push({ url: String(url), init: init! }); return implementation(url, init); } });
  return { transport, requests, expire: () => tick!(), clears: () => clears };
}

test('register sends exact same-origin capability request with allowlisted body', async () => {
  const h = harness();
  expect((await h.transport.register(secret, { ...event, shopId: 'ignored' } as typeof event)).kind).toBe('ok');
  const { url, init } = h.requests[0];
  expect(url).toBe('/api/v2/shops/shop-A/visits'); expect(url).not.toContain(secret);
  expect(init).toMatchObject({ method: 'POST', mode: 'same-origin', credentials: 'omit', redirect: 'error', cache: 'no-store' });
  expect(init.headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${secret}` });
  expect(JSON.parse(String(init.body))).toEqual(event);
  expect(init.signal?.aborted).toBe(false); expect(h.clears()).toBe(1);
});

test('rating serializes only contract fields and accepts complete receipt', async () => {
  const h = harness(async () => Response.json(saved));
  expect((await h.transport.rating(secret, id, { ...command, sessionId: 'ignored' } as typeof command)).kind).toBe('ok');
  expect(h.requests[0].url).toBe(`/api/v2/shops/shop-A/visits/${id}/rating`);
  expect(JSON.parse(String(h.requests[0].init.body))).toEqual(command);
  expect(h.clears()).toBe(1);
});

for (const [status, code] of [[400, 'INVALID_INPUT'], [401, 'VISIT_NOT_AUTHORIZED'], [403, 'ORIGIN_NOT_ALLOWED'],
  [404, 'SHOP_NOT_FOUND'], [409, 'REVISION_CONFLICT'], [409, 'SESSION_EXPIRED'], [409, 'INTENT_CONFLICT'],
  [413, 'BODY_TOO_LARGE'], [415, 'JSON_REQUIRED']] as const) {
  test(`definitive API rejection ${status}/${code}`, async () => {
    const h = harness(async () => Response.json({ error: code }, { status }));
    expect(await h.transport.rating(secret, id, command)).toEqual({ kind: 'rejected', code });
    expect(h.clears()).toBe(1);
  });
}

test('network failures and unexpected abort are unknown and cleaned up', async () => {
  for (const error of [new TypeError('offline'), new DOMException('aborted', 'AbortError')]) {
    const h = harness(async () => { throw error; });
    expect(await h.transport.register(secret, event)).toEqual({ kind: 'unknown' });
    expect(h.clears()).toBe(1);
  }
});

test('invalid JSON, schema, status, media type and unrecognized errors stay unknown', async () => {
  const responses = [new Response('{', { headers: { 'content-type': 'application/json' } }),
    Response.json({}), Response.json({ ...opened, session: { ...opened.session, id } }),
    Response.json({ ...opened, visit: { ...opened.visit, navigationKind: 'load' } }),
    Response.json({ ...opened, session: { ...opened.session, lastActivity: 'bad' } }),
    new Response(JSON.stringify(opened), { headers: { 'content-type': 'text/html' } }),
    Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 }),
    Response.json({ error: 'REVISION_CONFLICT' }, { status: 500 }),
    Response.json({ error: 'NEW_ERROR' }, { status: 409 }), Response.json(opened, { status: 201 })];
  for (const response of responses) {
    const h = harness(async () => response);
    expect(await h.transport.register(secret, event)).toEqual({ kind: 'unknown' });
    expect(h.clears()).toBe(1);
  }
  const h = harness(async () => Response.json({ ...saved, receipt: { ...saved.receipt, updatedAt: null } }));
  expect(await h.transport.rating(secret, id, command)).toEqual({ kind: 'unknown' });
});

test('timeout resolves even if fetch ignores abort; late success cannot change result', async () => {
  let resolve!: (response: Response) => void;
  const h = harness(() => new Promise(done => { resolve = done; }));
  const pending = h.transport.register(secret, event);
  h.expire();
  expect(await pending).toEqual({ kind: 'unknown' });
  expect(h.requests[0].init.signal?.aborted).toBe(true); expect(h.clears()).toBe(1);
  resolve(Response.json(opened));
  await Promise.resolve();
  expect(await pending).toEqual({ kind: 'unknown' });
});

test('timeout also covers stalled response body', async () => {
  const h = harness(async () => new Response(new ReadableStream({ start() { /* deliberately pending */ } }),
    { headers: { 'content-type': 'application/json' } }));
  const pending = h.transport.register(secret, event);
  await Promise.resolve(); await Promise.resolve(); h.expire();
  expect(await pending).toEqual({ kind: 'unknown' }); expect(h.clears()).toBe(1);
});

test('coordinator retries register and rating without changing keys or secret', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls++;
    if (calls === 1 || calls === 3) throw new TypeError('lost response');
    return Response.json(calls === 2 ? opened : saved);
  });
  const coordinator = createVisitCoordinator({ ...h.transport, identity: async () => ({ secret, persistence: 'shared' }), uuid: () => id });
  expect((await coordinator.open(event)).kind).toBe('ready');
  expect((await coordinator.rate(5)).kind).toBe('saved');
  for (const [a, b] of [[0, 1], [2, 3]]) {
    expect(h.requests[a].url).toBe(h.requests[b].url);
    expect(h.requests[a].init.body).toBe(h.requests[b].init.body);
    expect(h.requests[a].init.headers).toEqual(h.requests[b].init.headers);
  }
  expect(h.clears()).toBe(4);
});

test('URL injection and invalid visit path never reach fetch', async () => {
  const ports = { fetch: fetch, timer: { set: () => 0, clear: () => {} } };
  for (const slug of ['https://evil.test', '../x', 'x?scope=test', 'x/y', 'ZZZ']) {
    expect(() => createVisitFetchTransport(slug, ports)).toThrow('INVALID_SHOP_SLUG');
  }
  expect(() => createVisitFetchTransport('shop', { ...ports, timeoutMs: 0 })).toThrow('INVALID_TIMEOUT');
  const h = harness();
  expect(await h.transport.rating(secret, '../x', command)).toEqual({ kind: 'rejected', code: 'INVALID_INPUT' });
  expect(h.requests).toHaveLength(0);
});

const feedbackCommand = { intentId: id, expectedRevision: 1, topic: 'general', message: ' e\u0301\r\n😀 ' };
const feedbackReply = { outcome: 'applied', experience: { rating: 5, revision: 2, ...times }, receipt: { intentId: id, revision: 2, updatedAt: times.updatedAt } };
test('feedback request preserves exact content/intent and uses existing secure transport options', async () => {
  const h = harness(async () => Response.json(feedbackReply));
  expect((await h.transport.feedback(secret, id, feedbackCommand)).kind).toBe('ok');
  expect(h.requests[0].url).toBe(`/api/v2/shops/shop-A/visits/${id}/feedback`);
  expect(JSON.parse(String(h.requests[0].init.body))).toEqual(feedbackCommand);
  expect(h.requests[0].init).toMatchObject({ method: 'POST', cache: 'no-store', mode: 'same-origin', credentials: 'omit', redirect: 'error' });
  expect(new Headers(h.requests[0].init.headers).get('authorization')).toBe(`Bearer ${secret}`);
  expect(h.clears()).toBe(1);
});
test('feedback accepts replay/current revision, maps RATING_REQUIRED and rejects leaked/mismatched response', async () => {
  const h = harness(async () => Response.json({ ...feedbackReply, outcome: 'replayed', experience: { ...feedbackReply.experience, revision: 4 } }));
  expect((await h.transport.feedback(secret, id, feedbackCommand)).kind).toBe('ok');
  const missing = harness(async () => Response.json({ error: 'RATING_REQUIRED' }, { status: 409 }));
  expect(await missing.transport.feedback(secret, id, feedbackCommand)).toEqual({ kind: 'rejected', code: 'RATING_REQUIRED' });
  for (const value of [{ ...feedbackReply, message: 'private' }, { ...feedbackReply, receipt: { ...feedbackReply.receipt, topic: 'private' } },
    { ...feedbackReply, experience: { ...feedbackReply.experience, feedback: 'private' } },
    { ...feedbackReply, receipt: { ...feedbackReply.receipt, intentId: 'wrong' } },
    { ...feedbackReply, receipt: { ...feedbackReply.receipt, revision: 3 } }, {}]) {
    const invalid = harness(async () => Response.json(value));
    expect(await invalid.transport.feedback(secret, id, feedbackCommand)).toEqual({ kind: 'unknown' });
  }
});
test('feedback network/parse/timeout unknown keeps exact body for caller retry', async () => {
  for (const fetcher of [async () => { throw new TypeError('offline'); }, async () => new Response('{', { headers: { 'content-type': 'application/json' } })]) {
    const h = harness(fetcher); expect(await h.transport.feedback(secret, id, feedbackCommand)).toEqual({ kind: 'unknown' }); expect(h.clears()).toBe(1);
  }
  const h = harness(() => new Promise(() => {}));
  const first = h.transport.feedback(secret, id, feedbackCommand); h.expire(); expect(await first).toEqual({ kind: 'unknown' });
  const retry = h.transport.feedback(secret, id, feedbackCommand); h.expire(); expect(await retry).toEqual({ kind: 'unknown' });
  expect(h.requests[0].init.body).toBe(h.requests[1].init.body);
  expect(h.requests[0].init.headers).toEqual(h.requests[1].init.headers); expect(h.clears()).toBe(2);
});

test('render proof is header-only; only preview carries cookies; revoked context is definitive', async () => {
  for (const preview of [false, true]) {
    const calls: { url: string; init: RequestInit }[] = [];
    const transport = createVisitFetchTransport('shop-A', {
      fetch: async (url, init) => { calls.push({ url: String(url), init: init! }); return Response.json({ error: 'TAG_UNAVAILABLE' }, { status: 403 }); },
      timer: { set: () => 1, clear: () => {} },
    }, { proof: 'fixture.payload.signature', preview });
    expect(await transport.register(secret, event)).toEqual({ kind: 'rejected', code: 'TAG_UNAVAILABLE' });
    expect(calls[0].url).toBe('/api/v2/pages/visits');
    expect(calls[0].init.credentials).toBe(preview ? 'same-origin' : 'omit');
    expect(new Headers(calls[0].init.headers).get('X-NFC-Render')).toBe('fixture.payload.signature');
    expect(JSON.parse(String(calls[0].init.body))).toEqual(event);
  }
});
