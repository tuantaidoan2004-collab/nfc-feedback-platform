import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {setShopPlan} from '../lib/admin/shop-plan';
import {OwnerAuth,openSession,transaction} from '../lib/owner/auth';
import {OwnerTeam} from '../lib/owner/team';
import {AdminAuth} from '../lib/admin/auth';
import {PublishingResolver,ShopUnpaid} from '../lib/publishing/repository';
import {billingOf,entitled,addDays,GRACE_DAYS} from '../lib/billing/plans';

/**
 * Ba gói và hạn dùng (Tài 06/10, kịch bản mục 3b): `trial` mở hết; còn hạn và 14 ngày sau hạn chạy đủ theo gói; quá 14 ngày
 * thì trang tắt, thẻ và link chuyển tới Google của quán, dashboard chỉ còn khung. Nhân viên có ở mọi gói; VIP mở nhiều địa chỉ.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
type Fixture={db:Pool;actorId:string;shopId:string;pageSlug:string;ownerToken:string;managerToken:string;slug:string};
const test=base.extend<{f:Fixture}>({f:async({},provide)=>{
 const schema=`nfc_billing_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  await applySchema(db);
  const actorId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  const made=await new ShopProvisioning(db).create(actorId,{name:'Quán Gói',ownerUsername:'quan-goi',ownerEmail:'goi@example.com',placeId:'ChIJN1t_tDeuEmsRUsoyG83frY4'});
  const manager=(await db.query("INSERT INTO owner_identities_v2(username,password_salt,password_key)VALUES('nhan-vien',repeat('0',32),repeat('0',64))RETURNING id")).rows[0].id;
  await db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'manager')",[manager,made.shopId]);
  const ownerToken=(await transaction(db,c=>openSession(c,made.ownerUserId))).token,managerToken=(await transaction(db,c=>openSession(c,manager))).token;
  const pageSlug=(await db.query('SELECT slug FROM pages WHERE shop_id=$1',[made.shopId])).rows[0].slug;
  await provide({db,actorId,shopId:made.shopId,pageSlug,ownerToken,managerToken,slug:made.slug});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const REVIEW='https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4';
/** Puts the shop `days` days past its paid date (negative: still paid), counted from the database's day in Viet Nam. */
const pastDue=(f:Fixture,plan:string,days:number)=>f.db.query(`UPDATE shops SET plan=$2,paid_until=timezone('Asia/Ho_Chi_Minh',clock_timestamp())::date-$3::int WHERE id=$1`,[f.shopId,plan,days]);

test('the state of a plan is a pure function of its paid day: paid through the day, 14 days of grace, then off',()=>{
 expect(billingOf(null,null,'2026-10-06').state).toBe('trial');
 expect(billingOf('vip',null,'2026-10-06').state).toBe('trial');
 expect(billingOf('nonsense','2026-09-30','2026-10-06')).toMatchObject({state:'trial',plan:null});
 expect(billingOf('basic','2026-09-30','2026-09-30').state).toBe('active');
 expect(billingOf('basic','2026-09-30','2026-10-01').state).toBe('grace');
 expect(billingOf('basic','2026-09-30',addDays('2026-09-30',GRACE_DAYS)).state).toBe('grace');
 expect(billingOf('basic','2026-09-30','2026-10-15')).toMatchObject({state:'off',offFrom:'2026-10-15'});
 expect(addDays('2026-12-31',1)).toBe('2027-01-01');expect(addDays('2028-02-28',1)).toBe('2028-02-29');
 const at=(plan:string,day:string)=>billingOf(plan,'2026-09-30',day);
 expect([entitled(at('basic','2026-09-01'),'events'),entitled(at('events','2026-09-01'),'events'),entitled(at('events','2026-09-01'),'branches'),entitled(at('vip','2026-10-10'),'branches')]).toEqual([false,true,false,true]);
 expect(entitled(billingOf(null,null,'2026-10-06'),'branches')).toBe(true);
 expect(entitled(at('vip','2026-12-01'),'branches')).toBe(false);
});

