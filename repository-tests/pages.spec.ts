import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {AdminAuth} from '../lib/admin/auth';
import {OwnerAuth} from '../lib/owner/auth';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {OwnerCards} from '../lib/owner/cards';
import {OwnerPages} from '../lib/owner/pages';
import {requestEdit} from '../lib/owner/edit-requests';
import {OwnerDashboard} from '../lib/owner/dashboard';
import {parseFilters} from '../lib/owner/filters';
import {PublishingAdmin,PublishingResolver,type PageRef} from '../lib/publishing/repository';

import {publishingVisitPolicy} from '../lib/publishing/visit-policy';
import {VisitRatingRepository} from '../lib/repositories/visit-ratings';
import type {RenderContext} from '../lib/publishing/proof';
import { pageFromTemplate } from '../lib/canvas/templates';

/**
 * Lát P1 (migration 024, docs/goi-va-trang.md mục 3): a shop has pages. Each page is its own link, draft, releases,
 * cards and content; the shop stays the tenant, so every page's feedback lands in the shop's one dashboard.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
type F={db:Pool;shops:ShopProvisioning;actorId:string;admin:PublishingAdmin;resolver:PublishingResolver};
const test=base.extend<{f:F}>({f:async({},provide)=>{
 const schema=`nfc_pages_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  await applySchema(db);
  const actorId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  await provide({db,shops:new ShopProvisioning(db),actorId,admin:new PublishingAdmin(db,async()=>({actorId})),resolver:new PublishingResolver(db)});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
async function shopOn(f:F,n:number){
 const made=await f.shops.create(f.actorId,{name:`Quán ${n}`,ownerUsername:`quan-${n}`,ownerEmail:`q${n}@example.com`,placeId:'ChIJN1t_tDeuEmsRUsoyG83frY4',templateKey:'nut-don'});
 await new OwnerSetupLinks(f.db).consume(made.setupToken,`password-of-quan-${n}`);
 return {...made,page:{shopId:made.shopId,pageId:made.pageId} as PageRef,token:(await new OwnerAuth(f.db).login(`quan-${n}`,`password-of-quan-${n}`)).token};
}
/** A second page of the shop, the way "Nhân bản" will make one (lát P3): its own link, its own draft. */
async function secondPage(f:F,shopId:string,slug:string,name:string){
 const template=(await f.db.query("SELECT id FROM template_versions WHERE template_key='nut-don'")).rows[0].id;
 const page=await f.admin.createPage(shopId,template,pageFromTemplate('nut-don',name),slug);
 await f.admin.publish(page,1);return page;
}
async function manager(f:F,shopId:string){
 const auth=new OwnerAuth(f.db),id=await auth.bootstrap('quan-ly','password-of-quan-ly',async()=>{});
 await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'manager')",[id,shopId]);
 return (await auth.login('quan-ly','password-of-quan-ly')).token;
}
const hash=(c:RenderContext)=>createHash('sha256').update(`fixture-browser\0${c.shopId}\0${c.scope}\0${c.entryKey}`).digest('hex');
async function rate(f:F,c:RenderContext,score:number,message?:string){
 const repo=new VisitRatingRepository(f.db,undefined,publishingVisitPolicy(c)),v=await repo.registerVisit(c,randomUUID(),'load',hash(c));
 await repo.recordRating({...c,visitId:v.visit.visitId},{intentId:randomUUID(),expectedRevision:0,score},hash(c));
 if(message)await repo.recordPrivateFeedback({...c,visitId:v.visit.visitId},{intentId:randomUUID(),expectedRevision:1,topic:'other',message},hash(c));
 return v;
}

test('two pages of one shop: separate links, drafts, content and visits; one dashboard for both',async({f})=>{
 const shop=await shopOn(f,1),vip=await secondPage(f,shop.shopId,'phong-vip','Phòng VIP');
 const first=await f.resolver.live({slug:shop.slug}),second=await f.resolver.live({slug:'PHONG-VIP'});
 expect([first.pageId,second.pageId]).toEqual([shop.pageId,vip.pageId]);
 // Content belongs to the page: naming the VIP room did not rename the shop's first page.
 expect([first.config.name,second.config.name]).toEqual(['Quán 1','Phòng VIP']);
 // A new page records direct visits under its own key, so one browser on two pages has two sessions.
 expect([first.context.entryKey,second.context.entryKey]).toEqual([`direct:page:${shop.pageId}`,`direct:page:${vip.pageId}`]);
 const a=await rate(f,first.context,5),b=await rate(f,second.context,2,'Phòng VIP hơi nóng');
 expect(a.session.sessionId).not.toBe(b.session.sessionId);
 // Drafts count separately: page two is at revision 2 while page one moves on without conflict.
 expect((await f.db.query('SELECT page_id,revision::int FROM page_drafts WHERE shop_id=$1 ORDER BY page_id<>$2',[shop.shopId,shop.pageId])).rows)
  .toEqual([{page_id:shop.pageId,revision:2},{page_id:vip.pageId,revision:2}]);
 // Both pages' guests reach the one dashboard of the shop, labelled as direct visits.
 const read=await new OwnerDashboard(f.db).read(shop.token,shop.slug,parseFilters(new URLSearchParams()));
 expect(read.metrics).toMatchObject({sessions:'2',rated:'2',feedback:'1'});
 expect(read.sources).toEqual([{label:'Trực tiếp',sessions:2}]);
 // Each page's picture in the dashboard is its own: a change to one draft leaves the other as it was.
 const pages=new OwnerPages(f.db);
 expect((await pages.picture(shop.token,shop.slug,shop.slug)).config.name).toBe('Quán 1');
 expect((await pages.picture(shop.token,shop.slug,'phong-vip')).config.name).toBe('Phòng VIP');
 await f.admin.saveDraft(vip,2,pageFromTemplate('nut-don','Phòng VIP tầng 2'));
 expect((await pages.picture(shop.token,shop.slug,'phong-vip')).config.name).toBe('Phòng VIP tầng 2');
 expect((await pages.picture(shop.token,shop.slug,shop.slug)).config.name).toBe('Quán 1');
 await expect(pages.picture(shop.token,shop.slug,'khong-co')).rejects.toMatchObject({status:404,code:'PAGE_NOT_FOUND'});
});

