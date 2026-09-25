import {test as base,expect} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {AdminAuth} from '../lib/admin/auth';
import {OwnerAuth} from '../lib/owner/auth';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {OwnerDesign} from '../lib/owner/design';
import {OwnerCards} from '../lib/owner/cards';
import {OwnerPages} from '../lib/owner/pages';
import {OwnerDashboard} from '../lib/owner/dashboard';
import {parseFilters} from '../lib/owner/filters';
import {PublishingAdmin,PublishingResolver,type PageRef} from '../lib/publishing/repository';
import {templateConfig} from '../lib/publishing/config';
import {publishingVisitPolicy} from '../lib/publishing/visit-policy';
import {VisitRatingRepository} from '../lib/repositories/visit-ratings';
import type {RenderContext} from '../lib/publishing/proof';

/**
 * Lát P1 (migration 024, docs/goi-va-trang.md mục 3): a shop has pages. Each page is its own link, draft, releases,
 * cards and content; the shop stays the tenant, so every page's feedback lands in the shop's one dashboard.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const BEFORE=['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql','022_shop_profile.sql','023_media_review.sql'];
type F={db:Pool;shops:ShopProvisioning;actorId:string;admin:PublishingAdmin;resolver:PublishingResolver};
const test=base.extend<{f:F}>({f:async({},provide)=>{
 const schema=`nfc_pages_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of [...BEFORE,'024_pages.sql','025_page_labels.sql','026_page_lifecycle.sql'])await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  const actorId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  await provide({db,shops:new ShopProvisioning(db),actorId,admin:new PublishingAdmin(db,async()=>({actorId})),resolver:new PublishingResolver(db)});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
async function shopOn(f:F,n:number){
 const made=await f.shops.create(f.actorId,{name:`Quán ${n}`,ownerUsername:`quan-${n}`,ownerEmail:`q${n}@example.com`,googleUrl:'https://maps.google.com/?cid=7',templateKey:'minimal'});
 await new OwnerSetupLinks(f.db).consume(made.setupToken,`password-of-quan-${n}`);
 return {...made,page:{shopId:made.shopId,pageId:made.pageId} as PageRef,token:(await new OwnerAuth(f.db).login(`quan-${n}`,`password-of-quan-${n}`)).token};
}
/** A second page of the shop, the way "Nhân bản" will make one (lát P3): its own link, its own draft. */
async function secondPage(f:F,shopId:string,slug:string,name:string){
 const template=(await f.db.query("SELECT id FROM template_versions WHERE template_key='minimal'")).rows[0].id;
 const page=await f.admin.createPage(shopId,template,{...templateConfig('minimal'),name,googleUrl:'https://maps.google.com/?cid=7'},slug);
 await f.admin.publish(page,1);return page;
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
 // The editor works on the page it is asked for, and on the first page when none is named.
 const design=new OwnerDesign(f.db);
 expect((await design.read(shop.token,shop.slug)).page.slug).toBe(shop.slug);
 const vipState=await design.read(shop.token,shop.slug,'phong-vip');
 expect([vipState.page.slug,vipState.draft.config.name]).toEqual(['phong-vip','Phòng VIP']);
 await design.save(shop.token,shop.slug,{expectedRevision:vipState.draft.revision,config:{...vipState.draft.config,name:'Phòng VIP tầng 2'}},'phong-vip');
 expect((await design.read(shop.token,shop.slug,'phong-vip')).draft.config.name).toBe('Phòng VIP tầng 2');
 expect((await design.read(shop.token,shop.slug)).draft.config.name).toBe('Quán 1');
 await expect(design.read(shop.token,shop.slug,'khong-co')).rejects.toMatchObject({status:404,code:'PAGE_NOT_FOUND'});
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
 const template=(await f.db.query("SELECT id FROM template_versions WHERE template_key='minimal'")).rows[0].id;
 await f.admin.createPage(shop.shopId,template,{...templateConfig('minimal'),name:'Quầy bar',googleUrl:'https://maps.google.com/?cid=7'},'quay-bar');
 const dark=await cards.create(shop.token,shop.slug,{label:'Quầy'},'quay-bar');
 await expect(cards.update(shop.token,shop.slug,{id:dark.id,state:'active'})).rejects.toMatchObject({status:409,code:'SHOP_UNAVAILABLE'});
 await expect(f.resolver.live({slug:'quay-bar'})).rejects.toThrow('PAGE_UNAVAILABLE');
 // A visit context that names one page's release with another page's card or key is refused.
 const live=(await f.resolver.live({slug:shop.slug})).context;
 for(const forged of [{...live,entryKey:`direct:page:${vip.pageId}`},{...live,tagId:card.id,entryKey:`tag:${card.id}`}])
  await expect(new VisitRatingRepository(f.db,undefined,publishingVisitPolicy(forged)).registerVisit(forged,randomUUID(),'load',hash(forged))).rejects.toThrow('RENDER_CONTEXT_MISMATCH');
});

