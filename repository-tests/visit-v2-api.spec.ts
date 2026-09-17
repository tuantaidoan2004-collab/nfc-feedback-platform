import { test as base, expect } from '@playwright/test';
import { Pool } from 'pg';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { VisitRatingRepository } from '../lib/repositories/visit-ratings';
import { createVisitV2Api } from '../server/visit-v2-api';

const connectionString = process.env.NFC_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set NFC_TEST_DATABASE_URL to disposable local nfc_repo_test');
const url = new URL(connectionString);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/nfc_repo_test' || url.search) {
  throw new Error('API tests require local nfc_repo_test without overrides');
}
const origin = 'http://127.0.0.1:3000';
const secret = () => randomBytes(32).toString('hex');
const command = () => ({ intentId: randomUUID(), expectedRevision: 0, score: 5 });
function request(token: string, body: unknown, headers?: Record<string, string>, query = '') {
  return new Request(`${origin}/api/v2/shops/one/visits${query}`, { method: 'POST',
    headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body && typeof body === 'object' && 'loadKey' in body ? { navigationKind: 'load', ...body } : body),
  });
}
type Fixture = { pool: Pool; api: ReturnType<typeof createVisitV2Api>; shopId: string };
const test = base.extend<{ db: Fixture }>({
  db: async ({}, provideFixture) => {
    const schema = `nfc_api_test_${randomUUID().replaceAll('-', '')}`;
    const admin = new Pool({ connectionString });
    const pool = new Pool({ connectionString, options: `-c search_path=${schema}`, max: 8 });
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
      await pool.query(await readFile('db/migrations/001_core.sql', 'utf8'));
      await pool.query(await readFile('db/migrations/002_visit_ratings.sql', 'utf8'));
      await pool.query(await readFile('db/migrations/010_feedback_without_rating.sql', 'utf8'));
      const shopId = randomUUID();
      await pool.query(`INSERT INTO shops(id,slug,name) VALUES($1,'one','PRIVATE_SHOP_NAME'),($2,'two','Two')`, [shopId, randomUUID()]);
      await pool.query(`INSERT INTO experiences(shop_id,token_hash,note,message)
        VALUES($1,'private-legacy-hash','PRIVATE_OWNER_NOTE','PRIVATE_FEEDBACK')`, [shopId]);
      await provideFixture({ pool, shopId, api: createVisitV2Api({ enabled: true, origin, pool: () => pool }) });
    } finally {
      await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
    }
  },
});
async function register(db: Fixture, token: string, loadKey = randomUUID()) {
  const reply = await db.api(request(token, { loadKey }), { shop: 'one' }, 'register');
  expect(reply.status).toBe(200);
  return (await reply.json()).visit as { id: string; openedAt: string };
}
async function expectError(reply: Response, status: number, error: string) {
  expect(reply.status).toBe(status);
  expect(reply.headers.get('cache-control')).toContain('no-store');
  expect(reply.headers.get('set-cookie')).toBeNull();
  expect(await reply.json()).toEqual({ error });
}

test('lost register response retries same visit/time, stores only hash and never creates experience', async ({ db }) => {
  const token = secret(), loadKey = randomUUID(), before = Date.now();
  const lost = await register(db, token, loadKey); // Client discards this response.
  const recovered = await register(db, token, loadKey);
  expect(recovered).toEqual(lost);
  expect(Date.parse(recovered.openedAt)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(recovered.openedAt)).toBeLessThanOrEqual(Date.now());
  const visits = (await db.pool.query('SELECT * FROM visit_sessions')).rows;
  expect(visits).toHaveLength(1);
  expect(visits[0].browser_hash).toBe(createHash('sha256').update(`nfc-browser-v1\0${db.shopId}\0live\0direct:shop\0${token}`).digest('hex'));
  expect(JSON.stringify(visits)).not.toContain(token);
  expect((await db.pool.query('SELECT count(*)::int AS n FROM rating_experiences')).rows[0].n).toBe(0);
});