test('a card belongs to one page, opens that page, and goes live only on a live page',async({f})=>{
 const shop=await shopOn(f,1),vip=await secondPage(f,shop.shopId,'phong-vip','Phòng VIP'),cards=new OwnerCards(f.db);
 const card=await cards.create(shop.token,shop.slug,{label:'Bàn VIP 1'},'phong-vip');
 expect(card.page).toBe('phong-vip');
 await cards.update(shop.token,shop.slug,{id:card.id,state:'active'});
 const opened=await f.resolver.live({code:card.code});
 expect([opened.pageId,opened.config.name,opened.context.entryKey]).toEqual([vip.pageId,'Phòng VIP',`tag:${card.id}`]);
 expect((await cards.list(shop.token,shop.slug)).cards.map(c=>[c.code,c.page]).sort()).toEqual([[shop.tagCode,shop.slug],[card.code,'phong-vip']].sort());
 // A page never published cannot carry a live card.
 const template=(await f.db.query("SELECT id FROM template_versions WHERE template_key='nut-don'")).rows[0].id;
 await f.admin.createPage(shop.shopId,template,pageFromTemplate('nut-don','Quầy bar'),'quay-bar');
 const dark=await cards.create(shop.token,shop.slug,{label:'Quầy'},'quay-bar');
 await expect(cards.update(shop.token,shop.slug,{id:dark.id,state:'active'})).rejects.toMatchObject({status:409,code:'SHOP_UNAVAILABLE'});
 await expect(f.resolver.live({slug:'quay-bar'})).rejects.toThrow('PAGE_UNAVAILABLE');
 // A visit context that names one page's release with another page's card or key is refused.
 const live=(await f.resolver.live({slug:shop.slug})).context;
 for(const forged of [{...live,entryKey:`direct:page:${vip.pageId}`},{...live,tagId:card.id,entryKey:`tag:${card.id}`}])
  await expect(new VisitRatingRepository(f.db,undefined,publishingVisitPolicy(forged)).registerVisit(forged,randomUUID(),'load',hash(forged))).rejects.toThrow('RENDER_CONTEXT_MISMATCH');
 // Tài 08/10: a card written to its chip moves to another page of the shop and opens it at once; a live card never onto a dark page.
 const first=(await cards.list(shop.token,shop.slug)).cards.find(c=>c.code===shop.tagCode)!;
 expect(await cards.update(shop.token,shop.slug,{id:first.id,page:'phong-vip'})).toEqual({id:first.id,page:'phong-vip'});
 expect((await cards.list(shop.token,shop.slug)).cards.find(c=>c.id===first.id)!.page).toBe('phong-vip');
 // A live card follows its new page at once.
 await cards.update(shop.token,shop.slug,{id:card.id,page:shop.slug});
 expect((await f.resolver.live({code:card.code})).pageId).toBe(shop.pageId);
 await expect(cards.update(shop.token,shop.slug,{id:card.id,page:'quay-bar'})).rejects.toMatchObject({status:409,code:'SHOP_UNAVAILABLE'});
 await expect(cards.update(shop.token,shop.slug,{id:card.id,page:'khong-co'})).rejects.toMatchObject({code:'PAGE_NOT_FOUND'});
 expect(await cards.update(shop.token,shop.slug,{id:dark.id,page:shop.slug})).toEqual({id:dark.id,page:shop.slug});
});

