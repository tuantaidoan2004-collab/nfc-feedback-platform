import { test as base, expect } from '@playwright/test';
import { Pool } from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { VisitRatingRepository, type ResolvedShopContext } from '../lib/repositories/visit-ratings';
import { IDLE_WINDOW_MS } from '../lib/domain/visit-rating';
const connectionString = process.env.NFC_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set NFC_TEST_DATABASE_URL to disposable local nfc_repo_test');
const address = new URL(connectionString);
if (!['localhost','127.0.0.1','[::1]'].includes(address.hostname) || address.pathname !== '/nfc_repo_test' || address.search) {
  throw new Error('Repository tests require local nfc_repo_test without overrides');
}
const initial = Date.parse('2026-09-11T00:00:00Z');
const iso = (ms: number) => new Date(initial+ms).toISOString();
const command = (score = 5, expectedRevision = 0, intentId: string = randomUUID()) => ({ score, expectedRevision, intentId });
type Fixture = { pool: Pool; repo: VisitRatingRepository; context: ResolvedShopContext; otherShopId: string;
  hash: string; legacyId: string; setTime: (ms: number) => void };
const test = base.extend<{ db: Fixture }>({
  db: async ({}, provideFixture) => {
    const schema = `nfc_test_${randomUUID().replaceAll('-','')}`;
    const admin = new Pool({ connectionString });
    const pool = new Pool({ connectionString, options: `-c search_path=${schema}`, max: 12 });
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
      await pool.query(await readFile('db/migrations/001_core.sql','utf8'));
      const shopId = randomUUID(), otherShopId = randomUUID();
      await pool.query("INSERT INTO shops(id,slug,name) VALUES($1,'one','One'),($2,'two','Two')", [shopId,otherShopId]);
      const old = await pool.query("INSERT INTO experiences(shop_id,token_hash,rating,revision,message) VALUES($1,'legacy',3,7,'preserve me') RETURNING id", [shopId]);
      await pool.query(await readFile('db/migrations/002_visit_ratings.sql','utf8'));
      await pool.query(await readFile('db/migrations/010_feedback_without_rating.sql','utf8'));
      await pool.query(await readFile('db/migrations/011_feedback_phone.sql','utf8'));
      let time = initial;
      await provideFixture({ pool, repo: new VisitRatingRepository(pool, () => new Date(time)),
        context: { shopId, scope:'live', entryKey:'direct:shop' }, otherShopId, hash: randomBytes(32).toString('hex'),
        legacyId: old.rows[0].id, setTime: ms => { time = initial+ms; } });
    } finally { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  },
});
const counts = async (pool: Pool) => (await pool.query(`SELECT
 (SELECT count(*)::int FROM visit_sessions) AS sessions,
 (SELECT count(*)::int FROM page_visits) AS opens,
 (SELECT count(*)::int FROM rating_experiences) AS experiences`)).rows[0];

test('load/reload/back-forward/resume create separate opens in one session without experience', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context,'load','load',db.hash);
  for (const [i,kind] of (['reload','back_forward','resume'] as const).entries()) {
    db.setTime(i+1);
    const opened = await db.repo.registerVisit(db.context,kind,kind,db.hash);
    expect(opened.visit.visitId).not.toBe(first.visit.visitId);
    expect(opened.session.sessionId).toBe(first.session.sessionId);
    expect(opened.visit.navigationKind).toBe(kind);
  }
  expect(await counts(db.pool)).toEqual({ sessions:1,opens:4,experiences:0 });
});