test("another shop's page is out of reach from every door",async({f})=>{
 const one=await shopOn(f,1),two=await shopOn(f,2);
 const borrowed={shopId:two.shopId,pageId:one.pageId};
 await expect(f.admin.saveDraft(borrowed,2,templateConfig('minimal'))).rejects.toThrow('PAGE_NOT_FOUND');
 await expect(f.admin.publish(borrowed,2)).rejects.toThrow('PAGE_NOT_FOUND');
 await expect(f.admin.preview(borrowed,{kind:'draft',revision:2})).rejects.toThrow('PAGE_NOT_FOUND');
 await expect(f.admin.createTag(borrowed,'borrowed1')).rejects.toThrow();
 await expect(f.admin.publish({shopId:two.shopId,pageId:'not-a-uuid'},2)).rejects.toThrow('PAGE_NOT_FOUND');
 // Through the dashboard: shop two cannot name shop one's page.
 await expect(new OwnerDesign(f.db).read(two.token,two.slug,one.slug)).rejects.toMatchObject({code:'PAGE_NOT_FOUND'});
 await expect(new OwnerCards(f.db).create(two.token,two.slug,{label:'x'},one.slug)).rejects.toMatchObject({code:'PAGE_NOT_FOUND'});
 expect((await f.db.query('SELECT count(*)::int n FROM tags WHERE page_id=$1',[one.pageId])).rows[0].n).toBe(1);
});

test('a link is permanent: a page is never deleted, renamed or moved, and its link is never issued twice',async({f})=>{
 const shop=await shopOn(f,1),other=await shopOn(f,2);
 await expect(f.db.query('DELETE FROM pages WHERE id=$1',[shop.pageId])).rejects.toThrow('PAGE_PERMANENT');
 for(const change of ["slug='moi-ten'",'shop_id=$2',"entry_key='direct:shop'"])
  await expect(f.db.query(`UPDATE pages SET ${change} WHERE id=$1`,[shop.pageId,other.shopId].slice(0,change.includes('$2')?2:1))).rejects.toThrow();
 const template=(await f.db.query("SELECT id FROM template_versions WHERE template_key='minimal'")).rows[0].id;
 // Case does not make a new link, and another shop cannot take it either.
 await expect(f.admin.createPage(other.shopId,template,templateConfig('minimal'),shop.slug.toUpperCase())).rejects.toThrow('duplicate key');
 await expect(f.admin.createPage(other.shopId,template,templateConfig('minimal'),'gov')).rejects.toThrow('check constraint');
});

