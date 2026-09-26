import { test as base, expect } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { PublishingAdmin, PublishingResolver, previewHash, type PageRef } from '../lib/publishing/repository';
import { defaultConfig } from '../lib/publishing/config';
import { publishingVisitPolicy } from '../lib/publishing/visit-policy';
import { VisitRatingRepository } from '../lib/repositories/visit-ratings';
import type { RenderContext } from '../lib/publishing/proof';
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
// `page` / `otherPage` are the pages of `shop` / `other`, set by the case that creates them (migration 024).
type Fixture={db:Pool;admin:PublishingAdmin;resolver:PublishingResolver;shop:string;other:string;page:PageRef;otherPage:PageRef};
const test=base.extend<{fixture:Fixture}>({fixture:async({},provideFixture)=>{
 const schema=`nfc_publish_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri});
 const db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:8});
 try{await root.query(`CREATE SCHEMA ${schema}`);for(const file of ['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','020_page_events.sql','022_shop_profile.sql','009_template_shop.sql','023_media_review.sql','024_pages.sql','025_page_labels.sql','026_page_lifecycle.sql','027_page_debt.sql','028_retire_legacy.sql'])await db.query(await readFile(`db/migrations/${file}`,'utf8'));
 const shop=randomUUID(),other=randomUUID();await db.query("INSERT INTO shops(id,slug,name)VALUES($1,'one','One'),($2,'two','Two')",[shop,other]);
 await provideFixture({db,shop,other,page:undefined as unknown as PageRef,otherPage:undefined as unknown as PageRef,admin:new PublishingAdmin(db,async()=>({actorId:'fixture-admin'})),resolver:new PublishingResolver(db)});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
async function seed(f:Fixture){const template=await f.admin.createTemplate('showcase',1);(f.page=await f.admin.createPage(f.shop,template,defaultConfig('R1'),'one'));const release=await f.admin.publish(f.page,1);return{template,...release};}
const hash=(c:RenderContext)=>createHash('sha256').update(`fixture-browser\0${c.shopId}\0${c.scope}\0${c.entryKey}`).digest('hex');
const repo=(f:Fixture,c:RenderContext,token?:string,clock?:()=>Date)=>new VisitRatingRepository(f.db,clock,publishingVisitPolicy(c,token));
async function open(f:Fixture,c:RenderContext,token?:string){return repo(f,c,token).registerVisit(c,randomUUID(),'load',hash(c));}

test('authority boundary, draft CAS, concurrent publish and immutable versions/releases',async({fixture:f})=>{
 const denied=new PublishingAdmin(f.db,async()=>{throw Error('DENIED');});await expect(denied.createTemplate('bad',1)).rejects.toThrow('DENIED');
 const template=await f.admin.createTemplate('showcase',1);(f.page=await f.admin.createPage(f.shop,template,defaultConfig(),'one'));
 const outcomes=await Promise.allSettled([f.admin.publish(f.page,1),f.admin.publish(f.page,1)]);
 expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(1);
 await expect(f.admin.saveDraft(f.page,1,defaultConfig())).rejects.toThrow('DRAFT_CONFLICT');
 expect((await f.db.query('SELECT count(*)::int n FROM page_releases')).rows[0].n).toBe(1);
 await expect(f.db.query("UPDATE page_releases SET config_snapshot='{}'")).rejects.toThrow('IMMUTABLE');
 await expect(f.db.query('DELETE FROM template_versions')).rejects.toThrow('IMMUTABLE');
 await expect(f.admin.saveDraft(f.page,2,{...defaultConfig(),html:'x'})).rejects.toThrow('INVALID_CONFIG');
});
test('rollback pointer CAS and cross-shop FK preserve releases',async({fixture:f})=>{
 // Từ migration 022 tên quán thuộc về tài khoản, không thuộc bản phát hành — nên nó KHÔNG đổi theo
 // rollback nữa, và không còn dùng được làm bằng chứng "release nào đang sống". `layout` thì vẫn thuộc
 // bản phát hành, nên nó là bằng chứng đúng cho phép kiểm này.
 const first=await seed(f);await f.admin.saveDraft(f.page,2,{...defaultConfig('R2'),layout:'card' as const});const second=await f.admin.publish(f.page,3);
 await f.admin.rollback(f.page,first.releaseId,second.releaseId);expect((await f.resolver.live({slug:'one'})).config.layout).toBe('full-bleed');
 await expect(f.admin.rollback(f.page,second.releaseId,second.releaseId)).rejects.toThrow('RELEASE_CONFLICT');
 (f.otherPage=await f.admin.createPage(f.other,first.template,defaultConfig('Other'),'two'));const other=await f.admin.publish(f.otherPage,1);
 await expect(f.admin.rollback(f.page,other.releaseId,first.releaseId)).rejects.toThrow();
 expect((await f.db.query('SELECT count(*)::int n FROM page_releases')).rows[0].n).toBe(3);
});
test('publish race retains rendered R1; next open R2 shares session, origin and each receipt attribution',async({fixture:f})=>{
 await seed(f);const c1=(await f.resolver.live({slug:'one'})).context;
 await f.admin.saveDraft(f.page,2,defaultConfig('R2'));await f.admin.publish(f.page,3);const c2=(await f.resolver.live({slug:'one'})).context;
 const first=await open(f,c1);await repo(f,c1).recordRating({...c1,visitId:first.visit.visitId},{intentId:randomUUID(),expectedRevision:0,score:5},hash(c1));
 const second=await open(f,c2);expect(second.session.sessionId).toBe(first.session.sessionId);
 await repo(f,c2).recordRating({...c2,visitId:second.visit.visitId},{intentId:randomUUID(),expectedRevision:1,score:2},hash(c2));
 await repo(f,c2).recordPrivateFeedback({...c2,visitId:second.visit.visitId},{intentId:randomUUID(),expectedRevision:2,topic:'other',message:'Private'},hash(c2));
 const rows=(await f.db.query('SELECT c.release_id,r.applied_revision::int FROM rating_intent_receipts r JOIN published_visit_contexts c ON c.visit_id=r.visit_id ORDER BY r.applied_revision')).rows;
 expect(rows).toEqual([{release_id:c1.releaseId,applied_revision:1},{release_id:c2.releaseId,applied_revision:2},{release_id:c2.releaseId,applied_revision:3}]);
 for(const table of ['session_initial_contexts','experience_origin_contexts'])expect((await f.db.query(`SELECT c.release_id FROM ${table} o JOIN published_visit_contexts c ON c.visit_id=o.visit_id`)).rows[0].release_id).toBe(c1.releaseId);
 await expect(repo(f,c2).registerVisit(c2,(await f.db.query('SELECT load_key FROM page_visits WHERE id=$1',[first.visit.visitId])).rows[0].load_key,'load',hash(c2))).rejects.toThrow('RENDER_CONTEXT_MISMATCH');
});
test('prepared→tested via isolated preview→active→disabled; preview never increases live totals',async({fixture:f})=>{
 await seed(f);const tag=await f.admin.createTag(f.page,'fixture-tag');await expect(f.resolver.live({code:'fixture-tag'})).rejects.toThrow('PAGE_UNAVAILABLE');
 // Migration 013 also lets a shop go straight from prepared to active (tests in impersonation.spec.ts); this is the tested path.
 await expect(f.admin.setTagState(f.page,tag,'tested')).rejects.toThrow('TAG_TEST_REQUIRED');
 const preview=await f.admin.preview(f.page,{kind:'draft',revision:2},900,tag),c=(await f.resolver.preview(preview.token)).context;
 const v=await open(f,c,preview.token);await repo(f,c,preview.token).recordRating({...c,visitId:v.visit.visitId},{intentId:randomUUID(),expectedRevision:0,score:5},hash(c));
 expect((await f.db.query("SELECT count(*)::int n FROM rating_experiences WHERE scope='live'")).rows[0].n).toBe(0);
 await f.admin.setTagState(f.page,tag,'tested',preview.id);await f.admin.setTagState(f.page,tag,'active');
 const live=(await f.resolver.live({code:'fixture-tag'})).context,opened=await open(f,live);
 await f.admin.setTagState(f.page,tag,'disabled');await expect(f.resolver.live({code:'fixture-tag'})).rejects.toThrow('PAGE_UNAVAILABLE');
 await expect(repo(f,live).recordRating({...live,visitId:opened.visit.visitId},{intentId:randomUUID(),expectedRevision:0,score:5},hash(live))).rejects.toThrow('TAG_UNAVAILABLE');
 await expect(f.resolver.preview(preview.token)).rejects.toThrow('PREVIEW_UNAVAILABLE');
 // Since 013 a stored card can be switched back on.
 await f.admin.setTagState(f.page,tag,'active');await expect(f.resolver.live({code:'fixture-tag'})).resolves.toBeTruthy();
});
test('preview capability, expiry and suspended shop block old visits without live writes',async({fixture:f})=>{
 await seed(f);const preview=await f.admin.preview(f.page,{kind:'draft',revision:2},900),c=(await f.resolver.preview(preview.token)).context;
 await expect(open(f,c,'0'.repeat(64))).rejects.toThrow('PREVIEW_UNAVAILABLE');
 await expect(repo(f,c,preview.token,()=>new Date(preview.expiresAt.getTime()+1)).registerVisit(c,randomUUID(),'load',hash(c))).rejects.toThrow('PREVIEW_EXPIRED');
 const expired='1'.repeat(64);await f.db.query(`INSERT INTO preview_sessions(shop_id,page_id,template_version_id,config_snapshot,source_draft_revision,token_hash,created_at,expires_at)
 SELECT shop_id,page_id,template_version_id,config,revision,$2,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second' FROM page_drafts WHERE shop_id=$1`,[f.shop,previewHash(expired)]);
 await expect(f.resolver.preview(expired)).rejects.toThrow('PREVIEW_UNAVAILABLE');
 const live=(await f.resolver.live({slug:'one'})).context,visit=await open(f,live);await f.admin.setShopState(f.shop,'suspended');
 await expect(repo(f,live).recordRating({...live,visitId:visit.visit.visitId},{intentId:randomUUID(),expectedRevision:0,score:4},hash(live))).rejects.toThrow('PAGE_UNAVAILABLE');
});
test('same-shop/source FK isolation rejects another shop release/tag and immutable attribution edits',async({fixture:f})=>{
 const one=await seed(f);(f.otherPage=await f.admin.createPage(f.other,one.template,defaultConfig(),'two'));await f.admin.publish(f.otherPage,1);
 const c=(await f.resolver.live({slug:'one'})).context,v=await open(f,c),other=(await f.resolver.live({slug:'two'})).context;
 await expect(f.db.query('UPDATE published_visit_contexts SET release_id=$1 WHERE visit_id=$2',[other.releaseId,v.visit.visitId])).rejects.toThrow('IMMUTABLE');
 const raw=new VisitRatingRepository(f.db),free=await raw.registerVisit(c,randomUUID(),'load',hash(c));
 await expect(f.db.query('INSERT INTO published_visit_contexts(visit_id,shop_id,scope,entry_key,session_id,release_id)VALUES($1,$2,$3,$4,$5,$6)',[free.visit.visitId,c.shopId,c.scope,c.entryKey,free.session.sessionId,other.releaseId])).rejects.toThrow();
});
test('rollback003 refuses publishing data; empty003 rollback preserves foundation002',async({fixture:f})=>{
 const rollback=await readFile('db/rollback/003_publishing.sql','utf8');await seed(f);
 // Newest first: 027 takes back the shop column that rollback 003 checks and drops, and 028 sits on 027.
 for(const later of ['028_retire_legacy.sql','027_page_debt.sql'])await f.db.query(`BEGIN;${await readFile(`db/rollback/${later}`,'utf8')}COMMIT;`);
 await expect(f.db.query(`BEGIN;${rollback}COMMIT;`)).rejects.toThrow('PUBLISHING_DATA_EXISTS');await f.db.query('ROLLBACK');
 // Separate schema fixture starts empty; reset only fixture publishing rows via TRUNCATE, never production cleanup.
 await f.db.query('TRUNCATE template_versions CASCADE');await f.db.query("UPDATE shops SET active_release_id=NULL,publishing_state='draft'");
 // 024 sits on 003, so it comes off first.
 await f.db.query(`BEGIN;${await readFile('db/rollback/026_page_lifecycle.sql','utf8')}COMMIT;`);
 await f.db.query(`BEGIN;${await readFile('db/rollback/024_pages.sql','utf8')}COMMIT;`);
 await f.db.query(`BEGIN;${rollback}COMMIT;`);
 expect((await f.db.query("SELECT to_regclass('page_visits') IS NOT NULL kept")).rows[0].kept).toBe(true);
});

test('session source and first-rating origin may be different releases',async({fixture:f})=>{
 await seed(f);const c1=(await f.resolver.live({slug:'ONE'})).context;await open(f,c1);
 await f.admin.saveDraft(f.page,2,defaultConfig('R2'));await f.admin.publish(f.page,3);
 const c2=(await f.resolver.live({slug:'one'})).context,v=await open(f,c2);
 await repo(f,c2).recordRating({...c2,visitId:v.visit.visitId},{intentId:randomUUID(),expectedRevision:0,score:4},hash(c2));
 expect((await f.db.query('SELECT c.release_id FROM session_initial_contexts o JOIN published_visit_contexts c ON c.visit_id=o.visit_id')).rows[0].release_id).toBe(c1.releaseId);
 expect((await f.db.query('SELECT c.release_id FROM experience_origin_contexts o JOIN published_visit_contexts c ON c.visit_id=o.visit_id')).rows[0].release_id).toBe(c2.releaseId);
 await expect(f.db.query("INSERT INTO shops(slug,name)VALUES('preview','Reserved')")).rejects.toThrow('shops_preview_reserved');
});

/**
 * F-013 (Astra, 20/09): the product's Google rules are enforced where a shop writes, and that is the whole point
 * of where they sit. A page already live keeps rendering; a page being written cannot carry an offer.
 */
test('the Google rules stop a page being written, and never stop one already published',async({fixture:f})=>{
 const {SERVICE_LABELS}=await import('../lib/publishing/policy');
 const template=await f.admin.createTemplate('policy',1);
 const offer={icon:'link' as const,url:'https://maps.google.com/?cid=42',
   label:{vi:'Đánh giá Google 5 sao để nhận quà',en:'Leave a 5-star Google review to get a gift'}};
 // A new page cannot be created with it, and an existing draft cannot be saved with it.
 await expect(f.admin.createPage(f.shop,template,{...defaultConfig(),links:[offer]},'one')).rejects.toThrow('POLICY_LINK_LABEL');
 (f.page=await f.admin.createPage(f.shop,template,defaultConfig(),'one'));
 await expect(f.admin.saveDraft(f.page,1,{...defaultConfig(),links:[offer]})).rejects.toThrow('POLICY_LINK_LABEL');
 await expect(f.admin.saveDraft(f.page,1,{...defaultConfig(),name:'Quán 5 sao tặng quà'})).rejects.toThrow('POLICY_GOOGLE_EXCHANGE');
 // Nothing was written by a refused save: the draft is still at revision 1 with what it had.
 expect((await f.db.query('SELECT revision::int FROM page_drafts')).rows[0].revision).toBe(1);
 // A label from the list saves and publishes normally.
 await f.admin.saveDraft(f.page,1,{...defaultConfig(),links:[{...offer,label:SERVICE_LABELS[0]}]});
 await expect(f.admin.publish(f.page,2)).resolves.toMatchObject({draftRevision:3});

 // A draft written before the rule existed cannot be published under it -- checked again on the way out.
 await f.db.query(`UPDATE page_drafts SET config=jsonb_set(config,'{links}',$1::jsonb),revision=9`,[JSON.stringify([offer])]);
 await expect(f.admin.publish(f.page,9)).rejects.toThrow('POLICY_LINK_LABEL');
 // And the page that is already live still renders: the rule never runs on a stored snapshot.
 const live=await new PublishingResolver(f.db).live({slug:'one'});
 expect(live.config.links[0].label).toEqual(SERVICE_LABELS[0]);
});

/**
 * A7 (26/09): the Google button leads to Google. Pointed at a shop's own page it could ask for stars first and pass
 * only the happy guests on -- review gating through the platform's own button (google-policy.md rules 1-3).
 */
test('the Google button cannot be pointed away from Google or carry a rating, and a live page keeps rendering',async({fixture:f})=>{
 const template=await f.admin.createTemplate('policy-url',1);
 await expect(f.admin.createPage(f.shop,template,{...defaultConfig(),googleUrl:'https://sites.google.com/view/quan-mot'},'one')).rejects.toThrow('POLICY_GOOGLE_URL');
 f.page=await f.admin.createPage(f.shop,template,{...defaultConfig(),googleUrl:'https://g.page/r/CQuanMot/review'},'one');
 for(const googleUrl of ['https://quan-mot.example/danh-gia','https://www.google.com/url?q=https://quan-mot.example','https://g.page/r/CQuanMot/review?rating=5'])
  await expect(f.admin.saveDraft(f.page,1,{...defaultConfig(),googleUrl}),googleUrl).rejects.toThrow('POLICY_GOOGLE_URL');
 expect((await f.db.query('SELECT revision::int FROM page_drafts')).rows[0].revision).toBe(1);
 await f.admin.publish(f.page,1);
 // Content stored outside the snapshot that no longer passes is never shown; the page falls back to what it published.
 await f.db.query("UPDATE page_profile SET google_url='https://quan-mot.example/danh-gia'");
 expect((await new PublishingResolver(f.db).live({slug:'one'})).config.googleUrl).toBe('https://g.page/r/CQuanMot/review');
});
