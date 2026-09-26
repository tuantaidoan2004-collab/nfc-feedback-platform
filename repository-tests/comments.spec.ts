import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ownerFixture,addExperience,enrolAdmin} from './owner-fixture';
import {OwnerComments} from '../lib/owner/comments';
import {OwnerTeam} from '../lib/owner/team';
import {OwnerDashboard} from '../lib/owner/dashboard';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {AdminAuth} from '../lib/admin/auth';
import {AdminImpersonation} from '../lib/admin/impersonation';
import {parseFilters} from '../lib/owner/filters';
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const BEFORE=['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','022_shop_profile.sql','023_media_review.sql','024_pages.sql','025_page_labels.sql','026_page_lifecycle.sql','027_page_debt.sql'];
type Fixture=Awaited<ReturnType<typeof ownerFixture>>;
const test=base.extend<{f:Fixture}>({f:async({},provide)=>{
 const schema=`nfc_comment_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);for(const file of [...BEFORE,'016_feedback_comments.sql','017_mention_notifications.sql'])await db.query(await readFile(`db/migrations/${file}`,'utf8'));await provide(await ownerFixture(db));}
 finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const rows=(f:Fixture,token=f.users[0].token)=>new OwnerDashboard(f.db).read(token,'one',parseFilters(new URLSearchParams())).then(r=>r.records);
async function staff(f:Fixture,handle:string,role:'Quản lý'|'Nhân viên'){
 const team=new OwnerTeam(f.db),roleId=(await team.list(f.users[0].token,'one')).roles.find(r=>r.name===role)!.id;
 const invited=await team.invite(f.users[0].token,'one',{handle,roleId});await new OwnerSetupLinks(f.db).consume(invited.token,`password-of-${handle}`);
 return {id:invited.userId,token:(await f.auth.login(handle,`password-of-${handle}`)).token};
}

test('a thread: reply, like once, edit keeps the old text, one pin per thread, delete hides; counts follow',async({f})=>{
 const c=new OwnerComments(f.db),owner=f.users[0].token;
 const x=await addExperience(f.db,'one',2,'Món bún hơi mặn'),session=x.session.sessionId;
 const mai=await staff(f,'mai.ql','Quản lý');
 const first=await c.create(owner,'one',{sessionId:session,body:'  Đã gọi lại khách \r\n dòng hai '});
 const second=await c.create(mai.token,'one',{sessionId:session,body:'Em sẽ báo bếp'});
 let thread=(await c.list(owner,'one',session)).comments;
 expect(thread.map(t=>[t.body,t.author.handle,t.author.owner,t.mine,t.canDelete])).toEqual([
  ['Đã gọi lại khách \n dòng hai',f.users[0].username,true,true,true],['Em sẽ báo bếp','mai.ql',false,false,true]]);
 expect(thread[1].author.role).toEqual({name:'Quản lý',icon:'👑',color:'#d69a2d'});
 expect((await rows(f))[0].comment_count).toBe(2);
 for(const token of [owner,owner,mai.token])await c.change(token,'one',{id:first.id,op:'like',value:true});
 expect((await c.list(owner,'one',session)).comments[0]).toMatchObject({likes:2,liked:true});
 await c.change(owner,'one',{id:first.id,op:'like',value:false});
 expect((await c.list(owner,'one',session)).comments[0]).toMatchObject({likes:1,liked:false});
 // Only the author edits; the earlier text is kept.
 await expect(c.change(mai.token,'one',{id:first.id,op:'edit',value:'Sửa hộ'})).rejects.toMatchObject({code:'NOT_YOUR_COMMENT'});
 await c.change(owner,'one',{id:first.id,op:'edit',value:'Đã gọi lại, khách vui'});
 expect((await f.db.query('SELECT body FROM feedback_comment_revisions')).rows).toEqual([{body:'Đã gọi lại khách \n dòng hai'}]);
 expect((await c.list(owner,'one',session)).comments[0].editedAt).not.toBeNull();
 // Pinning another moves the pin; the pinned reply comes first.
 await c.change(owner,'one',{id:first.id,op:'pin',value:true});await c.change(mai.token,'one',{id:second.id,op:'pin',value:true});
 thread=(await c.list(owner,'one',session)).comments;
 expect(thread.map(t=>[t.body,t.pinned])).toEqual([['Em sẽ báo bếp',true],['Đã gọi lại, khách vui',false]]);
 // The manager deletes only their own; the owner may delete anyone's.
 await expect(c.remove(mai.token,'one',{id:first.id})).rejects.toMatchObject({code:'NOT_YOUR_COMMENT'});
 await c.remove(owner,'one',{id:second.id});
 expect((await c.list(mai.token,'one',session)).comments.map(t=>t.body)).toEqual(['Đã gọi lại, khách vui']);
 expect((await rows(f))[0].comment_count).toBe(1);
 await expect(c.change(owner,'one',{id:second.id,op:'like',value:true})).rejects.toMatchObject({code:'COMMENT_NOT_FOUND'});
 for(const body of ['','   ','x'.repeat(2001),42])await expect(c.create(owner,'one',{sessionId:session,body})).rejects.toMatchObject({code:'INVALID_COMMENT'});
 await expect(c.create(owner,'one',{sessionId:randomUUID(),body:'x'})).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(c.create(f.users[1].token,'one',{sessionId:session,body:'x'})).rejects.toMatchObject({code:'ACCESS_DENIED'});
 // The history holds the writes but never the words.
 const history=(await f.db.query("SELECT action,target,detail::text FROM shop_activity WHERE action LIKE 'comment.%' ORDER BY id")).rows;
 expect(history.map(h=>h.action)).toEqual(['comment.create','comment.create','comment.edit','comment.pin','comment.pin','comment.delete']);
 expect(JSON.stringify(history)).not.toMatch(/bún|gọi lại|bếp/);
 await expect(f.db.query('DELETE FROM feedback_comment_revisions')).rejects.toThrow('COMMENT_REVISIONS_APPEND_ONLY');
});

test('who may see and reply: the feedback switch for members; support reads at 1, replies only at 3, under its badge',async({f})=>{
 const c=new OwnerComments(f.db),owner=f.users[0].token;
 const x=await addExperience(f.db,'one',2,'Khách chê'),session=x.session.sessionId;
 await c.create(owner,'one',{sessionId:session,body:'Ghi chú nội bộ'});
 const an=await staff(f,'an.nv','Nhân viên');
 await expect(c.list(an.token,'one',session)).rejects.toMatchObject({code:'PERMISSION_REQUIRED'});
 await expect(c.create(an.token,'one',{sessionId:session,body:'x'})).rejects.toMatchObject({code:'PERMISSION_REQUIRED'});
 expect((await rows(f,an.token))[0].comment_count).toBe(0);
 await new OwnerTeam(f.db).change(owner,'one',{op:'feedback',userId:an.id,value:true});
 await c.create(an.token,'one',{sessionId:session,body:'Em đọc rồi'});
 // The call-back number is for the shop only: support never gets it, at any switch position (Tài, 2026-09-20).
 const admins=new AdminAuth(f.db);await admins.bootstrap('tai','a-sufficiently-long-admin-secret',async()=>{});
 await f.db.query("UPDATE platform_admins SET handle='Quitesensational',title='Admin Tài'");
 const adminToken=(await admins.login('tai','a-sufficiently-long-admin-secret')).token;await enrolAdmin(f.db);const dashboard=new OwnerDashboard(f.db);
 await dashboard.setSupport(owner,'one',{level:'view'});
 const s1=await new AdminImpersonation(f.db).start(adminToken,{shopId:f.shops[0],ownerUserId:f.users[0].id,scope:'feedback',reason:'Shop nhờ đọc góp ý khách'});
 expect((await c.list({impersonation:s1.token},'one',session)).comments).toHaveLength(2);
 await expect(c.create({impersonation:s1.token},'one',{sessionId:session,body:'Chào shop'})).rejects.toMatchObject({code:'SUPPORT_NOT_GRANTED'});
 await dashboard.setSupport(owner,'one',{level:'full'});
 const reply=await c.create({impersonation:s1.token},'one',{sessionId:session,body:'Chào shop, admin ghé chơi 👋'});
 const thread=(await c.list(owner,'one',session)).comments;
 expect(thread[2]).toMatchObject({body:'Chào shop, admin ghé chơi 👋',mine:false,canDelete:true,author:{kind:'admin',handle:'Quitesensational',title:'Admin Tài'}});
 await c.change({impersonation:s1.token},'one',{id:reply.id,op:'edit',value:'Chào shop!'});
 expect((await f.db.query("SELECT count(*)::int n FROM admin_audit WHERE action LIKE 'impersonation.comment%'")).rows[0].n).toBeGreaterThanOrEqual(3);
 expect((await f.db.query("SELECT actor_kind,actor_handle FROM shop_activity WHERE action='comment.edit'")).rows).toEqual([{actor_kind:'admin',actor_handle:'Quitesensational'}]);
 // Support reads the feedback but never the number, in the thread or in the Data list; the shop's own people do.
 const withPhone=await addExperience(f.db,'one',1,'Gọi lại giúp em',undefined,'0901234567');
 // The number is withheld at every position, not only at full: check view as well (Astra, 20/09).
 await dashboard.setSupport(owner,'one',{level:'view'});
 const atView=await c.list({impersonation:s1.token},'one',withPhone.session.sessionId);
 expect(atView.experience).toMatchObject({message:'Gọi lại giúp em',phone:null});
 expect((await new OwnerDashboard(f.db).read({impersonation:s1.token},'one',parseFilters(new URLSearchParams()))).records.every(r=>r.phone===null)).toBe(true);
 await dashboard.setSupport(owner,'one',{level:'full'});
 const forSupport=await c.list({impersonation:s1.token},'one',withPhone.session.sessionId);
 expect(forSupport.experience).toMatchObject({message:'Gọi lại giúp em',phone:null});
 const supportRows=(await new OwnerDashboard(f.db).read({impersonation:s1.token},'one',parseFilters(new URLSearchParams()))).records;
 expect(supportRows.every(r=>r.phone===null)).toBe(true);
 expect(supportRows.some(r=>r.message==='Gọi lại giúp em')).toBe(true);
 const forOwner=(await new OwnerDashboard(f.db).read(owner,'one',parseFilters(new URLSearchParams()))).records;
 expect(forOwner.find(r=>r.session_id===withPhone.session.sessionId)!.phone).toBe('0901234567');
 expect((await c.list(owner,'one',withPhone.session.sessionId)).experience.phone).toBe('0901234567');
});

test('migration 016 carries every note over as a first reply by its author; rollback refuses once people have replied',async()=>{
 const schema=`nfc_comment_mig_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:3});
 try{
  await root.query(`CREATE SCHEMA ${schema}`);for(const file of BEFORE)await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  const f=await ownerFixture(db);
  const a=await addExperience(db,'one',2,'Có ghi chú'),b=await addExperience(db,'one',3,'Không ghi chú');
  const [ra,rb]=[a,b].map(x=>x.session.sessionId);
  await db.query(`INSERT INTO owner_feedback_cases(session_id,shop_id,scope,entry_key,status,note,revision,feedback_seen_at,actor_id)
    SELECT e.session_id,e.shop_id,'live',e.entry_key,'resolved','Đã gọi lại',1,e.feedback_updated_at,$2 FROM rating_experiences e WHERE e.session_id=$1`,[ra,f.users[0].id]);
  await db.query(`INSERT INTO owner_feedback_cases(session_id,shop_id,scope,entry_key,status,note,revision,feedback_seen_at,actor_id)
    SELECT e.session_id,e.shop_id,'live',e.entry_key,'progress','   ',1,e.feedback_updated_at,$2 FROM rating_experiences e WHERE e.session_id=$1`,[rb,f.users[0].id]);
  await db.query(await readFile('db/migrations/016_feedback_comments.sql','utf8'));
  expect((await db.query('SELECT session_id,author_id,author_handle,body,from_note FROM feedback_comments')).rows)
   .toEqual([{session_id:ra,author_id:f.users[0].id,author_handle:f.users[0].username,body:'Đã gọi lại',from_note:true}]);
  const rollback=await readFile('db/rollback/016_feedback_comments.sql','utf8'),client=await db.connect();
  try{
   await client.query('BEGIN');await client.query(rollback);await client.query('ROLLBACK');
   await new OwnerComments(db).create(f.users[0].token,'one',{sessionId:rb,body:'Mới'});
   await client.query('BEGIN');await expect(client.query(rollback)).rejects.toThrow('COMMENTS_PRESENT');await client.query('ROLLBACK');
  }finally{client.release();}
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
});