test('load key cannot replace a capability, including concurrent registration', async ({ db }) => {
  const loadKey = randomUUID(), a = secret(), b = secret();
  const replies = await Promise.all([a, b].map(token => db.api(request(token, { loadKey }), { shop: 'one' }, 'register')));
  expect(replies.map(r => r.status).sort()).toEqual([200, 409]);
  const winner = replies.findIndex(r => r.status === 200), loser = 1 - winner;
  const first = (await replies[winner].json()).visit;
  await expectError(replies[loser], 409, 'VISIT_CONFLICT');
  expect(await register(db, [a, b][winner], loadKey)).toEqual(first);
  const stored = await db.pool.query('SELECT count(*)::int AS n FROM page_visits');
  expect(stored.rows[0].n).toBe(1);
});

test('different browser secrets cannot rate or replay each other', async ({ db }) => {
  const a = secret(), b = secret(), one = await register(db, a), two = await register(db, b);
  expect(one.id).not.toBe(two.id);
  for (const [token, visitId] of [[a, two.id], [b, one.id], [secret(), one.id]]) {
    await expectError(await db.api(request(token, command()), { shop: 'one', visitId }, 'rating'), 401, 'VISIT_NOT_AUTHORIZED');
  }
  const intent = command();
  const accepted = await db.api(request(a, intent), { shop: 'one', visitId: one.id }, 'rating');
  expect(accepted.status).toBe(200);
  await expectError(await db.api(request(b, intent), { shop: 'one', visitId: one.id }, 'rating'), 401, 'VISIT_NOT_AUTHORIZED');
  expect((await db.pool.query('SELECT count(*)::int AS n FROM rating_experiences')).rows[0].n).toBe(1);
});

test('same browser concurrent tabs/reload/resume share one rating session and return current revision', async ({ db }) => {
  const token = secret();
  const replies = await Promise.all(['load','reload','back_forward','resume'].map(navigationKind =>
    db.api(request(token,{loadKey:randomUUID(),navigationKind}),{shop:'one'},'register')));
  const bodies = await Promise.all(replies.map(r=>r.json()));
  expect(new Set(bodies.map(b=>b.visit.id)).size).toBe(4);
  expect(new Set(bodies.map(b=>b.session.id)).size).toBe(1);
  const rated = await db.api(request(token,command()),{shop:'one',visitId:bodies[0].visit.id},'rating');
  expect(rated.status).toBe(200);
  const opened = await (await db.api(request(token,{loadKey:randomUUID(),navigationKind:'resume'}),{shop:'one'},'register')).json();
  expect(opened.experience).toMatchObject({rating:5,revision:1});
  expect(opened.session.active).toBe(true);
  const edited = await db.api(request(token,{...command(),score:2,expectedRevision:1}),{shop:'one',visitId:opened.visit.id},'rating');
  expect(edited.status).toBe(200);
  expect((await db.pool.query('SELECT rating,revision::int FROM rating_experiences')).rows).toEqual([{rating:2,revision:2}]);
});

test('expired API session rejects fresh rating; resume creates a new session without fabricating a rating', async ({ db }) => {
  const token = secret(), loadKey = randomUUID();
  const first = await register(db,token,loadKey);
  await db.pool.query("UPDATE visit_sessions SET started_at=clock_timestamp()-interval '16 minutes',last_activity=clock_timestamp()-interval '16 minutes'");
  await expectError(await db.api(request(token,command()),{shop:'one',visitId:first.id},'rating'),409,'SESSION_EXPIRED');
  const retry = await (await db.api(request(token,{loadKey}),{shop:'one'},'register')).json();
  expect(retry.visit.id).toBe(first.id); expect(retry.session.active).toBe(false);
  const resumed = await (await db.api(request(token,{loadKey:randomUUID(),navigationKind:'resume'}),{shop:'one'},'register')).json();
  expect(resumed.session.id).not.toBe(retry.session.id); expect(resumed.experience).toBeNull();
});

test('capability does not override server shop or live scope', async ({ db }) => {
  const token = secret(), visit = await register(db, token);
  await expectError(await db.api(request(token, command()), { shop: 'two', visitId: visit.id }, 'rating'), 401, 'VISIT_NOT_AUTHORIZED');
  const testVisit = await new VisitRatingRepository(db.pool).registerVisit(
    { shopId: db.shopId, scope: 'test', entryKey: 'direct:shop' }, randomUUID(), 'load',
    createHash('sha256').update(`nfc-browser-v1\0${db.shopId}\0live\0direct:shop\0${token}`).digest('hex'));
  await expectError(await db.api(request(token, command()), { shop: 'one', visitId: testVisit.visit.visitId }, 'rating'), 401, 'VISIT_NOT_AUTHORIZED');
  expect((await db.pool.query('SELECT count(*)::int AS n FROM rating_experiences')).rows[0].n).toBe(0);
});