test("another shop's page is out of reach from every door",async({f})=>{
 const one=await shopOn(f,1),two=await shopOn(f,2);
 const borrowed={shopId:two.shopId,pageId:one.pageId};
 await expect(f.admin.saveDraft(borrowed,2,pageFromTemplate('nut-don','x'))).rejects.toThrow('PAGE_NOT_FOUND');
 await expect(f.admin.publish(borrowed,2)).rejects.toThrow('PAGE_NOT_FOUND');
 await expect(f.admin.preview(borrowed,{kind:'draft',revision:2})).rejects.toThrow('PAGE_NOT_FOUND');
 await expect(f.admin.createTag(borrowed,'borrowed1')).rejects.toThrow();
 await expect(f.admin.publish({shopId:two.shopId,pageId:'not-a-uuid'},2)).rejects.toThrow('PAGE_NOT_FOUND');
 // Through the dashboard: shop two cannot name shop one's page.
 await expect(new OwnerPages(f.db).picture(two.token,two.slug,one.slug)).rejects.toMatchObject({code:'PAGE_NOT_FOUND'});
 await expect(requestEdit(f.db,two.token,two.slug,{page:one.slug,contact:'0912345678'})).rejects.toMatchObject({code:'PAGE_NOT_FOUND'});
 await expect(new OwnerCards(f.db).create(two.token,two.slug,{label:'x'},one.slug)).rejects.toMatchObject({code:'PAGE_NOT_FOUND'});
 expect((await f.db.query('SELECT count(*)::int n FROM tags WHERE page_id=$1',[one.pageId])).rows[0].n).toBe(1);
});

test('a link is permanent: a page is never deleted, renamed or moved, and its link is never issued twice',async({f})=>{
 const shop=await shopOn(f,1),other=await shopOn(f,2);
 await expect(f.db.query('DELETE FROM pages WHERE id=$1',[shop.pageId])).rejects.toThrow('PAGE_PERMANENT');
 for(const change of ["slug='moi-ten'",'shop_id=$2',"entry_key='direct:shop'"])
  await expect(f.db.query(`UPDATE pages SET ${change} WHERE id=$1`,[shop.pageId,other.shopId].slice(0,change.includes('$2')?2:1))).rejects.toThrow();
 const template=(await f.db.query("SELECT id FROM template_versions WHERE template_key='nut-don'")).rows[0].id;
 // Case does not make a new link, and another shop cannot take it either.
 await expect(f.admin.createPage(other.shopId,template,pageFromTemplate('nut-don','x'),shop.slug.toUpperCase())).rejects.toThrow('duplicate key');
 await expect(f.admin.createPage(other.shopId,template,pageFromTemplate('nut-don','x'),'gov')).rejects.toThrow('check constraint');
});

test('the page list: each page with where it stands, the Zalo the shop left last, and names the owner gives',async({f})=>{
 const shop=await shopOn(f,1),pages=new OwnerPages(f.db);
 // A shop's first page is "Trang chính" from the start, as Library names it (lib/owner/page-names.ts), never unnamed.
 expect(await pages.list(shop.token,shop.slug)).toEqual({canManage:true,contact:null,pages:[{slug:shop.slug,label:'Trang chính',state:'active',pauseReason:null,
  template:{key:'nut-don',version:1},createdAt:expect.any(String),request:null}]});
 // A new page comes from a template the shop picked for Tài to build (edit-requests.spec.ts): a draft at a new permanent link.
 const fresh=await requestEdit(f.db,shop.token,shop.slug,{template:'party',contact:'0912 345 678'});
 expect(fresh.page).toMatch(/^[2-9a-hjkmnp-z]{5}$/);
 const listed=await pages.list(shop.token,shop.slug);
 expect(listed.contact).toBe('0912345678');
 expect(listed.pages.map(p=>[p.label,p.state,p.template.key,!!p.request])).toEqual([['Trang chính','active','nut-don',false],['Trang 2','draft','party',true]]);
 await pages.rename(shop.token,shop.slug,{page:fresh.page,label:'  Quầy bar tầng 1 '});
 expect((await pages.list(shop.token,shop.slug)).pages[1].label).toBe('Quầy bar tầng 1');
 for(const body of [{page:shop.slug,label:'x'.repeat(61)},{page:'khong-co',label:'x'},{page:shop.slug},{page:shop.slug,label:'<b>'}])
  await expect(pages.rename(shop.token,shop.slug,body)).rejects.toMatchObject({status:expect.any(Number)});
 expect((await f.db.query("SELECT target FROM shop_activity WHERE action='page.create' ORDER BY id")).rows.map(r=>r.target)).toEqual([`Trang 2 (${fresh.page})`]);
});

test('only the owner makes pages; a manager with the design switch may name them and ask Tài to change one',async({f})=>{
 const shop=await shopOn(f,1),token=await manager(f,shop.shopId),pages=new OwnerPages(f.db);
 expect((await pages.list(token,shop.slug)).canManage).toBe(false);
 await expect(requestEdit(f.db,token,shop.slug,{template:'party',contact:'0912345678'})).rejects.toMatchObject({status:403,code:'OWNER_ROLE_REQUIRED'});
 // Naming a page, or asking for a page to change, is not a payment decision: a manager with the design switch may.
 await pages.rename(token,shop.slug,{page:shop.slug,label:'Sảnh chính'});
 await expect(requestEdit(f.db,token,shop.slug,{page:shop.slug,template:'party',contact:'0912345678'})).resolves.toMatchObject({page:shop.slug});
 expect((await f.db.query('SELECT count(*)::int n FROM pages WHERE shop_id=$1',[shop.shopId])).rows[0].n).toBe(1);
});