test('two simultaneous tabs and simultaneous rollover share exactly one current session', async ({ db }) => {
  const first = await Promise.all(Array.from({length:8}, (_,i) => db.repo.registerVisit(db.context,`first-${i}`,'load',db.hash)));
  expect(new Set(first.map(r => r.session.sessionId)).size).toBe(1);
  db.setTime(IDLE_WINDOW_MS);
  const next = await Promise.all(Array.from({length:8}, (_,i) => db.repo.registerVisit(db.context,`next-${i}`,'resume',db.hash)));
  expect(new Set(next.map(r => r.session.sessionId)).size).toBe(1);
  expect(next[0].session.sessionId).not.toBe(first[0].session.sessionId);
  expect(await counts(db.pool)).toEqual({ sessions:2,opens:16,experiences:0 });
  expect((await db.pool.query('SELECT count(*)::int AS n FROM visit_sessions WHERE closed_at IS NULL')).rows[0].n).toBe(1);
});
for (const [idle,reused] of [[IDLE_WINDOW_MS-1,true],[IDLE_WINDOW_MS,false],[IDLE_WINDOW_MS+1,false]] as const) {
  test(`server idle ${idle} ms => session reused ${reused}`, async ({ db }) => {
    const first = await db.repo.registerVisit(db.context,'first','load',db.hash);
    db.setTime(idle);
    const next = await db.repo.registerVisit(db.context,'next','resume',db.hash);
    expect(next.session.sessionId === first.session.sessionId).toBe(reused);
    expect(next.visit.openedAt).toBe(iso(idle));
  });
}
test('valid open/rating extends last_activity; retry and rejection do not', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context,'first','load',db.hash), intent = command();
  db.setTime(600000);
  await db.repo.recordRating(first.visit,intent,db.hash);
  db.setTime(610000);
  await db.repo.recordRating(first.visit,intent,db.hash);
  await db.repo.recordRating(first.visit,command(2),db.hash);
  await db.repo.registerVisit(db.context,'first','load',db.hash);
  expect((await db.pool.query('SELECT last_activity FROM visit_sessions')).rows[0].last_activity.toISOString()).toBe(iso(600000));
  db.setTime(600000+IDLE_WINDOW_MS-1);
  const next = await db.repo.registerVisit(db.context,'next','reload',db.hash);
  expect(next.session.sessionId).toBe(first.session.sessionId);
  expect(next.session.lastActivity).toBe(iso(600000+IDLE_WINDOW_MS-1));
});
test('different browser/shop/scope/direct attribution remains separate', async ({ db }) => {
  const variants = [
    [db.context,db.hash], [db.context,randomBytes(32).toString('hex')],
    [{...db.context,shopId:db.otherShopId},db.hash], [{...db.context,scope:'test' as const},db.hash],
    [{...db.context,entryKey:'direct:other-resolved-entry'},db.hash],
  ] as const;
  const ids = [];
  for (const [i,[context,hash]] of variants.entries()) ids.push((await db.repo.registerVisit(context,`open-${i}`,'load',hash)).session.sessionId);
  expect(new Set(ids).size).toBe(5);
});
test('open retries are stable after expiry and reject changed nav/token without extending old session', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context,'first','load',db.hash);
  db.setTime(IDLE_WINDOW_MS);
  const retry = await db.repo.registerVisit(db.context,'first','load',db.hash);
  expect(retry.visit).toEqual(first.visit); expect(retry.active).toBe(false);
  expect(retry.session.lastActivity).toBe(first.session.lastActivity);
  await expect(db.repo.registerVisit(db.context,'first','reload',db.hash)).rejects.toThrow('VISIT_CONFLICT');
  await expect(db.repo.registerVisit(db.context,'first','load',randomBytes(32).toString('hex'))).rejects.toThrow('VISIT_CONFLICT');
  expect(await counts(db.pool)).toEqual({ sessions:1,opens:1,experiences:0 });
});
test('5→2 through two opens updates one experience, shared revision and original receipt', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context,'first','load',db.hash), intent = command();
  await db.repo.recordRating(first.visit,intent,db.hash);
  db.setTime(1);
  const second = await db.repo.registerVisit(db.context,'second','reload',db.hash);
  expect(second.experience).toMatchObject({rating:5,revision:1});
  const edit = await db.repo.recordRating(second.visit,command(2,1),db.hash);
  expect(edit).toMatchObject({kind:'applied',experience:{sessionId:first.session.sessionId,rating:2,revision:2,firstInteractionAt:iso(0)}});
  expect(await db.repo.recordRating(first.visit,intent,db.hash)).toMatchObject({kind:'replayed',experience:{rating:2,revision:2},receipt:{experience:{rating:5,revision:1}}});
  expect(await db.repo.recordRating(second.visit,intent,db.hash)).toEqual({kind:'rejected',code:'INTENT_CONFLICT'});
  expect(await counts(db.pool)).toEqual({sessions:1,opens:2,experiences:1});
});
test('concurrent first ratings across two pages apply only once; concurrent retries replay', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context,'first','load',db.hash);
  const second = await db.repo.registerVisit(db.context,'second','load',db.hash);
  const results = await Promise.all([first,second].map(r => db.repo.recordRating(r.visit,command(),db.hash)));
  expect(results.filter(r=>r.kind==='applied')).toHaveLength(1);
  expect(results.filter(r=>r.kind==='rejected')).toEqual([{kind:'rejected',code:'REVISION_CONFLICT'}]);
  const intent = command(2,1);
  const retries = await Promise.all(Array.from({length:6},()=>db.repo.recordRating(first.visit,intent,db.hash)));
  expect(retries.filter(r=>r.kind==='applied')).toHaveLength(1);
  expect(retries.filter(r=>r.kind==='replayed')).toHaveLength(5);
  expect((await db.pool.query('SELECT count(*)::int AS n FROM rating_intent_receipts')).rows[0].n).toBe(2);
});
test('expired page cannot mutate old session, resume starts new, old receipt still replays without reviving', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context,'first','load',db.hash), intent = command();
  await db.repo.recordRating(first.visit,intent,db.hash);
  db.setTime(IDLE_WINDOW_MS);
  expect(await db.repo.recordRating(first.visit,command(2,1),db.hash)).toEqual({kind:'rejected',code:'SESSION_EXPIRED'});
  const resumed = await db.repo.registerVisit(db.context,'resume','resume',db.hash);
  expect(resumed.session.sessionId).not.toBe(first.session.sessionId);
  expect(resumed.experience).toBeNull();
  expect(await db.repo.recordRating(first.visit,intent,db.hash)).toMatchObject({kind:'replayed'});
  expect(await db.repo.recordRating(resumed.visit,command(2),db.hash)).toMatchObject({kind:'applied',experience:{rating:2,revision:1}});
  const old = (await db.pool.query('SELECT last_activity,closed_at FROM visit_sessions WHERE id=$1',[first.session.sessionId])).rows[0];
  expect(old.last_activity.toISOString()).toBe(iso(0)); expect(old.closed_at).not.toBeNull();
});
test('tenant/scope/entry/token/revision and malformed ratings reject without mutation', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context,'first','load',db.hash), intent = command();
  await db.repo.recordRating(first.visit,intent,db.hash);
  for (const visit of [{...first.visit,shopId:db.otherShopId},{...first.visit,scope:'test' as const},
    {...first.visit,entryKey:'direct:other'},{...first.visit,visitId:randomUUID()}]) {
    expect(await db.repo.recordRating(visit,intent,db.hash)).toEqual({kind:'rejected',code:'CONTEXT_MISMATCH'});
  }
  expect(await db.repo.recordRating(first.visit,intent,'b'.repeat(64))).toEqual({kind:'rejected',code:'CONTEXT_MISMATCH'});
  expect(await db.repo.recordRating(first.visit,command(1),db.hash)).toEqual({kind:'rejected',code:'REVISION_CONFLICT'});
  expect(await db.repo.recordRating(first.visit,{...intent,score:1},db.hash)).toEqual({kind:'rejected',code:'INTENT_CONFLICT'});
  for(const score of [0,6,1.5]) expect(await db.repo.recordRating(first.visit,command(score,1),db.hash)).toEqual({kind:'rejected',code:'INVALID_INPUT'});
});
test('database FKs enforce session shop/scope/entry and receipt source page', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context,'first','load',db.hash);
  const second = await db.repo.registerVisit(db.context,'second','load','b'.repeat(64));
  for (const c of [{...db.context,shopId:db.otherShopId},{...db.context,scope:'test'},{...db.context,entryKey:'other'}]) {
    await expect(db.pool.query(`INSERT INTO rating_experiences(session_id,shop_id,scope,entry_key,rating,revision,first_interaction_at,updated_at)
      VALUES($1,$2,$3,$4,5,1,$5,$5)`,[first.session.sessionId,c.shopId,c.scope,c.entryKey,iso(0)])).rejects.toMatchObject({code:'23503'});
  }
  await db.repo.recordRating(first.visit,command(),db.hash);
  await expect(db.pool.query(`INSERT INTO rating_intent_receipts(shop_id,scope,entry_key,session_id,visit_id,intent_id,expected_revision,score,applied_revision,first_interaction_at,applied_at)
    VALUES($1,'live','direct:shop',$2,$3,'bad',1,2,2,$4,$4)`,[db.context.shopId,first.session.sessionId,second.visit.visitId,iso(0)])).rejects.toMatchObject({code:'23503'});
});
test('receipt failure rolls back insert/edit and last_activity; failed open rolls back rollover', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context,'first','load',db.hash);
  await db.pool.query(`CREATE FUNCTION fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.intent_id='fail' THEN RAISE EXCEPTION 'test receipt failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_receipt BEFORE INSERT ON rating_intent_receipts FOR EACH ROW EXECUTE FUNCTION fail_receipt();`);
  db.setTime(1);
  await expect(db.repo.recordRating(first.visit,command(5,0,'fail'),db.hash)).rejects.toThrow('test receipt failure');
  expect((await counts(db.pool)).experiences).toBe(0);
  await db.repo.recordRating(first.visit,command(),db.hash);
  db.setTime(2);
  await expect(db.repo.recordRating(first.visit,command(2,1,'fail'),db.hash)).rejects.toThrow('test receipt failure');
  expect((await db.pool.query('SELECT rating,revision::int FROM rating_experiences')).rows).toEqual([{rating:5,revision:1}]);
  expect((await db.pool.query('SELECT last_activity FROM visit_sessions')).rows[0].last_activity.toISOString()).toBe(iso(1));
  await db.pool.query(`CREATE FUNCTION fail_open() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.load_key='fail' THEN RAISE EXCEPTION 'test open failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_open BEFORE INSERT ON page_visits FOR EACH ROW EXECUTE FUNCTION fail_open();`);
  db.setTime(IDLE_WINDOW_MS+1);
  await expect(db.repo.registerVisit(db.context,'fail','resume',db.hash)).rejects.toThrow('test open failure');
  expect((await counts(db.pool)).sessions).toBe(1);
  expect((await db.pool.query('SELECT closed_at FROM visit_sessions')).rows[0].closed_at).toBeNull();
});
test('legacy has no fabricated sessions; guarded down/reapply preserves old rows', async ({ db }) => {
  const before = (await db.pool.query('SELECT * FROM experiences WHERE id=$1',[db.legacyId])).rows;
  expect(await counts(db.pool)).toEqual({sessions:0,opens:0,experiences:0});
  const down = await readFile('db/rollback/002_visit_ratings.sql','utf8'), client = await db.pool.connect();
  try {
    await client.query('BEGIN'); await client.query(down); await client.query('COMMIT');
    expect((await client.query("SELECT to_regclass('visit_sessions') AS name")).rows[0].name).toBeNull();
    await client.query(await readFile('db/migrations/002_visit_ratings.sql','utf8'));
    await db.repo.registerVisit(db.context,'first','load',db.hash);
    await client.query('BEGIN'); await expect(client.query(down)).rejects.toThrow('V2_DATA_PRESENT'); await client.query('ROLLBACK');
    expect((await client.query('SELECT * FROM experiences WHERE id=$1',[db.legacyId])).rows).toEqual(before);
  } finally {await client.query('ROLLBACK');client.release();}
});