test('rating reply/replay is explicit; stale revisions and changed intent payload conflict', async ({ db }) => {
  const token = secret(), visit = await register(db, token), context = { shop: 'one', visitId: visit.id }, first = command();
  const applied = await db.api(request(token, first), context, 'rating');
  expect(applied.headers.get('cache-control')).toContain('no-store');
  expect(applied.headers.get('set-cookie')).toBeNull();
  const original = await applied.json();
  expect(original.outcome).toBe('applied');
  expect(original.experience).toMatchObject({ rating: 5, revision: 1 });
  const edited = await db.api(request(token, { ...command(), expectedRevision: 1, score: 2 }), context, 'rating');
  expect(edited.status).toBe(200);
  const replay = await (await db.api(request(token, first), context, 'rating')).json();
  expect(replay.outcome).toBe('replayed');
  expect(replay.receipt).toEqual(original.receipt);
  expect(replay.experience).toMatchObject({ rating: 2, revision: 2 });
  await expectError(await db.api(request(token, command()), context, 'rating'), 409, 'REVISION_CONFLICT');
  await expectError(await db.api(request(token, { ...first, score: 1 }), context, 'rating'), 409, 'INTENT_CONFLICT');
  await expectError(await db.api(request(token, { ...first, expectedRevision: 2 }), context, 'rating'), 409, 'INTENT_CONFLICT');
  expect(Object.keys(replay).sort()).toEqual(['experience', 'outcome', 'receipt']);
  expect(Object.keys(replay.experience).sort()).toEqual(['firstInteractionAt', 'rating', 'revision', 'updatedAt']);
  for (const forbidden of [token, 'capability_hash', 'PRIVATE_OWNER_NOTE', 'PRIVATE_FEEDBACK', 'PRIVATE_SHOP_NAME']) {
    expect(JSON.stringify(replay)).not.toContain(forbidden);
  }
});

test('concurrent API retries authorize the same visit and return one applied receipt', async ({ db }) => {
  const token = secret(), visit = await register(db, token), intent = command();
  const results = await Promise.all(Array.from({ length: 6 }, async () => {
    const reply = await db.api(request(token, intent), { shop: 'one', visitId: visit.id }, 'rating');
    expect(reply.status).toBe(200);
    return reply.json();
  }));
  expect(results.filter(r => r.outcome === 'applied')).toHaveLength(1);
  expect(results.filter(r => r.outcome === 'replayed')).toHaveLength(5);
  for (const result of results) expect(result.receipt).toEqual(results[0].receipt);
  expect((await db.pool.query('SELECT count(*)::int AS n FROM rating_intent_receipts')).rows[0].n).toBe(1);
});

test('extra fields including scope and client time are rejected on both routes', async ({ db }) => {
  const token = secret(), visit = await register(db, token);
  for (const field of ['scope', 'shopId', 'visitId', 'sessionId', 'entryKey', 'tagId', 'openedAt', 'receivedAt', 'token', 'note']) {
    await expectError(await db.api(request(token, { loadKey: randomUUID(), [field]: 'test' }), { shop: 'one' }, 'register'), 400, 'INVALID_INPUT');
    await expectError(await db.api(request(token, { ...command(), [field]: 'test' }), { shop: 'one', visitId: visit.id }, 'rating'), 400, 'INVALID_INPUT');
  }
  expect((await db.pool.query('SELECT count(*)::int AS n FROM page_visits')).rows[0].n).toBe(1);
});

test('origin must match configuration and browser fetch metadata cannot be cross-site', async ({ db }) => {
  const token = secret();
  const variants: Record<string, string>[] = [{ origin: 'https://evil.test' }, { origin: 'null' }, { origin: '' },
    { origin, 'sec-fetch-site': 'cross-site' }, { origin, 'sec-fetch-site': 'same-site' }];
  for (const headers of variants) {
    await expectError(await db.api(request(token, { loadKey: randomUUID() }, headers), { shop: 'one' }, 'register'), 403, 'ORIGIN_NOT_ALLOWED');
  }
  expect((await db.pool.query('SELECT count(*)::int AS n FROM page_visits')).rows[0].n).toBe(0);
});