test('/gov sets a plan and a day, refuses nonsense and the template, and every change is in the admin log',async({f})=>{
 expect(await setShopPlan(f.db,f.actorId,{shopId:f.shopId,plan:'events',paidUntil:'2099-12-31'})).toMatchObject({state:'active',plan:'events',paidUntil:'2099-12-31'});
 for(const bad of [{plan:'team',paidUntil:'2099-12-31'},{plan:'basic',paidUntil:'2026-02-30'},{plan:'basic',paidUntil:'31/12/2099'},{plan:null,paidUntil:'2099-12-31'}])
  await expect(setShopPlan(f.db,f.actorId,{shopId:f.shopId,...bad})).rejects.toMatchObject({status:400});
 expect(await setShopPlan(f.db,f.actorId,{shopId:f.shopId,plan:null,paidUntil:null})).toMatchObject({state:'trial',plan:null});
 const template=(await f.db.query("INSERT INTO shops(slug,name,is_template)VALUES('mau-goi','Mẫu',true)RETURNING id")).rows[0].id;
 await expect(setShopPlan(f.db,f.actorId,{shopId:template,plan:'basic',paidUntil:'2099-12-31'})).rejects.toMatchObject({code:'TEMPLATE_HAS_NO_PLAN'});
 const log=(await f.db.query("SELECT detail FROM admin_audit WHERE action='shop.plan' ORDER BY id")).rows.map(r=>r.detail.to);
 expect(log).toEqual([{plan:'events',paidUntil:'2099-12-31'},{plan:null,paidUntil:null}]);
});

test('past 14 days the card and the link go to the shop\'s own Google page; in grace the page still runs',async({f})=>{
 const resolver=new PublishingResolver(f.db);
 await pastDue(f,'basic',GRACE_DAYS);
 expect((await resolver.live({slug:f.pageSlug})).googleUrl).toBe(REVIEW);
 await pastDue(f,'basic',GRACE_DAYS+1);
 const unpaid=await resolver.live({slug:f.pageSlug}).catch(e=>e);
 expect(unpaid).toBeInstanceOf(ShopUnpaid);expect(unpaid.googleUrl).toBe(REVIEW);
 // A card follows its page: once activated, the same answer.
 await f.db.query("UPDATE tags SET state='active' WHERE shop_id=$1",[f.shopId]);
 const code=(await f.db.query('SELECT public_code FROM tags WHERE shop_id=$1',[f.shopId])).rows[0].public_code;
 await expect(resolver.live({code})).rejects.toBeInstanceOf(ShopUnpaid);
 await f.db.query("UPDATE shops SET paid_until=paid_until+60 WHERE id=$1",[f.shopId]);
 expect((await resolver.live({code})).slug).toBe(f.pageSlug);
});

test('off: the owner and staff get only the frame; staff are in on every plan, the cheapest too',async({f})=>{
 const auth=new OwnerAuth(f.db),team=new OwnerTeam(f.db);
 // Not yet billed: everyone in, as in the trial period.
 expect((await auth.access(f.managerToken,f.slug,'overview')).billing.state).toBe('trial');
 await pastDue(f,'basic',-30);
 expect((await auth.access(f.managerToken,f.slug,'overview')).billing).toMatchObject({state:'active',plan:'basic'});
 // The plan never refuses an invitation: an unknown role is what stops this one.
 await expect(team.invite(f.ownerToken,f.slug,{handle:'moi-vao',roleId:randomUUID()})).rejects.toMatchObject({code:'ROLE_NOT_FOUND'});
 await pastDue(f,'vip',3);
 expect((await auth.access(f.managerToken,f.slug,'overview')).billing.state).toBe('grace');
 await pastDue(f,'vip',GRACE_DAYS+1);
 expect((await auth.access(f.ownerToken,f.slug,'shell')).billing.state).toBe('off');
 await expect(auth.access(f.ownerToken,f.slug,'overview')).rejects.toMatchObject({status:402,code:'SHOP_UNPAID'});
 await expect(auth.access(f.managerToken,f.slug,'feedback')).rejects.toMatchObject({status:402,code:'SHOP_UNPAID'});
});
