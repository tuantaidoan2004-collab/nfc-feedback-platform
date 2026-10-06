import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {OwnerAuth,openSession,transaction} from '../lib/owner/auth';
import {AdminAuth} from '../lib/admin/auth';
import {Payments} from '../lib/billing/payments';
import {billingOf,TRY_DAYS,addDays} from '../lib/billing/plans';
import {vietQr,crc16} from '../lib/billing/vietqr';

/**
 * Kích hoạt và gia hạn (Tài 06/10, kịch bản mục 3b): quán tự đăng ký dùng thử TRY_DAYS ngày rồi khoá tới khi quét 10k; 10k mở
 * ngay tháng đầu, trong tháng trả nốt giá gói − 10k; mỗi lần trả là một yêu cầu có mã, Admin Tài bấm "Đã nhận" thì hạn tự cộng.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
type Fixture={db:Pool;adminId:string;shopId:string;slug:string;owner:string;manager:string;pay:Payments};
const test=base.extend<{f:Fixture}>({f:async({},provide)=>{
 const schema=`nfc_pay_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  await applySchema(db);
  const adminId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  const shopId=(await db.query("INSERT INTO shops(slug,name,self_signup,publishing_state)VALUES('tu-den','Quán Tự Đến',true,'active')RETURNING id")).rows[0].id;
  const person=async(name:string,role:string)=>{const id=(await db.query("INSERT INTO owner_identities_v2(username,password_salt,password_key)VALUES($1,repeat('0',32),repeat('0',64))RETURNING id",[name])).rows[0].id;
   await db.query('INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,$3)',[id,shopId,role]);return (await transaction(db,c=>openSession(c,id))).token;};
  await provide({db,adminId,shopId,slug:'tu-den',owner:await person('chu-tu-den','owner'),manager:await person('nv-tu-den','manager'),pay:new Payments(db)});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const today=async(f:Fixture)=>(await f.db.query("SELECT to_char(timezone('Asia/Ho_Chi_Minh',clock_timestamp())::date,'YYYY-MM-DD') d")).rows[0].d as string;
const payee={bankBin:'970436',accountNumber:'0000000000',accountName:'Tài khoản thử'};

test('the VietQR is the EMVCo string banks read, with the CRC of the standard',()=>{
 expect(crc16('123456789')).toBe('29B1');
 // Read back from the QR drawn by lib/qr.ts with Chrome's BarcodeDetector (06/10), CRC checked by a separate implementation.
 expect(vietQr({bin:'970436',account:'0000000000',amount:2000,memo:'QS KIEM TRA'}))
  .toBe('00020101021238540010A00000072701240006970436011000000000000208QRIBFTTA5303704540420005802VN62150811QS KIEM TRA63044FF9');
 for(const bad of [{bin:'97043',account:'0000000000',amount:1,memo:'QS'},{bin:'970436',account:'000',amount:1,memo:'QS'},{bin:'970436',account:'0000000000',amount:0,memo:'QS'},{bin:'970436',account:'0000000000',amount:1,memo:'QS <b>'}])
  expect(()=>vietQr(bad)).toThrow('VIETQR_INVALID');
});

test('a shop that signed itself up looks around for its days, then only the 10k opens it',async({f})=>{
 expect(billingOf(null,null,'2026-10-06','2026-10-09')).toMatchObject({state:'trial',activateBy:'2026-10-09'});
 expect(billingOf('vip',null,'2026-10-10','2026-10-09').state).toBe('locked');
 const auth=new OwnerAuth(f.db);
 expect((await auth.access(f.owner,f.slug,'overview')).billing).toMatchObject({state:'trial',activateBy:addDays(await today(f),TRY_DAYS)});
 await f.db.query("UPDATE shops SET created_at=clock_timestamp()-interval '10 days' WHERE id=$1",[f.shopId]);
 expect((await auth.access(f.owner,f.slug,'shell')).billing.state).toBe('locked');
 await expect(auth.access(f.owner,f.slug,'overview')).rejects.toMatchObject({status:402,code:'ACTIVATION_REQUIRED'});
 // Only the frame, and in it only the way to pay: the 10k, never a plan.
 await expect(f.pay.request(f.owner,f.slug,{kind:'activation',plan:'events',cycle:'month'})).rejects.toMatchObject({code:'PAYEE_NOT_SET'});
 await f.pay.setPayee(f.adminId,payee);
 await expect(f.pay.request(f.owner,f.slug,{kind:'plan',plan:'events',cycle:'month'})).rejects.toMatchObject({code:'ACTIVATION_REQUIRED'});
 const first=await f.pay.request(f.owner,f.slug,{kind:'activation',plan:'basic',cycle:'month'});
 const asked=await f.pay.request(f.owner,f.slug,{kind:'activation',plan:'events',cycle:'month'});
 expect(asked.pending).toMatchObject({kind:'activation',plan:'events',amount:10000,months:1});
 expect(asked.pending!.code).not.toBe(first.pending!.code);
 expect(asked.pending!.qr).toContain('<svg');
 expect((await f.db.query("SELECT status FROM payments WHERE shop_id=$1 ORDER BY created_at",[f.shopId])).rows.map(r=>r.status)).toEqual(['cancelled','pending']);
 expect(await f.pay.decide(f.adminId,{id:asked.pending!.id,action:'received'})).toMatchObject({status:'received'});
 await expect(f.pay.decide(f.adminId,{id:asked.pending!.id,action:'received'})).rejects.toMatchObject({code:'PAYMENT_DECIDED'});
 const day=await today(f),month=(await f.db.query("SELECT to_char(($1::date+interval '1 month')::date-1,'YYYY-MM-DD') d",[day])).rows[0].d;
 const opened=await f.pay.status(f.owner,f.slug);
 expect(opened.billing).toMatchObject({state:'active',plan:'events',paidUntil:month,activateBy:null});
 expect(opened.owed).toBe(60000);
 expect((await f.db.query("SELECT action FROM admin_audit WHERE action LIKE 'payment.%' ORDER BY id")).rows.map(r=>r.action)).toEqual(['payment.payee','payment.received']);
});

test('the rest of the first month rides on the next payment; a month adds after the paid day; staff cannot pay',async({f})=>{
 await f.pay.setPayee(f.adminId,payee);
 const activation=await f.pay.request(f.owner,f.slug,{kind:'activation',plan:'basic',cycle:'month'});
 await f.pay.decide(f.adminId,{id:activation.pending!.id,action:'received'});
 // Staff are in on every plan, but paying is the owner's.
 await expect(f.pay.request(f.manager,f.slug,{kind:'plan',plan:'basic',cycle:'month'})).rejects.toMatchObject({code:'OWNER_ROLE_REQUIRED'});
 await expect(f.pay.status(f.manager,f.slug)).rejects.toMatchObject({code:'OWNER_ROLE_REQUIRED'});
 await expect(f.pay.request(f.owner,f.slug,{kind:'activation',plan:'basic',cycle:'month'})).rejects.toMatchObject({code:'NOT_AWAITING_ACTIVATION'});
 await expect(f.pay.request(f.owner,f.slug,{kind:'plan',plan:'team',cycle:'month'})).rejects.toMatchObject({code:'INVALID_PAYMENT'});
 const before=(await f.pay.status(f.owner,f.slug)).billing.paidUntil!;
 const year=await f.pay.request(f.owner,f.slug,{kind:'plan',plan:'vip',cycle:'year'});
 expect(year.pending).toMatchObject({amount:40000+1200000,months:12,settlesFirstMonth:true});
 await f.pay.decide(f.adminId,{id:year.pending!.id,action:'received'});
 const after=await f.pay.status(f.owner,f.slug);
 expect(after.owed).toBe(0);
 expect(after.billing.plan).toBe('vip');
 expect(after.billing.paidUntil).toBe((await f.db.query("SELECT to_char(($1::date+interval '12 months')::date,'YYYY-MM-DD') d",[before])).rows[0].d);
 await expect(f.pay.request(f.owner,f.slug,{kind:'plan',plan:'vip',cycle:'rest'})).rejects.toMatchObject({code:'NOTHING_OWED'});
 // Late: the new month starts from yesterday, never paying for days already gone.
 await f.db.query("UPDATE shops SET paid_until=timezone('Asia/Ho_Chi_Minh',clock_timestamp())::date-40 WHERE id=$1",[f.shopId]);
 const late=await f.pay.request(f.owner,f.slug,{kind:'plan',plan:'basic',cycle:'month'});
 expect(late.pending!.amount).toBe(50000);
 const cancelled=await f.pay.cancel(f.owner,f.slug);expect(cancelled.pending).toBeNull();
 const again=await f.pay.request(f.owner,f.slug,{kind:'plan',plan:'basic',cycle:'month'});
 expect(await f.pay.decide(f.adminId,{id:again.pending!.id,action:'received'})).toMatchObject({paidUntil:(await f.db.query("SELECT to_char((timezone('Asia/Ho_Chi_Minh',clock_timestamp())::date-1+interval '1 month')::date,'YYYY-MM-DD') d")).rows[0].d});
});

test('/gov keeps one account to pay into, in the bank\'s capitals, and refuses one it cannot draw',async({f})=>{
 expect(await f.pay.setPayee(f.adminId,{bankBin:'970436',accountNumber:' 0123456789 ',accountName:'Đoàn  Văn   Thử'})).toMatchObject({bank:'Vietcombank',accountNumber:'0123456789',accountName:'DOAN VAN THU'});
 for(const bad of [{...payee,bankBin:'123456'},{...payee,accountNumber:'12'},{...payee,accountName:'<b>'}])
  await expect(f.pay.setPayee(f.adminId,bad)).rejects.toMatchObject({code:'INVALID_PAYEE'});
 expect((await f.pay.payeeCheck())!.qr).toContain('<svg');
 expect((await f.db.query('SELECT count(*)::int n FROM payment_settings')).rows[0].n).toBe(1);
});