test('token shape, UUID keys, score and revision are strictly validated', async ({ db }) => {
  for (const token of ['', 'abc', secret().slice(1), secret().toUpperCase()]) {
    await expectError(await db.api(request(token, { loadKey: randomUUID() }), { shop: 'one' }, 'register'), 401, 'VISIT_NOT_AUTHORIZED');
  }
  const token = secret(), visit = await register(db, token);
  for (const navigationKind of ['invalid', ['reload'], null, 1]) {
    await expectError(await db.api(request(token, { loadKey: randomUUID(), navigationKind }), {shop:'one'}, 'register'),400,'INVALID_INPUT');
  }
  for (const loadKey of ['', 1, 'not-a-uuid']) {
    await expectError(await db.api(request(token, { loadKey }), { shop: 'one' }, 'register'), 400, 'INVALID_INPUT');
  }
  for (const patch of [{ score: 0 }, { score: 6 }, { score: 2.5 }, { score: '5' }, { expectedRevision: -1 },
    { expectedRevision: Number.MAX_SAFE_INTEGER }, { expectedRevision: '0' }, { intentId: '' }]) {
    await expectError(await db.api(request(token, { ...command(), ...patch }), { shop: 'one', visitId: visit.id }, 'rating'), 400, 'INVALID_INPUT');
  }
});

test('body bounds, JSON type, query params, and missing shop fail closed', async ({ db }) => {
  const token = secret();
  await expectError(await db.api(request(token, { loadKey: 'x'.repeat(5000) }), { shop: 'one' }, 'register'), 413, 'BODY_TOO_LARGE');
  await expectError(await db.api(request(token, {}, { 'content-type': 'text/plain' }), { shop: 'one' }, 'register'), 415, 'JSON_REQUIRED');
  await expectError(await db.api(request(token, []), { shop: 'one' }, 'register'), 400, 'INVALID_BODY');
  await expectError(await db.api(request(token, { loadKey: randomUUID() }, {}, '?scope=test'), { shop: 'one' }, 'register'), 400, 'INVALID_INPUT');
  await expectError(await db.api(request(token, { loadKey: randomUUID() }), { shop: 'missing' }, 'register'), 404, 'SHOP_NOT_FOUND');
});

test('disabled configuration never touches database and infrastructure errors reveal nothing', async ({ db }) => {
  const noDatabase = () => { throw new Error('PRIVATE_CREDENTIAL_DETAIL'); };
  const disabled = createVisitV2Api({ enabled: false, origin, pool: noDatabase });
  await expectError(await disabled(request(secret(), { loadKey: randomUUID() }), { shop: 'one' }, 'register'), 404, 'NOT_FOUND');
  const unavailable = createVisitV2Api({ enabled: true, origin, pool: noDatabase });
  await expectError(await unavailable(request(secret(), { loadKey: randomUUID() }), { shop: 'one' }, 'register'), 503, 'SERVICE_UNAVAILABLE');
  const badConfig = createVisitV2Api({ enabled: true, origin: `${origin}/`, pool: () => db.pool });
  await expectError(await badConfig(request(secret(), { loadKey: randomUUID() }), { shop: 'one' }, 'register'), 503, 'SERVICE_UNAVAILABLE');
});

