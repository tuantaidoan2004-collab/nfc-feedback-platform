import { test as base, expect } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { PublishingAdmin, PublishingResolver, previewHash } from '../lib/publishing/repository';
import { defaultConfig } from '../lib/publishing/config';
import { publishingVisitPolicy } from '../lib/publishing/visit-policy';
import { VisitRatingRepository } from '../lib/repositories/visit-ratings';
import type { RenderContext } from '../lib/publishing/proof';
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
type Fixture={db:Pool;admin:PublishingAdmin;resolver:PublishingResolver;shop:string;other:string};
const test=base.extend<{fixture:Fixture}>({fixture:async({},provideFixture)=>{
 const schema=`nfc_publish_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri});
 const db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:8});
 try{await root.query(`CREATE SCHEMA ${schema}`);for(const file of ['001_core.sql','002_visit_ratings.sql','003_publishing.sql'])await db.query(await readFile(`db/migrations/${file}`,'utf8'));
 const shop=randomUUID(),other=randomUUID();await db.query("INSERT INTO shops(id,slug,name)VALUES($1,'one','One'),($2,'two','Two')",[shop,other]);
 await provideFixture({db,shop,other,admin:new PublishingAdmin(db,async()=>({actorId:'fixture-admin'})),resolver:new PublishingResolver(db)});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
async function seed(f:Fixture){const template=await f.admin.createTemplate('showcase',1);await f.admin.createDraft(f.shop,template,defaultConfig('R1'));const release=await f.admin.publish(f.shop,1);return{template,...release};}
const hash=(c:RenderContext)=>createHash('sha256').update(`fixture-browser\0${c.shopId}\0${c.scope}\0${c.entryKey}`).digest('hex');
const repo=(f:Fixture,c:RenderContext,token?:string,clock?:()=>Date)=>new VisitRatingRepository(f.db,clock,publishingVisitPolicy(c,token));
async function open(f:Fixture,c:RenderContext,token?:string){return repo(f,c,token).registerVisit(c,randomUUID(),'load',hash(c));}

test('authority boundary, draft CAS, concurrent publish and immutable versions/releases',async({fixture:f})=>{
 const denied=new PublishingAdmin(f.db,async()=>{throw Error('DENIED');});await expect(denied.createTemplate('bad',1)).rejects.toThrow('DENIED');
 const template=await f.admin.createTemplate('showcase',1);await f.admin.createDraft(f.shop,template,defaultConfig());
 const outcomes=await Promise.allSettled([f.admin.publish(f.shop,1),f.admin.publish(f.shop,1)]);
 expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(1);
 await expect(f.admin.saveDraft(f.shop,1,defaultConfig())).rejects.toThrow('DRAFT_CONFLICT');
 expect((await f.db.query('SELECT count(*)::int n FROM page_releases')).rows[0].n).toBe(1);
 await expect(f.db.query("UPDATE page_releases SET config_snapshot='{}'")).rejects.toThrow('IMMUTABLE');
 await expect(f.db.query('DELETE FROM template_versions')).rejects.toThrow('IMMUTABLE');
 await expect(f.admin.saveDraft(f.shop,2,{...defaultConfig(),html:'x'})).rejects.toThrow('INVALID_CONFIG');
});
test('rollback pointer CAS and cross-shop FK preserve releases',async({fixture:f})=>{
 const first=await seed(f);await f.admin.saveDraft(f.shop,2,defaultConfig('R2'));const second=await f.admin.publish(f.shop,3);
 await f.admin.rollback(f.shop,first.releaseId,second.releaseId);expect((await f.resolver.live({slug:'one'})).config.name).toBe('R1');
 await expect(f.admin.rollback(f.shop,second.releaseId,second.releaseId)).rejects.toThrow('RELEASE_CONFLICT');
 await f.admin.createDraft(f.other,first.template,defaultConfig('Other'));const other=await f.admin.publish(f.other,1);
 await expect(f.admin.rollback(f.shop,other.releaseId,first.releaseId)).rejects.toThrow();
 expect((await f.db.query('SELECT count(*)::int n FROM page_releases')).rows[0].n).toBe(3);
});
test('publish race retains rendered R1; next open R2 shares session, origin and each receipt attribution',async({fixture:f})=>{
 await seed(f);const c1=(await f.resolver.live({slug:'one'})).context;
 await f.admin.saveDraft(f.shop,2,defaultConfig('R2'));await f.admin.publish(f.shop,3);const c2=(await f.resolver.live({slug:'one'})).context;
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
 await seed(f);const tag=await f.admin.createTag(f.shop,'fixture-tag');await expect(f.resolver.live({code:'fixture-tag'})).rejects.toThrow('PAGE_UNAVAILABLE');
 await expect(f.admin.setTagState(f.shop,tag,'active')).rejects.toThrow('INVALID_TAG_TRANSITION');
 await expect(f.admin.setTagState(f.shop,tag,'tested')).rejects.toThrow('TAG_TEST_REQUIRED');
 const preview=await f.admin.preview(f.shop,{kind:'draft',revision:2},900,tag),c=(await f.resolver.preview(preview.token)).context;
 const v=await open(f,c,preview.token);await repo(f,c,preview.token).recordRating({...c,visitId:v.visit.visitId},{intentId:randomUUID(),expectedRevision:0,score:5},hash(c));
 expect((await f.db.query("SELECT count(*)::int n FROM rating_experiences WHERE scope='live'")).rows[0].n).toBe(0);
 await f.admin.setTagState(f.shop,tag,'tested',preview.id);await f.admin.setTagState(f.shop,tag,'active');
 const live=(await f.resolver.live({code:'fixture-tag'})).context,opened=await open(f,live);
 await f.admin.setTagState(f.shop,tag,'disabled');await expect(f.resolver.live({code:'fixture-tag'})).rejects.toThrow('PAGE_UNAVAILABLE');
 await expect(repo(f,live).recordRating({...live,visitId:opened.visit.visitId},{intentId:randomUUID(),expectedRevision:0,score:5},hash(live))).rejects.toThrow('TAG_UNAVAILABLE');
 await expect(f.admin.setTagState(f.shop,tag,'active')).rejects.toThrow('INVALID_TAG_TRANSITION');
 await expect(f.resolver.preview(preview.token)).rejects.toThrow('PREVIEW_UNAVAILABLE');
});
test('preview capability, expiry and suspended shop block old visits without live writes',async({fixture:f})=>{
 await seed(f);const preview=await f.admin.preview(f.shop,{kind:'draft',revision:2},900),c=(await f.resolver.preview(preview.token)).context;
 await expect(open(f,c,'0'.repeat(64))).rejects.toThrow('PREVIEW_UNAVAILABLE');
 await expect(repo(f,c,preview.token,()=>new Date(preview.expiresAt.getTime()+1)).registerVisit(c,randomUUID(),'load',hash(c))).rejects.toThrow('PREVIEW_EXPIRED');
 const expired='1'.repeat(64);await f.db.query(`INSERT INTO preview_sessions(shop_id,template_version_id,config_snapshot,source_draft_revision,token_hash,created_at,expires_at)
 SELECT shop_id,template_version_id,config,revision,$2,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second' FROM page_drafts WHERE shop_id=$1`,[f.shop,previewHash(expired)]);
 await expect(f.resolver.preview(expired)).rejects.toThrow('PREVIEW_UNAVAILABLE');
 const live=(await f.resolver.live({slug:'one'})).context,visit=await open(f,live);await f.admin.setShopState(f.shop,'suspended');
 await expect(repo(f,live).recordRating({...live,visitId:visit.visit.visitId},{intentId:randomUUID(),expectedRevision:0,score:4},hash(live))).rejects.toThrow('PAGE_UNAVAILABLE');
});
test('same-shop/source FK isolation rejects another shop release/tag and immutable attribution edits',async({fixture:f})=>{
 const one=await seed(f);await f.admin.createDraft(f.other,one.template,defaultConfig());await f.admin.publish(f.other,1);
 const c=(await f.resolver.live({slug:'one'})).context,v=await open(f,c),other=(await f.resolver.live({slug:'two'})).context;
 await expect(f.db.query('UPDATE published_visit_contexts SET release_id=$1 WHERE visit_id=$2',[other.releaseId,v.visit.visitId])).rejects.toThrow('IMMUTABLE');
 const raw=new VisitRatingRepository(f.db),free=await raw.registerVisit(c,randomUUID(),'load',hash(c));
 await expect(f.db.query('INSERT INTO published_visit_contexts(visit_id,shop_id,scope,entry_key,session_id,release_id)VALUES($1,$2,$3,$4,$5,$6)',[free.visit.visitId,c.shopId,c.scope,c.entryKey,free.session.sessionId,other.releaseId])).rejects.toThrow();
});
test('rollback003 refuses publishing data; empty003 rollback preserves foundation002',async({fixture:f})=>{
 const rollback=await readFile('db/rollback/003_publishing.sql','utf8');await seed(f);
 await expect(f.db.query(`BEGIN;${rollback}COMMIT;`)).rejects.toThrow('PUBLISHING_DATA_EXISTS');await f.db.query('ROLLBACK');
 // Separate schema fixture starts empty; reset only fixture publishing rows via TRUNCATE, never production cleanup.
 await f.db.query('TRUNCATE template_versions CASCADE');await f.db.query("UPDATE shops SET active_release_id=NULL,publishing_state='draft'");
 await f.db.query(`BEGIN;${rollback}COMMIT;`);
 expect((await f.db.query("SELECT to_regclass('page_visits') IS NOT NULL kept")).rows[0].kept).toBe(true);
});

test('session source and first-rating origin may be different releases',async({fixture:f})=>{
 await seed(f);const c1=(await f.resolver.live({slug:'ONE'})).context;await open(f,c1);
 await f.admin.saveDraft(f.shop,2,defaultConfig('R2'));await f.admin.publish(f.shop,3);
 const c2=(await f.resolver.live({slug:'one'})).context,v=await open(f,c2);
 await repo(f,c2).recordRating({...c2,visitId:v.visit.visitId},{intentId:randomUUID(),expectedRevision:0,score:4},hash(c2));
 expect((await f.db.query('SELECT c.release_id FROM session_initial_contexts o JOIN published_visit_contexts c ON c.visit_id=o.visit_id')).rows[0].release_id).toBe(c1.releaseId);
 expect((await f.db.query('SELECT c.release_id FROM experience_origin_contexts o JOIN published_visit_contexts c ON c.visit_id=o.visit_id')).rows[0].release_id).toBe(c2.releaseId);
 await expect(f.db.query("INSERT INTO shops(slug,name)VALUES('preview','Reserved')")).rejects.toThrow('shops_preview_reserved');
});