const privateCommand = (expectedRevision = 1, message = 'private 🦋 message', intentId: string = randomUUID()) => ({ expectedRevision, message, topic: 'general', intentId });

test('private feedback needs no rating; a later rating joins the same experience and keeps the text', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context, 'first', 'load', db.hash);
  const intent = privateCommand(0, 'before any star');
  expect(await db.repo.recordPrivateFeedback(first.visit, privateCommand(1), db.hash)).toEqual({ kind: 'rejected', code: 'REVISION_CONFLICT' });
  expect(await db.repo.recordPrivateFeedback(first.visit, intent, db.hash)).toMatchObject({ kind: 'applied',
    experience: { rating: null, revision: 1, firstInteractionAt: iso(0), feedback: { message: 'before any star' } },
    receipt: { experience: { rating: null, revision: 1 } } });
  expect((await counts(db.pool)).experiences).toBe(1);
  expect((await db.repo.registerVisit(db.context, 'first', 'load', db.hash)).experience).toMatchObject({ rating: null, revision: 1 });
  db.setTime(1);
  expect(await db.repo.recordRating(first.visit, command(2, 1), db.hash)).toMatchObject({ kind: 'applied',
    experience: { rating: 2, revision: 2, firstInteractionAt: iso(0), updatedAt: iso(1) } });
  expect(await db.repo.recordPrivateFeedback(first.visit, intent, db.hash)).toMatchObject({ kind: 'replayed',
    experience: { rating: 2, revision: 2 }, receipt: { experience: { rating: null, revision: 1 } } });
  expect((await db.pool.query('SELECT rating,feedback_message FROM rating_experiences')).rows).toEqual([{ rating: 2, feedback_message: 'before any star' }]);
  expect((await db.pool.query('SELECT operation,score FROM rating_intent_receipts ORDER BY applied_revision')).rows)
    .toEqual([{ operation: 'feedback', score: null }, { operation: 'rating', score: 2 }]);
});