test('migration 024 gives every shop its page at the same link, keeps old visits and erase keys, and rolls back',async()=>{
 const schema=`nfc_pages_mig_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:3});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of BEFORE)await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  // Before 024: a live shop with a release, a card, a preview and a guest visit; and a shop never set up.
  const shop=randomUUID(),tv=(await db.query("INSERT INTO template_versions(template_key,version,schema_version,renderer_version,capabilities)VALUES('standard',1,1,'1','[]')RETURNING id")).rows[0].id;
  await db.query("INSERT INTO shops(id,slug,name)VALUES($1,'cu','Quán Cũ'),(gen_random_uuid(),'rong','Quán Rỗng')",[shop]);
  const config={...templateConfig('standard'),name:'Quán Cũ',googleUrl:'https://maps.google.com/?cid=1'};
  await db.query('INSERT INTO page_drafts(shop_id,template_version_id,config,revision)VALUES($1,$2,$3,2)',[shop,tv,config]);
  const release=(await db.query("INSERT INTO page_releases(shop_id,template_version_id,config_snapshot,draft_revision,created_by)VALUES($1,$2,$3,1,'fixture')RETURNING id",[shop,tv,config])).rows[0].id;
  await db.query("UPDATE shops SET active_release_id=$2,publishing_state='active' WHERE id=$1",[shop,release]);
  await db.query("INSERT INTO tags(shop_id,public_code,state)VALUES($1,'the-old-card','prepared')",[shop]);
  await db.query("INSERT INTO preview_sessions(shop_id,template_version_id,config_snapshot,source_release_id,token_hash,expires_at)VALUES($1,$2,$3,$4,$5,clock_timestamp()+interval '1 hour')",[shop,tv,config,release,'a'.repeat(64)]);
  const before:RenderContext={v:1,shopId:shop,releaseId:release,tagId:null,previewId:null,scope:'live',entryKey:'direct:shop'};
  const visit=await new VisitRatingRepository(db).registerVisit(before,randomUUID(),'load',hash(before));

  await db.query(await readFile('db/migrations/024_pages.sql','utf8'));
  const page=(await db.query('SELECT id,slug,state,active_release_id,entry_key FROM pages WHERE shop_id=$1',[shop])).rows[0];
  expect(page).toMatchObject({slug:'cu',state:'active',active_release_id:release,entry_key:'direct:shop'});
  expect((await db.query('SELECT count(*)::int n FROM pages')).rows[0].n).toBe(1);
  for(const table of ['page_drafts','page_releases','tags','preview_sessions','shop_profile'])
   expect((await db.query(`SELECT count(*)::int n FROM ${table} WHERE page_id=$1`,[page.id])).rows[0].n,table).toBe(1);
  // The same link still opens the same page, and a guest who came before keeps the same session and erase key.
  const live=await new PublishingResolver(db).live({slug:'cu'});
  expect(live.context).toEqual(before);
  const again=await new VisitRatingRepository(db,undefined,publishingVisitPolicy(live.context)).registerVisit(live.context,randomUUID(),'load',hash(live.context));
  expect(again.session.sessionId).toBe(visit.session.sessionId);
  // Today's publishing code needs the migrations after 024 too.
  for(const file of ['025_page_labels.sql','026_page_lifecycle.sql'])await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  await new PublishingAdmin(db,async()=>({actorId:'fixture'})).publish({shopId:shop,pageId:page.id},2);

  // One page per shop comes back out; a shop with two pages refuses and changes nothing.
  const rollback=await readFile('db/rollback/024_pages.sql','utf8');
  const second=await new PublishingAdmin(db,async()=>({actorId:'fixture'})).createPage(shop,tv,config,'cu-vip');
  await expect(db.query(`BEGIN;${rollback}COMMIT;`)).rejects.toThrow('ROLLBACK_024_MULTIPLE_PAGES');await db.query('ROLLBACK');
  expect((await db.query('SELECT count(*)::int n FROM pages')).rows[0].n).toBe(2);
  expect(second.pageId).toBeTruthy();
  await db.query('ALTER TABLE pages DISABLE TRIGGER pages_identity');
  await db.query('DELETE FROM shop_profile WHERE page_id=$1',[second.pageId]);await db.query('DELETE FROM page_drafts WHERE page_id=$1',[second.pageId]);
  await db.query('DELETE FROM pages WHERE id=$1',[second.pageId]);await db.query('ALTER TABLE pages ENABLE TRIGGER pages_identity');
  await db.query(`BEGIN;${await readFile('db/rollback/026_page_lifecycle.sql','utf8')}COMMIT;`);
  await db.query(`BEGIN;${rollback}COMMIT;`);
  expect((await db.query("SELECT to_regclass('pages') t")).rows[0].t).toBeNull();
  const back=(await db.query('SELECT s.active_release_id,(SELECT count(*)::int FROM shop_profile) profiles FROM shops s WHERE s.id=$1',[shop])).rows[0];
  expect(back.profiles).toBe(2);expect(back.active_release_id).not.toBe(release);
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
});

/** A manager of the shop with the default switches, design included (lib/owner/auth.ts MANAGER_DEFAULT). */
async function manager(f:F,shopId:string){
 const auth=new OwnerAuth(f.db),id=await auth.bootstrap('quan-ly','password-of-quan-ly',async()=>{});
 await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'manager')",[id,shopId]);
 return (await auth.login('quan-ly','password-of-quan-ly')).token;
}

test('the page list: the owner copies a page or takes a template from the library, each a draft at a new permanent link',async({f})=>{
 const shop=await shopOn(f,1),pages=new OwnerPages(f.db),design=new OwnerDesign(f.db),resolver=new PublishingResolver(f.db);
 expect(await pages.list(shop.token,shop.slug)).toEqual({canManage:true,pages:[{slug:shop.slug,label:'',state:'active',pauseReason:null,template:{key:'minimal',version:1},createdAt:expect.any(String)}]});
 // A copy: same template version and draft, its own link and name, not live until published.
 const before=(await design.read(shop.token,shop.slug)).draft.config;
 const copy=await pages.create(shop.token,shop.slug,{copy:shop.slug,label:'Phòng VIP'});
 expect(copy.slug).toMatch(/^[2-9a-hjkmnp-z]{5}$/);
 expect((await design.read(shop.token,shop.slug,copy.slug)).draft.config).toEqual(before);
 await expect(resolver.live({slug:copy.slug})).rejects.toThrow('PAGE_UNAVAILABLE');
 await design.publish(shop.token,shop.slug,{action:'publish',expectedRevision:1},copy.slug);
 expect((await resolver.live({slug:copy.slug})).config.name).toBe('Quán 1');
 // From the library: the template's bare skeleton at its newest version, content to be brought in.
 const fresh=await pages.create(shop.token,shop.slug,{template:'big-button',label:'Quầy bar'});
 const state=await design.read(shop.token,shop.slug,fresh.slug);
 expect([state.template.key,state.template.draft,state.draft.config.name,state.draft.config.links]).toEqual(['big-button',1,'YOUR SHOP',[]]);
 expect((await pages.list(shop.token,shop.slug)).pages.map(p=>[p.label,p.state,p.template.key])).toEqual([['','active','minimal'],['Phòng VIP','active','minimal'],['Quầy bar','draft','big-button']]);
 await pages.rename(shop.token,shop.slug,{page:fresh.slug,label:'  Quầy bar tầng 1 '});
 expect((await pages.list(shop.token,shop.slug)).pages[2].label).toBe('Quầy bar tầng 1');
 for(const body of [{template:'nope',label:''},{copy:'khong-co',label:''},{template:'minimal',label:'x'.repeat(61)},{template:'minimal'},{copy:shop.slug,template:'minimal',label:''},{page:shop.slug,label:'<b>'}])
  await expect('page' in body?pages.rename(shop.token,shop.slug,body):pages.create(shop.token,shop.slug,body)).rejects.toMatchObject({status:expect.any(Number)});
 expect((await f.db.query("SELECT target FROM shop_activity WHERE action='page.create' ORDER BY id")).rows.map(r=>r.target)).toEqual([`Phòng VIP (${copy.slug})`,`Quầy bar (${fresh.slug})`]);
});

test('only the owner makes pages or changes a template: each decides what the shop pays',async({f})=>{
 const shop=await shopOn(f,1),token=await manager(f,shop.shopId),pages=new OwnerPages(f.db),design=new OwnerDesign(f.db);
 expect((await pages.list(token,shop.slug)).canManage).toBe(false);
 await expect(pages.create(token,shop.slug,{template:'minimal',label:''})).rejects.toMatchObject({status:403,code:'OWNER_ROLE_REQUIRED'});
 const revision=(await design.read(token,shop.slug)).draft.revision;
 await expect(design.template(token,shop.slug,{action:'template',expectedRevision:revision,template:'glass'})).rejects.toMatchObject({status:403,code:'OWNER_ROLE_REQUIRED'});
 // Naming a page is not a payment decision: a manager with the design switch may.
 await pages.rename(token,shop.slug,{page:shop.slug,label:'Sảnh chính'});
 expect((await f.db.query('SELECT count(*)::int n FROM pages WHERE shop_id=$1',[shop.shopId])).rows[0].n).toBe(1);
});

test('a page moved to another template keeps its link, cards and content, and takes the new look',async({f})=>{
 const shop=await shopOn(f,1),design=new OwnerDesign(f.db),resolver=new PublishingResolver(f.db);
 let state=await design.read(shop.token,shop.slug);
 const content={...state.draft.config,name:'Quán Đổi Khuôn',googleUrl:'https://maps.google.com/?cid=99',
  links:[{label:{vi:'Instagram',en:'Instagram'},url:'https://instagram.com/q',icon:'instagram' as const}]};
 const {SERVICE_LABELS}=await import('../lib/publishing/policy');content.links[0].label={...SERVICE_LABELS[0]};
 const saved=(await design.save(shop.token,shop.slug,{expectedRevision:state.draft.revision,config:content})).revision;
 const moved=await design.template(shop.token,shop.slug,{action:'template',expectedRevision:saved,template:'glass'});
 expect(moved.revision).toBe(saved+1);
 state=await design.read(shop.token,shop.slug);
 expect(state.template).toMatchObject({key:'glass',draft:1});
 expect(state.draft.config).toMatchObject({name:'Quán Đổi Khuôn',googleUrl:'https://maps.google.com/?cid=99',links:content.links,
  background:{kind:'gradient',colors:['#1B2B4A','#8FB3D9'],angle:160}});
 // Nothing changed for guests until it is published; then the same link and card show the new template.
 expect((await resolver.live({slug:shop.slug})).template).toBe('minimal');
 await design.publish(shop.token,shop.slug,{action:'publish',expectedRevision:moved.revision});
 const cards=new OwnerCards(f.db);await cards.update(shop.token,shop.slug,{id:(await cards.list(shop.token,shop.slug)).cards[0].id,state:'active'});
 expect([(await resolver.live({slug:shop.slug})).template,(await resolver.live({code:shop.tagCode})).template]).toEqual(['glass','glass']);
 await expect(design.template(shop.token,shop.slug,{action:'template',expectedRevision:moved.revision+1,template:'nope'})).rejects.toMatchObject({code:'INVALID_DESIGN'});
});
