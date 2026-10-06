import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {setShopPlan} from '../lib/admin/shop-plan';
import {OwnerAuth,openSession,transaction} from '../lib/owner/auth';
import {AdminAuth} from '../lib/admin/auth';
import {PublishingResolver,ShopUnpaid} from '../lib/publishing/repository';
import {Payments} from '../lib/billing/payments';
import {addBranch,accountShops} from '../lib/account/branches';
import {GRACE_DAYS} from '../lib/billing/plans';

/**
 * Nhiều địa chỉ quán (G3b, Tài 06/10, kịch bản mục 13): chủ quán VIP thêm địa chỉ (tên, Place ID → link Google riêng) và chuyển
 * qua lại; mỗi địa chỉ là một quán riêng (trang, đội ngũ riêng) nhưng tiền là của quán chính: trả ở đó thì mọi địa chỉ mở, để quá
 * hạn thì mọi địa chỉ tắt. Quán chính còn địa chỉ thì không hạ xuống gói dưới VIP.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
type Fixture={db:Pool;adminId:string;shopId:string;slug:string;pageSlug:string;owner:string;ownerId:string;manager:string};
const test=base.extend<{f:Fixture}>({f:async({},provide)=>{
 const schema=`nfc_branch_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  await applySchema(db);
  const adminId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  const made=await new ShopProvisioning(db).create(adminId,{name:'Quán Mây',ownerUsername:'chu-may',ownerEmail:'may@example.com',placeId:'ChIJN1t_tDeuEmsRUsoyG83frY4'});
  const manager=(await db.query("INSERT INTO owner_identities_v2(username,password_salt,password_key)VALUES('nv-may',repeat('0',32),repeat('0',64))RETURNING id")).rows[0].id;
  await db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'manager')",[manager,made.shopId]);
  const token=async(id:string)=>(await transaction(db,c=>openSession(c,id))).token;
  const pageSlug=(await db.query('SELECT slug FROM pages WHERE shop_id=$1',[made.shopId])).rows[0].slug;
  await provide({db,adminId,shopId:made.shopId,slug:made.slug,pageSlug,owner:await token(made.ownerUserId),ownerId:made.ownerUserId,manager:await token(manager)});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const PLACE='ChIJ3S-JXmauEmsRUcIaWtf4MzE';
const paid=(f:Fixture,plan:string,days:number)=>f.db.query(`UPDATE shops SET plan=$2,paid_until=timezone('Asia/Ho_Chi_Minh',clock_timestamp())::date+$3::int WHERE id=$1`,[f.shopId,plan,days]);

test('only the owner of a VIP shop (or one not yet billed) adds an address, with its own Google link and its own team',async({f})=>{
 await paid(f,'events',30);
 await expect(addBranch(f.db,f.owner,f.slug,{name:'Quán Mây Q3'})).rejects.toMatchObject({status:402,code:'VIP_REQUIRED'});
 await paid(f,'vip',30);
 await expect(addBranch(f.db,f.manager,f.slug,{name:'Quán Mây Q3'})).rejects.toMatchObject({status:403,code:'OWNER_ROLE_REQUIRED'});
 for(const bad of [{name:''},{name:'<b>x</b>'},{name:'x'.repeat(101)}])
  await expect(addBranch(f.db,f.owner,f.slug,bad)).rejects.toMatchObject({code:'INVALID_NAME'});
 await expect(addBranch(f.db,f.owner,f.slug,{name:'Quán Mây Q3',placeId:'không phải mã'})).rejects.toMatchObject({code:'INVALID_PLACE_ID'});
 const q3=await addBranch(f.db,f.owner,f.slug,{name:'Quán Mây Q3',placeId:`Place ID: ${PLACE}`});
 const row=(await f.db.query('SELECT name,place_id,google_url,main_shop_id,publishing_state,plan FROM shops WHERE slug=$1',[q3.slug])).rows[0];
 expect(row).toMatchObject({name:'Quán Mây Q3',place_id:PLACE,google_url:`https://search.google.com/local/writereview?placeid=${PLACE}`,main_shop_id:f.shopId,publishing_state:'active',plan:null});
 // Its own team: the owner is in, the main shop's staff are not.
 const auth=new OwnerAuth(f.db);
 expect((await auth.access(f.owner,q3.slug,'overview')).role).toBe('owner');
 await expect(auth.access(f.manager,q3.slug,'shell')).rejects.toMatchObject({status:403});
 // Added from an address, the next one still belongs to the main shop: one level only.
 const q7=await addBranch(f.db,f.owner,q3.slug,{name:'Quán Mây Q7'});
 expect((await f.db.query('SELECT main_shop_id FROM shops WHERE slug=$1',[q7.slug])).rows[0].main_shop_id).toBe(f.shopId);
 expect((await accountShops(f.db,f.ownerId)).map(s=>[s.name,s.mainSlug])).toEqual([['Quán Mây',null],['Quán Mây Q3',f.slug],['Quán Mây Q7',f.slug]]);
 const log=(await f.db.query("SELECT shop_id,target FROM shop_activity WHERE action='shop.branch' ORDER BY id")).rows;
 expect(log.map(l=>l.target)).toEqual(['Quán Mây Q3','Quán Mây Q7']);
 // A shop not yet billed opens everything, addresses too (the trial period).
 await f.db.query('UPDATE shops SET plan=NULL,paid_until=NULL WHERE id=$1',[f.shopId]);
 expect((await addBranch(f.db,f.owner,f.slug,{name:'Quán Mây Thủ Đức'})).slug).toMatch(/^[a-z0-9]{6}$/);
});

test('an address has no plan of its own: paying the main shop opens every address, letting it lapse closes them all',async({f})=>{
 await paid(f,'vip',30);
 const q3=await addBranch(f.db,f.owner,f.slug,{name:'Quán Mây Q3',placeId:PLACE});
 const branchId=(await f.db.query('SELECT id FROM shops WHERE slug=$1',[q3.slug])).rows[0].id;
 const auth=new OwnerAuth(f.db);
 expect((await auth.access(f.owner,q3.slug,'overview')).billing).toMatchObject({state:'active',plan:'vip',main:{slug:f.slug,name:'Quán Mây'}});
 expect((await auth.access(f.owner,f.slug,'overview')).billing.main).toBeNull();
 // The database refuses a plan written on the address itself.
 await expect(f.db.query("UPDATE shops SET plan='vip',paid_until='2099-12-31' WHERE id=$1",[branchId])).rejects.toMatchObject({code:'23514'});
 // A live page on an address follows the main shop's day: past 14 days its guests go to the address's own Google page,
 // not the main shop's. (A page never changes shop, so the address with a page is a provisioned shop put under the main one.)
 const other=await new ShopProvisioning(f.db).create(f.adminId,{name:'Quán Mây Q1',ownerUsername:'chu-may-q1',ownerEmail:'q1@example.com',placeId:PLACE});
 await f.db.query('UPDATE shops SET main_shop_id=$2 WHERE id=$1',[other.shopId,f.shopId]);
 const page=(await f.db.query('SELECT slug FROM pages WHERE shop_id=$1',[other.shopId])).rows[0].slug;
 const resolver=new PublishingResolver(f.db);
 expect((await resolver.live({slug:page})).googleUrl).toBe(`https://search.google.com/local/writereview?placeid=${PLACE}`);
 await paid(f,'vip',-(GRACE_DAYS+1));
 expect((await auth.access(f.owner,q3.slug,'shell')).billing.state).toBe('off');
 await expect(auth.access(f.owner,q3.slug,'overview')).rejects.toMatchObject({status:402,code:'SHOP_UNPAID'});
 const unpaid=await resolver.live({slug:page}).catch(e=>e);
 expect(unpaid).toBeInstanceOf(ShopUnpaid);expect(unpaid.googleUrl).toBe(`https://search.google.com/local/writereview?placeid=${PLACE}`);
 await paid(f,'vip',30);
 expect((await auth.access(f.owner,q3.slug,'overview')).billing.state).toBe('active');
 expect((await resolver.live({slug:page})).slug).toBe(page);
});

test('the address pays nowhere; the main shop keeps VIP while it has addresses, at /gov and at the bank',async({f})=>{
 const pay=new Payments(f.db);
 await pay.setPayee(f.adminId,{bankBin:'970436',accountNumber:'0000000000',accountName:'Tài khoản thử'});
 await paid(f,'vip',30);
 // A lower plan asked for before the first address existed is refused when Admin Tài confirms it.
 const earlier=(await pay.request(f.owner,f.slug,{kind:'plan',plan:'basic',cycle:'month'})).pending!.id;
 const q3=await addBranch(f.db,f.owner,f.slug,{name:'Quán Mây Q3'});
 await expect(pay.decide(f.adminId,{id:earlier,action:'received'})).rejects.toMatchObject({code:'BRANCHES_NEED_VIP'});
 const branchId=(await f.db.query('SELECT id FROM shops WHERE slug=$1',[q3.slug])).rows[0].id;
 await expect(pay.request(f.owner,q3.slug,{kind:'plan',plan:'vip',cycle:'month'})).rejects.toMatchObject({status:409,code:'PAID_BY_MAIN'});
 await expect(pay.request(f.owner,f.slug,{kind:'plan',plan:'basic',cycle:'month'})).rejects.toMatchObject({status:409,code:'BRANCHES_NEED_VIP'});
 await expect(setShopPlan(f.db,f.adminId,{shopId:branchId,plan:'vip',paidUntil:'2099-12-31'})).rejects.toMatchObject({code:'PAID_BY_MAIN'});
 await expect(setShopPlan(f.db,f.adminId,{shopId:f.shopId,plan:'events',paidUntil:'2099-12-31'})).rejects.toMatchObject({code:'BRANCHES_NEED_VIP'});
 // VIP, or no plan at all, stays possible; and paying the main shop moves every address's day.
 expect(await setShopPlan(f.db,f.adminId,{shopId:f.shopId,plan:'vip',paidUntil:'2099-12-31'})).toMatchObject({state:'active',plan:'vip'});
 expect((await new OwnerAuth(f.db).access(f.owner,q3.slug,'overview')).billing.paidUntil).toBe('2099-12-31');
 // /gov lists the address with the shop that pays for it.
 const listed=(await new ShopProvisioning(f.db).list()).find(s=>s.slug===q3.slug)!;
 expect(listed.billing).toMatchObject({state:'active',main:{slug:f.slug,name:'Quán Mây'}});
});
