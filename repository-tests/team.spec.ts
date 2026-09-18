import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ownerFixture,addExperience} from './owner-fixture';
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
const MIGRATIONS=['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql'];
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
 // A fresh link supersedes the old one; removing someone closes the shop to them at once.
 const again=await team.change(mai.token,'one',{op:'link',userId:binh.id}) as {token:string};
 expect(again.token).toMatch(/^[a-f0-9]{64}$/);
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
 const adminToken=(await admins.login('tai','a-sufficiently-long-admin-secret')).token;
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
