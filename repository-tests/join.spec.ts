import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {OwnerAuth,openSession,transaction} from '../lib/owner/auth';
import {OwnerTeam} from '../lib/owner/team';
import {AccountSignup} from '../lib/account/signup';
import {findShop,openJoinRequest,myRequests,JOIN_LIMITS} from '../lib/account/join';

/**
 * Nhân viên tự xin vào quán (G3, Tài 06/10): gõ @chủ quán, link trang, link thẻ hay mã quán; người có quyền Thành viên duyệt
 * với một vai không mạnh hơn vai của mình, hoặc từ chối. Chưa duyệt thì không thấy gì của quán.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
type Fixture={db:Pool;shopId:string;owner:string;ownerId:string;session:(id:string)=>Promise<string>;person:(name:string)=>Promise<string>};
const test=base.extend<{f:Fixture}>({f:async({},provide)=>{
 const schema=`nfc_join_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  await applySchema(db);
  const person=async(name:string)=>(await db.query("INSERT INTO owner_identities_v2(username,password_salt,password_key)VALUES($1,repeat('0',32),repeat('0',64))RETURNING id",[name])).rows[0].id as string;
  const session=async(id:string)=>(await transaction(db,c=>openSession(c,id))).token;
  const shopId=(await db.query("INSERT INTO shops(slug,name,publishing_state)VALUES('quan-mot','Quán Một','active')RETURNING id")).rows[0].id;
  const ownerId=await person('chu-mot');
  await db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')",[ownerId,shopId]);
  await provide({db,shopId,owner:await session(ownerId),ownerId,session,person});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const look=(f:Fixture,text:unknown)=>transaction(f.db,db=>findShop(db,text));

test('a shop is found by its owner\'s @handle, its code, or a link to its page; never the template, and never a guess',async({f})=>{
 for(const text of ['@chu-mot','CHU-MOT','quan-mot','https://quitesensational-review-bio.com/quan-mot','quitesensational-review-bio.com/quan-mot?x=1'])
  expect((await look(f,text)).id).toBe(f.shopId);
 for(const text of ['@khong-ai','','x'.repeat(301),42,'https://example.com/t/'])await expect(look(f,text)).rejects.toMatchObject({code:'SHOP_NOT_FOUND'});
 await f.db.query("INSERT INTO shops(slug,name,publishing_state,is_template)VALUES('mau','Mẫu','active',true)");
 await expect(look(f,'mau')).rejects.toMatchObject({code:'SHOP_NOT_FOUND'});
 const second=(await f.db.query("INSERT INTO shops(slug,name,publishing_state)VALUES('quan-hai','Quán Hai','active')RETURNING id")).rows[0].id;
 await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')",[f.ownerId,second]);
 await expect(look(f,'@chu-mot')).rejects.toMatchObject({code:'SHOP_AMBIGUOUS'});
 expect((await look(f,'quan-hai')).id).toBe(second);
});

test('staff sign up into a request, not a shop; a wrong shop makes no account',async({f})=>{
 const signup=new AccountSignup(f.db),input={username:'lan',email:'lan@example.com',password:'a-long-enough-password'};
 await expect(signup.createStaff({...input,join:'@khong-ai'},null)).rejects.toMatchObject({status:404,code:'SHOP_NOT_FOUND'});
 expect((await f.db.query("SELECT count(*)::int n FROM owner_identities_v2 WHERE username='lan'")).rows[0].n).toBe(0);
 const made=await signup.createStaff({...input,join:'@chu-mot',message:'Em Lan ca sáng'},null);
 expect(made.join).toMatchObject({id:f.shopId,name:'Quán Một'});
 expect((await f.db.query('SELECT count(*)::int n FROM owner_memberships_v2 WHERE user_id=$1',[made.userId])).rows[0].n).toBe(0);
 expect((await f.db.query('SELECT count(*)::int n FROM shops')).rows[0].n).toBe(1);
 const mine=await myRequests(f.db,made.userId);
 expect(mine).toMatchObject({shops:[],requests:[{shopName:'Quán Một',outcome:null}]});
 // Asking again is the same request; the shop stays shut to them until someone decides.
 const again=await transaction(f.db,db=>findShop(db,'quan-mot').then(shop=>openJoinRequest(db,made.userId,shop,null)));
 expect(again.id).toBe(mine.requests[0].id);
 await expect(new OwnerAuth(f.db).access(made.session.token,'quan-mot','shell')).rejects.toMatchObject({status:403,code:'ACCESS_DENIED'});
});

test('the owner lets them in with a role, or declines; only with the members switch, and never above their own',async({f})=>{
 const team=new OwnerTeam(f.db),roles=(await team.list(f.owner,'quan-mot')).roles;
 const quanLy=roles.find(r=>r.name==='Quản lý')!,nhanVien=roles.find(r=>r.name==='Nhân viên')!;
 const ask=async(name:string)=>{const id=await f.person(name);const shop=await look(f,'quan-mot');await transaction(f.db,db=>openJoinRequest(db,id,shop,null));return {id,token:await f.session(id)};};
 const lan=await ask('lan'),minh=await ask('minh');
 const open=(await team.list(f.owner,'quan-mot')).requests;
 expect(open.map(r=>r.handle)).toEqual(['lan','minh']);
 await team.change(f.owner,'quan-mot',{op:'join',requestId:open[0].id,value:nhanVien.id});
 expect((await new OwnerAuth(f.db).access(lan.token,'quan-mot','overview')).role).toBe('manager');
 // A Nhân viên has no members switch: it neither sees nor decides requests.
 expect((await team.list(lan.token,'quan-mot')).requests).toEqual([]);
 await expect(team.change(lan.token,'quan-mot',{op:'join',requestId:open[1].id,value:nhanVien.id})).rejects.toMatchObject({code:'PERMISSION_REQUIRED'});
 await team.change(f.owner,'quan-mot',{op:'join',requestId:open[1].id,value:false});
 await expect(team.change(f.owner,'quan-mot',{op:'join',requestId:open[1].id,value:false})).rejects.toMatchObject({code:'REQUEST_NOT_FOUND'});
 await expect(new OwnerAuth(f.db).access(minh.token,'quan-mot','shell')).rejects.toMatchObject({code:'ACCESS_DENIED'});
 expect((await f.db.query("SELECT action,target FROM shop_activity WHERE shop_id=$1 AND action IN ('member.join','member.decline') ORDER BY id",[f.shopId])).rows.map(r=>[r.action,r.target]))
  .toEqual([['member.join','@lan'],['member.decline','@minh']]);
 // A manager without the feedback switch cannot let someone in as a full Quản lý.
 await team.change(f.owner,'quan-mot',{op:'role',userId:lan.id,value:quanLy.id});
 await team.change(f.owner,'quan-mot',{op:'feedback',userId:lan.id,value:false});
 const minhAgain=await ask('minh-2');
 const request=(await team.list(lan.token,'quan-mot')).requests[0];
 await expect(team.change(lan.token,'quan-mot',{op:'join',requestId:request.id,value:quanLy.id})).rejects.toMatchObject({code:'ROLE_ABOVE_YOU'});
 await team.change(lan.token,'quan-mot',{op:'join',requestId:request.id,value:nhanVien.id});
 expect((await new OwnerAuth(f.db).access(minhAgain.token,'quan-mot','overview')).role).toBe('manager');
 // Removed, then back: one membership row, active again, with the new role.
 await team.change(f.owner,'quan-mot',{op:'remove',userId:minhAgain.id});
 const back=await transaction(f.db,db=>openJoinRequest(db,minhAgain.id,{id:f.shopId,slug:'quan-mot',name:'Quán Một'},null));
 await team.change(f.owner,'quan-mot',{op:'join',requestId:back.id,value:nhanVien.id});
 expect((await f.db.query('SELECT active,role_id FROM owner_memberships_v2 WHERE user_id=$1',[minhAgain.id])).rows).toEqual([{active:true,role_id:nhanVien.id}]);
 await expect(transaction(f.db,db=>openJoinRequest(db,minhAgain.id,{id:f.shopId,slug:'quan-mot',name:'Quán Một'},null))).rejects.toMatchObject({code:'ALREADY_MEMBER'});
});

test('one person keeps at most five requests open; nobody floods a shop',async({f})=>{
 const id=await f.person('rai-don');
 for(let i=0;i<JOIN_LIMITS.openPerPerson;i++){
  const shop=(await f.db.query("INSERT INTO shops(slug,name,publishing_state)VALUES($1,$2,'active')RETURNING id,slug,name",[`q${i}`,`Q${i}`])).rows[0];
  await transaction(f.db,db=>openJoinRequest(db,id,shop,null));
 }
 await expect(transaction(f.db,async db=>openJoinRequest(db,id,await findShop(db,'quan-mot'),null))).rejects.toMatchObject({status:429,code:'TOO_MANY_REQUESTS'});
});