test('database keeps a star on every rating receipt; rollback 010 refuses while unrated feedback exists', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context, 'first', 'load', db.hash);
  await db.repo.recordPrivateFeedback(first.visit, privateCommand(0, 'no star'), db.hash);
  await expect(db.pool.query(`INSERT INTO rating_intent_receipts
    (shop_id,scope,entry_key,session_id,visit_id,intent_id,expected_revision,score,applied_revision,first_interaction_at,applied_at,operation)
    SELECT shop_id,scope,entry_key,session_id,visit_id,'rating-without-star',1,NULL,2,first_interaction_at,applied_at,'rating'
    FROM rating_intent_receipts`)).rejects.toMatchObject({ code: '23514' });
  const down = await readFile('db/rollback/010_feedback_without_rating.sql', 'utf8'), client = await db.pool.connect();
  try {
    await client.query('BEGIN'); await expect(client.query(down)).rejects.toThrow('UNRATED_FEEDBACK_PRESENT'); await client.query('ROLLBACK');
    await client.query('BEGIN'); await client.query('DELETE FROM rating_intent_receipts'); await client.query('DELETE FROM rating_experiences');
    await client.query(down);
    await expect(client.query("INSERT INTO rating_experiences(session_id,shop_id,scope,entry_key,rating,revision,first_interaction_at,updated_at) VALUES($1,$2,'live','direct:shop',NULL,1,now(),now())",
      [first.session.sessionId, db.context.shopId])).rejects.toMatchObject({ code: '23502' });
  } finally { await client.query('ROLLBACK'); client.release(); }
});

