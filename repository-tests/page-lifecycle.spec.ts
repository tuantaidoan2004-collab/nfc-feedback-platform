import {test as base,expect} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {AdminAuth} from '../lib/admin/auth';
import {PageIncidents} from '../lib/admin/page-incidents';
import {OwnerAuth} from '../lib/owner/auth';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {OwnerDesign} from '../lib/owner/design';
import {OwnerCards} from '../lib/owner/cards';
import {OwnerPages,OwnerPageLifecycle} from '../lib/owner/pages';
import {PublishingAdmin,PublishingResolver,type PageRef} from '../lib/publishing/repository';
import {templateConfig} from '../lib/publishing/config';
import {publishingVisitPolicy} from '../lib/publishing/visit-policy';
import {VisitRatingRepository} from '../lib/repositories/visit-ratings';
import type {RenderContext} from '../lib/publishing/proof';

/**
 * Lát P4 (migration 026, docs/goi-va-trang.md mục 5): draft → live ⇄ paused → closed. Paused keeps everything and says
 * so to guests; closed is for good. The owner's emergency stop reports to the administrators, who can also stop,
 * restart and close a page.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const BEFORE=['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql','022_shop_profile.sql','023_media_review.sql','024_pages.sql','025_page_labels.sql'];
type F={db:Pool;shops:ShopProvisioning;actorId:string;resolver:PublishingResolver};
const test=base.extend<{f:F}>({f:async({},provide)=>{
 const schema=`nfc_life_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of [...BEFORE,'026_page_lifecycle.sql','027_page_debt.sql','028_retire_legacy.sql'])await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  const actorId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  await provide({db,shops:new ShopProvisioning(db),actorId,resolver:new PublishingResolver(db)});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
async function shopOn(f:F,n=1){
 const made=await f.shops.create(f.actorId,{name:`Quán ${n}`,ownerUsername:`quan-${n}`,ownerEmail:`q${n}@example.com`,googleUrl:'https://maps.google.com/?cid=7',templateKey:'minimal'});
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
 const draft=await new OwnerPages(f.db).create(shop.token,shop.slug,{template:'minimal',label:''});
 await expect(life.pause(shop.token,shop.slug,{action:'pause',page:draft.slug,reason:'x'})).rejects.toMatchObject({code:'PAGE_NOT_LIVE'});
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
 await incidents.resolve(f.actorId,report.incident,{resolution:'Đã gọi chủ quán, tặng một tháng khuôn 1'});
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
 const shop=await shopOn(f),design=new OwnerDesign(f.db),life=new OwnerPageLifecycle(f.db);
 await life.pause(shop.token,shop.slug,{action:'pause',page:shop.slug,reason:'Sửa tên'});
 const state=await design.read(shop.token,shop.slug);
 const saved=(await design.save(shop.token,shop.slug,{expectedRevision:state.draft.revision,config:{...state.draft.config,name:'Quán Đã Sửa'}})).revision;
 await design.publish(shop.token,shop.slug,{action:'publish',expectedRevision:saved});
 await expect(f.resolver.live({slug:shop.slug})).rejects.toThrow('PAGE_PAUSED');
 // The owner can still look at it while it is stopped.
 const preview=await design.preview(shop.token,shop.slug,{action:'preview',expectedRevision:saved+1});
 expect((await f.resolver.preview(preview.token)).config.name).toBe('Quán Đã Sửa');
 await life.resume(shop.token,shop.slug,{action:'resume',page:shop.slug});
 expect((await f.resolver.live({slug:shop.slug})).config.name).toBe('Quán Đã Sửa');
});

test('a closed page is gone for good: its link and cards answer "không tồn tại", and nothing about it changes again',async({f})=>{
 const shop=await shopOn(f),design=new OwnerDesign(f.db),incidents=new PageIncidents(f.db),admin=new PublishingAdmin(f.db,async()=>({actorId:f.actorId}));
 const state=await design.read(shop.token,shop.slug);
 const preview=await design.preview(shop.token,shop.slug,{action:'preview',expectedRevision:state.draft.revision});
 await incidents.act(f.actorId,shop.pageId,{action:'close'});
 for(const target of [{slug:shop.slug},{code:shop.tagCode}])await expect(f.resolver.live(target)).rejects.toThrow('PAGE_CLOSED');
 await expect(f.resolver.preview(preview.token)).rejects.toThrow('PREVIEW_UNAVAILABLE');
 // Every door that writes to the page refuses it.
 await expect(design.save(shop.token,shop.slug,{expectedRevision:state.draft.revision,config:state.draft.config},shop.slug)).rejects.toMatchObject({status:409,code:'PAGE_CLOSED'});
 await expect(design.publish(shop.token,shop.slug,{action:'publish',expectedRevision:state.draft.revision},shop.slug)).rejects.toMatchObject({code:'PAGE_CLOSED'});
 await expect(admin.createTag(shop.page,'late-card')).rejects.toThrow('PAGE_CLOSED');
 await expect(new OwnerCards(f.db).create(shop.token,shop.slug,{label:'Muộn'},shop.slug)).rejects.toMatchObject({code:'PAGE_CLOSED'});
 await expect(new OwnerPages(f.db).rename(shop.token,shop.slug,{page:shop.slug,label:'x'})).rejects.toMatchObject({code:'PAGE_CLOSED'});
 for(const action of ['pause','resume','close'])await expect(incidents.act(f.actorId,shop.pageId,{action})).rejects.toMatchObject({status:409,code:'PAGE_CLOSED'});
 await expect(f.db.query("UPDATE pages SET label='x' WHERE id=$1",[shop.pageId])).rejects.toThrow('PAGE_CLOSED');
 // Its data stays (how long is still open, docs/goi-va-trang.md mục 9), and its link is never issued again.
 expect((await f.db.query('SELECT count(*)::int n FROM page_releases WHERE page_id=$1',[shop.pageId])).rows[0].n).toBe(1);
 const template=(await f.db.query("SELECT id FROM template_versions WHERE template_key='minimal'")).rows[0].id;
 await expect(admin.createPage(shop.shopId,template,templateConfig('minimal'),shop.slug)).rejects.toThrow('duplicate key');
 // With no link named, the dashboard opens the first page that is still open.
 const next=await new OwnerPages(f.db).create(shop.token,shop.slug,{template:'minimal',label:'Mới'});
 expect((await design.read(shop.token,shop.slug)).page.slug).toBe(next.slug);
});

test('migration 026 keeps every page as it was, only allows the drawn transitions, and rolls back while no page is stopped',async()=>{
 const schema=`nfc_life_mig_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:3});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of BEFORE)await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  const admin=new PublishingAdmin(db,async()=>({actorId:'fixture'})),shop=randomUUID();
  await db.query("INSERT INTO shops(id,slug,name)VALUES($1,'cu','Quán Cũ')",[shop]);
  // Pages as the code before 026 leaves them, written in SQL: today's code already reads 026's columns.
  const tv=await admin.createTemplate('minimal',1),live=await admin.createPage(shop,tv,templateConfig('minimal'),'cu');
  const release=(await db.query("INSERT INTO page_releases(shop_id,page_id,template_version_id,config_snapshot,draft_revision,created_by)VALUES($1,$2,$3,$4,1,'fixture')RETURNING id",
   [shop,live.pageId,tv,templateConfig('minimal')])).rows[0].id;
  await db.query("UPDATE pages SET state='active',active_release_id=$2 WHERE id=$1",[live.pageId,release]);
  const draft=await admin.createPage(shop,tv,templateConfig('minimal'),'cu-nhap');
  await db.query(await readFile('db/migrations/026_page_lifecycle.sql','utf8'));
  expect((await db.query('SELECT slug,state,paused_at,pause_reason,closed_at FROM pages ORDER BY slug')).rows).toEqual([
   {slug:'cu',state:'active',paused_at:null,pause_reason:null,closed_at:null},{slug:'cu-nhap',state:'draft',paused_at:null,pause_reason:null,closed_at:null}]);
  // The old two-state check is gone; the drawn transitions are all that remain.
  for(const bad of ["state='paused'","state='closed'","state='active'"])
   await expect(db.query(`UPDATE pages SET ${bad} WHERE id=$1`,[draft.pageId])).rejects.toThrow(/check constraint|INVALID_PAGE_TRANSITION/);
  await expect(db.query("UPDATE pages SET state='draft' WHERE id=$1",[live.pageId])).rejects.toThrow('INVALID_PAGE_TRANSITION');
  const rollback=await readFile('db/rollback/026_page_lifecycle.sql','utf8');
  await admin.pausePage(live,'admin');
  await expect(db.query(`BEGIN;${rollback}COMMIT;`)).rejects.toThrow('ROLLBACK_026_PAGES_NOT_LIVE');await db.query('ROLLBACK');
  await admin.resumePage(live,['admin']);
  await db.query(`BEGIN;${rollback}COMMIT;`);
  expect((await db.query("SELECT to_regclass('page_incidents') t")).rows[0].t).toBeNull();
  await expect(db.query("UPDATE pages SET state='paused' WHERE id=$1",[live.pageId])).rejects.toThrow('check constraint');
  await expect(db.query("UPDATE pages SET state='active' WHERE id=$1",[draft.pageId])).rejects.toThrow('check constraint');
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
});
