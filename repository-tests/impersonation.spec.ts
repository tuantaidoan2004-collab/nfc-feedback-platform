import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ownerFixture,addExperience} from './owner-fixture';
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
  for(const file of ['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','012_support_levels.sql'])
   await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  const base=await ownerFixture(db),admins=new AdminAuth(db);
  const adminId=await admins.bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  const adminToken=(await admins.login('operator','a-sufficiently-long-admin-secret')).token;
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
 expect(own.viewer).toEqual({kind:'owner',role:'owner'});
 expect(own.adminVisits.map(v=>({scope:v.scope,reason:v.reason,reads:v.reads,end:v.end_reason}))).toEqual([
  {scope:'overview',reason,reads:1,end:null},{scope:'feedback',reason,reads:3,end:'superseded'}]);
 expect(own.support.feedback).toBe(false);
 expect(own.support.history.map(h=>({level:h.level,by:h.by}))).toEqual([{level:'off',by:f.users[0].username},{level:'view',by:f.users[0].username}]);
 expect((await f.db.query('SELECT count(*)::int n FROM admin_audit')).rows[0].n).toBe(before);
 // The other shop's owner sees nothing of it.
 expect((await dashboard.summary(f.users[1].token,'two')).adminVisits).toEqual([]);
});

test('only the owner moves the switch: not support, not a manager, not another shop; history cannot be edited',async({f})=>{
 const dashboard=new OwnerDashboard(f.db),events='SELECT count(*)::int n FROM shop_support_grant_events';
 const o=await open(f,'overview');
 await expect(dashboard.setSupport(o.credential,'one',{level:'view'})).rejects.toThrow('IMPERSONATION_READ_ONLY');
 await expect(dashboard.setSupport(f.users[1].token,'one',{level:'view'})).rejects.toThrow('ACCESS_DENIED');
 await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'manager')",[f.users[1].id,f.shops[0]]);
 await expect(dashboard.setSupport(f.users[1].token,'one',{level:'view'})).rejects.toThrow('OWNER_ROLE_REQUIRED');
 for(const bad of [{level:'on'},{level:1},{permission:'feedback',enabled:true},{level:'view',extra:1},null,[]])
  await expect(dashboard.setSupport(f.users[0].token,'one',bad)).rejects.toThrow('INVALID_SUPPORT');
 expect((await f.db.query(events)).rows[0].n).toBe(0);

 // Repeating the current state records nothing, so the history holds changes only.
 await allow(f,false);
 expect((await f.db.query(events)).rows[0].n).toBe(0);
 await Promise.all([allow(f,true),allow(f,true)]);
 expect((await f.db.query(events)).rows[0].n).toBe(1);
 expect(await allow(f,true)).toEqual({level:'view'});
 expect((await f.db.query(events)).rows[0].n).toBe(1);

 await expect(f.db.query('UPDATE shop_support_grant_events SET enabled=false')).rejects.toThrow('IMMUTABLE');
 await expect(f.db.query('DELETE FROM shop_support_grant_events')).rejects.toThrow('IMMUTABLE');
 await expect(f.db.query("INSERT INTO shop_support_grant_events(shop_id,permission,enabled,actor_id)VALUES($1,'config',true,$2)",[f.shops[0],f.users[0].id])).rejects.toThrow('check constraint');
 // The operator's table shows the switch as it stands.
 const {ShopProvisioning}=await import('../lib/admin/provisioning');
 expect((await new ShopProvisioning(f.db).list()).map(r=>[r.slug,r.support_level])).toEqual(expect.arrayContaining([['one','view'],['two','off']]));

 const sql=await readFile('db/rollback/008_shop_support_grants.sql','utf8'),db=await f.db.connect();
 try{await expect(db.query(`BEGIN;${sql}COMMIT;`)).rejects.toThrow('SUPPORT_GRANT_DATA_EXISTS');await db.query('ROLLBACK');}finally{db.release();}
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

test('rollback refuses while impersonation records exist',async({f})=>{
 await open(f,'overview');
 const sql=await readFile('db/rollback/007_admin_impersonation.sql','utf8'),db=await f.db.connect();
 try{await expect(db.query(`BEGIN;${sql}COMMIT;`)).rejects.toThrow('IMPERSONATION_DATA_EXISTS');await db.query('ROLLBACK');}finally{db.release();}
 expect((await f.db.query('SELECT count(*)::int n FROM admin_impersonation_sessions')).rows[0].n).toBe(1);
});

test('four positions: what support may open and read at each, checked again on every request',async({f})=>{
 const dashboard=new OwnerDashboard(f.db),{OwnerDesign}=await import('../lib/owner/design');const design=new OwnerDesign(f.db);
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
 await expect(design.read(d.credential,'one')).resolves.toMatchObject({draft:{revision:expect.any(Number)}});
 await position(f,'view');
 await expect(design.read(d.credential,'one')).rejects.toThrow('SUPPORT_NOT_GRANTED');
 await position(f,'full');
 await expect(dashboard.summary(d.credential,'one')).resolves.toBeTruthy();
 await expect(design.read(d.credential,'one')).resolves.toBeTruthy();
 // Never at any position: case notes, exports, the switch itself.
 await expect(dashboard.update(d.credential,'one',{sessionId:randomUUID(),expectedCaseRevision:0,expectedExperienceRevision:'1',status:'resolved',note:''})).rejects.toThrow('IMPERSONATION_READ_ONLY');
 await expect(dashboard.setSupport(d.credential,'one',{level:'off'})).rejects.toThrow('IMPERSONATION_READ_ONLY');
 await expect(exportStream(f.db,d.credential,'one',filters(),'experiences','csv',new AbortController().signal)).rejects.toThrow('IMPERSONATION_NO_EXPORT');
 // An overview or feedback session cannot edit the page.
 const o=await open(f,'overview');await expect(design.read(o.credential,'one')).rejects.toThrow('IMPERSONATION_SCOPE');
});
test('older on/off decisions keep their meaning; rollback 012 refuses once four-position data exists',async({f})=>{
 await f.db.query("INSERT INTO shop_support_grant_events(shop_id,permission,enabled,actor_id)VALUES($1,'feedback',true,$2)",[f.shops[0],f.users[0].id]);
 const own=await new OwnerDashboard(f.db).summary(f.users[0].token,'one');
 expect(own.support).toMatchObject({level:'view',feedback:true});expect(own.support.history.map(h=>h.level)).toEqual(['view']);
 await expect(f.db.query("INSERT INTO shop_support_grant_events(shop_id,permission,enabled,level,actor_id)VALUES($1,'level',true,'off',$2)",[f.shops[0],f.users[0].id])).rejects.toThrow('check constraint');
 await expect(f.db.query("INSERT INTO shop_support_grant_events(shop_id,permission,enabled,actor_id)VALUES($1,'level',true,$2)",[f.shops[0],f.users[0].id])).rejects.toThrow('check constraint');
 await position(f,'edit');
 const sql=await readFile('db/rollback/012_support_levels.sql','utf8'),db=await f.db.connect();
 try{await expect(db.query(`BEGIN;${sql}COMMIT;`)).rejects.toThrow('SUPPORT_LEVEL_DATA_EXISTS');await db.query('ROLLBACK');}finally{db.release();}
});
test('the page editor: owners and managers edit and publish; support edits only in a design session and is recorded',async({f})=>{
 const {OwnerDesign}=await import('../lib/owner/design');const design=new OwnerDesign(f.db);
 const {PublishingResolver}=await import('../lib/publishing/repository');
 const state=await design.read(f.users[0].token,'one');
 expect(state.draft.config.schemaVersion).toBe(2);expect(state.live).not.toBeNull();
 const config={...state.draft.config,name:'Tên mới',layout:'card' as const,links:[{label:{vi:'Gọi',en:'Call'},url:'tel:0901234567',icon:'phone' as const}]};
 await expect(design.save(f.users[0].token,'one',{expectedRevision:state.draft.revision,config:{...config,html:'<b>'}})).rejects.toThrow('INVALID_CONFIG');
 const saved=await design.save(f.users[0].token,'one',{expectedRevision:state.draft.revision,config});
 await expect(design.save(f.users[0].token,'one',{expectedRevision:state.draft.revision,config})).rejects.toThrow('DRAFT_CONFLICT');
 const preview=await design.preview(f.users[0].token,'one',{action:'preview',expectedRevision:saved.revision});
 expect((await new PublishingResolver(f.db).preview(preview.token)).config.name).toBe('Tên mới');
 expect((await new PublishingResolver(f.db).live({slug:'one'})).config.name).not.toBe('Tên mới');
 const published=await design.publish(f.users[0].token,'one',{action:'publish',expectedRevision:saved.revision});
 expect((await new PublishingResolver(f.db).live({slug:'one'})).config).toMatchObject({name:'Tên mới',layout:'card'});
 // A manager edits too; another shop's owner does not.
 await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'manager')",[f.users[1].id,f.shops[0]]);
 const again=await design.read(f.users[1].token,'one');expect(again.draft.revision).toBe(published.revision);
 await expect(design.read(f.users[1].token,'two')).resolves.toBeTruthy();
 await f.db.query('UPDATE owner_memberships_v2 SET active=false WHERE user_id=$1 AND shop_id=$2',[f.users[1].id,f.shops[0]]);
 await expect(design.read(f.users[1].token,'one')).rejects.toThrow('ACCESS_DENIED');
 // Support at position 2, in a design session: saves and publishes, each recorded as on the owner's behalf.
 await position(f,'edit');const d=await open(f,'design');
 const current=await design.read(d.credential,'one');
 const s2=await design.save(d.credential,'one',{expectedRevision:current.draft.revision,config:{...current.draft.config,name:'Sửa hộ'}});
 await design.publish(d.credential,'one',{action:'publish',expectedRevision:s2.revision});
 expect((await audit(f,'impersonation.design.save')).map(r=>[r.actor_id,r.on_behalf_of])).toEqual([[f.adminId,f.users[0].id]]);
 expect(await audit(f,'impersonation.design.publish')).toHaveLength(1);
 expect((await f.db.query("SELECT created_by FROM page_releases ORDER BY created_at DESC LIMIT 1")).rows[0].created_by).toBe(`admin:${f.adminId}`);
});

