import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ownerFixture,addExperience,enrolAdmin} from './owner-fixture';
import {OwnerTeam} from '../lib/owner/team';
import {OwnerActivity,parseActivityQuery,fold} from '../lib/owner/activity';
import {OwnerDashboard} from '../lib/owner/dashboard';
import {OwnerCards} from '../lib/owner/cards';
import {OwnerDesign} from '../lib/owner/design';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {AdminAuth} from '../lib/admin/auth';
import {AdminImpersonation} from '../lib/admin/impersonation';
import {parseFilters} from '../lib/owner/filters';
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const MIGRATIONS=['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql','022_shop_profile.sql','023_media_review.sql'];
const test=base.extend<{f:Awaited<ReturnType<typeof ownerFixture>>}>({f:async({},provide)=>{
 const schema=`nfc_team_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);for(const file of MIGRATIONS)await db.query(await readFile(`db/migrations/${file}`,'utf8'));await provide(await ownerFixture(db));}
 finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const everything=()=>parseActivityQuery(new URLSearchParams());
/** Invites someone, follows their link, signs them in: what a new team member does on their phone. */
async function join(f:Awaited<ReturnType<typeof ownerFixture>>,by:string,handle:string,roleId:string){
 const invited=await new OwnerTeam(f.db).invite(by,'one',{handle,roleId});
 const password=`password-of-${handle}`;
 await new OwnerSetupLinks(f.db).consume(invited.token,password);
 return {id:invited.userId,token:(await f.auth.login(`@${handle}`,password)).token};
}

test('roles appear on first open; a Nhân viên sees figures but no feedback words, and no switch it lacks',async({f})=>{
 const owner=f.users[0].token,team=new OwnerTeam(f.db);
 const first=await team.list(owner,'one');
 expect(first.roles.map(r=>[r.name,r.icon,r.permissions])).toEqual([['Quản lý','👑',['feedback','design','cards','members','activity']],['Nhân viên',null,[]]]);
 expect(first.members.map(m=>[m.owner,m.permissions.length])).toEqual([[true,6]]);
 const staffRole=first.roles.find(r=>r.name==='Nhân viên')!.id;
 const invited=await team.invite(owner,'one',{handle:'@An.NV',roleId:staffRole,email:'an@example.com'});
 expect(invited.handle).toBe('an.nv');
 expect((await team.list(owner,'one')).members.find(m=>m.handle==='an.nv')).toMatchObject({pending:true,roleId:staffRole});
 // The account is closed until the link is used: no password works.
 await expect(f.auth.login('an.nv','anything-at-all-123')).rejects.toThrow('LOGIN_FAILED');
 await new OwnerSetupLinks(f.db).consume(invited.token,'an-chooses-this-one');
 const an=(await f.auth.login('an@example.com','an-chooses-this-one')).token;
 expect((await team.list(owner,'one')).members.find(m=>m.handle==='an.nv')!.pending).toBe(false);
 await addExperience(f.db,'one',2,'Lời khách riêng tư');
 const dashboard=new OwnerDashboard(f.db);
 expect((await dashboard.summary(an,'one')).viewer).toEqual({kind:'owner',role:'manager',permissions:[]});
 const rows=(await dashboard.read(an,'one',parseFilters(new URLSearchParams()))).records;
 expect(rows[0].message).toBeNull();
 for(const refused of [
  ()=>new OwnerCards(f.db).list(an,'one'),()=>new OwnerCards(f.db).create(an,'one',{label:'Bàn 9'}),()=>new OwnerDesign(f.db).read(an,'one'),
  ()=>new OwnerActivity(f.db).list(an,'one',everything()),()=>team.invite(an,'one',{handle:'someone',roleId:staffRole}),
  ()=>f.auth.access(an,'one','export'),()=>dashboard.update(an,'one',{sessionId:rows[0].session_id,expectedCaseRevision:0,expectedExperienceRevision:rows[0].experience_revision,status:'new',note:'x'}),
 ])await expect(refused()).rejects.toMatchObject({code:'PERMISSION_REQUIRED'});
 // The owner opens feedback to this one person; the words appear and a note can be saved.
 await team.change(owner,'one',{op:'feedback',userId:invited.userId,value:true});
 const opened=(await dashboard.read(an,'one',parseFilters(new URLSearchParams()))).records[0];
 expect(opened.message).toBe('Lời khách riêng tư');
 await dashboard.update(an,'one',{sessionId:opened.session_id,expectedCaseRevision:0,expectedExperienceRevision:opened.experience_revision,status:'progress',note:'An gọi lại khách'});
 // Only the owner moves that switch.
 await expect(team.change(an,'one',{op:'feedback',userId:f.users[0].id,value:true})).rejects.toMatchObject({code:'OWNER_UNTOUCHABLE'});
});

test('a Quản lý invites and manages, but never above their own reach, never the owner, never themselves',async({f})=>{
 const owner=f.users[0].token,team=new OwnerTeam(f.db);
 const roles=(await team.list(owner,'one')).roles,managerRole=roles[0].id,staffRole=roles[1].id;
 const {id:accountantRole}=await team.roles(owner,'one','POST',{name:'Kế toán',icon:'🧾',color:'#2563eb',permissions:['export']}) as {id:string};
 const mai=await join(f,owner,'mai.ql',managerRole);
 const binh=await join(f,mai.token,'binh.nv',staffRole);
 await expect(team.invite(mai.token,'one',{handle:'ketoan',roleId:accountantRole})).rejects.toMatchObject({code:'ROLE_ABOVE_YOU'});
 await expect(team.change(mai.token,'one',{op:'role',userId:binh.id,value:accountantRole})).rejects.toMatchObject({code:'ROLE_ABOVE_YOU'});
 await expect(team.change(mai.token,'one',{op:'role',userId:f.users[0].id,value:staffRole})).rejects.toMatchObject({code:'OWNER_UNTOUCHABLE'});
 await expect(team.change(mai.token,'one',{op:'role',userId:mai.id,value:staffRole})).rejects.toMatchObject({code:'NOT_ON_YOURSELF'});
 await expect(team.change(mai.token,'one',{op:'feedback',userId:binh.id,value:true})).rejects.toMatchObject({code:'OWNER_ROLE_REQUIRED'});
 await expect(team.roles(mai.token,'one','PATCH',{id:staffRole,name:'Nhân viên',icon:null,color:'#5a6d62',permissions:['export']})).rejects.toMatchObject({code:'OWNER_ROLE_REQUIRED'});
 // Only the owner activates a card, whatever the role says.
 const card=await new OwnerCards(f.db).create(mai.token,'one',{label:'Bàn 3'});
 await expect(new OwnerCards(f.db).update(mai.token,'one',{id:card.id,state:'active'})).rejects.toMatchObject({code:'OWNER_ROLE_REQUIRED'});
 // A fresh link only for someone who never activated (binh has signed in, so no); removing someone closes the shop at once.
 await expect(team.change(mai.token,'one',{op:'link',userId:binh.id})).rejects.toMatchObject({code:'MEMBER_ALREADY_ACTIVE'});
 const pending=await team.invite(mai.token,'one',{handle:'chua.vao',roleId:staffRole});
 const again=await team.change(mai.token,'one',{op:'link',userId:pending.userId}) as {token:string};
 expect(again.token).toMatch(/^[a-f0-9]{64}$/);
 await expect(new OwnerSetupLinks(f.db).consume(pending.token,'the-first-link-is-dead')).rejects.toThrow('SETUP_LINK_INVALID');
 await team.change(mai.token,'one',{op:'remove',userId:binh.id});
 await expect(f.auth.access(binh.token,'one','overview')).rejects.toMatchObject({code:'ACCESS_DENIED'});
 // Roles: a taken name, a role still held, and an unknown switch are refused; an empty role can go.
 await expect(team.roles(owner,'one','POST',{name:'kế toán',icon:null,color:'#000000',permissions:[]})).rejects.toMatchObject({code:'ROLE_NAME_TAKEN'});
 await expect(team.roles(owner,'one','DELETE',{id:managerRole})).rejects.toMatchObject({code:'ROLE_IN_USE'});
 await expect(team.roles(owner,'one','POST',{name:'X',icon:null,color:'#000000',permissions:['sudo']})).rejects.toMatchObject({code:'INVALID_ROLE'});
 await team.roles(owner,'one','DELETE',{id:accountantRole});
 // The badge is the person's own choice.
 await team.change(mai.token,'one',{op:'badge',value:false});
 expect((await team.list(owner,'one')).members.find(m=>m.handle==='mai.ql')!.showBadge).toBe(false);
 // Another shop's owner sees nothing of this team.
 await expect(team.list(f.users[1].token,'one')).rejects.toMatchObject({code:'ACCESS_DENIED'});
});

test('history: every change leaves a line, search ignores accents, filters narrow, nothing can be edited',async({f})=>{
 const owner=f.users[0].token,team=new OwnerTeam(f.db),activity=new OwnerActivity(f.db);
 const roles=(await team.list(owner,'one')).roles;
 const mai=await join(f,owner,'mai.ql',roles[0].id);
 await new OwnerCards(f.db).create(mai.token,'one',{label:'Bàn 3'});
 await new OwnerDashboard(f.db).setSupport(owner,'one',{level:'view'});
 const all=(await activity.list(owner,'one',everything())).rows;
 expect(all.map(r=>[r.actor_handle,r.action])).toEqual([[f.users[0].username,'support.level'],['mai.ql','card.create'],[f.users[0].username,'member.invite']]);
 expect(fold('Bàn 3 ĐỔI Tên')).toBe('ban 3 doi ten');
 const q=(params:Record<string,string>)=>activity.list(owner,'one',parseActivityQuery(new URLSearchParams(params))).then(r=>r.rows.map(x=>x.action));
 expect(await q({q:'ban 3'})).toEqual(['card.create']);
 expect(await q({q:'MOI thanh vien'})).toEqual(['member.invite']);
 expect(await q({actor:mai.id})).toEqual(['card.create']);
 expect(await q({action:'support.level'})).toEqual(['support.level']);
 expect(await q({q:'100%_'})).toEqual([]);
 expect((await activity.list(owner,'one',everything())).people.map(p=>p.handle).sort()).toEqual(['mai.ql',f.users[0].username].sort());
 expect(()=>parseActivityQuery(new URLSearchParams({action:'drop.table'}))).toThrow('INVALID_QUERY');
 await expect(f.db.query("UPDATE shop_activity SET actor_handle='someone'")).rejects.toThrow('SHOP_ACTIVITY_APPEND_ONLY');
 await expect(f.db.query('DELETE FROM shop_activity')).rejects.toThrow('SHOP_ACTIVITY_APPEND_ONLY');
 // A note leaves a reference only: the history is readable without the feedback switch.
 const x=await addExperience(f.db,'one',1,'Khách chê món bún');
 const row=(await new OwnerDashboard(f.db).read(owner,'one',parseFilters(new URLSearchParams()))).records.find(r=>r.session_id===x.session.sessionId)!;
 await new OwnerDashboard(f.db).update(owner,'one',{sessionId:row.session_id,expectedCaseRevision:0,expectedExperienceRevision:row.experience_revision,status:'new',note:'Gọi lại khách'});
 expect(JSON.stringify((await activity.list(owner,'one',everything())).rows[0])).not.toContain('bún');
});

test('support: never reads or changes the team or its history; its design work is recorded under its badge',async({f})=>{
 const admins=new AdminAuth(f.db);await admins.bootstrap('tai','a-sufficiently-long-admin-secret',async()=>{});
 await f.db.query("UPDATE platform_admins SET handle='Quitesensational',title='Admin Tài'");
 const adminToken=(await admins.login('tai','a-sufficiently-long-admin-secret')).token;await enrolAdmin(f.db);
 await new OwnerDashboard(f.db).setSupport(f.users[0].token,'one',{level:'full'});
 const s=await new AdminImpersonation(f.db).start(adminToken,{shopId:f.shops[0],ownerUserId:f.users[0].id,scope:'design',reason:'Shop nhờ sửa tên hiển thị'});
 const credential={impersonation:s.token};
 await expect(new OwnerTeam(f.db).list(credential,'one')).rejects.toMatchObject({code:'PERMISSION_REQUIRED'});
 await expect(new OwnerActivity(f.db).list(credential,'one',everything())).rejects.toMatchObject({code:'PERMISSION_REQUIRED'});
 const design=new OwnerDesign(f.db),state=await design.read(credential,'one');
 await design.save(credential,'one',{expectedRevision:state.draft.revision,config:{...state.draft.config,name:'Sửa hộ'}});
 const line=(await new OwnerActivity(f.db).list(f.users[0].token,'one',everything())).rows[0];
 expect(line).toMatchObject({actor_kind:'admin',actor_handle:'Quitesensational',action:'design.save'});
});

test('rollback 015 refuses once there is history or an invited member, and removes everything on a clean database',async({f})=>{
 const rollback=await readFile('db/rollback/015_shop_team.sql','utf8');
 const db=await f.db.connect();
 try{
  await db.query('BEGIN');await db.query(rollback);
  expect((await db.query("SELECT to_regclass('shop_roles') r,to_regclass('shop_activity') a")).rows[0]).toEqual({r:null,a:null});
  await db.query('ROLLBACK');
  const roles=(await new OwnerTeam(f.db).list(f.users[0].token,'one')).roles;
  await new OwnerTeam(f.db).invite(f.users[0].token,'one',{handle:'moi.vao',roleId:roles[1].id});
  await db.query('BEGIN');await expect(db.query(rollback)).rejects.toThrow('TEAM_DATA_PRESENT');await db.query('ROLLBACK');
 }finally{db.release();}
});

// Found by Astra 2026-09-20 (docs/security-review-20260920.md), red before the fix in lib/owner/team.ts.
test('F-007: a manager without the feedback switch cannot act on someone the owner opened feedback to',async({f})=>{
 const owner=f.users[0].token,team=new OwnerTeam(f.db);
 const roles=(await team.list(owner,'one')).roles;
 const limited=await team.roles(owner,'one','POST',{name:'People only',icon:null,color:'#000000',permissions:['members']}) as {id:string};
 const manager=await join(f,owner,'limited.manager',limited.id);
 const target=await team.invite(owner,'one',{handle:'feedback.reader',roleId:roles[1].id});
 await team.change(owner,'one',{op:'feedback',userId:target.userId,value:true});
 for(const change of [{op:'link',userId:target.userId},{op:'remove',userId:target.userId},{op:'role',userId:target.userId,value:roles[1].id}])
  await expect(team.change(manager.token,'one',change)).rejects.toMatchObject({code:'ROLE_ABOVE_YOU'});
});

test('F-008: authority in one shop never resets an identity that is active, or that belongs to another shop',async({f})=>{
 const owner=f.users[0].token,team=new OwnerTeam(f.db);
 const roles=(await team.list(owner,'one')).roles;
 // The owner of shop two also joins shop one (the identity model allows one person in several shops).
 await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role,role_id,invited_by)VALUES($1,$2,'manager',$3,$4)",[f.users[1].id,f.shops[0],roles[1].id,f.users[0].id]);
 await expect(team.change(owner,'one',{op:'link',userId:f.users[1].id})).rejects.toMatchObject({code:'MEMBER_ALREADY_ACTIVE'});
 // Even a never-activated account is refused once it belongs to a second shop.
 const pending=await team.invite(owner,'one',{handle:'hai.shop',roleId:roles[1].id});
 await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')",[pending.userId,f.shops[1]]);
 await expect(team.change(owner,'one',{op:'link',userId:pending.userId})).rejects.toMatchObject({code:'MEMBER_ALREADY_ACTIVE'});
 await expect(f.auth.access(f.users[1].token,'two','export')).resolves.toBeTruthy();
});

// F-009, found by Astra 2026-09-20: the "never activated" check must run after the account lock, not before it.
test('F-009: a link cannot be re-sent while the member is finishing their password in another transaction',async({f})=>{
 const owner=f.users[0].token,team=new OwnerTeam(f.db);
 const roles=(await team.list(owner,'one')).roles;
 const pending=await team.invite(owner,'one',{handle:'dang.dat',roleId:roles[1].id});
 // Stand in for consume(): hold the identity row the way it does, then finish and commit while the re-send waits.
 const held=await f.db.connect();
 try{
  await held.query('BEGIN');
  await held.query('SELECT 1 FROM owner_identities_v2 WHERE id=$1 FOR UPDATE',[pending.userId]);
  const attempt=team.change(owner,'one',{op:'link',userId:pending.userId});
  const waiting=attempt.then(()=>'done',()=>'failed');
  // Count only this fixture's own waiters: another suite on the same cluster must not make this pass (Astra, 20/09).
  await expect.poll(async()=>(await f.db.query(`SELECT count(*)::int n FROM pg_stat_activity
   WHERE wait_event_type='Lock' AND state='active' AND datname=current_database() AND application_name=current_setting('application_name')`)).rows[0].n,
   {timeout:10000}).toBeGreaterThan(0);
  await held.query('UPDATE owner_setup_tokens SET used_at=clock_timestamp() WHERE user_id=$1 AND used_at IS NULL',[pending.userId]);
  await held.query("UPDATE owner_identities_v2 SET password_salt=repeat('a',32),password_key=repeat('b',64) WHERE id=$1",[pending.userId]);
  await held.query('COMMIT');
  await expect(attempt).rejects.toMatchObject({code:'MEMBER_ALREADY_ACTIVE'});
  expect(await waiting).toBe('failed');
 }finally{
  // Roll back before returning the connection: a failed assertion above would otherwise hand the pool a connection
  // still holding the lock, and cleanup would hang (Astra, 20/09).
  await held.query('ROLLBACK').catch(()=>held.release(new Error('rollback failed')));
  held.release();
 }
});

