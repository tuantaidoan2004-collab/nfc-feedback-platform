import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {AccountSignup} from '../lib/account/signup';
import {AdminAuth} from '../lib/admin/auth';
import {EditRequests} from '../lib/admin/edit-requests';
import {saveShopDetails} from '../lib/admin/shop-details';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {requestEdit} from '../lib/owner/edit-requests';
import {OwnerPages} from '../lib/owner/pages';
import {PublishingAdmin,PublishingResolver,type PageRef} from '../lib/publishing/repository';
import {pageFromTemplate} from '../lib/canvas/templates';
import {walk} from '../lib/canvas/validate';
import type {ButtonEl,PageDoc} from '../lib/canvas/doc';

/**
 * Tài 06/10: a template is a look, not a page -- its links, its words on buttons, its wifi are samples. A shop picks one and leaves
 * its Zalo; Tài fills the shop's details and publishes (scripts/sua-trang.mjs). Shown to guests, a page takes the shop's details in
 * its places at the moment it is shown, and the publishing core refuses a page that would still lead to a sample.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
type F={db:Pool;adminId:string;core:PublishingAdmin;resolver:PublishingResolver};
const test=base.extend<{f:F}>({f:async({},provide)=>{
 const schema=`nfc_requests_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:4});
 try{await root.query(`CREATE SCHEMA ${schema}`);await applySchema(db);
  const adminId=await new AdminAuth(db).bootstrap('tai','a-sufficiently-long-admin-secret',async()=>{});
  await provide({db,adminId,core:new PublishingAdmin(db,async()=>({actorId:`admin:${adminId}`})),resolver:new PublishingResolver(db)});}
 finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const code=async(run:Promise<unknown>)=>run.then(()=>'ok',(error:{code?:string})=>error.code);
const signUp=async(f:F,name='chu-quan')=>{const made=await new AccountSignup(f.db).create({username:name,email:`${name}@example.test`,password:'a-long-test-password'},null);
 return {...made,token:made.session.token,shopId:(await f.db.query('SELECT id FROM shops WHERE slug=$1',[made.slug])).rows[0].id as string};};
const pageRef=async(f:F,slug:string):Promise<PageRef&{revision:number}>=>{
 const row=(await f.db.query('SELECT p.shop_id,p.id,d.revision FROM pages p JOIN page_drafts d ON d.page_id=p.id WHERE p.slug=$1',[slug])).rows[0];
 return {shopId:row.shop_id,pageId:row.id,revision:Number(row.revision)};
};
/** What scripts/sua-trang.mjs does, in one transaction: the shop's details, then the page published. */
async function build(f:F,shopId:string,slug:string,details:Parameters<typeof saveShopDetails>[3]){
 const db=await f.db.connect();
 try{await db.query('BEGIN');await saveShopDetails(db,f.adminId,shopId,details);const page=await pageRef(f,slug);
  const done=await new PublishingAdmin(db,async()=>({actorId:`admin:${f.adminId}`})).publish(page,page.revision);
  await db.query("UPDATE edit_requests SET handled_at=clock_timestamp(),handled_by='agent',outcome='published' WHERE page_id=$1 AND handled_at IS NULL",[page.pageId]);
  await db.query('COMMIT');return done;}
 catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
const button=(doc:PageDoc,id:string)=>[...walk(doc)].find(el=>el.id===id) as ButtonEl;

test('picking a template: the owner leaves a Zalo, a draft page waits for Tài, asking again keeps one request with every word',async({f})=>{
 const shop=await signUp(f),pages=new OwnerPages(f.db);
 // A Zalo Tài can message, and a template that exists; nothing is made otherwise.
 expect(await code(requestEdit(f.db,shop.token,shop.slug,{template:'hien-dai',contact:'12345'}))).toBe('INVALID_CONTACT');
 expect(await code(requestEdit(f.db,shop.token,shop.slug,{template:'khong-co',contact:'0912345678'}))).toBe('INVALID_TEMPLATE');
 expect(await code(requestEdit(f.db,shop.token,shop.slug,{contact:'0912345678'}))).toBe('INVALID_REQUEST');
 expect(await code(requestEdit(f.db,shop.token,shop.slug,{template:'hien-dai',contact:'0912345678',price:0}))).toBe('INVALID_REQUEST');
 expect((await f.db.query('SELECT count(*)::int n FROM pages')).rows[0].n).toBe(0);
 const asked=await requestEdit(f.db,shop.token,shop.slug,{template:'hien-dai',contact:'+84 912 345 678',message:'Quán trà sữa <b>xanh lá</b>'});
 expect(asked).toEqual({page:expect.stringMatching(/^[2-9a-hjkmnp-z]{5}$/),waiting:true});
 await requestEdit(f.db,shop.token,shop.slug,{page:asked.page,contact:'0987654321',message:'Thêm wifi cho khách'});
 const rows=(await f.db.query('SELECT template_key,contact,message,contacted_at,handled_at FROM edit_requests')).rows;
 expect(rows).toEqual([{template_key:'hien-dai',contact:'0987654321',message:'Quán trà sữa bxanh lá/b\n—\nThêm wifi cho khách',contacted_at:null,handled_at:null}]);
 const listed=await pages.list(shop.token,shop.slug);
 expect(listed.contact).toBe('0987654321');
 expect(listed.pages).toEqual([expect.objectContaining({slug:asked.page,label:'Trang chính',state:'draft',template:{key:'hien-dai',version:1},
  request:{at:expect.any(String),template:'hien-dai',message:'Quán trà sữa bxanh lá/b\n—\nThêm wifi cho khách',contacted:false}})]);
 // Nothing is live: a shop's page reaches guests only through Tài.
 await expect(f.resolver.live({slug:asked.page})).rejects.toThrow('PAGE_UNAVAILABLE');
 // The owner's picture of it, while it waits: the template picked, with the shop's name in.
 const picture=await pages.picture(shop.token,shop.slug,asked.page);
 expect(JSON.stringify(picture.config.doc)).toContain('QUÁN CỦA @CHU-QUAN');expect(button(picture.config.doc,'zalo').link).toBe('https://zalo.me/');
 expect((await f.db.query("SELECT target FROM shop_activity WHERE action='edit.request' ORDER BY id")).rows.map(r=>r.target)).toEqual([`${asked.page} · Hiện đại`,asked.page]);
});

test('in /gov: oldest first with the Zalo to message; "Đã nhắn Zalo" tells the owner; "Đóng" closes; the draft is on show only while it waits',async({f})=>{
 const one=await signUp(f,'quan-mot'),two=await signUp(f,'quan-hai'),requests=new EditRequests(f.db);
 const first=await requestEdit(f.db,one.token,one.slug,{template:'party',contact:'0912345678'});
 const second=await requestEdit(f.db,two.token,two.slug,{template:'basic-1',contact:'0987654321',message:'Gấp'});
 const open=await requests.open();
 expect(open.map(row=>[row.page_slug,row.template_name,row.contact,row.owner_handle])).toEqual([[first.page,'Interactive card · Party','0912345678','quan-mot'],[second.page,'Basic 1','0987654321','quan-hai']]);
 expect(await requests.draft(open[0].page_id)).toMatchObject({slug:first.page,name:'Quán của @quan-mot'});
 expect(await code(requests.act(f.adminId,open[0].id,{action:'publish'}))).toBe('INVALID_INPUT');
 expect(await code(requests.act(f.adminId,'not-an-id',{action:'done'}))).toBe('INVALID_INPUT');
 await requests.act(f.adminId,open[0].id,{action:'contacted'});
 expect((await new OwnerPages(f.db).list(one.token,one.slug)).pages[0].request).toMatchObject({contacted:true});
 await requests.act(f.adminId,open[0].id,{action:'done'});
 expect(await code(requests.act(f.adminId,open[0].id,{action:'done'}))).toBe('REQUEST_ALREADY_HANDLED');
 expect(await requests.draft(open[0].page_id)).toBeNull();
 expect((await requests.open()).map(row=>row.page_slug)).toEqual([second.page]);
 expect((await f.db.query("SELECT outcome,handled_by FROM edit_requests WHERE page_id=$1",[open[0].page_id])).rows).toEqual([{outcome:'closed',handled_by:`admin:${f.adminId}`}]);
 expect((await f.db.query("SELECT action FROM admin_audit WHERE action LIKE 'page.edit_request.%' ORDER BY id")).rows.map(r=>r.action)).toEqual(['page.edit_request.contacted','page.edit_request.done']);
});

test('Tài builds it: the shop\'s details go in its places, what the shop lacks is not there, and a number changed later is right at once',async({f})=>{
 const shop=await signUp(f),asked=await requestEdit(f.db,shop.token,shop.slug,{template:'hien-dai',contact:'0912345678'});
 await build(f,shop.shopId,asked.page,{name:'Nhẹ Tênh Tea',placeId:'ChIJN1t_tDeuEmsRUsoyG83frY4',
  profile:{links:{zalo:'0912345678',website:{url:'https://nhetenh.vn',label:'NHETENH.VN – HẬU MÃI'}}}});
 const live=await f.resolver.live({slug:asked.page});
 expect(button(live.config.doc,'zalo')).toMatchObject({link:'https://zalo.me/0912345678'});
 expect(button(live.config.doc,'hau-mai')).toMatchObject({link:'https://nhetenh.vn',label:{vi:'NHETENH.VN – HẬU MÃI'}});
 expect(button(live.config.doc,'tiktok').hide).toBe(true);expect(button(live.config.doc,'bang-gia').hide).toBe(true);
 expect(JSON.stringify(live.config.doc)).toContain('NHẸ TÊNH TEA');expect(live.googleUrl).toContain('ChIJN1t_tDeuEmsRUsoyG83frY4');
 expect((await f.db.query('SELECT outcome,handled_by FROM edit_requests')).rows).toEqual([{outcome:'published',handled_by:'agent'}]);
 // The stored release is the design; the details are read when the page is shown, so a new number needs no new release.
 const releases=(await f.db.query('SELECT count(*)::int n FROM page_releases')).rows[0].n;
 const db=await f.db.connect();
 try{await saveShopDetails(db,f.adminId,shop.shopId,{profile:{links:{zalo:'0987654321',tiktok:'@nhetenh'}}});}finally{db.release();}
 const after=await f.resolver.live({slug:asked.page});
 expect(button(after.config.doc,'zalo').link).toBe('https://zalo.me/0987654321');expect(button(after.config.doc,'tiktok').link).toBe('https://www.tiktok.com/@nhetenh');
 expect(button(after.config.doc,'hau-mai').hide).toBe(true);
 expect((await f.db.query('SELECT count(*)::int n FROM page_releases')).rows[0].n).toBe(releases);
});

test('a new look for a live page: guests keep the old one until Tài publishes the new one; the same look again keeps Tài\'s work',async({f})=>{
 const shop=await signUp(f),asked=await requestEdit(f.db,shop.token,shop.slug,{template:'hien-dai',contact:'0912345678'});
 await build(f,shop.shopId,asked.page,{profile:{links:{zalo:'0912345678'}}});
 // Picking the template the page already wears only asks for changes: the page Tài built is not started afresh.
 const built=(await pageRef(f,asked.page)).revision;
 await requestEdit(f.db,shop.token,shop.slug,{page:asked.page,template:'hien-dai',contact:'0912345678',message:'Đổi chữ PRICE'});
 expect((await pageRef(f,asked.page)).revision).toBe(built);
 await requestEdit(f.db,shop.token,shop.slug,{page:asked.page,template:'basic-1',contact:'0912345678'});
 expect((await f.resolver.live({slug:asked.page})).template).toBe('hien-dai');
 expect((await new OwnerPages(f.db).list(shop.token,shop.slug)).pages[0]).toMatchObject({state:'active',template:{key:'basic-1'},request:{template:'basic-1'}});
 await build(f,shop.shopId,asked.page,{});
 const live=await f.resolver.live({slug:asked.page});
 expect(live.template).toBe('basic-1');expect(button(live.config.doc,'zalo').link).toBe('https://zalo.me/0912345678');
 expect(button(live.config.doc,'instagram').hide).toBe(true);
});

test('the publishing core refuses a page that still leads to a sample, whoever publishes it; the sample shop keeps its samples',async({f})=>{
 const shop=await signUp(f),asked=await requestEdit(f.db,shop.token,shop.slug,{template:'hien-dai',contact:'0912345678'});
 const page=await pageRef(f,asked.page);
 // A slot left as it was is hidden, so the page publishes; an element that lost its slot but kept a sample link does not.
 const doc=pageFromTemplate('hien-dai','x').doc,zalo=button(doc,'zalo');delete zalo.slot;
 const saved=await f.core.saveDraft(page,page.revision,{schemaVersion:4,name:'x',doc});
 expect(await code(f.core.publish(page,saved))).toBe('PAGE_NOT_SYNCED');
 zalo.link='https://zalo.me/0912345678';
 const fixed=await f.core.saveDraft(page,saved,{schemaVersion:4,name:'x',doc});
 expect(await code(f.core.publish(page,fixed))).toBe('ok');
 // A link back to this platform is a sample too.
 const back=pageFromTemplate('hien-dai','x').doc;delete button(back,'hau-mai').slot;
 const again=await f.core.saveDraft(page,fixed+1,{schemaVersion:4,name:'x',doc:back});
 expect(await code(f.core.publish(page,again))).toBe('PAGE_NOT_SYNCED');
 // The sample shop that shows the dashboard publishes its page as it is, its sample name and all (since 06/10 the hidden start
 // page, which carries no sample link).
 const sample=await new ShopProvisioning(f.db).ensureTemplate(f.adminId);
 const shown=(await f.resolver.live({slug:sample.slug})).config.doc;
 expect(JSON.stringify(shown)).toContain('YOUR SHOP');expect([...walk(shown)].some(el=>el.t==='google')).toBe(true);
});

test('the shop\'s details are checked against every live page before they are saved, and refused by where the problem is',async({f})=>{
 const shop=await signUp(f),asked=await requestEdit(f.db,shop.token,shop.slug,{template:'chuyen-dong',contact:'0912345678'});
 await build(f,shop.shopId,asked.page,{profile:{links:{instagram:'@nhetenh'}}});
 const db=await f.db.connect();
 try{
  // Words that trade a gift for a review never reach a page through the shop's details either.
  await expect(saveShopDetails(db,f.adminId,shop.shopId,{profile:{hours:'Tặng quà khi đánh giá 5 sao'}})).rejects.toMatchObject({code:'POLICY_GOOGLE_EXCHANGE',at:asked.page});
  await expect(saveShopDetails(db,f.adminId,shop.shopId,{profile:{links:{facebook:'https://www.facebook.com/'}}})).rejects.toMatchObject({code:'INVALID_PROFILE',at:'links.facebook.url'});
  await expect(saveShopDetails(db,f.adminId,shop.shopId,{placeId:'nope'})).rejects.toMatchObject({code:'INVALID_PLACE_ID'});
  await expect(saveShopDetails(db,f.adminId,shop.shopId,{name:'<b>'})).rejects.toMatchObject({code:'INVALID_NAME'});
  expect(await saveShopDetails(db,f.adminId,shop.shopId,{profile:{links:{instagram:'@nhetenh'}}})).toEqual({changed:[]});
  expect(await saveShopDetails(db,f.adminId,shop.shopId,{profile:{links:{instagram:'@nhetenh'},hours:'Mở cửa 8:00 – 21:00'},name:'Nha Khoa Nụ Cười'})).toEqual({changed:['name','profile']});
 }finally{db.release();}
 const live=await f.resolver.live({slug:asked.page});
 expect(JSON.stringify(live.config.doc)).toContain('Mở cửa 8:00 – 21:00');expect(JSON.stringify(live.config.doc)).toContain('NHA KHOA NỤ CƯỜI');
 // Only a change is recorded: the build's own details, then the hours and the name.
 expect((await f.db.query("SELECT detail FROM admin_audit WHERE action='shop.details' ORDER BY id")).rows.map(r=>r.detail.changed)).toEqual([['profile'],['name','profile']]);
});

test('only the owner makes a page; a support session asks for nothing; a closed page takes no requests',async({f})=>{
 const shop=await signUp(f),asked=await requestEdit(f.db,shop.token,shop.slug,{template:'hien-dai',contact:'0912345678'});
 await f.core.closePage(await pageRef(f,asked.page));
 expect(await code(requestEdit(f.db,shop.token,shop.slug,{page:asked.page,contact:'0912345678'}))).toBe('PAGE_CLOSED');
 expect(await code(requestEdit(f.db,shop.token,shop.slug,{page:asked.page,template:'party',contact:'0912345678'}))).toBe('PAGE_CLOSED');
 expect(await code(requestEdit(f.db,{impersonation:'0'.repeat(64)},shop.slug,{template:'party',contact:'0912345678'}))).toBe('IMPERSONATION_ENDED');
});
