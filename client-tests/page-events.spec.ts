import { test, expect } from '@playwright/test';
import { createEventSink, NO_EVENTS, sinceOpen } from '../lib/client/page-events';

/**
 * The event sink (lát mục 7). Its whole job is to be invisible: never awaited, never thrown, and gone before the
 * page is. These run in Node because none of that needs a browser -- the ports stand in for fetch and the events.
 */
const harness = (implementation?: typeof fetch, render?: { proof: string }) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const listeners = new Map<string, () => void>();
  const sink = createEventSink('one', '11111111-1111-4111-8111-111111111111', 'a'.repeat(64), render, {
    listen: (event, run) => listeners.set(event, run),
    fetch: implementation ?? (async (url, init) => { calls.push({ url: String(url), init: init! }); return new Response(null, { status: 204 }); }),
  });
  return { sink, calls, fire: (event: string) => listeners.get(event)?.(),
    body: (index = 0) => JSON.parse(String(calls[index].init.body)) as { events: { name: string; sinceOpenMs: number; detail?: unknown }[] } };
};

test('nothing is sent until the page goes away, and then everything is, in one call', () => {
  const h = harness();
  h.sink.send('page_opened', 0);
  h.sink.send('card_opened', 4200);
  h.sink.send('star_chosen', 6100, { score: 5 });
  // Still nothing: measurement must not cost a request per tap.
  expect(h.calls).toHaveLength(0);
  h.fire('pagehide');
  expect(h.calls).toHaveLength(1);
  expect(h.body().events).toEqual([
    { name: 'page_opened', sinceOpenMs: 0 },
    { name: 'card_opened', sinceOpenMs: 4200 },
    { name: 'star_chosen', sinceOpenMs: 6100, detail: { score: 5 } },
  ]);
  // The queue is emptied by the flush, so a second one sends nothing rather than sending it twice.
  h.fire('pagehide');
  expect(h.calls).toHaveLength(1);
});

test('the request carries the capability and survives the page, and never blocks anything', () => {
  const h = harness();
  h.sink.send('google_tapped', 0);
  h.sink.flush();
  const { init, url } = h.calls[0];
  expect(url).toBe('/api/v2/shops/one/visits/11111111-1111-4111-8111-111111111111/events');
  // A published page -- which is every real card -- uses the other path, because the per-slug routes are off
  // whenever publishing is on. Getting this wrong would 404 for every customer while every test still passed.
  const live = harness(undefined, { proof: 'signed-context-fixture' });
  live.sink.send('google_tapped', 0); live.sink.flush();
  expect(live.calls[0].url).toBe('/api/v2/pages/visits/11111111-1111-4111-8111-111111111111/events');
  // And it carries the proof, or the published path refuses it with 403 and the log stays empty.
  expect((live.calls[0].init.headers as Record<string, string>)['X-NFC-Render']).toBe('signed-context-fixture');
  // keepalive is why this arrives at all when the customer has already tapped through to Google.
  expect(init.keepalive).toBe(true);
  expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${'a'.repeat(64)}`);
  expect(init.cache).toBe('no-store');
});

test('a full batch goes early, so the server never has to refuse one for being too long', () => {
  const h = harness();
  for (let i = 0; i < 20; i++) h.sink.send('page_opened', i);
  expect(h.calls).toHaveLength(1);
  expect(h.body().events).toHaveLength(20);
});

test('a failing transport is not the page\'s problem', async () => {
  const rejects = harness(async () => { throw new Error('offline'); });
  rejects.sink.send('page_opened', 0);
  expect(() => rejects.sink.flush()).not.toThrow();
  const throws = harness((() => { throw new Error('blocked'); }) as unknown as typeof fetch);
  throws.sink.send('page_opened', 0);
  expect(() => throws.sink.flush()).not.toThrow();
  // A page with no visit yet records nothing and still answers every call.
  expect(() => { NO_EVENTS.send('page_opened', 0); NO_EVENTS.flush(); }).not.toThrow();
  const noVisit = createEventSink('one', 'not-a-visit', 'a'.repeat(64), undefined, { fetch: async () => new Response(null) });
  expect(noVisit).toBe(NO_EVENTS);
});

test('a clock that jumps cannot make the server refuse the whole batch', () => {
  // The moment is measured where the customer acted, so the clamp lives beside it rather than in the sender.
  expect(sinceOpen(1_000, 500)).toBe(0);
  expect(sinceOpen(1_000, 999_000_000)).toBe(86_400_000);
  expect(sinceOpen(1_000, 5_200)).toBe(4_200);
});