test('shared snapshot update preserves5→2 and public projections redact', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context, 'first', 'load', db.hash);
  const ratingIntent = command(); await db.repo.recordRating(first.visit, ratingIntent, db.hash);
  db.setTime(1); const feedbackIntent = privateCommand();
  const feedback = await db.repo.recordPrivateFeedback(first.visit, feedbackIntent, db.hash);
  expect(feedback).toMatchObject({ kind: 'applied', experience: { revision: 2, rating: 5, feedback: { topic: 'general', message: feedbackIntent.message } } });
  db.setTime(2); const editIntent = command(2, 2);
  const untrustedExtras = { ...editIntent, message: 'injected-private', topic: 'injected-topic' };
  const edited = await db.repo.recordRating(first.visit, untrustedExtras, db.hash);
  expect(edited).toMatchObject({ kind: 'applied', experience: { rating: 2, revision: 3 } });
  const publicResults = [edited, await db.repo.recordRating(first.visit, editIntent, db.hash),
    await db.repo.recordRating(first.visit, ratingIntent, db.hash), await db.repo.registerVisit(db.context, 'first', 'load', db.hash),
    await db.repo.registerVisit(db.context, 'new', 'reload', db.hash)];
  for (const result of publicResults) {
    const serialized = JSON.stringify(result);
    for (const forbidden of ['feedback', 'message', 'topic', feedbackIntent.message]) expect(serialized).not.toContain(forbidden);
  }
  const replay = await db.repo.recordPrivateFeedback(first.visit, feedbackIntent, db.hash);
  expect(replay).toMatchObject({ kind: 'replayed', experience: { rating: 2, revision: 3, feedback: { message: feedbackIntent.message } },
    receipt: { experience: { rating: 5, revision: 2 } } });
  expect((await db.pool.query('SELECT feedback_message FROM rating_experiences')).rows[0].feedback_message).toBe(feedbackIntent.message);
});