test('feedback before any star is saved with no rating, and a later star keeps its revision chain', async ({ db }) => {
  const token = secret(), visit = await register(db, token), context = { shop: 'one', visitId: visit.id };
  const body = { ...feedbackBody(), expectedRevision: 0 };
  const saved = await db.api(request(token, body), context, 'feedback');
  expect(saved.status).toBe(200);
  const initial = await saved.json();
  expect(initial).toMatchObject({ outcome: 'applied', experience: { rating: null, revision: 1 }, receipt: { intentId: body.intentId, revision: 1 } });
  const reopened = await (await db.api(request(token, { loadKey: randomUUID() }), { shop: 'one' }, 'register')).json();
  expect(reopened.experience).toMatchObject({ rating: null, revision: 1 });
  const rated = await db.api(request(token, { ...command(), expectedRevision: 1, score: 1 }), context, 'rating');
  expect(await rated.json()).toMatchObject({ outcome: 'applied', experience: { rating: 1, revision: 2 }, receipt: { score: 1, revision: 2 } });
  for (const value of [initial, reopened]) {
    for (const forbidden of ['message', 'topic', body.message, token]) expect(JSON.stringify(value)).not.toContain(forbidden);
  }
});
const feedbackBody = () => ({ intentId: randomUUID(), expectedRevision: 1, topic: 'general', message: 'PRIVATE_CONTENT_é' });
test('feedback save/replay/interleaved rating share revision and never echo content', async ({ db }) => {
  const token = secret(), visit = await register(db, token), context = { shop: 'one', visitId: visit.id };
  const body = feedbackBody();
  await expectError(await db.api(request(token, body), context, 'feedback'), 409, 'REVISION_CONFLICT');
  await db.api(request(token, command()), context, 'rating');
  const saved = await db.api(request(token, body), context, 'feedback');
  expect(saved.status).toBe(200); expect(saved.headers.get('cache-control')).toContain('no-store');
  const initial = await saved.json(); expect(initial).toMatchObject({ outcome: 'applied', experience: { revision: 2 }, receipt: { intentId: body.intentId, revision: 2 } });
  const rating = { ...command(), expectedRevision: 2, score: 2 };
  const edited = await db.api(request(token, rating), context, 'rating');
  const replay = await db.api(request(token, body), context, 'feedback');
  const current = await replay.json(); expect(current).toMatchObject({ outcome: 'replayed', experience: { rating: 2, revision: 3 }, receipt: initial.receipt });
  const opened = await db.api(request(token, { loadKey: randomUUID() }), { shop: 'one' }, 'register');
  for (const value of [initial, current, await edited.json(), await opened.json()]) {
    for (const forbidden of ['message', 'topic', body.message, token]) expect(JSON.stringify(value)).not.toContain(forbidden);
  }
  await expectError(await db.api(request(token, { ...body, message: 'changed' }), context, 'feedback'), 409, 'INTENT_CONFLICT');
  await expectError(await db.api(request(token, { ...body, intentId: randomUUID() }), context, 'feedback'), 409, 'REVISION_CONFLICT');
  await db.pool.query("UPDATE visit_sessions SET last_activity=clock_timestamp()-interval '16 minutes',started_at=clock_timestamp()-interval '17 minutes'");
  await expectError(await db.api(request(token, { ...feedbackBody(), expectedRevision: 3 }), context, 'feedback'), 409, 'SESSION_EXPIRED');
  expect((await db.api(request(token, body), context, 'feedback')).status).toBe(200);
});
test('feedback capability/context, malformed/body/origin validation and disabled gate', async ({ db }) => {
  const token = secret(), visit = await register(db, token), context = { shop: 'one', visitId: visit.id }, body = feedbackBody();
  for (const c of [{ ...context, shop: 'two' }, { ...context, visitId: randomUUID() }]) await expectError(await db.api(request(token, body), c, 'feedback'), 401, 'VISIT_NOT_AUTHORIZED');
  await expectError(await db.api(request(secret(), body), context, 'feedback'), 401, 'VISIT_NOT_AUTHORIZED');
  await expectError(await db.api(request(token, body, { origin: 'https://other.test' }), context, 'feedback'), 403, 'ORIGIN_NOT_ALLOWED');
  await expectError(await db.api(request(token, { ...body, message: 'a'.repeat(17000) }), context, 'feedback'), 413, 'BODY_TOO_LARGE');
  for (const patch of [{ scope: 'test' }, { topic: '../x' }, { message: '' }, { message: '\uD800' }, { expectedRevision: -1 }]) {
    await expectError(await db.api(request(token, { ...body, ...patch }), context, 'feedback'), 400, 'INVALID_INPUT');
  }
  const malformed = new Request(`${origin}/api/v2/shops/one/visits/${visit.id}/feedback`, {
    method: 'POST', headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{',
  });
  await expectError(await db.api(malformed, context, 'feedback'), 400, 'INVALID_BODY');
  await expectError(await db.api(request(token, body, { 'content-type': 'text/plain' }), context, 'feedback'), 415, 'JSON_REQUIRED');
  const unavailable = createVisitV2Api({ enabled: true, origin, pool: () => { throw Error('PRIVATE_INTERNAL_FAILURE'); } });
  await expectError(await unavailable(request(token, body), context, 'feedback'), 503, 'SERVICE_UNAVAILABLE');
  const disabled = createVisitV2Api({ enabled: false, origin, pool: () => { throw Error('must not open DB'); } });
  await expectError(await disabled(request(token, body), context, 'feedback'), 404, 'NOT_FOUND');
});