test('cards: anyone running the shop adds and renames; only the owner switches on; support never changes them',async({f})=>{
 const {OwnerCards}=await import('../lib/owner/cards');const cards=new OwnerCards(f.db);
 const {PublishingResolver}=await import('../lib/publishing/repository');
 const made=await cards.create(f.users[0].token,'one',{label:'Bàn 3'});
 expect(made).toMatchObject({label:'Bàn 3',state:'prepared'});expect(made.code).toMatch(/^[2-9a-hjkmnp-z]{5}$/);
 for(const bad of [{label:''},{label:'x'.repeat(61)},{label:'<b>'},{label:'ok',extra:1},null])await expect(cards.create(f.users[0].token,'one',bad)).rejects.toThrow('INVALID_CARD');
 await expect(new PublishingResolver(f.db).live({code:made.code})).rejects.toThrow('PAGE_UNAVAILABLE');
 // A manager may add and rename, and switch a card off, but not on: active cards are what the shop pays for.
 await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'manager')",[f.users[1].id,f.shops[0]]);
 await cards.update(f.users[1].token,'one',{id:made.id,label:'Bàn 4'});
 await expect(cards.update(f.users[1].token,'one',{id:made.id,state:'active'})).rejects.toThrow('OWNER_ROLE_REQUIRED');
 const before=await cards.list(f.users[0].token,'one');
 expect(before).toMatchObject({canActivate:true,included:5});
 await cards.update(f.users[0].token,'one',{id:made.id,state:'active'});
 expect((await new PublishingResolver(f.db).live({code:made.code})).context.tagId).toBe(made.id);
 const after=await cards.list(f.users[0].token,'one');
 expect(after.active).toBe(before.active+1);expect(after.cards.find(c=>c.id===made.id)).toMatchObject({label:'Bàn 4',state:'active'});
 expect((await cards.list(f.users[1].token,'one')).canActivate).toBe(false);
 // Off stops the page at once and stops billing; on again brings it back.
 await cards.update(f.users[1].token,'one',{id:made.id,state:'disabled'});
 await expect(new PublishingResolver(f.db).live({code:made.code})).rejects.toThrow('PAGE_UNAVAILABLE');
 await cards.update(f.users[0].token,'one',{id:made.id,state:'active'});
 await expect(new PublishingResolver(f.db).live({code:made.code})).resolves.toBeTruthy();
 // Another shop's card is out of reach, and support changes nothing at any position.
 await expect(cards.update(f.users[0].token,'one',{id:randomUUID(),state:'active'})).rejects.toThrow('CARD_NOT_FOUND');
 await position(f,'full');const d=await open(f,'design');
 await expect(cards.list(d.credential,'one')).resolves.toMatchObject({canActivate:false});
 await expect(cards.create(d.credential,'one',{label:'Hộ'})).rejects.toThrow('IMPERSONATION_READ_ONLY');
 await expect(cards.update(d.credential,'one',{id:made.id,state:'disabled'})).rejects.toThrow('IMPERSONATION_READ_ONLY');
 // The database still refuses codes under five characters, and rollback 013 refuses once short codes exist.
 await expect(f.db.query("INSERT INTO tags(shop_id,public_code) VALUES($1,'abcd')",[f.shops[0]])).rejects.toThrow('check constraint');
 const sql=await readFile('db/rollback/013_short_card_codes.sql','utf8'),db=await f.db.connect();
 try{await expect(db.query(`BEGIN;${sql}COMMIT;`)).rejects.toThrow('SHORT_CARD_CODES_EXIST');await db.query('ROLLBACK');}finally{db.release();}
});