test('private canonical replay/mismatch and concurrent retries share exactly one receipt', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context, 'first', 'load', db.hash); await db.repo.recordRating(first.visit, command(), db.hash);
  const intent = privateCommand(1, ' e\u0301\r\n好 ');
  const results = await Promise.all(Array.from({ length: 6 }, () => db.repo.recordPrivateFeedback(first.visit, intent, db.hash)));
  expect(results.filter(r => r.kind === 'applied')).toHaveLength(1); expect(results.filter(r => r.kind === 'replayed')).toHaveLength(5);
  expect(await db.repo.recordPrivateFeedback(first.visit, { ...intent, message: 'é\n好' }, db.hash)).toMatchObject({ kind: 'replayed' });
  for (const patch of [{ message: 'different' }, { topic: 'service' }, { expectedRevision: 2 }]) {
    expect(await db.repo.recordPrivateFeedback(first.visit, { ...intent, ...patch }, db.hash)).toEqual({ kind: 'rejected', code: 'INTENT_CONFLICT' });
  }
  const second = await db.repo.registerVisit(db.context, 'second', 'reload', db.hash);
  expect(await db.repo.recordPrivateFeedback(second.visit, intent, db.hash)).toEqual({ kind: 'rejected', code: 'INTENT_CONFLICT' });
  expect((await db.pool.query("SELECT count(*)::int AS n FROM rating_intent_receipts WHERE operation='feedback'")).rows[0].n).toBe(1);
});

test('rating and feedback competing at shared revision have one winner and no lost update', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context, 'first', 'load', db.hash); await db.repo.recordRating(first.visit, command(), db.hash);
  const results = await Promise.all([db.repo.recordRating(first.visit, command(2, 1), db.hash), db.repo.recordPrivateFeedback(first.visit, privateCommand(), db.hash)]);
  expect(results.filter(r => r.kind === 'applied')).toHaveLength(1);
  expect(results.filter(r => r.kind === 'rejected')).toEqual([{ kind: 'rejected', code: 'REVISION_CONFLICT' }]);
  expect((await db.pool.query('SELECT revision::int FROM rating_experiences')).rows[0].revision).toBe(2);
  const next = results[0].kind === 'applied'
    ? await db.repo.recordPrivateFeedback(first.visit, privateCommand(2), db.hash)
    : await db.repo.recordRating(first.visit, command(2, 2), db.hash);
  expect(next).toMatchObject({ kind: 'applied', experience: { revision: 3, rating: 2 } });
  expect((await db.pool.query('SELECT feedback_message FROM rating_experiences')).rows[0].feedback_message).toBe('private 🦋 message');
});

