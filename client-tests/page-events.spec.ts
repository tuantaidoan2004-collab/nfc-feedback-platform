import { test, expect } from '@playwright/test';
import { createEventSink, NO_EVENTS } from '../lib/client/page-events';

/**
 * The event sink (lát mục 7). Its whole job is to be invisible: never awaited, never thrown, and gone before the
 * page is. These run in Node because none of that needs a browser -- the ports stand in for fetch and the events.
 */
const harness = (implementation?: typeof fetch) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const listeners = new Map<string, () => void>();
  let clock = 1000;
  const sink = createEventSink('one', '11111111-1111-4111-8111-111111111111', 'a'.repeat(64), {
    now: () => clock,
    listen: (event, run) => listeners.set(event, run),
    fetch: implementation ?? (async (url, init) => { calls.push({ url: String(url), init: init! }); return new Response(null, { status: 204 }); }),
  });
  return { sink, calls, fire: (event: string) => listeners.get(event)?.(), tick: (ms: number) => { clock += ms; },
    body: (index = 0) => JSON.parse(String(calls[index].init.body)) as { events: { name: string; sinceOpenMs: number; detail?: unknown }[] } };
};

test('nothing is sent until the page goes away, and then everything is, in one call', () => {
  const h = harness();
  h.sink.send('page_opened');
  h.tick(4200); h.sink.send('card_opened');
  h.tick(1900); h.sink.send('star_chosen', { score: 5 });
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
  h.sink.send('google_tapped');
  h.sink.flush();
  const { init, url } = h.calls[0];
  expect(url).toBe('/api/v2/shops/one/visits/11111111-1111-4111-8111-111111111111/events');
  // keepalive is why this arrives at all when the customer has already tapped through to Google.
  expect(init.keepalive).toBe(true);
  expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${'a'.repeat(64)}`);
  expect(init.cache).toBe('no-store');
});

test('a full batch goes early, so the server never has to refuse one for being too long', () => {
  const h = harness();
  for (let i = 0; i < 20; i++) h.sink.send('page_opened');
  expect(h.calls).toHaveLength(1);
  expect(h.body().events).toHaveLength(20);
});

test('a failing transport is not the page\'s problem', async () => {
  const rejects = harness(async () => { throw new Error('offline'); });
  rejects.sink.send('page_opened');
  expect(() => rejects.sink.flush()).not.toThrow();
  const throws = harness((() => { throw new Error('blocked'); }) as unknown as typeof fetch);
  throws.sink.send('page_opened');
  expect(() => throws.sink.flush()).not.toThrow();
  // A page with no visit yet records nothing and still answers every call.
  expect(() => { NO_EVENTS.send('page_opened'); NO_EVENTS.flush(); }).not.toThrow();
  const noVisit = createEventSink('one', 'not-a-visit', 'a'.repeat(64), { fetch: async () => new Response(null) });
  expect(noVisit).toBe(NO_EVENTS);
});

test('a clock that jumps cannot make the server refuse the whole batch', () => {
  const h = harness();
  h.tick(-5000); h.sink.send('page_opened');
  h.tick(999_000_000); h.sink.send('feedback_sent');
  h.sink.flush();
  expect(h.body().events.map(e => e.sinceOpenMs)).toEqual([0, 86_400_000]);
});
