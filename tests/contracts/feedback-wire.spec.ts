import { test, expect } from '@playwright/test';
import { createVisitV2Api } from '../../server/visit-v2-api';
import { normalizeFeedback } from '../../lib/domain/private-feedback';
const origin = 'https://test.example';
const id = '11111111-1111-4111-8111-111111111111';
const body = { intentId: id, expectedRevision: 1, topic: 'general', message: 'hello' };
function harness() {
  let dbCalls = 0;
  const handler = createVisitV2Api({ enabled: true, origin, pool: () => { dbCalls++; throw Error('intentional DB boundary'); } });
  return { dbCalls: () => dbCalls, call: (raw: string, operation: 'feedback' | 'rating' | 'register' = 'feedback') => handler(
    new Request(`${origin}/api/v2/shops/shop/visits/${id}/feedback`, { method: 'POST',
      headers: { origin, 'content-type': 'application/json', authorization: `Bearer ${'a'.repeat(64)}` }, body: raw }),
    { shop: 'shop', visitId: id }, operation) };
}
for (const size of [16383, 16384, 16385]) test(`feedback wire ${size} bytes boundary`, async () => {
  const h = harness(), json = JSON.stringify(body), raw = json + ' '.repeat(size - Buffer.byteLength(json));
  expect(Buffer.byteLength(raw)).toBe(size);
  const response = await h.call(raw);
  expect(response.status).toBe(size > 16384 ? 413 : 503);
  expect(h.dbCalls()).toBe(size > 16384 ? 0 : 1);
  expect(await response.json()).toEqual({ error: size > 16384 ? 'BODY_TOO_LARGE' : 'SERVICE_UNAVAILABLE' });
});
test('2000 non-BMP codepoints pass wire and domain normalization independently', async () => {
  const h = harness(), message = '😀'.repeat(2000), raw = JSON.stringify({ ...body, message });
  expect(Buffer.byteLength(raw)).toBeGreaterThan(4096);
  expect(normalizeFeedback('general', message)?.message).toBe(message);
  expect((await h.call(raw)).status).toBe(503); expect(h.dbCalls()).toBe(1);
});
for (const operation of ['rating', 'register'] as const) test(`${operation} retains4096byte wire limit`, async () => {
  const h = harness();
  const json = JSON.stringify(operation === 'rating' ? { intentId: id, expectedRevision: 0, score: 5 } : { loadKey: id, navigationKind: 'load' });
  expect((await h.call(json + ' '.repeat(4096 - Buffer.byteLength(json)), operation)).status).toBe(503);
  expect((await h.call(json + ' '.repeat(4097 - Buffer.byteLength(json)), operation)).status).toBe(413);
  expect(h.dbCalls()).toBe(1);
});

test('wire cap counts UTF8 bytes, not JavaScript string length', async () => {
  const h = harness(), raw = JSON.stringify({ ...body, message: '😀'.repeat(4096) });
  expect(raw.length).toBeLessThan(16384); expect(Buffer.byteLength(raw)).toBeGreaterThan(16384);
  expect((await h.call(raw)).status).toBe(413); expect(h.dbCalls()).toBe(0);
});