test('shared intent namespace is atomic across operations and directly enforced by DB key', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context, 'first', 'load', db.hash); await db.repo.recordRating(first.visit, command(), db.hash);
  const id = randomUUID();
  const result = await Promise.all([db.repo.recordRating(first.visit, command(2, 1, id), db.hash), db.repo.recordPrivateFeedback(first.visit, privateCommand(1, 'private', id), db.hash)]);
  expect(result.filter(r => r.kind === 'applied')).toHaveLength(1);
  expect(result.filter(r => r.kind === 'rejected')).toEqual([{ kind: 'rejected', code: 'INTENT_CONFLICT' }]);
  // Explicit-column copy tests the shared PK, independent of the operation discriminator.
  await expect(db.pool.query(`INSERT INTO rating_intent_receipts
    (shop_id,scope,entry_key,session_id,visit_id,intent_id,expected_revision,score,applied_revision,first_interaction_at,applied_at,operation)
    SELECT shop_id,scope,entry_key,session_id,visit_id,intent_id,expected_revision,score,applied_revision,first_interaction_at,applied_at,'rating'
    FROM rating_intent_receipts WHERE intent_id=$1`, [id])).rejects.toMatchObject({ code: '23505' });
});

test('private expiry and closed-session replay preserve activity and context/capability isolation', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context, 'first', 'load', db.hash); await db.repo.recordRating(first.visit, command(), db.hash);
  db.setTime(1); const intent = privateCommand(); await db.repo.recordPrivateFeedback(first.visit, intent, db.hash);
  db.setTime(IDLE_WINDOW_MS + 1);
  expect(await db.repo.recordPrivateFeedback(first.visit, privateCommand(2), db.hash)).toEqual({ kind: 'rejected', code: 'SESSION_EXPIRED' });
  const resumed = await db.repo.registerVisit(db.context, 'resume', 'resume', db.hash);
  expect(await db.repo.recordPrivateFeedback(resumed.visit, privateCommand(0, 'new session'), db.hash)).toMatchObject({ kind: 'applied', experience: { rating: null, revision: 1 } });
  expect(await db.repo.recordPrivateFeedback(first.visit, intent, db.hash)).toMatchObject({ kind: 'replayed' });
  for (const context of [{ ...first.visit, shopId: db.otherShopId }, { ...first.visit, scope: 'test' as const }, { ...first.visit, entryKey: 'other' }, { ...first.visit, visitId: randomUUID() }]) {
    expect(await db.repo.recordPrivateFeedback(context, intent, db.hash)).toEqual({ kind: 'rejected', code: 'CONTEXT_MISMATCH' });
  }
  expect(await db.repo.recordPrivateFeedback(first.visit, intent, 'b'.repeat(64))).toEqual({ kind: 'rejected', code: 'CONTEXT_MISMATCH' });
  expect((await db.pool.query('SELECT last_activity FROM visit_sessions WHERE id=$1', [first.session.sessionId])).rows[0].last_activity.toISOString()).toBe(iso(1));
});

test('feedback receipt failure rolls back snapshot, revision and activity, including update', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context, 'first', 'load', db.hash); await db.repo.recordRating(first.visit, command(), db.hash);
  await db.pool.query(`CREATE FUNCTION fail_private() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.intent_id='fail-private' THEN RAISE EXCEPTION 'private receipt failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_private BEFORE INSERT ON rating_intent_receipts FOR EACH ROW EXECUTE FUNCTION fail_private();`);
  db.setTime(1);
  await expect(db.repo.recordPrivateFeedback(first.visit, privateCommand(1, 'first', 'fail-private'), db.hash)).rejects.toThrow('private receipt failure');
  expect((await db.pool.query('SELECT revision::int,feedback_message FROM rating_experiences')).rows[0]).toEqual({ revision: 1, feedback_message: null });
  await db.repo.recordPrivateFeedback(first.visit, privateCommand(1, 'original'), db.hash);
  db.setTime(2);
  await expect(db.repo.recordPrivateFeedback(first.visit, privateCommand(2, 'edit', 'fail-private'), db.hash)).rejects.toThrow('private receipt failure');
  expect((await db.pool.query('SELECT revision::int,feedback_message FROM rating_experiences')).rows[0]).toEqual({ revision: 2, feedback_message: 'original' });
  expect((await db.pool.query('SELECT last_activity FROM visit_sessions')).rows[0].last_activity.toISOString()).toBe(iso(1));
});

