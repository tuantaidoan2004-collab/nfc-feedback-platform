import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {MediaReview} from '../lib/admin/media-review';
import {UPLOAD_EXPIRES_SECONDS} from '../lib/owner/media';
import {AdminAuth} from '../lib/admin/auth';
import {PublishingAdmin,PublishingResolver} from '../lib/publishing/repository';
import { templateConfig } from '../lib/publishing/templates';

/**
 * Cửa duyệt ảnh (migration 023, docs/thiet-ke-va-template.md mục 10). Shops upload; nothing they upload reaches a guest
 * page until the operator approves it; the check sits where a shop publishes, so a page already live stays live.
 */
/** The shop's page (migration 024): provisioning returns both ids. */
const pageOf=(m:{shopId:string;pageId:string})=>({shopId:m.shopId,pageId:m.pageId});
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const BEFORE=['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql','022_shop_profile.sql'];
type F={db:Pool;shops:ShopProvisioning;review:MediaReview;actorId:string;schema:string};
const test=base.extend<{f:F}>({f:async({},provide)=>{
 const schema=`nfc_media_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of [...BEFORE,'023_media_review.sql','030_text_review.sql','024_pages.sql','025_page_labels.sql','026_page_lifecycle.sql','027_page_debt.sql','028_retire_legacy.sql'])await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  const actorId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  await provide({db,shops:new ShopProvisioning(db),review:new MediaReview(db),actorId,schema});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const input={name:'Quán Ảnh',ownerUsername:'quan-anh',ownerEmail:'anh@example.com',googleUrl:'https://maps.google.com/?cid=9'};
/** An upload whose signed link has long expired, so it can be decided (the next test is about one that has not). */
const queue=(f:F,shopId:string,url:string,kind='image')=>f.db.query(`INSERT INTO media_assets(shop_id,url,kind,content_type,size_bytes,uploaded_by,created_at)
  VALUES($1,$2,$3,$4,1000,'owner:fixture',clock_timestamp()-interval '1 hour')RETURNING id`,[shopId,url,kind,kind==='video'?'video/mp4':'image/jpeg']).then(r=>r.rows[0].id as string);

// Rà bảo mật 29/09, C3b-1. A signed upload link can be sent again -- other bytes, the same size and type -- until it expires
// (lib/owner/media.ts), so a picture approved in those minutes could be swapped for one nobody saw. Neither decision is
// taken before the link has expired: what is decided is what stays.
test('a picture is decided only once its upload link has expired, so what is approved is what stays',async({f})=>{
 const made=await f.shops.create(f.actorId,input);
 const url=`https://media.example/shops/${made.shopId}/fresh.jpg`;
 const fresh=(await f.db.query(`INSERT INTO media_assets(shop_id,url,kind,content_type,size_bytes,uploaded_by)VALUES($1,$2,'image','image/jpeg',1000,'owner:fixture')RETURNING id`,
  [made.shopId,url])).rows[0].id as string;
 await expect(f.review.decide(f.actorId,fresh,{decision:'approve'})).rejects.toThrow('MEDIA_STILL_UPLOADING');
 await expect(f.review.decide(f.actorId,fresh,{decision:'reject',reason:'Ảnh mờ'})).rejects.toThrow('MEDIA_STILL_UPLOADING');
 // The queue says from when: the link's lifetime, and a minute more for clocks that differ.
 const [waiting]=await f.review.pending();
 expect(waiting.uploading).toBe(true);
 expect(new Date(waiting.ready_at).getTime()-new Date(waiting.created_at).getTime()).toBe((UPLOAD_EXPIRES_SECONDS+60)*1000);
 const age=(seconds:number)=>f.db.query("UPDATE media_assets SET created_at=clock_timestamp()-$2*interval '1 second' WHERE id=$1",[fresh,seconds]);
 await age(UPLOAD_EXPIRES_SECONDS+58);
 await expect(f.review.decide(f.actorId,fresh,{decision:'approve'})).rejects.toThrow('MEDIA_STILL_UPLOADING');
 await age(UPLOAD_EXPIRES_SECONDS+60);
 expect((await f.review.pending())[0].uploading).toBe(false);
 await f.review.decide(f.actorId,fresh,{decision:'approve'});
 expect((await f.db.query('SELECT state FROM media_assets WHERE id=$1',[fresh])).rows).toEqual([{state:'approved'}]);
 // Nothing was recorded for the refused attempts.
 expect((await f.db.query("SELECT action FROM admin_audit WHERE action LIKE 'media.%'")).rows).toEqual([{action:'media.approve'}]);
});

// Rà bảo mật 29/09, C3b-2. A refusal is final -- a new picture is a new upload -- yet the refused file stayed readable on the
// public store for good. It is removed once the refusal is recorded; a store that fails leaves the refusal standing.
test('a refused picture is removed from the store once the refusal is recorded; an approved one stays',async({f})=>{
 const made=await f.shops.create(f.actorId,input);
 const calls:string[]=[];let failing=false;
 const review=new MediaReview(f.db,async url=>{calls.push(url);if(failing)throw Error('store down');return true;});
 const [kept,refused,unlucky]=['k','r','u'].map(name=>`https://media.example/shops/${made.shopId}/${name}.jpg`);
 expect(await review.decide(f.actorId,await queue(f,made.shopId,kept),{decision:'approve'})).toMatchObject({state:'approved',removed:false});
 expect(calls).toEqual([]);
 expect(await review.decide(f.actorId,await queue(f,made.shopId,refused),{decision:'reject',reason:'Ảnh mờ'})).toMatchObject({state:'rejected',removed:true});
 expect(calls).toEqual([refused]);
 // The store fails: the refusal stands, the answer says the file is still there, and the log says which one.
 failing=true;
 const lines:string[]=[],original=console.error;console.error=(...args:unknown[])=>{lines.push(args.map(String).join(' '));};
 const id=await queue(f,made.shopId,unlucky);
 let answer:unknown;try{answer=await review.decide(f.actorId,id,{decision:'reject',reason:'Ảnh mờ'});}finally{console.error=original;}
 expect(answer).toMatchObject({state:'rejected',removed:false});
 expect(lines).toEqual([`MEDIA_REMOVE_FAILED {"media":"${id}","cause":"store down"}`]);
 expect((await f.db.query('SELECT url,state FROM media_assets WHERE url=ANY($1) ORDER BY url',[[kept,refused,unlucky]])).rows).toEqual([
  {url:kept,state:'approved'},{url:refused,state:'rejected'},{url:unlucky,state:'rejected'}]);
});

test('a page with an unreviewed picture cannot be published, and the page already live stays live',async({f})=>{
 const made=await f.shops.create(f.actorId,input);
 const admin=new PublishingAdmin(f.db,async()=>({actorId:f.actorId})),live=new PublishingResolver(f.db);
 const poster=`https://media.example/shops/${made.shopId}/a.jpg`;
 const withPoster={...templateConfig('standard'),name:input.name,googleUrl:input.googleUrl,poster:{kind:'image' as const,url:poster}};
 let revision=await admin.saveDraft(pageOf(made),2,withPoster);
 // Never uploaded through the platform: an address typed into a draft is refused outright.
 await expect(admin.publish(pageOf(made),revision)).rejects.toThrow('MEDIA_UNKNOWN');
 const id=await queue(f,made.shopId,poster);
 await expect(admin.publish(pageOf(made),revision)).rejects.toThrow('MEDIA_PENDING');
 // While it waits, the guest page is the one published before, untouched.
 expect((await live.live({slug:made.slug})).config.poster).toBeNull();
 expect(await f.review.pending()).toEqual([expect.objectContaining({id,url:poster,slug:made.slug,shop_name:input.name,kind:'image'})]);
 await f.review.decide(f.actorId,id,{decision:'approve'});
 await admin.publish(pageOf(made),revision);
 expect((await live.live({slug:made.slug})).config.poster).toEqual({kind:'image',url:poster});
 expect(await f.review.pending()).toEqual([]);
 // A refusal carries a reason, and a page holding the refused picture cannot be published.
 const logo=`https://media.example/shops/${made.shopId}/b.png`,second=await queue(f,made.shopId,logo);
 await expect(f.review.decide(f.actorId,second,{decision:'reject'})).rejects.toThrow('INVALID_INPUT');
 await expect(f.review.decide(f.actorId,second,{decision:'reject',reason:'   '})).rejects.toThrow('REASON_REQUIRED');
 await expect(f.review.decide(f.actorId,second,{decision:'reject',reason:'<b>x</b>'})).rejects.toThrow('REASON_REQUIRED');
 await f.review.decide(f.actorId,second,{decision:'reject',reason:'Logo của một thương hiệu khác'});
 revision=await admin.saveDraft(pageOf(made),revision+1,{...withPoster,logo:{kind:'image',url:logo}});
 await expect(admin.publish(pageOf(made),revision)).rejects.toThrow('MEDIA_REJECTED');
 // A decision is final for that upload.
 await expect(f.review.decide(f.actorId,second,{decision:'approve'})).rejects.toThrow('MEDIA_ALREADY_REVIEWED');
 expect((await f.db.query("SELECT action,shop_id,detail FROM admin_audit WHERE action LIKE 'media.%' ORDER BY id")).rows).toEqual([
  {action:'media.approve',shop_id:made.shopId,detail:{media:id,url:poster}},
  {action:'media.reject',shop_id:made.shopId,detail:{media:second,url:logo,reason:'Logo của một thương hiệu khác'}}]);
 expect((await f.db.query('SELECT state,reason FROM media_assets WHERE id=$1',[second])).rows).toEqual([{state:'rejected',reason:'Logo của một thương hiệu khác'}]);
});

test('an approved picture belongs to its shop, or to the template every shop starts from',async({f})=>{
 const one=await f.shops.create(f.actorId,input);
 const two=await f.shops.create(f.actorId,{...input,ownerUsername:'quan-hai',ownerEmail:'hai@example.com'});
 const admin=new PublishingAdmin(f.db,async()=>({actorId:f.actorId}));
 const theirs=`https://media.example/shops/${one.shopId}/x.jpg`;await f.review.decide(f.actorId,await queue(f,one.shopId,theirs),{decision:'approve'});
 const borrowed={...templateConfig('standard'),name:'Quán Hai',googleUrl:input.googleUrl,poster:{kind:'image' as const,url:theirs}};
 await expect(admin.publish(pageOf(two),await admin.saveDraft(pageOf(two),2,borrowed))).rejects.toThrow('MEDIA_UNKNOWN');
 // The template's own approved picture is every shop's starting point, so a clone can publish with it.
 const template=(await f.db.query('SELECT id FROM shops WHERE is_template')).rows[0].id;
 const shared=`https://media.example/shops/${template}/t.jpg`;await f.review.decide(f.actorId,await queue(f,template,shared),{decision:'approve'});
 const draft=Number((await f.db.query('SELECT revision FROM page_drafts WHERE shop_id=$1',[two.shopId])).rows[0].revision);
 await admin.publish(pageOf(two),await admin.saveDraft(pageOf(two),draft,{...borrowed,poster:{kind:'image',url:shared}}));
 // Built-in media is the platform's own: the standard template's video needs no review.
 expect((await f.db.query('SELECT count(*)::int n FROM media_assets WHERE url LIKE $1',['%stem-background%'])).rows[0].n).toBe(0);
 await expect(f.review.decide(f.actorId,'not-a-uuid',{decision:'approve'})).rejects.toThrow('INVALID_INPUT');
 await expect(f.review.decide(f.actorId,randomUUID(),{decision:'approve'})).rejects.toThrow('MEDIA_NOT_FOUND');
 await expect(f.review.decide(f.actorId,randomUUID(),{decision:'maybe'})).rejects.toThrow('INVALID_INPUT');
 await expect(f.review.decide(f.actorId,randomUUID(),{decision:'approve',reason:'x'})).rejects.toThrow('INVALID_INPUT');
});

test('migration 023 approves the pictures already on pages, and its rollback removes the table',async()=>{
 const schema=`nfc_media_mig_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:2});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of BEFORE)await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  // A page published before the gate existed, with an uploaded poster (video + still), a logo and the built-in video.
  const shop=randomUUID(),tv=(await db.query("INSERT INTO template_versions(template_key,version,schema_version,renderer_version,capabilities)VALUES('standard',1,1,'1','[]')RETURNING id")).rows[0].id;
  await db.query("INSERT INTO shops(id,slug,name)VALUES($1,'cu','Quán Cũ')",[shop]);
  const config={...templateConfig('standard'),poster:{kind:'video',url:'https://media.example/old/p.mp4',still:'https://media.example/old/p.jpg'},logo:{kind:'image',url:'https://media.example/old/l.png'}};
  await db.query('INSERT INTO page_drafts(shop_id,template_version_id,config)VALUES($1,$2,$3)',[shop,tv,config]);
  const release=(await db.query("INSERT INTO page_releases(shop_id,template_version_id,config_snapshot,draft_revision,created_by)VALUES($1,$2,$3,1,'fixture')RETURNING id",[shop,tv,config])).rows[0].id;
  await db.query("UPDATE shops SET active_release_id=$2,publishing_state='active' WHERE id=$1",[shop,release]);
  await db.query('UPDATE page_drafts SET revision=2 WHERE shop_id=$1',[shop]);
  await db.query(await readFile('db/migrations/023_media_review.sql','utf8'));
  expect((await db.query('SELECT url,kind,state,uploaded_by FROM media_assets ORDER BY url')).rows).toEqual([
   {url:'https://media.example/old/l.png',kind:'image',state:'approved',uploaded_by:'backfill-023'},
   {url:'https://media.example/old/p.jpg',kind:'image',state:'approved',uploaded_by:'backfill-023'},
   {url:'https://media.example/old/p.mp4',kind:'video',state:'approved',uploaded_by:'backfill-023'}]);
  // So that page can be published again as it is.
  for(const file of ['024_pages.sql','025_page_labels.sql','026_page_lifecycle.sql','027_page_debt.sql','028_retire_legacy.sql'])await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  const page=(await db.query('SELECT id FROM pages WHERE shop_id=$1',[shop])).rows[0].id;
  await new PublishingAdmin(db,async()=>({actorId:'fixture'})).publish({shopId:shop,pageId:page},2);
  // Constraints: a refusal needs a reason; a decision needs a time; lengths are checked with length(), not regex counts.
  await expect(db.query("UPDATE media_assets SET state='rejected' WHERE url LIKE '%l.png'")).rejects.toThrow('check constraint');
  await expect(db.query("INSERT INTO media_assets(shop_id,url,kind,uploaded_by,state)VALUES($1,'https://x.example/a.jpg','image','t','approved')",[shop])).rejects.toThrow('check constraint');
  await expect(db.query("INSERT INTO media_assets(shop_id,url,kind,uploaded_by)VALUES($1,$2,'image','t')",[shop,'https://x.example/'+'a'.repeat(2100)])).rejects.toThrow('check constraint');
  const sql=await readFile('db/rollback/023_media_review.sql','utf8');await db.query(`BEGIN;${sql}COMMIT;`);
  expect((await db.query("SELECT to_regclass('media_assets') t")).rows[0].t).toBeNull();
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
});
