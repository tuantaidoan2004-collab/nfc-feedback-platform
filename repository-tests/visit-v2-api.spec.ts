import { test as base, expect } from '@playwright/test';
import { Pool } from 'pg';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { VisitAccessDenied, VisitRatingRepository } from '../lib/repositories/visit-ratings';
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
  return new Request(`${origin}/api/v2/pages/visits${query}`, { method: 'POST',
    headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body && typeof body === 'object' && 'loadKey' in body ? { navigationKind: 'load', ...body } : body),
  });
}
/**
 * Since lát A3b the handler learns which page a request came from only through `resolve` -- in production, the signed
 * render proof. Here `shop` names that page's shop directly: it stands in for the proof, so the cases about one shop
 * reaching another's visits still test exactly what they did. A shop that does not exist is refused like a bad proof.
 */
type Call = (request: Request, context: { shop: string; visitId?: string }, operation: Parameters<ReturnType<typeof createVisitV2Api>>[2]) => Promise<Response>;
type Fixture = { pool: Pool; api: Call; shopId: string };
const bySlug = (pool: Pool, shop: string) => createVisitV2Api({ enabled: true, origin, pool: () => pool, resolve: async () => {
  const row = (await pool.query<{ id: string }>('SELECT id FROM shops WHERE slug=$1', [shop])).rows[0];
  if (!row) throw new VisitAccessDenied('PAGE_UNAVAILABLE');
  return { context: { shopId: row.id, scope: 'live', entryKey: 'direct:shop' } };
} });
const unresolved = async () => { throw new Error('unreachable: refused before the page is resolved'); };
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
      await pool.query(await readFile('db/migrations/011_feedback_phone.sql', 'utf8'));
      await pool.query(await readFile('db/migrations/018_guest_flood_control.sql', 'utf8'));
      await pool.query(await readFile('db/migrations/020_page_events.sql', 'utf8'));
      await pool.query(await readFile('db/migrations/021_erase_on_request.sql', 'utf8'));
      const shopId = randomUUID();
      await pool.query(`INSERT INTO shops(id,slug,name) VALUES($1,'one','PRIVATE_SHOP_NAME'),($2,'two','Two')`, [shopId, randomUUID()]);
      await provideFixture({ pool, shopId, api: (request, { shop, ...context }, operation) => bySlug(pool, shop)(request, context, operation) });
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
  for (const forbidden of [token, 'capability_hash', 'PRIVATE_SHOP_NAME']) {
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

test('browser fetch metadata decides when present; without it, origin must match configuration', async ({ db }) => {
  const token = secret();
  const variants: Record<string, string>[] = [{ origin: 'https://evil.test' }, { origin: 'null' }, { origin: '' },
    { origin, 'sec-fetch-site': 'cross-site' }, { origin, 'sec-fetch-site': 'same-site' }, { origin, 'sec-fetch-site': 'none' },
    { origin: 'https://evil.test', 'sec-fetch-site': 'cross-site' }];
  for (const headers of variants) {
    await expectError(await db.api(request(token, { loadKey: randomUUID() }, headers), { shop: 'one' }, 'register'), 403, 'ORIGIN_NOT_ALLOWED');
  }
  expect((await db.pool.query('SELECT count(*)::int AS n FROM page_visits')).rows[0].n).toBe(0);
  // Chrome on iPhone (27/09): the browser says same-origin, yet Origin is not this site's. The browser's own header wins.
  for (const other of ['null', 'https://evil.test']) {
    const opened = await db.api(request(secret(), { loadKey: randomUUID() }, { origin: other, 'sec-fetch-site': 'same-origin' }), { shop: 'one' }, 'register');
    expect(opened.status, other).toBe(200);
  }
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
  await expectError(await db.api(request(token, { loadKey: randomUUID() }), { shop: 'missing' }, 'register'), 403, 'PAGE_UNAVAILABLE');
});

test('disabled configuration never touches database and infrastructure errors reveal nothing', async ({ db }) => {
  const noDatabase = () => { throw new Error('PRIVATE_CREDENTIAL_DETAIL'); };
  const disabled = createVisitV2Api({ enabled: false, origin, pool: noDatabase, resolve: unresolved });
  await expectError(await disabled(request(secret(), { loadKey: randomUUID() }), {}, 'register'), 404, 'NOT_FOUND');
  const unavailable = createVisitV2Api({ enabled: true, origin, pool: noDatabase, resolve: unresolved });
  await expectError(await unavailable(request(secret(), { loadKey: randomUUID() }), {}, 'register'), 503, 'SERVICE_UNAVAILABLE');
  const badConfig = createVisitV2Api({ enabled: true, origin: `${origin}/`, pool: () => db.pool, resolve: unresolved });
  await expectError(await badConfig(request(secret(), { loadKey: randomUUID() }), {}, 'register'), 503, 'SERVICE_UNAVAILABLE');
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
  const unavailable = createVisitV2Api({ enabled: true, origin, pool: () => { throw Error('PRIVATE_INTERNAL_FAILURE'); }, resolve: unresolved });
  await expectError(await unavailable(request(token, body), context, 'feedback'), 503, 'SERVICE_UNAVAILABLE');
  const disabled = createVisitV2Api({ enabled: false, origin, pool: () => { throw Error('must not open DB'); }, resolve: unresolved });
  await expectError(await disabled(request(token, body), context, 'feedback'), 404, 'NOT_FOUND');
});

test('feedback takes an optional call-back number, rejects a malformed one and never echoes it', async ({ db }) => {
  const token = secret(), visit = await register(db, token), context = { shop: 'one', visitId: visit.id };
  for (const phone of ['12', 42, 'call me']) {
    await expectError(await db.api(request(token, { ...feedbackBody(), expectedRevision: 0, phone }), context, 'feedback'), 400, 'INVALID_INPUT');
  }
  const saved = await db.api(request(token, { ...feedbackBody(), expectedRevision: 0, phone: '+84 961 036 265' }), context, 'feedback');
  expect(saved.status).toBe(200);
  // Look for the whole number: a random intent id or timestamp can contain any short run of digits.
  const text = await saved.text(); expect(text).not.toContain('961036265'); expect(text).not.toContain('phone');
  expect((await db.pool.query('SELECT feedback_phone FROM rating_experiences')).rows).toEqual([{ feedback_phone: '+84961036265' }]);
});

/**
 * Flood control on the guest page (lát A1). Nothing a customer sends is refused at the marking threshold: the
 * session is marked and the answer is kept, and the shop's numbers leave it out until the shop asks to see it.
 * Only a machine past the ceiling is turned away, so that one script cannot fill the database.
 */
const marks = async (db: Fixture) =>
  (await db.pool.query('SELECT suspected_reason FROM visit_sessions ORDER BY sequence')).rows.map(r => r.suspected_reason);
/** Put a bucket at a chosen count. Registering already touched some of them, so this has to overwrite. */
const seed = (db: Fixture, bucket: string, attempts: number) =>
  db.pool.query(`INSERT INTO public_request_limits(bucket,window_start,attempts)VALUES($1,clock_timestamp(),$2)
    ON CONFLICT(bucket) DO UPDATE SET attempts=$2,window_start=clock_timestamp()`, [bucket, attempts]);
/** Move the whole session back in time, the way a person who actually read the page would look. */
async function unhurried(db: Fixture, seconds = 10) {
  // One statement per query: pg refuses several commands in a prepared statement.
  await db.pool.query('UPDATE page_visits SET opened_at=opened_at-make_interval(secs=>$1)', [seconds]);
  await db.pool.query(`UPDATE visit_sessions SET started_at=started_at-make_interval(secs=>$1),
    last_activity=last_activity-make_interval(secs=>$1)`, [seconds]);
}

test('an answer no person could have given that fast is marked, and kept', async ({ db }) => {
  const token = secret(), visit = await register(db, token);
  expect(await marks(db)).toEqual([null]);
  const reply = await db.api(request(token, command()), { shop: 'one', visitId: visit.id }, 'rating');
  // The customer is answered exactly as before: marking is never visible on the guest page.
  expect(reply.status).toBe(200);
  expect((await reply.json()).experience).toMatchObject({ rating: 5, revision: 1 });
  expect(await marks(db)).toEqual(['too_fast']);
  expect((await db.pool.query('SELECT rating FROM rating_experiences')).rows).toEqual([{ rating: 5 }]);
});

test('a person who took a few seconds is not marked, on stars or on words', async ({ db }) => {
  const token = secret(), visit = await register(db, token);
  await unhurried(db);
  expect((await db.api(request(token, command()), { shop: 'one', visitId: visit.id }, 'rating')).status).toBe(200);
  expect(await marks(db)).toEqual([null]);
  const words = { intentId: randomUUID(), expectedRevision: 1, topic: 'other', message: 'Quán phục vụ tốt' };
  expect((await db.api(request(token, words), { shop: 'one', visitId: visit.id }, 'feedback')).status).toBe(200);
  expect(await marks(db)).toEqual([null]);
});

test('past the marking threshold the answer is still taken; past the ceiling it is refused', async ({ db }) => {
  const token = secret(), visit = await register(db, token);
  await unhurried(db);
  // One page load answering faster than any person could tap: over the threshold, nowhere near the ceiling.
  await seed(db, `visit:${visit.id}`, 20);
  expect((await db.api(request(token, command()), { shop: 'one', visitId: visit.id }, 'rating')).status).toBe(200);
  expect(await marks(db)).toEqual(['visit_rate']);
  // The mark keeps the first reason: it records what was seen first, it is not a running commentary.
  await db.pool.query("UPDATE public_request_limits SET attempts=200 WHERE bucket=$1", [`visit:${visit.id}`]);
  await expectError(await db.api(request(token, { ...command(), expectedRevision: 1 }), { shop: 'one', visitId: visit.id }, 'rating'), 429, 'TOO_MANY_REQUESTS');
  expect(await marks(db)).toEqual(['visit_rate']);
  // Refused means refused before the write: the star the customer already gave is untouched.
  expect((await db.pool.query('SELECT rating,revision::int FROM rating_experiences')).rows).toEqual([{ rating: 5, revision: 1 }]);
});

test('one entry point being pumped leaves another shop alone', async ({ db }) => {
  const a = secret(), b = secret();
  const first = await register(db, a);
  const opened = await db.api(request(b, { loadKey: randomUUID() }), { shop: 'two' }, 'register');
  expect(opened.status).toBe(200);
  const second = (await opened.json()).visit as { id: string };
  await unhurried(db);
  // Shop one's entry point is at its threshold; shop two's is untouched and must stay that way.
  await seed(db, `entry:${db.shopId}:live:direct:shop`, 120);
  expect((await db.api(request(a, command()), { shop: 'one', visitId: first.id }, 'rating')).status).toBe(200);
  expect((await db.api(request(b, command()), { shop: 'two', visitId: second.id }, 'rating')).status).toBe(200);
  expect(await marks(db)).toEqual(['entry_rate', null]);
  // The bucket name carries shop, scope and entry key, which is why the two never met.
  expect((await db.pool.query("SELECT bucket FROM public_request_limits WHERE bucket LIKE 'entry:%' ORDER BY bucket")).rowCount).toBe(2);
});

test('the address tier runs only behind a proxy that sets the header, never on one shared unknown bucket', async ({ db }) => {
  const token = secret(), visit = await register(db, token);
  await unhurried(db);
  // No header locally: counting by address must simply not happen. Falling back to one bucket for everyone is how
  // F-002's platform-wide limit became a way to lock real people out.
  expect((await db.pool.query("SELECT count(*)::int n FROM public_request_limits WHERE bucket LIKE 'address:%'")).rows[0].n).toBe(0);
  const address = '203.0.113.9';
  const bucket = `address:${db.shopId}:${createHash('sha256').update(`nfc-guest-address-v1\0${address}`).digest('hex')}`;
  await seed(db, bucket, 600);
  // Lát I1: a header the visitor sent is not an address. Unconfigured, even Vercel's own header name is ignored here --
  // off Vercel anyone can send it -- so nothing is marked.
  const spoofed = await db.api(request(token, command(), { 'x-vercel-forwarded-for': address, 'x-forwarded-for': address, 'x-real-ip': address }),
    { shop: 'one', visitId: visit.id }, 'rating');
  expect(spoofed.status).toBe(200); expect(await marks(db)).toEqual([null]);
  // Behind the operator's own proxy, which overwrites the one header it is told to trust, the address counts.
  const before = process.env.NFC_CLIENT_IP_HEADER; process.env.NFC_CLIENT_IP_HEADER = 'x-real-ip';
  let reply: Response;
  try { reply = await db.api(request(token, { ...command(), expectedRevision: 1 }, { 'x-real-ip': address }), { shop: 'one', visitId: visit.id }, 'rating'); }
  finally { if (before === undefined) delete process.env.NFC_CLIENT_IP_HEADER; else process.env.NFC_CLIENT_IP_HEADER = before; }
  expect(reply.status).toBe(200);
  expect(await marks(db)).toEqual(['address_rate']);
  // The address is counted, not kept: what is in the table cannot be read back as an address.
  const stored = (await db.pool.query("SELECT bucket FROM public_request_limits WHERE bucket LIKE 'address:%'")).rows.map(r => r.bucket);
  expect(stored).toEqual([bucket]);
  expect(stored[0]).not.toContain(address);

  // And a counting row does not outlive its minute by an hour: registering sweeps what is stale.
  await db.pool.query("UPDATE public_request_limits SET window_start=clock_timestamp()-interval '2 hours'");
  await register(db, secret());
  expect((await db.pool.query('SELECT count(*)::int n FROM public_request_limits')).rows[0].n).toBe(1);
});

/**
 * The behavioural event stream (lát mục 7). Measurement, so it is answered and forgotten; shape, so nothing a
 * customer wrote can reach it.
 */
const events = (db: Fixture, token: string, visitId: string, body: unknown) =>
  db.api(new Request(`${origin}/api/v2/shops/one/visits/${visitId}/events`, { method: 'POST',
    headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    { shop: 'one', visitId }, 'events');
const logged = async (db: Fixture) =>
  (await db.pool.query('SELECT name,since_open_ms,detail,session_id,visit_id FROM page_events ORDER BY id')).rows;

test('a batch of behaviour is recorded against the visit, and answered with nothing', async ({ db }) => {
  const token = secret(), visit = await register(db, token);
  const reply = await events(db, token, visit.id, { events: [
    { name: 'page_opened', sinceOpenMs: 0 },
    { name: 'card_opened', sinceOpenMs: 4200 },
    { name: 'star_chosen', sinceOpenMs: 6100, detail: { score: 5, layout: 'card' } },
  ] });
  // Nothing to read back: no body, no echo, nothing a caller could wait on.
  expect(reply.status).toBe(204);
  expect(await reply.text()).toBe('');
  const rows = await logged(db);
  expect(rows.map(r => [r.name, r.since_open_ms])).toEqual([['page_opened', 0], ['card_opened', 4200], ['star_chosen', 6100]]);
  expect(rows[2].detail).toEqual({ score: 5, layout: 'card' });
  // The visit and session come from the server's own record, never from the browser.
  expect(rows.every(r => r.visit_id === visit.id)).toBe(true);
  expect(new Set(rows.map(r => r.session_id)).size).toBe(1);
  // Rewriting history is refused; forgetting it is not, or the log could never be archived.
  await expect(db.pool.query("UPDATE page_events SET name='page_opened'")).rejects.toThrow('PAGE_EVENTS_APPEND_ONLY');
  await expect(db.pool.query('DELETE FROM page_events')).resolves.toBeTruthy();
});

test('another page cannot write this one\'s history, and nothing a customer wrote can get in', async ({ db }) => {
  const mine = secret(), theirs = secret();
  const visit = await register(db, mine);
  await register(db, theirs);
  // A valid capability for a different session is still not this visit's capability.
  await expectError(await events(db, theirs, visit.id, { events: [{ name: 'page_opened', sinceOpenMs: 0 }] }), 401, 'VISIT_NOT_AUTHORIZED');
  expect(await logged(db)).toHaveLength(0);

  // Shape only. Free prose, a phone number, a long string or an unknown name are all refused outright, because a
  // permissive detail column is the hole a message eventually arrives through.
  for (const bad of [
    { events: [{ name: 'page_opened', sinceOpenMs: 0, detail: { note: 'Quán phục vụ rất tệ' } }] },
    { events: [{ name: 'page_opened', sinceOpenMs: 0, detail: { phone: '0961036265' } }] },
    { events: [{ name: 'page_opened', sinceOpenMs: 0, detail: { a: 1, b: 2, c: 3, d: 4, e: 5 } }] },
    { events: [{ name: 'star_chosen', sinceOpenMs: -1 }] },
    { events: [{ name: 'page_opened', sinceOpenMs: 86_400_001 }] },
    { events: [{ name: 'message_typed', sinceOpenMs: 0 }] },
    { events: [] },
    { events: Array.from({ length: 21 }, () => ({ name: 'page_opened', sinceOpenMs: 0 })) },
    { events: [{ name: 'page_opened' }] },
    { events: 'page_opened' },
  ]) await expectError(await events(db, mine, visit.id, bad), 400, 'INVALID_INPUT');
  expect(await logged(db)).toHaveLength(0);
  // A number and a short enumeration value are what the column is for, and they go through.
  expect((await events(db, mine, visit.id, { events: [{ name: 'google_tapped', sinceOpenMs: 900, detail: { layout: 'full-bleed' } }] })).status).toBe(204);
  expect((await logged(db))[0].detail).toEqual({ layout: 'full-bleed' });
});

/**
 * Erasure at the customer's own request (lát B). The secret their browser holds is the proof; no account, no
 * email, nobody to ask. What goes is what they wrote; what stays is that a visit happened and what star it gave.
 */
const eraseCall = (db: Fixture, token: string, visitId: string) =>
  db.api(new Request(`${origin}/api/v2/shops/one/visits/${visitId}/erase`, { method: 'POST',
    headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' }),
    { shop: 'one', visitId }, 'erase');

test('a customer erases their own words and number, and the star and the totals survive', async ({ db }) => {
  const token = secret(), visit = await register(db, token);
  const words = { intentId: randomUUID(), expectedRevision: 0, topic: 'other', message: 'Xin gọi lại giúp tôi', phone: '0961036265' };
  expect((await db.api(request(token, words), { shop: 'one', visitId: visit.id }, 'feedback')).status).toBe(200);
  expect((await db.api(request(token, { ...command(), expectedRevision: 1 }), { shop: 'one', visitId: visit.id }, 'rating')).status).toBe(200);
  await events(db, token, visit.id, { events: [{ name: 'card_opened', sinceOpenMs: 10 }] });
  expect((await db.pool.query('SELECT count(*)::int n FROM page_events')).rows[0].n).toBe(1);

  const reply = await eraseCall(db, token, visit.id);
  expect(reply.status).toBe(200);
  expect(await reply.json()).toEqual({ erased: true });

  // The words and the number are gone from both copies -- including the one the database used to refuse to touch.
  for (const table of ['rating_experiences', 'rating_intent_receipts']) {
    const rows = (await db.pool.query(`SELECT feedback_message,feedback_phone FROM ${table} WHERE feedback_message IS NOT NULL`)).rows;
    expect(rows.length, table).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.feedback_message, table).toBe('(đã xoá theo yêu cầu)');
      expect(row.feedback_phone, table).toBeNull();
    }
  }
  expect(JSON.stringify((await db.pool.query('SELECT * FROM rating_intent_receipts')).rows)).not.toContain('0961036265');
  // The behaviour log for this session goes with it: it holds no words, but it does say what this person did.
  expect((await db.pool.query('SELECT count(*)::int n FROM page_events')).rows[0].n).toBe(0);
  // The star stays. It names nobody, and the shop's totals must not quietly change when someone erases words.
  expect((await db.pool.query('SELECT rating FROM rating_experiences')).rows).toEqual([{ rating: 5 }]);
  expect((await db.pool.query('SELECT count(*)::int n FROM visit_sessions')).rows[0].n).toBe(1);
  // Asking twice is not an error, and changes nothing further.
  expect(await (await eraseCall(db, token, visit.id)).json()).toEqual({ erased: false });
});

test('erasure is the one edit a receipt allows, and only for the person who owns it', async ({ db }) => {
  const mine = secret(), theirs = secret();
  const visit = await register(db, mine);
  await register(db, theirs);
  await db.api(request(mine, { intentId: randomUUID(), expectedRevision: 0, topic: 'other', message: 'Lời của tôi' }),
    { shop: 'one', visitId: visit.id }, 'feedback');
  // Someone else's capability is not a way to erase this person's feedback -- nor to keep it.
  await expectError(await eraseCall(db, theirs, visit.id), 401, 'VISIT_NOT_AUTHORIZED');
  expect((await db.pool.query("SELECT count(*)::int n FROM rating_intent_receipts WHERE feedback_message='Lời của tôi'")).rows[0].n).toBe(1);

  // Every other edit the receipt still refuses, which is what makes it a record.
  await expect(db.pool.query("UPDATE rating_intent_receipts SET feedback_message='Chữ khác'")).rejects.toThrow('IMMUTABLE_PUBLISHING_RECORD');
  await expect(db.pool.query('UPDATE rating_intent_receipts SET applied_revision=99')).rejects.toThrow('IMMUTABLE_PUBLISHING_RECORD');
  // Including an erasure that quietly changes something else at the same time.
  await expect(db.pool.query("UPDATE rating_intent_receipts SET feedback_message='(đã xoá theo yêu cầu)',feedback_phone=NULL,applied_revision=99"))
    .rejects.toThrow('IMMUTABLE_PUBLISHING_RECORD');
  await expect(db.pool.query('DELETE FROM rating_intent_receipts')).rejects.toThrow('IMMUTABLE_PUBLISHING_RECORD');
  // And the erasure the trigger does allow is exactly the one the application performs.
  await expect(db.pool.query("UPDATE rating_intent_receipts SET feedback_message='(đã xoá theo yêu cầu)',feedback_phone=NULL")).resolves.toBeTruthy();
});

test('a customer who comes back later erases what they wrote in an earlier session too', async ({ db }) => {
  const mine = secret(), theirs = secret();
  const first = await register(db, mine);
  await db.api(request(mine, { intentId: randomUUID(), expectedRevision: 0, topic: 'other', message: 'Lần trước', phone: '0961036265' }),
    { shop: 'one', visitId: first.id }, 'feedback');
  const other = await register(db, theirs);
  await db.api(request(theirs, { intentId: randomUUID(), expectedRevision: 0, topic: 'other', message: 'Của người khác' }),
    { shop: 'one', visitId: other.id }, 'feedback');
  // Fifteen idle minutes close a session; closing it directly is the same state without the wait.
  await db.pool.query('UPDATE visit_sessions SET closed_at=last_activity WHERE id=(SELECT session_id FROM page_visits WHERE id=$1)', [first.id]);
  const later = await register(db, mine);
  expect((await db.pool.query('SELECT session_id FROM page_visits WHERE id=$1', [later.id])).rows[0].session_id)
    .not.toBe((await db.pool.query('SELECT session_id FROM page_visits WHERE id=$1', [first.id])).rows[0].session_id);

  expect(await (await eraseCall(db, mine, later.id)).json()).toEqual({ erased: true });
  const left = (await db.pool.query('SELECT feedback_message,feedback_phone FROM rating_experiences WHERE feedback_message IS NOT NULL ORDER BY feedback_message')).rows;
  // Mine is gone from the old session; the other customer's words are untouched.
  expect(left).toEqual([{ feedback_message: '(đã xoá theo yêu cầu)', feedback_phone: null }, { feedback_message: 'Của người khác', feedback_phone: null }]);
});

// C3 (docs/agents-board.md, mặt trận 1 và 2): a guest of one shop naming a visit of another shop -- say they learned
// its id -- must move nothing of that visit, not even its counter: a counter pushed past the ceiling would refuse the
// real guest's next answer.
test("a visit of another shop, named from this shop's page, counts nothing against that visit", async ({ db }) => {
  const attacker = secret(), guest = secret();
  await register(db, attacker);
  const opened = await db.api(request(guest, { loadKey: randomUUID() }), { shop: 'two' }, 'register');
  const victim = (await opened.json()).visit as { id: string };
  await unhurried(db);
  await expectError(await db.api(request(attacker, command()), { shop: 'one', visitId: victim.id }, 'rating'), 401, 'VISIT_NOT_AUTHORIZED');
  expect((await db.pool.query('SELECT attempts FROM public_request_limits WHERE bucket=$1', [`visit:${victim.id}`])).rows).toEqual([]);
  expect((await db.api(request(guest, command()), { shop: 'two', visitId: victim.id }, 'rating')).status).toBe(200);
  expect(await marks(db)).toEqual([null, null]);
});
