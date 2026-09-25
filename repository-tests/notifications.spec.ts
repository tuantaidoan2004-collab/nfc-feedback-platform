import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ownerFixture,addExperience,enrolAdmin} from './owner-fixture';
import {OwnerComments} from '../lib/owner/comments';
import {OwnerNotifications,mentions} from '../lib/owner/notifications';
import {OwnerTeam} from '../lib/owner/team';
import {OwnerDashboard} from '../lib/owner/dashboard';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {AdminAuth} from '../lib/admin/auth';
import {AdminImpersonation} from '../lib/admin/impersonation';
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const MIGRATIONS=['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql','022_shop_profile.sql','023_media_review.sql','024_pages.sql','025_page_labels.sql','026_page_lifecycle.sql'];
type Fixture=Awaited<ReturnType<typeof ownerFixture>>;
const test=base.extend<{f:Fixture}>({f:async({},provide)=>{
 const schema=`nfc_notify_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);for(const file of MIGRATIONS)await db.query(await readFile(`db/migrations/${file}`,'utf8'));await provide(await ownerFixture(db));}
 finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
async function staff(f:Fixture,handle:string,role:'Quản lý'|'Nhân viên'){
 const team=new OwnerTeam(f.db),roleId=(await team.list(f.users[0].token,'one')).roles.find(r=>r.name===role)!.id;
 const invited=await team.invite(f.users[0].token,'one',{handle,roleId});await new OwnerSetupLinks(f.db).consume(invited.token,`password-of-${handle}`);
 return {id:invited.userId,token:(await f.auth.login(handle,`password-of-${handle}`)).token};
}

test('mentions: handles in a text, lowercased, no trailing full stop, not inside an email address',()=>{
 expect(mentions('@An.NV ơi, cảm ơn @mai.ql. Gửi a@b.com và @ab, @an.nv lần nữa')).toEqual(['an.nv','mai.ql']);
 expect(mentions('(@mai-ql) xem giúp')).toEqual(['mai-ql']);
 expect(mentions('không nhắc ai')).toEqual([]);
});

test('only people who can read the feedback are notified; editing notifies only the newly mentioned; read and unread',async({f})=>{
 const c=new OwnerComments(f.db),n=new OwnerNotifications(f.db),owner=f.users[0];
 const x=await addExperience(f.db,'one',2,'Khách chê'),session=x.session.sessionId;
 const mai=await staff(f,'mai.ql','Quản lý'),an=await staff(f,'an.nv','Nhân viên');
 const first=await c.create(owner.token,'one',{sessionId:session,body:`@mai.ql @an.nv @${owner.username} @${f.users[1].username} @ai.do xem giúp`});
 expect(first.notified).toBe(1);
 const inbox=await n.list(mai.token);
 expect(inbox.unread).toBe(1);
 expect(inbox.items[0]).toMatchObject({shop:{slug:'one',name:'Shop one'},sessionId:session,commentId:first.id,actorKind:'member',actorHandle:owner.username,read:false});
 expect(inbox.items[0].excerpt).toContain('@mai.ql');
 for(const token of [an.token,owner.token,f.users[1].token])expect((await n.list(token)).unread).toBe(0);
 // An edit that adds a person notifies that person only, once.
 await new OwnerTeam(f.db).change(owner.token,'one',{op:'feedback',userId:an.id,value:true});
 await c.change(owner.token,'one',{id:first.id,op:'edit',value:'@mai.ql @an.nv xem giúp'});
 await c.change(owner.token,'one',{id:first.id,op:'edit',value:'@mai.ql @an.nv xem giúp nhé'});
 expect([(await n.list(mai.token)).unread,(await n.list(an.token)).unread]).toEqual([1,1]);
 await n.read(mai.token,{ids:[inbox.items[0].id]});
 expect((await n.list(mai.token))).toMatchObject({unread:0,items:[{read:true}]});
 // Someone else's notification cannot be marked, and nothing but ids or all is accepted.
 expect((await n.read(mai.token,{ids:[(await n.list(an.token)).items[0].id]})).marked).toBe(0);
 for(const bad of [{},{ids:'x'},{all:false},{ids:[],all:true}])await expect(n.read(an.token,bad)).rejects.toMatchObject({code:'INVALID_NOTIFICATION'});
 await n.read(an.token,{all:true});expect((await n.list(an.token)).unread).toBe(0);
 // Losing the feedback switch hides the notification and its quote.
 await c.create(mai.token,'one',{sessionId:session,body:'@an.nv lần hai'});
 expect((await n.list(an.token)).unread).toBe(1);
 await new OwnerTeam(f.db).change(owner.token,'one',{op:'feedback',userId:an.id,value:false});
 expect(await n.list(an.token)).toEqual({unread:0,items:[]});
 await expect(n.list({impersonation:'0'.repeat(64)})).rejects.toMatchObject({code:'IMPERSONATION_READ_ONLY'});
 await expect(n.list(undefined)).rejects.toMatchObject({code:'LOGIN_REQUIRED'});
 // A thread opens on its own with the customer's feedback, for the bell's link.
 const thread=await c.list(mai.token,'one',session);
 expect(thread.experience).toMatchObject({session_id:session,rating:2,message:'Khách chê'});
});

test('support at position 3 can mention; the bell names it; the route name is not a shop; rollback refuses a filled inbox',async({f})=>{
 const owner=f.users[0],x=await addExperience(f.db,'one',2,'Khách chê'),session=x.session.sessionId;
 const mai=await staff(f,'mai.ql','Quản lý');
 const admins=new AdminAuth(f.db);await admins.bootstrap('tai','a-sufficiently-long-admin-secret',async()=>{});
 await f.db.query("UPDATE platform_admins SET handle='Quitesensational',title='Admin Tài'");
 await new OwnerDashboard(f.db).setSupport(owner.token,'one',{level:'full'});
 const adminToken=(await admins.login('tai','a-sufficiently-long-admin-secret')).token;await enrolAdmin(f.db);
 const s=await new AdminImpersonation(f.db).start(adminToken,{shopId:f.shops[0],ownerUserId:owner.id,scope:'feedback',reason:'Ghé chơi với shop một chút'});
 await new OwnerComments(f.db).create({impersonation:s.token},'one',{sessionId:session,body:'Chào @mai.ql 👋'});
 expect((await new OwnerNotifications(f.db).list(mai.token)).items[0]).toMatchObject({actorKind:'admin',actorHandle:'Quitesensational'});
 await expect(f.db.query("UPDATE shops SET slug='notifications' WHERE id=$1",[f.shops[0]])).rejects.toThrow('shops_account_routes_reserved');
 const rollback=await readFile('db/rollback/017_mention_notifications.sql','utf8'),db=await f.db.connect();
 try{await db.query('BEGIN');await expect(db.query(rollback)).rejects.toThrow('NOTIFICATIONS_PRESENT');await db.query('ROLLBACK');}finally{db.release();}
});