test('private Unicode validation/codepoint storage and guarded rollback preserve001', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context, 'first', 'load', db.hash); await db.repo.recordRating(first.visit, command(), db.hash);
  expect(await db.repo.recordPrivateFeedback(first.visit, privateCommand(1, '😀'.repeat(2001)), db.hash)).toEqual({ kind: 'rejected', code: 'INVALID_INPUT' });
  expect(await db.repo.recordPrivateFeedback(first.visit, privateCommand(1, '😀'.repeat(2000)), db.hash)).toMatchObject({ kind: 'applied' });
  expect((await db.pool.query('SELECT char_length(feedback_message) AS n FROM rating_experiences')).rows[0].n).toBe(2000);
  await expect(db.pool.query('UPDATE rating_experiences SET feedback_topic=NULL')).rejects.toMatchObject({ code: '23514' });
  const client = await db.pool.connect();
  try { await client.query('BEGIN'); await expect(client.query(await readFile('db/rollback/002_visit_ratings.sql', 'utf8'))).rejects.toThrow('V2_DATA_PRESENT'); }
  finally { await client.query('ROLLBACK'); client.release(); }
  expect((await db.pool.query('SELECT message,revision::int FROM experiences WHERE id=$1', [db.legacyId])).rows[0]).toEqual({ message: 'preserve me', revision: 7 });
});

test('a call-back number is stored with its feedback, checked by the database, and guards rollback 011', async ({ db }) => {
  const first = await db.repo.registerVisit(db.context, 'first', 'load', db.hash);
  expect(await db.repo.recordPrivateFeedback(first.visit, { ...privateCommand(0, 'gọi tôi'), phone: '0961 036 265' }, db.hash))
    .toMatchObject({ kind: 'applied', experience: { rating: null, feedback: { message: 'gọi tôi', phone: '0961036265' } } });
  expect((await db.pool.query('SELECT feedback_phone FROM rating_experiences')).rows).toEqual([{ feedback_phone: '0961036265' }]);
  expect((await db.pool.query('SELECT feedback_phone FROM rating_intent_receipts')).rows).toEqual([{ feedback_phone: '0961036265' }]);
  // A star later keeps the number with the feedback; a feedback edit without a number clears it.
  await db.repo.recordRating(first.visit, command(2, 1), db.hash);
  expect((await db.pool.query('SELECT rating,feedback_phone FROM rating_experiences')).rows).toEqual([{ rating: 2, feedback_phone: '0961036265' }]);
  await db.repo.recordPrivateFeedback(first.visit, privateCommand(2, 'thôi khỏi gọi'), db.hash);
  expect((await db.pool.query('SELECT feedback_phone FROM rating_experiences')).rows).toEqual([{ feedback_phone: null }]);
  expect(await db.repo.recordPrivateFeedback(first.visit, { ...privateCommand(3), phone: 'abc' }, db.hash)).toEqual({ kind: 'rejected', code: 'INVALID_INPUT' });
  await expect(db.pool.query("UPDATE rating_experiences SET feedback_phone='12'")).rejects.toMatchObject({ code: '23514' });
  const down = await readFile('db/rollback/011_feedback_phone.sql', 'utf8'), client = await db.pool.connect();
  try {
    await client.query('BEGIN'); await expect(client.query(down)).rejects.toThrow('FEEDBACK_PHONE_PRESENT'); await client.query('ROLLBACK');
  } finally { client.release(); }
  const empty = await db.pool.connect();
  try {
    await empty.query('BEGIN'); await empty.query('DELETE FROM rating_intent_receipts'); await empty.query('DELETE FROM rating_experiences');
    await empty.query(down);
    expect((await empty.query("SELECT count(*)::int n FROM information_schema.columns WHERE column_name='feedback_phone' AND table_schema=current_schema()")).rows[0].n).toBe(0);
  } finally { await empty.query('ROLLBACK'); empty.release(); }
});
