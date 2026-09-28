import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {AdminAuth} from '../lib/admin/auth';
import {AdminBilling} from '../lib/admin/billing';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {OwnerAuth} from '../lib/owner/auth';
import {OwnerBilling} from '../lib/owner/billing';
/** Lát P5b-lite (migration 031): where money goes, what each shop has paid, and who may read it. Test values only. */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const test=base.extend<{f:{db:Pool;billing:AdminBilling;shops:ShopProvisioning;auth:OwnerAuth;actorId:string}}>({f:async({},provide)=>{
 const schema=`nfc_billing_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:3});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of ['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql','022_shop_profile.sql','023_media_review.sql','030_text_review.sql','024_pages.sql','025_page_labels.sql','026_page_lifecycle.sql','027_page_debt.sql','028_retire_legacy.sql','029_shop_signups.sql','031_billing.sql'])
   await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  const actorId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  await provide({db,billing:new AdminBilling(db),shops:new ShopProvisioning(db),auth:new OwnerAuth(db),actorId});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const settings={bank:'Ngân hàng Thử',holder:'NGUYEN VAN THU',account:'0123456789',zalo:'0912345678',qr:'data:image/png;base64,iVBORw0KGgo='};
const failure=async(run:Promise<unknown>)=>run.then(()=>'ok',(error:{code?:string})=>error.code);
const vnDay=(offset:number)=>new Date(Date.now()+7*3600_000+offset*86_400_000).toISOString().slice(0,10);
async function shopWithOwner(f:{shops:ShopProvisioning;auth:OwnerAuth;db:Pool;actorId:string},name:string,user:string){
 const made=await f.shops.create(f.actorId,{name,ownerUsername:user,ownerEmail:`${user}@example.com`,googleUrl:''});
 await new OwnerSetupLinks(f.db).consume(made.setupToken,'owner-password-long');
 return {made,token:(await f.auth.login(user,'owner-password-long')).token};
}

test('the operator saves where money goes, once, and each save is on the record without the picture',async({f})=>{
 expect(await f.billing.settings()).toBeNull();
 await f.billing.saveSettings(f.actorId,settings);
 await f.billing.saveSettings(f.actorId,{...settings,qr:null});
 expect(await f.billing.settings()).toEqual({...settings,qr:null});
 expect(await failure(f.billing.saveSettings(f.actorId,{...settings,account:'12'}))).toBe('INVALID_SETTINGS');
 const audit=(await f.db.query("SELECT detail FROM admin_audit WHERE action='billing.settings' ORDER BY id")).rows.map(row=>row.detail);
 expect(audit).toEqual([{bank:settings.bank,holder:settings.holder,account:settings.account,zalo:settings.zalo,qr:true},{bank:settings.bank,holder:settings.holder,account:settings.account,zalo:settings.zalo,qr:false}]);
});

test('records are never changed; the newest decides; the owner reads it, a manager and the template never',async({f})=>{
 const {made,token}=await shopWithOwner(f,'Quán Thu Tiền','quan-thu');
 const owner=new OwnerBilling(f.db);
 let view=await owner.get(token,made.slug);
 // One paid page, inside the two free places: nothing to pay yet; no record; no transfer details before the operator sets them.
 expect(view).toMatchObject({monthly:0,status:{kind:'none'},history:[],transfer:null});
 await f.billing.saveSettings(f.actorId,settings);
 await f.billing.record(f.actorId,{shopId:made.shopId,kind:'trial',amountVnd:0,coversUntil:vnDay(14)});
 const paid=await f.billing.record(f.actorId,{shopId:made.shopId,kind:'payment',amountVnd:30000,coversUntil:vnDay(40),note:'Biên lai Zalo'});
 view=await owner.get(token,made.slug);
 expect(view.status).toEqual({kind:'payment',coversUntil:vnDay(40),daysLeft:40});
 expect(view.history.map(row=>row.kind)).toEqual(['payment','trial']);
 expect(view.transfer).toEqual({...settings,memo:`QS ${made.slug.toUpperCase()}`});
 // A mistake is corrected by a newer record, never by editing the old one.
 await expect(f.db.query('UPDATE shop_payments SET amount_vnd=1 WHERE id=$1',[paid.id])).rejects.toThrow('IMMUTABLE_PUBLISHING_RECORD');
 await expect(f.db.query('DELETE FROM shop_payments WHERE id=$1',[paid.id])).rejects.toThrow('IMMUTABLE_PUBLISHING_RECORD');
 await f.billing.record(f.actorId,{shopId:made.shopId,kind:'payment',amountVnd:30000,coversUntil:vnDay(-2),note:'Sửa ngày ghi nhầm'});
 expect((await owner.get(token,made.slug)).status).toEqual({kind:'payment',coversUntil:vnDay(-2),daysLeft:-2});
 expect((await f.billing.due()).map(row=>[row.slug,row.days_left])).toEqual([[made.slug,-2]]);
 expect((await f.billing.latest())[made.shopId]).toEqual({kind:'payment',coversUntil:vnDay(-2)});
 expect((await f.db.query("SELECT count(*)::int n FROM admin_audit WHERE action='billing.record' AND shop_id=$1",[made.shopId])).rows[0].n).toBe(3);
 // A manager of the same shop does not see the money; nor may anyone record for the template shop or with bad input.
 const managerId=await f.auth.bootstrap('quan-ly-thu','manager-password-long',async()=>{});
 await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'manager')",[managerId,made.shopId]);
 const manager=(await f.auth.login('quan-ly-thu','manager-password-long')).token;
 expect(await failure(owner.get(manager,made.slug))).toBe('OWNER_ROLE_REQUIRED');
 const template=await f.shops.ensureTemplate(f.actorId);
 expect(await failure(f.billing.record(f.actorId,{shopId:template.shopId,kind:'trial',amountVnd:0,coversUntil:vnDay(3)}))).toBe('SHOP_NOT_FOUND');
 expect(await failure(f.billing.record(f.actorId,{shopId:made.shopId,kind:'trial',amountVnd:5000,coversUntil:vnDay(3)}))).toBe('INVALID_PAYMENT');
});

test('another shop\'s owner reads nothing of this one',async({f})=>{
 const one=await shopWithOwner(f,'Quán Một','quan-mot');const two=await shopWithOwner(f,'Quán Hai','quan-hai');
 await f.billing.record(f.actorId,{shopId:one.made.shopId,kind:'payment',amountVnd:10000,coversUntil:vnDay(30)});
 expect(await failure(new OwnerBilling(f.db).get(two.token,one.made.slug))).toBe('ACCESS_DENIED');
 expect((await new OwnerBilling(f.db).get(two.token,two.made.slug)).status).toEqual({kind:'none'});
});
