import {test as base,expect} from '@playwright/test';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ownerFixture,addExperience} from './owner-fixture';
import {OwnerDashboard} from '../lib/owner/dashboard';
import {sessionHash} from '../lib/owner/auth';
import {parseFilters} from '../lib/owner/filters';
import {exportStream} from '../lib/owner/export';
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const test=base.extend<{f:Awaited<ReturnType<typeof ownerFixture>>}>({f:async({},provideFixture)=>{
 const schema=`nfc_owner_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);for(const file of ['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql'])await db.query(await readFile(`db/migrations/${file}`,'utf8'));
 await provideFixture(await ownerFixture(db));}finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const filters=()=>parseFilters(new URLSearchParams());
test('real password login, opaque hash, rotation/logout/expiry/disabled membership and cross-tenant boundaries',async({f})=>{
 const a=f.users[0],auth=f.auth,dashboard=new OwnerDashboard(f.db);
 await expect(auth.bootstrap('not-authorized','valid-password-for-fixture',async()=>{throw Error('DENIED');})).rejects.toThrow('DENIED');
 await expect(auth.bootstrap('bad-password','short',async()=>{})).rejects.toThrow('INVALID_CREDENTIAL');await addExperience(f.db);await addExperience(f.db,'two');
 const stored=(await f.db.query('SELECT token_hash FROM owner_auth_sessions_v2 WHERE user_id=$1',[a.id])).rows[0];expect(stored.token_hash).toBe(sessionHash(a.token));expect(stored.token_hash).not.toBe(a.token);
 await expect(auth.login(a.username,'incorrect-password')).rejects.toThrow('LOGIN_FAILED');await expect(auth.login('unknown-user','incorrect-password')).rejects.toThrow('LOGIN_FAILED');
 await expect(dashboard.read(a.token,'two',filters())).rejects.toThrow('ACCESS_DENIED');
 const second=await auth.login(a.username,a.password,a.token);expect(second.token).not.toBe(a.token);await expect(auth.access(a.token,'one','overview')).rejects.toThrow('LOGIN_REQUIRED');
 await f.db.query('UPDATE owner_memberships_v2 SET active=false WHERE user_id=$1',[a.id]);await expect(dashboard.read(second.token,'one',filters())).rejects.toThrow('ACCESS_DENIED');
 await f.db.query('UPDATE owner_memberships_v2 SET active=true WHERE user_id=$1',[a.id]);await auth.logout(second.token);await expect(auth.access(second.token,'one','overview')).rejects.toThrow('LOGIN_REQUIRED');
 const third=await auth.login(a.username,a.password);await f.db.query("UPDATE owner_auth_sessions_v2 SET created_at=clock_timestamp()-interval '9 hours',expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",[sessionHash(third.token)]);
 await expect(auth.access(third.token,'one','overview')).rejects.toThrow('LOGIN_REQUIRED');
 await f.db.query('UPDATE owner_identities_v2 SET active=false WHERE id=$1',[f.users[1].id]);await expect(auth.access(f.users[1].token,'two','overview')).rejects.toThrow('LOGIN_REQUIRED');
});
test('DB-backed login throttling is generic and attempts survive failed authentication',async({f})=>{
 for(let i=0;i<8;i++)await expect(f.auth.login(f.users[0].username,'wrong-password')).rejects.toThrow('LOGIN_FAILED');
 await expect(f.auth.login(f.users[0].username,f.users[0].password)).rejects.toThrow('LOGIN_FAILED');
 expect((await f.db.query('SELECT max(attempts) n FROM owner_login_limits')).rows[0].n).toBeGreaterThan(8);
});
test('live cohort metrics/date boundaries, filters and source attribution exclude preview and other tenant',async({f})=>{
 const before=new Date('2026-09-12T16:59:59.999Z'),start=new Date('2026-09-12T17:00:00Z'),last=new Date('2026-09-13T16:59:59.999Z'),after=new Date('2026-09-13T17:00:00Z');
 for(const at of [before,start,last,after])await addExperience(f.db,'one',2,'Private date fixture',at);
 await addExperience(f.db,'two',5,'Other tenant',start);
 const snapshot=await f.admin.preview(f.shops[0],{kind:'draft',revision:2});
 const {PublishingResolver}=await import('../lib/publishing/repository');const c=(await new PublishingResolver(f.db).preview(snapshot.token)).context;
 const {VisitRatingRepository}=await import('../lib/repositories/visit-ratings');const {publishingVisitPolicy}=await import('../lib/publishing/visit-policy');
 const repo=new VisitRatingRepository(f.db,()=>start,publishingVisitPolicy(c,snapshot.token)),hash=randomBytes(32).toString('hex'),v=await repo.registerVisit(c,randomUUID(),'load',hash);
 await repo.recordRating({...c,visitId:v.visit.visitId},{intentId:randomUUID(),expectedRevision:0,score:5},hash);
 const filter=parseFilters(new URLSearchParams('from=2026-09-13&to=2026-09-13&source=direct&rating=2&status=new'));
 const result=await new OwnerDashboard(f.db).read(f.users[0].token,'one',filter);
 expect(result.metrics).toMatchObject({opens:'2',sessions:'2',rated:'2',average:'2.00',feedback:'2'});expect(result.metrics).not.toHaveProperty('unresolved');expect(result.records).toHaveLength(2);
 const filtered=await new OwnerDashboard(f.db).read(f.users[0].token,'one',{...filter,release:result.records[0].release_id!});expect(filtered.records).toHaveLength(2);
 expect(JSON.stringify(result)).not.toMatch(/browser_hash|token_hash|password|proof/);
});
test('feedback without a star counts as feedback, not as a rating, and exports its rating as null',async({f})=>{
 const at=new Date('2026-09-13T03:00:00Z');
 await addExperience(f.db,'one',4,null,at);const unrated=await addExperience(f.db,'one',null,'Không chấm sao',at,'0961036265');
 const dashboard=new OwnerDashboard(f.db),range='from=2026-09-13&to=2026-09-13';
 const all=await dashboard.read(f.users[0].token,'one',parseFilters(new URLSearchParams(range)));
 expect(all.metrics).toMatchObject({opens:'2',sessions:'2',rated:'1',average:'4.00',feedback:'1'});
 const row=all.records.find(r=>r.session_id===unrated.session.sessionId)!;
 expect(row).toMatchObject({rating:null,message:'Không chấm sao',phone:'0961036265',status:'new',experience_revision:'1'});
 expect(row.origin_release_id).toBe(row.release_id);expect(row.origin_release_id).not.toBeNull();
 expect((await dashboard.read(f.users[0].token,'one',parseFilters(new URLSearchParams(`${range}&rating=4`)))).records).toHaveLength(1);
 expect((await dashboard.read(f.users[0].token,'one',parseFilters(new URLSearchParams(`${range}&status=new`)))).records.map(r=>r.session_id)).toEqual([unrated.session.sessionId]);
 await expect(dashboard.update(f.users[0].token,'one',{sessionId:unrated.session.sessionId,expectedCaseRevision:0,expectedExperienceRevision:'1',status:'resolved',note:''})).resolves.toMatchObject({saved:true});
 const read=async(dataset:'experiences'|'receipts')=>{const reader=(await exportStream(f.db,f.users[0].token,'one',parseFilters(new URLSearchParams(range)),dataset,'jsonl',new AbortController().signal)).getReader();let text='';
  while(true){const part=await reader.read();if(part.done)break;text+=new TextDecoder().decode(part.value);}return text.trim().split('\n').map(line=>JSON.parse(line));};
 expect((await read('experiences')).find(r=>r.session_id===unrated.session.sessionId)).toMatchObject({rating:null,message:'Không chấm sao',phone:'0961036265'});
 expect((await read('receipts')).filter(r=>r.session_id===unrated.session.sessionId)).toEqual([expect.objectContaining({operation:'feedback',rating:null,phone:'0961036265'})]);
 const {dictionary}=await import('../lib/owner/export');
 expect(dictionary('experiences').fields.find(x=>x.name==='rating')).toMatchObject({nullable:true});
});
test('the summary carries period totals, seven days and the account\'s shops (no processing status since lát F4); rows load only on read',async({f})=>{
 const today=new Date(),yesterday=new Date(Date.now()-86400000),longAgo=new Date(Date.now()-20*86400000),older=new Date(Date.now()-40*86400000);
 await addExperience(f.db,'one',5,null,today);await addExperience(f.db,'one',4,'Hôm nay',today);await addExperience(f.db,'one',null,'Góp ý',yesterday);
 await addExperience(f.db,'one',3,null,longAgo);await addExperience(f.db,'one',2,null,older);await addExperience(f.db,'two',5,null,today);
 const dashboard=new OwnerDashboard(f.db),a=f.users[0];
 const summary=await dashboard.summary(a.token,'one');
 expect(summary).not.toHaveProperty('records');
 expect(summary.account).toBe(a.username);
 expect(summary.totals).toEqual({today:{opens:2,sessions:2,private:2,messages:1},week:{opens:3,sessions:3,private:3,messages:2},month:{opens:4,sessions:4,private:4,messages:2}});
 // Seven days, oldest first, every day present even when nothing happened, and only this shop's live opens.
 expect(summary.daily).toHaveLength(7);
 expect(summary.daily.map(d=>d.day)).toEqual([...summary.daily].sort((x,y)=>x.day.localeCompare(y.day)).map(d=>d.day));
 expect(summary.daily.at(-1)).toMatchObject({opens:2,sessions:2,private:2});
 expect(summary.daily.at(-2)).toMatchObject({opens:1,sessions:1,private:1});
 expect(summary.daily.filter(d=>d.opens===0)).toHaveLength(5);
 const read=await dashboard.read(a.token,'one',parseFilters(new URLSearchParams(`from=${new Date(Date.now()+7*3600000).toISOString().slice(0,10)}&to=${new Date(Date.now()+7*3600000).toISOString().slice(0,10)}`)));
 expect(read.sources).toEqual([{label:'Trực tiếp',sessions:2}]);expect(read.records).toHaveLength(2);
 // The account sees the shops it may switch between; a stand-in administrator sees only the shop it was let into.
 await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'manager')",[a.id,f.shops[1]]);
 expect((await dashboard.summary(a.token,'one')).shops.map(s=>s.slug).sort()).toEqual(['one','two']);
 await f.db.query('UPDATE owner_memberships_v2 SET active=false WHERE user_id=$1 AND shop_id=$2',[a.id,f.shops[1]]);
 expect((await dashboard.summary(a.token,'one')).shops.map(s=>s.slug)).toEqual(['one']);
});
test('changing the password: needs the current one, a long new one, signs out other sessions and keeps this one',async({f})=>{
 const a=f.users[0],auth=f.auth,next='a-brand-new-long-password';
 const other=await auth.login(a.username,a.password);
 await expect(auth.changePassword(a.token,'wrong-current-password',next)).rejects.toThrow('WRONG_PASSWORD');
 await expect(auth.changePassword(a.token,a.password,'short')).rejects.toThrow('WEAK_PASSWORD');
 await expect(auth.changePassword(a.token,a.password,a.password)).rejects.toThrow('SAME_PASSWORD');
 await expect(auth.changePassword(a.token,a.password,'x'.repeat(257))).rejects.toThrow('WEAK_PASSWORD');
 await expect(auth.changePassword(undefined,a.password,next)).rejects.toThrow('LOGIN_REQUIRED');
 await expect(auth.changePassword({impersonation:'a'.repeat(64)},a.password,next)).rejects.toThrow('IMPERSONATION_READ_ONLY');
 await expect(auth.changePassword(a.token,a.password,next)).resolves.toEqual({changed:true});
 await expect(auth.access(a.token,'one','overview')).resolves.toBeTruthy();
 await expect(auth.access(other.token,'one','overview')).rejects.toThrow('LOGIN_REQUIRED');
 await expect(auth.login(a.username,a.password)).rejects.toThrow('LOGIN_FAILED');
 await expect(auth.login(a.username,next)).resolves.toMatchObject({token:expect.any(String)});
 // Guessing the current password through this screen counts against the same limit as signing in: the two sign-ins
 // just above already used two of the eight attempts in this window.
 for(let i=0;i<6;i++)await expect(auth.changePassword(a.token,`guess-number-${i}-wrong`,'yet-another-long-password')).rejects.toThrow('WRONG_PASSWORD');
 await expect(auth.changePassword(a.token,next,'yet-another-long-password')).rejects.toThrow('TOO_MANY_ATTEMPTS');
});
test('case CAS concurrent actors, audit immutability, feedback revision conflict and automatic reopening',async({f})=>{
 const x=await addExperience(f.db),dashboard=new OwnerDashboard(f.db),a=f.users[0],b=f.users[1];
 await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'manager')",[b.id,f.shops[0]]);
 const input={sessionId:x.session.sessionId,expectedCaseRevision:0,expectedExperienceRevision:'2',status:'resolved',note:'=1+1'};
 const outcomes=await Promise.allSettled([dashboard.update(a.token,'one',input),dashboard.update(b.token,'one',{...input,note:'other'})]);expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
 expect((await f.db.query('SELECT count(*)::int n FROM owner_feedback_audit')).rows[0].n).toBe(1);
 await expect(f.db.query("UPDATE owner_feedback_audit SET note='changed'")).rejects.toThrow('IMMUTABLE');
 await x.repo.recordPrivateFeedback({...x.context,visitId:x.visit.visitId},{intentId:randomUUID(),expectedRevision:2,topic:'other',message:'New feedback'},x.hash);
 await expect(dashboard.update(a.token,'one',{...input,expectedCaseRevision:1})).rejects.toThrow('CASE_CONFLICT');
 expect((await dashboard.read(a.token,'one',filters())).records[0].status).toBe('new');
 await expect(dashboard.update(a.token,'two',input)).rejects.toThrow('ACCESS_DENIED');
});
test('stable microsecond keyset and bounded JSONL cursor, abort/revoke releases connections',async({f})=>{
 const x=await addExperience(f.db,'one',4,null),at=new Date().toISOString();
 // Fixture bulk SQL creates distinct valid foundation sessions, all in a single selected date window.
 await f.db.query(`WITH ids AS (SELECT gen_random_uuid() id,n FROM generate_series(1,600)n),s AS (
 INSERT INTO visit_sessions(id,shop_id,scope,entry_key,browser_hash,started_at,last_activity) SELECT id,$1,'live','direct:shop',lpad(n::text,64,'0'),$2::timestamptz,$2::timestamptz FROM ids RETURNING id)
 INSERT INTO page_visits(id,shop_id,scope,entry_key,session_id,load_key,navigation_kind,opened_at) SELECT gen_random_uuid(),$1,'live','direct:shop',id,id::text,'load',$2 FROM s`,[f.shops[0],at]);
 await f.db.query(`INSERT INTO rating_experiences(session_id,shop_id,scope,entry_key,rating,revision,first_interaction_at,updated_at)
 SELECT id,shop_id,scope,entry_key,4,1,$2::timestamptz+sequence*interval '1 microsecond',$2 FROM visit_sessions WHERE shop_id=$1 AND id<>$3`,[f.shops[0],at,x.session.sessionId]);
 const dashboard=new OwnerDashboard(f.db),first=await dashboard.read(f.users[0].token,'one',filters());expect(first.records).toHaveLength(50);expect(first.nextCursor).toBeTruthy();
 const next=await dashboard.read(f.users[0].token,'one',parseFilters(new URLSearchParams({cursor:first.nextCursor!})));expect(next.records).toHaveLength(50);expect(next.records.some(r=>first.records.some(a=>a.session_id===r.session_id))).toBe(false);
 const full=await exportStream(f.db,f.users[0].token,'one',filters(),'experiences','jsonl',new AbortController().signal),fullReader=full.getReader();let total=0,chunkCount=0;
 while(true){const part=await fullReader.read();if(part.done)break;const batch=new TextDecoder().decode(part.value).trim().split('\n');expect(batch.length).toBeLessThanOrEqual(256);total+=batch.length;chunkCount++;}
 expect(total).toBe(601);expect(chunkCount).toBe(3);
 const abort=new AbortController(),stream=await exportStream(f.db,f.users[0].token,'one',filters(),'experiences','jsonl',abort.signal),reader=stream.getReader();
 const chunk=await reader.read();const lines=new TextDecoder().decode(chunk.value).trim().split('\n');expect(lines).toHaveLength(256);expect(JSON.parse(lines[0]).schemaVersion).toBe('nfc-owner-export-v1');
 await f.auth.logout(f.users[0].token);await expect(reader.read()).rejects.toThrow('Export interrupted');
 const second=await exportStream(f.db,f.users[1].token,'two',filters(),'page_visits','jsonl',new AbortController().signal);await second.cancel();
 expect((await f.db.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction' AND query LIKE 'FETCH FORWARD%' ")).rows[0].n).toBe(0);
});
test('CSV/JSONL export enforce membership, suspend and dictionary-independent scope',async({f})=>{
 await addExperience(f.db,'one',2,'=SUM(1,2)');
 await expect(exportStream(f.db,f.users[0].token,'two',filters(),'experiences','csv',new AbortController().signal)).rejects.toThrow('ACCESS_DENIED');
 const stream=await exportStream(f.db,f.users[0].token,'one',filters(),'experiences','csv',new AbortController().signal),text=await new Response(stream).text();
 expect(text).toContain('"\'=SUM(1,2)"');expect(text).not.toMatch(/password|browser_hash|token_hash/);
 await f.admin.setShopState(f.shops[0],'suspended');await expect(new OwnerDashboard(f.db).read(f.users[0].token,'one',filters())).rejects.toThrow('ACCESS_DENIED');
});

test('stream abort, database failure, export concurrency and guarded rollback release resources',async({f})=>{
 await addExperience(f.db);
 const controller=new AbortController(),stream=await exportStream(f.db,f.users[0].token,'one',filters(),'experiences','jsonl',controller.signal),reader=stream.getReader();await reader.read();
 await expect(exportStream(f.db,f.users[0].token,'one',filters(),'experiences','jsonl',new AbortController().signal)).rejects.toThrow('EXPORT_BUSY');
 controller.abort();await expect(reader.read()).rejects.toThrow('Export interrupted');
 const broken=await exportStream(f.db,f.users[0].token,'one',filters(),'experiences','jsonl',new AbortController().signal),r=broken.getReader();await r.read();
 await f.db.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=current_setting('application_name') AND pid<>pg_backend_pid() AND state='idle in transaction' AND query='FETCH FORWARD 256 FROM owner_export'");
 await expect(r.read()).rejects.toThrow();
 const sql=await readFile('db/rollback/004_owner_dashboard.sql','utf8');const db=await f.db.connect();try{await expect(db.query(`BEGIN;${sql}COMMIT;`)).rejects.toThrow('OWNER_DATA_EXISTS');await db.query('ROLLBACK');}finally{db.release();}
});

test('two slow export cursors cannot consume the separate authorization pool',async({f})=>{
 await addExperience(f.db);await addExperience(f.db,'two');
 const schema=(await f.db.query('SELECT current_schema() s')).rows[0].s;
 const cursors=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:2,connectionTimeoutMillis:500});
 let first:ReadableStream<Uint8Array>|undefined,second:ReadableStream<Uint8Array>|undefined;
 try{
 first=await exportStream(f.db,f.users[0].token,'one',filters(),'experiences','jsonl',new AbortController().signal,cursors);
 second=await exportStream(f.db,f.users[1].token,'two',filters(),'experiences','jsonl',new AbortController().signal,cursors);
 expect((await f.auth.access(f.users[0].token,'one','overview')).shopId).toBe(f.shops[0]);
 const readers=[first.getReader(),second.getReader()];const chunks=await Promise.all(readers.map(r=>r.read()));expect(chunks.every(c=>!!c.value)).toBe(true);
 await Promise.all(readers.map(r=>r.cancel()));
 }finally{await cursors.end();}
});

/**
 * Flood control on the guest page marks a session; the shop's numbers leave it out until the shop asks to see it
 * (lát A1, Tài 2026-09-20 chose keeping the answer over turning the customer away). One mark has to take the
 * session's touches, its star and its words out together, which is why the mark sits on the session.
 */
test('a marked session is out of every number until the shop asks for it, and says why when it comes back',async({f})=>{
 const real=await addExperience(f.db,'one',5,'Khách thật viết');
 const bot=await addExperience(f.db,'one',1,'Bot viết');
 await f.db.query("UPDATE visit_sessions SET suspected_at=clock_timestamp(),suspected_reason='too_fast' WHERE id=$1",[bot.session.sessionId]);
 const dashboard=new OwnerDashboard(f.db),token=f.users[0].token;
 const hidden=await dashboard.read(token,'one',filters());
 expect(hidden.records.map(r=>r.message)).toEqual(['Khách thật viết']);
 // Touches, sessions, stars and words: the marked one is out of all of them, and the star average is not dragged down.
 expect(hidden.metrics).toMatchObject({opens:'1',sessions:'1',rated:'1',average:'5.00',feedback:'1',suspected:'1'});
 // The light summary answers "how has the week gone", so it is always the shop's real customers.
 const summary=await dashboard.summary(token,'one');
 expect(summary.totals.today).toMatchObject({opens:1,sessions:1,private:1,messages:1});
 expect(summary.daily.at(-1)).toMatchObject({opens:1,sessions:1,private:1});

 const shown=await dashboard.read(token,'one',parseFilters(new URLSearchParams('suspected=show')));
 expect(shown.records.map(r=>[r.message,r.suspected]).sort()).toEqual([['Bot viết','too_fast'],['Khách thật viết',null]]);
 const only=await dashboard.read(token,'one',parseFilters(new URLSearchParams('suspected=only')));
 expect(only.records.map(r=>[r.message,r.suspected])).toEqual([['Bot viết','too_fast']]);
 expect(only.metrics).toMatchObject({opens:'1',sessions:'1',average:'1.00'});
 // Nothing was deleted: the shop can still reach what was filtered, and the real session was never touched.
 expect((await f.db.query('SELECT count(*)::int n FROM rating_experiences')).rows[0].n).toBe(2);
 expect((await f.db.query('SELECT suspected_at FROM visit_sessions WHERE id=$1',[real.session.sessionId])).rows[0].suspected_at).toBeNull();
 // parseFilters throws before read is ever called, so this is a synchronous expectation, not a rejected promise.
 expect(()=>parseFilters(new URLSearchParams('suspected=maybe'))).toThrow('INVALID_FILTER');
});
