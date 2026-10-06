import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {AdminAuth} from '../lib/admin/auth';
import {PageIncidents} from '../lib/admin/page-incidents';
import {OwnerAuth} from '../lib/owner/auth';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {requestEdit} from '../lib/owner/edit-requests';
import {OwnerCards} from '../lib/owner/cards';
import {pageOf,OwnerPages,OwnerPageLifecycle} from '../lib/owner/pages';
import {PublishingAdmin,PublishingResolver,type PageRef} from '../lib/publishing/repository';

import {publishingVisitPolicy} from '../lib/publishing/visit-policy';
import {VisitRatingRepository} from '../lib/repositories/visit-ratings';
import type {RenderContext} from '../lib/publishing/proof';
import { pageFromTemplate } from '../lib/canvas/templates';

/**
 * Lát P4 (migration 026, docs/goi-va-trang.md mục 5): draft → live ⇄ paused → closed. Paused keeps everything and says
 * so to guests; closed is for good. The owner's emergency stop reports to the administrators, who can also stop,
 * restart and close a page.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
type F={db:Pool;shops:ShopProvisioning;actorId:string;resolver:PublishingResolver};
const test=base.extend<{f:F}>({f:async({},provide)=>{
 const schema=`nfc_life_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  await applySchema(db);
  const actorId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  await provide({db,shops:new ShopProvisioning(db),actorId,resolver:new PublishingResolver(db)});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
async function shopOn(f:F,n=1){
 const made=await f.shops.create(f.actorId,{name:`Quán ${n}`,ownerUsername:`quan-${n}`,ownerEmail:`q${n}@example.com`,placeId:'ChIJN1t_tDeuEmsRUsoyG83frY4',templateKey:'nut-don'});
 await new OwnerSetupLinks(f.db).consume(made.setupToken,`password-of-quan-${n}`);
 const token=(await new OwnerAuth(f.db).login(`quan-${n}`,`password-of-quan-${n}`)).token,cards=new OwnerCards(f.db);
 await cards.update(token,made.slug,{id:(await cards.list(token,made.slug)).cards[0].id,state:'active'});
 return {...made,token,page:{shopId:made.shopId,pageId:made.pageId} as PageRef};
}
const hash=(c:RenderContext)=>createHash('sha256').update(`fixture-browser\0${c.shopId}\0${c.scope}\0${c.entryKey}`).digest('hex');
const register=(f:F,c:RenderContext)=>new VisitRatingRepository(f.db,undefined,publishingVisitPolicy(c)).registerVisit(c,randomUUID(),'load',hash(c));

test("the owner's emergency stop: at once, for the link and every card, nothing lost, a report for the platform, and lifted by the owner",async({f})=>{
 const shop=await shopOn(f),life=new OwnerPageLifecycle(f.db),incidents=new PageIncidents(f.db);
 const live=(await f.resolver.live({slug:shop.slug})).context,visit=await register(f,live);
 await expect(life.pause(shop.token,shop.slug,{action:'pause',page:shop.slug,reason:'  '})).rejects.toMatchObject({code:'REASON_REQUIRED'});
 const paused=await life.pause(shop.token,shop.slug,{action:'pause',page:shop.slug,reason:'Nút Google mở sai link'});
 expect(paused.state).toBe('paused');
 for(const target of [{slug:shop.slug},{code:shop.tagCode}])await expect(f.resolver.live(target)).rejects.toThrow('PAGE_PAUSED');
 // A guest who had the page open can write nothing more; what was there stays.
 await expect(new VisitRatingRepository(f.db,undefined,publishingVisitPolicy(live)).recordRating({...live,visitId:visit.visit.visitId},{intentId:randomUUID(),expectedRevision:0,score:5},hash(live))).rejects.toThrow('PAGE_UNAVAILABLE');
 expect((await f.db.query('SELECT count(*)::int n FROM page_visits')).rows[0].n).toBe(1);
 expect(await incidents.open()).toEqual([expect.objectContaining({id:paused.incident,page_slug:shop.slug,shop_name:'Quán 1',page_state:'paused',pause_reason:'emergency',reason:'Nút Google mở sai link'})]);
 expect((await new OwnerPages(f.db).list(shop.token,shop.slug)).pages[0]).toMatchObject({state:'paused',pauseReason:'emergency'});
 // Stopping twice is not a thing; lifting it brings the page back as it was.
 await expect(life.pause(shop.token,shop.slug,{action:'pause',page:shop.slug,reason:'lần nữa'})).rejects.toMatchObject({status:409,code:'PAGE_NOT_LIVE'});
 await life.resume(shop.token,shop.slug,{action:'resume',page:shop.slug});
 expect((await f.resolver.live({code:shop.tagCode})).config.name).toBe('Quán 1');
 await expect(life.resume(shop.token,shop.slug,{action:'resume',page:shop.slug})).rejects.toMatchObject({code:'PAGE_NOT_PAUSED'});
 // The report stays for the platform to handle.
 expect((await incidents.open()).length).toBe(1);
 expect((await f.db.query("SELECT action FROM shop_activity WHERE action LIKE 'page.%' ORDER BY id")).rows.map(r=>r.action)).toEqual(['page.pause','page.resume']);
 // A draft page has nothing live to stop, and only the owner may stop a page.
 const draft=await requestEdit(f.db,shop.token,shop.slug,{template:'party',contact:'0912345678'});
 await expect(life.pause(shop.token,shop.slug,{action:'pause',page:draft.page,reason:'x'})).rejects.toMatchObject({code:'PAGE_NOT_LIVE'});
 const auth=new OwnerAuth(f.db),id=await auth.bootstrap('quan-ly','password-of-quan-ly',async()=>{});
 await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'manager')",[id,shop.shopId]);
 const manager=(await auth.login('quan-ly','password-of-quan-ly')).token;
 await expect(life.pause(manager,shop.slug,{action:'pause',page:shop.slug,reason:'x'})).rejects.toMatchObject({status:403,code:'OWNER_ROLE_REQUIRED'});
});

test('the platform stops, restarts and handles reports; an owner cannot lift a stop that is not theirs',async({f})=>{
 const shop=await shopOn(f),life=new OwnerPageLifecycle(f.db),incidents=new PageIncidents(f.db);
 await incidents.act(f.actorId,shop.pageId,{action:'pause'});
 await expect(f.resolver.live({slug:shop.slug})).rejects.toThrow('PAGE_PAUSED');
 await expect(life.resume(shop.token,shop.slug,{action:'resume',page:shop.slug})).rejects.toMatchObject({status:409,code:'PAUSE_NOT_YOURS'});
 await incidents.act(f.actorId,shop.pageId,{action:'resume'});
 await f.resolver.live({slug:shop.slug});
 const report=await life.pause(shop.token,shop.slug,{action:'pause',page:shop.slug,reason:'Ảnh bị lỗi'});
 await expect(incidents.resolve(f.actorId,report.incident,{resolution:' '})).rejects.toMatchObject({code:'NOTE_REQUIRED'});
 await expect(incidents.resolve(f.actorId,report.incident,{resolution:'x',more:1})).rejects.toMatchObject({code:'INVALID_INPUT'});
 await incidents.resolve(f.actorId,report.incident,{resolution:'Đã gọi chủ quán, tặng một tháng template 1'});
 await expect(incidents.resolve(f.actorId,report.incident,{resolution:'lại'})).rejects.toMatchObject({status:409,code:'INCIDENT_ALREADY_RESOLVED'});
 expect(await incidents.open()).toEqual([]);
 // Handling the report leaves the page as it is: still stopped until someone starts it.
 await expect(f.resolver.live({slug:shop.slug})).rejects.toThrow('PAGE_PAUSED');
 for(const body of [{action:'nope'},{action:'pause',x:1},{}])await expect(incidents.act(f.actorId,shop.pageId,body)).rejects.toMatchObject({code:'INVALID_INPUT'});
 await expect(incidents.act(f.actorId,randomUUID(),{action:'pause'})).rejects.toMatchObject({status:404,code:'PAGE_NOT_FOUND'});
 expect((await f.db.query("SELECT action,shop_id FROM admin_audit WHERE action LIKE 'page.%' ORDER BY id")).rows)
  .toEqual(['page.pause','page.resume','page.incident.resolve'].map(action=>({action,shop_id:shop.shopId})));
});

test('a paused page takes a new release and keeps it for when it resumes',async({f})=>{
 const shop=await shopOn(f),admin=new PublishingAdmin(f.db,async()=>({actorId:f.actorId})),life=new OwnerPageLifecycle(f.db);
 await life.pause(shop.token,shop.slug,{action:'pause',page:shop.slug,reason:'Sửa tên'});
 // Tài publishes the change the shop asked for while its page is stopped (scripts/sua-trang.mjs).
 const saved=await admin.saveDraft(shop.page,2,pageFromTemplate('nut-don','Quán Đã Sửa'));
 await admin.publish(shop.page,saved);
 await expect(f.resolver.live({slug:shop.slug})).rejects.toThrow('PAGE_PAUSED');
 // It can still be looked at while it is stopped.
 const preview=await admin.preview(shop.page,{kind:'draft',revision:saved+1});
 expect((await f.resolver.preview(preview.token)).config.name).toBe('Quán Đã Sửa');
 await life.resume(shop.token,shop.slug,{action:'resume',page:shop.slug});
 expect((await f.resolver.live({slug:shop.slug})).config.name).toBe('Quán Đã Sửa');
});

test('a closed page is gone for good: its link and cards answer "không tồn tại", and nothing about it changes again',async({f})=>{
 const shop=await shopOn(f),incidents=new PageIncidents(f.db),admin=new PublishingAdmin(f.db,async()=>({actorId:f.actorId}));
 const preview=await admin.preview(shop.page,{kind:'draft',revision:2});
 await incidents.act(f.actorId,shop.pageId,{action:'close'});
 for(const target of [{slug:shop.slug},{code:shop.tagCode}])await expect(f.resolver.live(target)).rejects.toThrow('PAGE_CLOSED');
 await expect(f.resolver.preview(preview.token)).rejects.toThrow('PREVIEW_UNAVAILABLE');
 // Every door that writes to the page refuses it.
 await expect(admin.saveDraft(shop.page,2,pageFromTemplate('nut-don','Quán'))).rejects.toThrow('PAGE_CLOSED');
 await expect(admin.publish(shop.page,2)).rejects.toThrow('PAGE_CLOSED');
 await expect(requestEdit(f.db,shop.token,shop.slug,{page:shop.slug,contact:'0912345678'})).rejects.toMatchObject({status:409,code:'PAGE_CLOSED'});
 await expect(admin.createTag(shop.page,'late-card')).rejects.toThrow('PAGE_CLOSED');
 await expect(new OwnerCards(f.db).create(shop.token,shop.slug,{label:'Muộn'},shop.slug)).rejects.toMatchObject({code:'PAGE_CLOSED'});
 await expect(new OwnerPages(f.db).rename(shop.token,shop.slug,{page:shop.slug,label:'x'})).rejects.toMatchObject({code:'PAGE_CLOSED'});
 for(const action of ['pause','resume','close'])await expect(incidents.act(f.actorId,shop.pageId,{action})).rejects.toMatchObject({status:409,code:'PAGE_CLOSED'});
 await expect(f.db.query("UPDATE pages SET label='x' WHERE id=$1",[shop.pageId])).rejects.toThrow('PAGE_CLOSED');
 // Its data stays (how long is still open, docs/goi-va-trang.md mục 9), and its link is never issued again.
 expect((await f.db.query('SELECT count(*)::int n FROM page_releases WHERE page_id=$1',[shop.pageId])).rows[0].n).toBe(1);
 const template=(await f.db.query("SELECT id FROM template_versions WHERE template_key='nut-don'")).rows[0].id;
 await expect(admin.createPage(shop.shopId,template,pageFromTemplate('nut-don','Quán'),shop.slug)).rejects.toThrow('duplicate key');
 // With no link named, the dashboard opens the first page that is still open.
 const next=await requestEdit(f.db,shop.token,shop.slug,{template:'party',contact:'0912345678'});
 expect((await pageOf(f.db,shop.shopId,null)).slug).toBe(next.page);
});
