import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
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
type Fixture=Awaited<ReturnType<typeof ownerFixture>>;
const test=base.extend<{f:Fixture}>({f:async({},provide)=>{
 const schema=`nfc_notify_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);await applySchema(db);await provide(await ownerFixture(db));}
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
