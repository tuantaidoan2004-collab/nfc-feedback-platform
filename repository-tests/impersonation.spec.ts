import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {ownerFixture,addExperience,enrolAdmin} from './owner-fixture';
import {AdminAuth,adminSessionHash} from '../lib/admin/auth';
import {AdminImpersonation} from '../lib/admin/impersonation';
import {OwnerDashboard} from '../lib/owner/dashboard';
import {exportStream} from '../lib/owner/export';
import {parseFilters} from '../lib/owner/filters';
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
type Fixture=Awaited<ReturnType<typeof ownerFixture>>&{adminId:string;adminToken:string;admins:AdminAuth;imp:AdminImpersonation};
const test=base.extend<{f:Fixture}>({f:async({},provide)=>{
 const schema=`nfc_imp_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  await applySchema(db);
  const base=await ownerFixture(db),admins=new AdminAuth(db);
  const adminId=await admins.bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  const adminToken=(await admins.login('operator','a-sufficiently-long-admin-secret')).token;await enrolAdmin(db,'operator');
  await provide({...base,adminId,adminToken,admins,imp:new AdminImpersonation(db)});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const filters=()=>parseFilters(new URLSearchParams());
const reason='Shop nhờ kiểm vì sao góp ý không hiện';
const open=async(f:Fixture,scope:'overview'|'feedback'|'design',shop=0,why=reason)=>{
 const opened=await f.imp.start(f.adminToken,{shopId:f.shops[shop],ownerUserId:f.users[shop].id,scope,reason:why});
 return {...opened,credential:{impersonation:opened.token}};
};
const audit=async(f:Fixture,action:string)=>(await f.db.query('SELECT actor_id,shop_id,on_behalf_of,detail FROM admin_audit WHERE action=$1 ORDER BY id',[action])).rows;
// The owner's switch, moved the way the owner moves it.
const allow=(f:Fixture,enabled:boolean,shop=0)=>new OwnerDashboard(f.db).setSupport(f.users[shop].token,['one','two'][shop],{level:enabled?'view':'off'});
const position=(f:Fixture,level:string,shop=0)=>new OwnerDashboard(f.db).setSupport(f.users[shop].token,['one','two'][shop],{level});
const exports=['experiences','page_visits','receipts'] as const;

test('design: a session for editing the page never reads the customer\'s words through the overview route',async({f})=>{
 // F-010 (Astra, 20/09): `read` asks authorize for 'overview', which a design session passes, so the words came back
 // although the very same session is refused at the feedback door. Both switch positions that open a design session.
 await addExperience(f.db,'one',2,'Bí mật của khách',undefined,'0961036265');
 const dashboard=new OwnerDashboard(f.db);
 // Position 2 ('edit') closes the overview route to support outright, so only position 3 ever reached the rows.
 await position(f,'edit');
 const editing=await open(f,'design');
 await expect(dashboard.read(editing.credential,'one',filters())).rejects.toThrow('SUPPORT_NOT_GRANTED');

 await position(f,'full');
 const s=await open(f,'design');
 await expect(f.auth.access(s.credential,'one','feedback')).rejects.toThrow('IMPERSONATION_SCOPE');
 const read=await dashboard.read(s.credential,'one',filters());
 expect(read.records[0]).toMatchObject({topic:null,message:null,phone:null,note:'',rating:2});
 expect(JSON.stringify(read)).not.toMatch(/Bí mật|0961036265/);
 // The record of the visit must not claim words were shown when they were not.
 expect((await audit(f,'impersonation.read')).at(-1)).toMatchObject({detail:{scope:'design',feedbackShown:false}});

 // The feedback session, at the same switch position, is the one scope that may read; it still does.
 const reading=await open(f,'feedback');
 expect((await dashboard.read(reading.credential,'one',filters())).records[0]).toMatchObject({message:'Bí mật của khách',phone:null});
});

test('overview: needs no permission, feedback text is removed on the server, every export and every write is refused',async({f})=>{
 const x=await addExperience(f.db,'one',2,'Bí mật của khách',undefined,'0961036265');
 const dashboard=new OwnerDashboard(f.db);
 await dashboard.update(f.users[0].token,'one',{sessionId:x.session.sessionId,expectedCaseRevision:0,expectedExperienceRevision:'2',status:'progress',note:'Ghi chú của chủ'});
 // The switch is off: overview still opens.
 const s=await open(f,'overview');

 const read=await dashboard.read(s.credential,'one',filters());
 expect(read.viewer).toMatchObject({kind:'admin',admin:'operator',scope:'overview',reason});
 // Support state and visits live in the light summary; reading it as a stand-in counts as a read too.
 expect((await dashboard.summary(s.credential,'one')).support).toEqual({level:'off',feedback:false,history:[]});
 expect(read.records).toHaveLength(1);
 expect(read.records[0]).toMatchObject({topic:null,message:null,phone:null,note:'',status:'progress',rating:2});
 expect(JSON.stringify(read)).not.toMatch(/Bí mật|Ghi chú của chủ|0961036265/);
 expect(read.metrics.feedback).toBe('1');

 for(const dataset of exports)
  await expect(exportStream(f.db,s.credential,'one',filters(),dataset,'csv',new AbortController().signal)).rejects.toThrow('IMPERSONATION_NO_EXPORT');
 // The dictionary route asks this same question before answering.
 await expect(f.auth.access(s.credential,'one','export')).rejects.toThrow('IMPERSONATION_NO_EXPORT');
 await expect(f.auth.access(s.credential,'one','feedback')).rejects.toThrow('IMPERSONATION_SCOPE');

 await expect(dashboard.update(s.credential,'one',{sessionId:x.session.sessionId,expectedCaseRevision:1,expectedExperienceRevision:'2',status:'resolved',note:'Sửa hộ'}))
  .rejects.toThrow('IMPERSONATION_READ_ONLY');
 expect((await f.db.query('SELECT status,note,revision,actor_id FROM owner_feedback_cases')).rows).toEqual([{status:'progress',note:'Ghi chú của chủ',revision:1,actor_id:f.users[0].id}]);
 expect((await f.db.query('SELECT count(*)::int n FROM owner_feedback_audit')).rows[0].n).toBe(1);
});

test('feedback: only while the owner allows it, never exports, read-only, one audit line per request',async({f})=>{
 for(let i=0;i<3;i++)await addExperience(f.db,'one',i+1,`Góp ý số ${i}`);
 await addExperience(f.db,'two',5,'Shop khác');
 const dashboard=new OwnerDashboard(f.db);
 await expect(open(f,'feedback')).rejects.toThrow('SUPPORT_NOT_GRANTED');
 // Another shop's switch opens nothing here.
 await allow(f,true,1);
 await expect(open(f,'feedback')).rejects.toThrow('SUPPORT_NOT_GRANTED');
 expect((await f.db.query('SELECT count(*)::int n FROM admin_impersonation_sessions')).rows[0].n).toBe(0);

 await allow(f,true);
 const s=await open(f,'feedback');
 for(let i=0;i<2;i++){
  const read=await dashboard.read(s.credential,'one',filters());
  expect(read.records.map(r=>r.message).sort()).toEqual(['Góp ý số 0','Góp ý số 1','Góp ý số 2']);
 }
 // Two requests, two lines — not one per row.
 const reads=await audit(f,'impersonation.read');
 expect(reads).toHaveLength(2);
 expect(reads.every(r=>r.actor_id===f.adminId&&r.shop_id===f.shops[0]&&r.on_behalf_of===f.users[0].id)).toBe(true);
 expect(reads[0].detail).toEqual({session:s.sessionId,scope:'feedback',rows:3,feedbackShown:true});

 // Permission to read is not permission to take: no dataset, no format.
 for(const dataset of exports)for(const format of ['csv','jsonl'] as const)
  await expect(exportStream(f.db,s.credential,'one',filters(),dataset,format,new AbortController().signal)).rejects.toThrow('IMPERSONATION_NO_EXPORT');
 await expect(f.auth.access(s.credential,'one','export')).rejects.toThrow('IMPERSONATION_NO_EXPORT');
 expect(await audit(f,'impersonation.export')).toEqual([]);

 const row=(await dashboard.read(s.credential,'one',filters())).records[0];
 await expect(dashboard.update(s.credential,'one',{sessionId:row.session_id,expectedCaseRevision:0,expectedExperienceRevision:row.experience_revision,status:'resolved',note:''}))
  .rejects.toThrow('IMPERSONATION_READ_ONLY');
 expect((await f.db.query('SELECT count(*)::int n FROM owner_feedback_cases')).rows[0].n).toBe(0);

 // Switched off mid-session: the very next request is refused, without waiting for the thirty minutes.
 await allow(f,false);
 await expect(dashboard.read(s.credential,'one',filters())).rejects.toThrow('SUPPORT_NOT_GRANTED');
 await expect(f.auth.access(s.credential,'one','overview')).rejects.toThrow('SUPPORT_NOT_GRANTED');
 // An overview session is untouched by the switch.
 const o=await open(f,'overview');
 await expect(dashboard.read(o.credential,'one',filters())).resolves.toBeTruthy();

 // The owner sees both visits, the reasons as written, and their own switching; reading adds nothing to the record.
 const before=(await f.db.query('SELECT count(*)::int n FROM admin_audit')).rows[0].n;
 const own=await dashboard.summary(f.users[0].token,'one');
 expect(own.viewer).toEqual({kind:'owner',role:'owner',permissions:['feedback','design','cards','members','activity','export']});
 expect(own.adminVisits.map(v=>({scope:v.scope,reason:v.reason,reads:v.reads,end:v.end_reason}))).toEqual([
  {scope:'overview',reason,reads:1,end:null},{scope:'feedback',reason,reads:3,end:'superseded'}]);
 expect(own.support.feedback).toBe(false);
 expect(own.support.history.map(h=>({level:h.level,by:h.by}))).toEqual([{level:'off',by:f.users[0].username},{level:'view',by:f.users[0].username}]);
 expect((await f.db.query('SELECT count(*)::int n FROM admin_audit')).rows[0].n).toBe(before);
 // The other shop's owner sees nothing of it.
 expect((await dashboard.summary(f.users[1].token,'two')).adminVisits).toEqual([]);
});

test('a session dies with its time limit, its administrator, and every condition the owner is held to',async({f})=>{
 await addExperience(f.db);
 await allow(f,true);
 const refused=async(code:string,change:()=>Promise<unknown>,restore:()=>Promise<unknown>=async()=>{})=>{
  const s=await open(f,'feedback');
  await expect(f.auth.access(s.credential,'one','overview')).resolves.toMatchObject({shopId:f.shops[0]});
  await change();
  await expect(f.auth.access(s.credential,'one','overview')).rejects.toThrow(code);
  await expect(new OwnerDashboard(f.db).read(s.credential,'one',filters())).rejects.toThrow(code);
  await restore();
 };
 // The table refuses edits, so the test lifts that guard for this one change and puts it back.
 await refused('IMPERSONATION_ENDED',async()=>{
  await f.db.query('ALTER TABLE admin_impersonation_sessions DISABLE TRIGGER admin_impersonation_immutable');
  // One clock reading: two clock_timestamp() calls differ by microseconds and can push the span past the 30-minute CHECK.
  await f.db.query("WITH t AS (SELECT clock_timestamp() n) UPDATE admin_impersonation_sessions SET created_at=t.n-interval '31 minutes',expires_at=t.n-interval '2 minutes' FROM t WHERE ended_at IS NULL");
  await f.db.query('ALTER TABLE admin_impersonation_sessions ENABLE TRIGGER admin_impersonation_immutable');
 });
 await refused('IMPERSONATION_ENDED',()=>f.db.query("WITH t AS (SELECT clock_timestamp() n) UPDATE admin_auth_sessions SET created_at=t.n-interval '5 hours',expires_at=t.n-interval '1 second' FROM t WHERE token_hash=$1",[adminSessionHash(f.adminToken)]),
  ()=>f.db.query("UPDATE admin_auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE token_hash=$1",[adminSessionHash(f.adminToken)]));
 await refused('IMPERSONATION_ENDED',()=>f.db.query('UPDATE platform_admins SET active=false'),()=>f.db.query('UPDATE platform_admins SET active=true'));
 await refused('ACCESS_DENIED',()=>f.db.query('UPDATE owner_identities_v2 SET active=false WHERE id=$1',[f.users[0].id]),
  ()=>f.db.query('UPDATE owner_identities_v2 SET active=true WHERE id=$1',[f.users[0].id]));
 await refused('ACCESS_DENIED',()=>f.db.query('UPDATE owner_memberships_v2 SET active=false WHERE user_id=$1',[f.users[0].id]),
  ()=>f.db.query('UPDATE owner_memberships_v2 SET active=true WHERE user_id=$1',[f.users[0].id]));
 await refused('ACCESS_DENIED',()=>f.admin.setShopState(f.shops[0],'suspended'),()=>f.admin.setShopState(f.shops[0],'active'));

 const s=await open(f,'feedback');
 // One shop only, and the token means nothing to the owner path or the owner token to this one.
 await expect(f.auth.access(s.credential,'two','overview')).rejects.toThrow('ACCESS_DENIED');
 await expect(f.auth.access(s.token,'one','overview')).rejects.toThrow('LOGIN_REQUIRED');
 await expect(f.auth.access({impersonation:f.users[0].token},'one','overview')).rejects.toThrow('IMPERSONATION_ENDED');
 await expect(f.auth.access({impersonation:undefined},'one','overview')).rejects.toThrow('IMPERSONATION_ENDED');
 await f.imp.endByToken(s.token);
 await expect(f.auth.access(s.credential,'one','overview')).rejects.toThrow('IMPERSONATION_ENDED');

 // Signing out of administration ends it too.
 const t=await open(f,'overview');
 await f.admins.logout(f.adminToken);
 await expect(f.auth.access(t.credential,'one','overview')).rejects.toThrow('IMPERSONATION_ENDED');
});

test('refuses to open for an unavailable owner or with an unusable reason, and writes nothing',async({f})=>{
 const count=async()=>(await f.db.query('SELECT (SELECT count(*) FROM admin_impersonation_sessions)::int s,(SELECT count(*) FROM admin_audit)::int a')).rows[0];
 const start=(input:Record<string,unknown>)=>f.imp.start(f.adminToken,{shopId:f.shops[0],ownerUserId:f.users[0].id,scope:'overview',reason,...input});
 for(const bad of [{reason:''},{reason:'quá ngắn'},{reason:'x'.repeat(201)},{reason:'hai\ndòng lý do ở đây'},{reason:'chuông ẩn trong lý do'},{reason:'ký tự điều khiển C1'},
   {reason:42},{scope:'all'},{scope:undefined},{shopId:'not-a-uuid'},{ownerUserId:f.users[0].id.toUpperCase()}])
  await expect(start(bad)).rejects.toThrow('INVALID_INPUT');
 // Owner of a different shop, and an owner who was switched off: refused through the owner gate.
 await expect(start({ownerUserId:f.users[1].id})).rejects.toThrow('OWNER_NOT_AVAILABLE');
 await f.db.query('UPDATE owner_identities_v2 SET active=false WHERE id=$1',[f.users[0].id]);
 await expect(start({})).rejects.toThrow('OWNER_NOT_AVAILABLE');
 await f.db.query('UPDATE owner_identities_v2 SET active=true WHERE id=$1',[f.users[0].id]);
 await expect(f.imp.start('0'.repeat(64),{shopId:f.shops[0],ownerUserId:f.users[0].id,scope:'overview',reason})).rejects.toThrow('ADMIN_LOGIN_REQUIRED');
 expect(await count()).toEqual({s:0,a:0});

 // The limits are inclusive, trimmed, and count characters rather than bytes.
 const longest='ý'.repeat(200),opened=await start({reason:`  ${longest}  `});
 expect((await f.db.query('SELECT reason,scope FROM admin_impersonation_sessions WHERE id=$1',[opened.sessionId])).rows[0]).toEqual({reason:longest,scope:'overview'});
 const minutes=(opened.expiresAt.getTime()-Date.now())/60_000;
 expect(minutes).toBeGreaterThan(29.9); expect(minutes).toBeLessThanOrEqual(30);
 expect((await audit(f,'impersonation.start'))[0]).toMatchObject({shop_id:f.shops[0],on_behalf_of:f.users[0].id,detail:{session:opened.sessionId,scope:'overview',reason:longest}});
});

test('one live session per administrator; closed sessions and reasons cannot be changed',async({f})=>{
 await allow(f,true);
 const a=await open(f,'feedback',0),b=await open(f,'overview',1);
 await expect(f.auth.access(a.credential,'one','overview')).rejects.toThrow('IMPERSONATION_ENDED');
 await expect(f.auth.access(b.credential,'two','overview')).resolves.toMatchObject({shopId:f.shops[1]});
 expect((await f.db.query('SELECT end_reason FROM admin_impersonation_sessions WHERE id=$1',[a.sessionId])).rows[0].end_reason).toBe('superseded');
 expect((await audit(f,'impersonation.end')).map(r=>r.detail)).toEqual([{session:a.sessionId,endReason:'superseded'}]);

 // Two starts at once are serialized, and exactly one survives.
 const both=await Promise.all([open(f,'overview',0,'Yêu cầu hỗ trợ thứ nhất'),open(f,'overview',1,'Yêu cầu hỗ trợ thứ hai')]);
 const live=(await f.db.query('SELECT id FROM admin_impersonation_sessions WHERE ended_at IS NULL')).rows;
 expect(live).toHaveLength(1);
 expect(both.map(x=>x.sessionId)).toContain(live[0].id);

 // The database refuses a second live row even if the code were bypassed.
 await expect(f.db.query(`INSERT INTO admin_impersonation_sessions(token_hash,admin_id,admin_session_hash,shop_id,owner_user_id,scope,reason,created_at,expires_at)
  SELECT repeat('a',64),admin_id,admin_session_hash,shop_id,owner_user_id,scope,reason,clock_timestamp(),clock_timestamp()+interval '1 minute'
  FROM admin_impersonation_sessions WHERE ended_at IS NULL`)).rejects.toThrow('admin_impersonation_one_live');
 // …and a session longer than thirty minutes, or a reason with a control character.
 const insert=(expires:string,why:string)=>f.db.query(`INSERT INTO admin_impersonation_sessions(token_hash,admin_id,admin_session_hash,shop_id,owner_user_id,scope,reason,created_at,expires_at,ended_at,end_reason)
  VALUES(repeat('b',64),$1,$2,$3,$4,'overview',$5,clock_timestamp(),clock_timestamp()+$6::interval,clock_timestamp(),'ended')`,[f.adminId,adminSessionHash(f.adminToken),f.shops[0],f.users[0].id,why,expires]);
 await expect(insert('31 minutes',reason)).rejects.toThrow('check constraint');
 await expect(insert('1 minute','hai\ndòng lý do ở đây')).rejects.toThrow('check constraint');

 await expect(f.db.query("UPDATE admin_impersonation_sessions SET reason='Lý do đã bị sửa lại' WHERE id=$1",[live[0].id])).rejects.toThrow('IMMUTABLE');
 await expect(f.db.query("UPDATE admin_impersonation_sessions SET expires_at=expires_at+interval '1 minute' WHERE id=$1",[live[0].id])).rejects.toThrow('IMMUTABLE');
 await expect(f.db.query('DELETE FROM admin_impersonation_sessions WHERE id=$1',[a.sessionId])).rejects.toThrow('IMMUTABLE');
 await expect(f.db.query("UPDATE admin_impersonation_sessions SET end_reason='ended' WHERE id=$1",[a.sessionId])).rejects.toThrow('IMMUTABLE');
 await expect(f.db.query("UPDATE admin_audit SET detail='{}'")).rejects.toThrow('IMMUTABLE');

 expect(await f.imp.endForAdmin(f.adminToken)).toMatchObject({end_reason:'ended'});
 expect(await f.imp.endForAdmin(f.adminToken)).toBeNull();
 expect(await f.imp.endByToken(a.token)).toBeNull();
});

test('four positions: what support may open and read at each, checked again on every request',async({f})=>{
 const dashboard=new OwnerDashboard(f.db),{OwnerPages}=await import('../lib/owner/pages');const pages=new OwnerPages(f.db);
 await addExperience(f.db,'one',2,'Góp ý bí mật');
 const can=async(scope:'overview'|'feedback'|'design')=>f.imp.start(f.adminToken,{shopId:f.shops[0],ownerUserId:f.users[0].id,scope,reason}).then(()=>true,e=>{expect(String(e)).toContain('SUPPORT_NOT_GRANTED');return false;});
 const table:Record<string,boolean[]>={off:[true,false,false],view:[true,true,false],edit:[false,false,true],full:[true,true,true]};
 for(const level of ['off','view','edit','full']){
  await position(f,level);
  expect([await can('overview'),await can('feedback'),await can('design')],level).toEqual(table[level]);
 }
 // Position 2 hides every figure from an open design session, and moving the switch applies to the next request.
 await position(f,'edit');const d=await open(f,'design');
 await expect(dashboard.summary(d.credential,'one')).rejects.toThrow('SUPPORT_NOT_GRANTED');
 await expect(dashboard.read(d.credential,'one',filters())).rejects.toThrow('SUPPORT_NOT_GRANTED');
 await expect(pages.picture(d.credential,'one','one')).resolves.toMatchObject({slug:'one'});
 await position(f,'view');
 await expect(pages.picture(d.credential,'one','one')).rejects.toThrow('SUPPORT_NOT_GRANTED');
 await position(f,'full');
 await expect(dashboard.summary(d.credential,'one')).resolves.toBeTruthy();
 await expect(pages.picture(d.credential,'one','one')).resolves.toBeTruthy();
 // Never at any position: case notes, exports, the switch itself.
 await expect(dashboard.update(d.credential,'one',{sessionId:randomUUID(),expectedCaseRevision:0,expectedExperienceRevision:'1',status:'resolved',note:''})).rejects.toThrow('IMPERSONATION_READ_ONLY');
 await expect(dashboard.setSupport(d.credential,'one',{level:'off'})).rejects.toThrow('IMPERSONATION_READ_ONLY');
 await expect(exportStream(f.db,d.credential,'one',filters(),'experiences','csv',new AbortController().signal)).rejects.toThrow('IMPERSONATION_NO_EXPORT');
 // An overview or feedback session cannot see the page's design.
 const o=await open(f,'overview');await expect(pages.picture(o.credential,'one','one')).rejects.toThrow('IMPERSONATION_SCOPE');
});

test('uploads: a signed PUT to R2 pinned to type and size under the shop\'s folder; editors only; support recorded',async({f})=>{
 const {OwnerMedia}=await import('../lib/owner/media');const {storageSettings:r2Settings}=await import('../lib/media/storage');
 const env={R2_ACCOUNT_ID:'a'.repeat(32),R2_ACCESS_KEY_ID:'AKFIXTURE',R2_SECRET_ACCESS_KEY:'secret-fixture',R2_BUCKET:'nfc-media',MEDIA_PUBLIC_ORIGIN:'https://media.example.com/'};
 expect(r2Settings(env)).toMatchObject({publicOrigin:'https://media.example.com'});
 for(const missing of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','MEDIA_PUBLIC_ORIGIN'])expect(r2Settings({...env,[missing]:''})).toBeNull();
 expect(r2Settings({...env,MEDIA_PUBLIC_ORIGIN:'http://media.example.com'})).toBeNull();
 // Lát I1: any S3-compatible store by endpoint, no Cloudflare account needed; plain http only on this machine.
 const own={...env,R2_ACCOUNT_ID:'',STORAGE_ENDPOINT:'http://127.0.0.1:9000',STORAGE_REGION:'us-east-1'};
 const local=await new OwnerMedia(f.db,r2Settings(own),()=>new Date('2026-09-18T10:00:00Z')).presign(f.users[0].token,'one',{type:'image/png',size:10});
 expect(local.upload).toMatch(/^http:\/\/127\.0\.0\.1:9000\/nfc-media\/shops\//);expect(new URL(local.upload).searchParams.get('X-Amz-Credential')).toContain('/us-east-1/s3/');
 expect(r2Settings({...own,STORAGE_ENDPOINT:'http://store.example.com:9000'})).toBeNull();
 expect(r2Settings({...own,STORAGE_ENDPOINT:'https://s3.ap-southeast-1.amazonaws.com'})).toMatchObject({endpoint:'https://s3.ap-southeast-1.amazonaws.com'});
 // A path-style store serves public objects under the bucket's path; a query or a stray path segment is refused.
 expect(r2Settings({...own,MEDIA_PUBLIC_ORIGIN:'https://media.example.com/nfc-media/'})).toMatchObject({publicOrigin:'https://media.example.com/nfc-media'});
 for(const bad of ['https://media.example.com/?x=1','https://media.example.com/a b','javascript:alert(1)'])expect(r2Settings({...own,MEDIA_PUBLIC_ORIGIN:bad}),bad).toBeNull();
 const media=new OwnerMedia(f.db,r2Settings(env),()=>new Date('2026-09-18T10:00:00Z'));
 const signed=await media.presign(f.users[0].token,'one',{type:'image/png',size:12345});
 expect(signed.kind).toBe('image');expect(signed.headers).toEqual({'Content-Type':'image/png'});
 expect(signed.url).toMatch(new RegExp(`^https://media\\.example\\.com/shops/${f.shops[0]}/[0-9a-f-]{36}\\.png$`));
 const upload=new URL(signed.upload);
 expect(upload.host).toBe(`${'a'.repeat(32)}.r2.cloudflarestorage.com`);expect(upload.pathname).toBe(`/nfc-media/${new URL(signed.url).pathname.slice(1)}`);
 expect(upload.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
 expect(upload.searchParams.get('X-Amz-Expires')).toBe('300');expect(signed.upload).not.toContain('secret-fixture');
 await expect(media.presign(f.users[0].token,'one',{type:'image/gif',size:10})).rejects.toThrow('UNSUPPORTED_MEDIA');
 // F-012 (Astra, 20/09): the type table was a plain object, so these names answered with something inherited and the
 // rule that came back had no `max` — a gigabyte passed the ceiling. Fails on 415 if the lookup goes back to an object.
 for(const name of ['constructor','toString','__proto__','valueOf','hasOwnProperty'])
  await expect(media.presign(f.users[0].token,'one',{type:name,size:1024*1024*1024})).rejects.toThrow('UNSUPPORTED_MEDIA');
 await expect(media.presign(f.users[0].token,'one',{type:'image/jpeg',size:5*1024*1024+1})).rejects.toThrow('MEDIA_TOO_LARGE');
 await expect(media.presign(f.users[0].token,'one',{type:'video/mp4',size:30*1024*1024})).resolves.toMatchObject({kind:'video'});
 for(const bad of [{type:'image/png'},{type:'image/png',size:0},{type:'image/png',size:1,name:'x'},null])await expect(media.presign(f.users[0].token,'one',bad)).rejects.toThrow('INVALID_UPLOAD');
 await expect(media.presign(f.users[1].token,'one',{type:'image/png',size:10})).rejects.toThrow('ACCESS_DENIED');
 await expect(new OwnerMedia(f.db,null).presign(f.users[0].token,'one',{type:'image/png',size:10})).rejects.toThrow('UPLOADS_NOT_CONFIGURED');
 // Support uploads only inside a design session, and each upload is on the record.
 const o=await open(f,'overview');await expect(media.presign(o.credential,'one',{type:'image/png',size:10})).rejects.toThrow('IMPERSONATION_SCOPE');
 await position(f,'edit');const d=await open(f,'design');
 await media.presign(d.credential,'one',{type:'image/jpeg',size:10});
 expect((await audit(f,'impersonation.design.upload')).map(r=>[r.actor_id,r.on_behalf_of,r.detail.type])).toEqual([[f.adminId,f.users[0].id,'image/jpeg']]);
 // Cửa duyệt ảnh (migration 023): every signed upload queues for review, recorded under whoever asked for it.
 const queued=(await f.db.query("SELECT url,kind,content_type,size_bytes,uploaded_by,state FROM media_assets WHERE url=$1",[signed.url])).rows;
 expect(queued).toEqual([{url:signed.url,kind:'image',content_type:'image/png',size_bytes:12345,uploaded_by:`owner:${f.users[0].id}`,state:'pending'}]);
 expect(signed.review).toBe('pending');
 expect((await f.db.query("SELECT count(*)::int n FROM media_assets WHERE uploaded_by=$1",[`admin:${f.adminId}`])).rows[0].n).toBe(1);
 // Only the four uploads that were signed (the PNG to the local store, the PNG, the MP4, the design-session JPEG) queue;
 // every refused request leaves nothing.
 expect((await f.db.query("SELECT count(*)::int n FROM media_assets")).rows[0].n).toBe(4);
});

// Rà bảo mật 29/09, C3b-3. Every signed upload waits in the operator's queue until decided, and nothing bounded how many: one
// shop could fill the queue, and the store, with files nobody will ever look at. A page shows at most five pictures.
test('uploads: a shop has at most PENDING_UPLOADS_MAX files waiting for review, even asked all at once; a decision frees a place',async({f})=>{
 const {OwnerMedia,PENDING_UPLOADS_MAX}=await import('../lib/owner/media');const {storageSettings:r2Settings}=await import('../lib/media/storage');
 const {MediaReview}=await import('../lib/admin/media-review');
 const env={R2_ACCOUNT_ID:'a'.repeat(32),R2_ACCESS_KEY_ID:'AKFIXTURE',R2_SECRET_ACCESS_KEY:'secret-fixture',R2_BUCKET:'nfc-media',MEDIA_PUBLIC_ORIGIN:'https://media.example.com'};
 const media=new OwnerMedia(f.db,r2Settings(env)),ask=(token:string,slug:string)=>media.presign(token,slug,{type:'image/jpeg',size:10});
 const MAX=20;
 // Asked all at once, so two requests cannot both take the last place.
 const answers=await Promise.allSettled(Array.from({length:MAX+5},()=>ask(f.users[0].token,'one')));
 expect(answers.filter(a=>a.status==='fulfilled')).toHaveLength(MAX);
 expect(answers.filter(a=>a.status==='rejected').map(a=>String((a as PromiseRejectedResult).reason?.code))).toEqual(Array(5).fill('UPLOAD_QUEUE_FULL'));
 expect((await f.db.query("SELECT count(*)::int n FROM media_assets WHERE shop_id=$1",[f.shops[0]])).rows[0].n).toBe(MAX);
 // Support in a design session counts against the same shop's queue; another shop's queue is its own.
 await position(f,'edit');const d=await open(f,'design');
 await expect(media.presign(d.credential,'one',{type:'image/jpeg',size:10})).rejects.toThrow('UPLOAD_QUEUE_FULL');
 await expect(ask(f.users[1].token,'two')).resolves.toMatchObject({review:'pending'});
 // A decision frees a place (after the upload link has expired, C3b-1).
 const first=(await f.db.query("SELECT id FROM media_assets WHERE shop_id=$1 ORDER BY created_at LIMIT 1",[f.shops[0]])).rows[0].id;
 await f.db.query("UPDATE media_assets SET created_at=clock_timestamp()-interval '1 hour' WHERE id=$1",[first]);
 await new MediaReview(f.db).decide(f.adminId,first,{decision:'reject',reason:'Không dùng tới'});
 await expect(ask(f.users[0].token,'one')).resolves.toMatchObject({review:'pending'});
 await expect(ask(f.users[0].token,'one')).rejects.toThrow('UPLOAD_QUEUE_FULL');
 expect(PENDING_UPLOADS_MAX).toBe(MAX);
});
