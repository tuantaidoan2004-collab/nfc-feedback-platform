import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {MediaReview} from '../lib/admin/media-review';
import {UPLOAD_EXPIRES_SECONDS} from '../lib/owner/media';
import {AdminAuth} from '../lib/admin/auth';
import {PublishingAdmin,PublishingResolver} from '../lib/publishing/repository';
import { DEFAULT_TEMPLATE, pageFromTemplate } from '../lib/canvas/templates';

/**
 * Cửa duyệt ảnh (migration 023, docs/thiet-ke-va-template.md mục 10). Shops upload; nothing they upload reaches a guest
 * page until the operator approves it; the check sits where a shop publishes, so a page already live stays live.
 */
/** A shop's page whose hero picture (and, if given, its first section's background) is an upload at `url`. */
const pictured=(name:string,url:string,background?:string)=>{
 const page=pageFromTemplate(DEFAULT_TEMPLATE,name),first=page.doc.sections[0];
 first.els=first.els.map(el=>el.id==='anh-chinh'&&el.t==='image'?{...el,src:url}:el);
 if(background)first.bg={...first.bg,src:background};
 return page;
};
const shows=(config:{doc:unknown},url:string)=>JSON.stringify(config.doc).includes(url);
/** The shop's page (migration 024): provisioning returns both ids. */
const pageOf=(m:{shopId:string;pageId:string})=>({shopId:m.shopId,pageId:m.pageId});
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
type F={db:Pool;shops:ShopProvisioning;review:MediaReview;actorId:string;schema:string};
const test=base.extend<{f:F}>({f:async({},provide)=>{
 const schema=`nfc_media_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  await applySchema(db);
  const actorId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  await provide({db,shops:new ShopProvisioning(db),review:new MediaReview(db),actorId,schema});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const input={name:'Quán Ảnh',ownerUsername:'quan-anh',ownerEmail:'anh@example.com',placeId:'ChIJN1t_tDeuEmsRUsoyG83frY4'};
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
 const withPoster=pictured(input.name,poster);
 let revision=await admin.saveDraft(pageOf(made),2,withPoster);
 // Never uploaded through the platform: an address typed into a draft is refused outright.
 await expect(admin.publish(pageOf(made),revision)).rejects.toThrow('MEDIA_UNKNOWN');
 // Plain http is a page source only for the local app's store (scripts/local/store.ts), and even there it must be an upload.
 const typed=await admin.saveDraft(pageOf(made),revision,pictured(input.name,'http://127.0.0.1:3322/nfc-media/x.jpg'));
 await expect(admin.publish(pageOf(made),typed)).rejects.toThrow('MEDIA_UNKNOWN');
 revision=await admin.saveDraft(pageOf(made),typed,withPoster);
 const id=await queue(f,made.shopId,poster);
 await expect(admin.publish(pageOf(made),revision)).rejects.toThrow('MEDIA_PENDING');
 // While it waits, the guest page is the one published before, untouched.
 expect(shows((await live.live({slug:made.slug})).config,poster)).toBe(false);
 expect(await f.review.pending()).toEqual([expect.objectContaining({id,url:poster,slug:made.slug,shop_name:input.name,kind:'image'})]);
 await f.review.decide(f.actorId,id,{decision:'approve'});
 await admin.publish(pageOf(made),revision);
 expect(shows((await live.live({slug:made.slug})).config,poster)).toBe(true);
 expect(await f.review.pending()).toEqual([]);
 // A refusal carries a reason, and a page holding the refused picture cannot be published.
 const logo=`https://media.example/shops/${made.shopId}/b.png`,second=await queue(f,made.shopId,logo);
 await expect(f.review.decide(f.actorId,second,{decision:'reject'})).rejects.toThrow('INVALID_INPUT');
 await expect(f.review.decide(f.actorId,second,{decision:'reject',reason:'   '})).rejects.toThrow('REASON_REQUIRED');
 await expect(f.review.decide(f.actorId,second,{decision:'reject',reason:'<b>x</b>'})).rejects.toThrow('REASON_REQUIRED');
 await f.review.decide(f.actorId,second,{decision:'reject',reason:'Logo của một thương hiệu khác'});
 revision=await admin.saveDraft(pageOf(made),revision+1,pictured(input.name,poster,logo));
 await expect(admin.publish(pageOf(made),revision)).rejects.toThrow('MEDIA_REJECTED');
 // A decision is final for that upload.
 await expect(f.review.decide(f.actorId,second,{decision:'approve'})).rejects.toThrow('MEDIA_ALREADY_REVIEWED');
 expect((await f.db.query("SELECT action,shop_id,detail FROM admin_audit WHERE action LIKE 'media.%' ORDER BY id")).rows).toEqual([
  {action:'media.approve',shop_id:made.shopId,detail:{media:id,url:poster}},
  {action:'media.reject',shop_id:made.shopId,detail:{media:second,url:logo,reason:'Logo của một thương hiệu khác'}}]);
 expect((await f.db.query('SELECT state,reason FROM media_assets WHERE id=$1',[second])).rows).toEqual([{state:'rejected',reason:'Logo của một thương hiệu khác'}]);
});

test('an approved picture belongs to its shop and to no other, the sample shop included',async({f})=>{
 const one=await f.shops.create(f.actorId,input);
 const two=await f.shops.create(f.actorId,{...input,ownerUsername:'quan-hai',ownerEmail:'hai@example.com'});
 const admin=new PublishingAdmin(f.db,async()=>({actorId:f.actorId}));
 const theirs=`https://media.example/shops/${one.shopId}/x.jpg`;await f.review.decide(f.actorId,await queue(f,one.shopId,theirs),{decision:'approve'});
 const borrowed=pictured('Quán Hai',theirs);
 await expect(admin.publish(pageOf(two),await admin.saveDraft(pageOf(two),2,borrowed))).rejects.toThrow('MEDIA_UNKNOWN');
 // The sample shop is a shop like any other: its pictures are its own (new pages start from a template's drawings).
 const template=(await f.shops.ensureTemplate(f.actorId)).shopId;
 const shared=`https://media.example/shops/${template}/t.jpg`;await f.review.decide(f.actorId,await queue(f,template,shared),{decision:'approve'});
 const draft=Number((await f.db.query('SELECT revision FROM page_drafts WHERE shop_id=$1',[two.shopId])).rows[0].revision);
 await expect(admin.publish(pageOf(two),await admin.saveDraft(pageOf(two),draft,pictured('Quán Hai',shared)))).rejects.toThrow('MEDIA_UNKNOWN');
 // Built-in pictures are the platform's own: a template's drawings need no review.
 expect((await f.db.query("SELECT count(*)::int n FROM media_assets WHERE url LIKE 'art:%'")).rows[0].n).toBe(0);
 await expect(f.review.decide(f.actorId,'not-a-uuid',{decision:'approve'})).rejects.toThrow('INVALID_INPUT');
 await expect(f.review.decide(f.actorId,randomUUID(),{decision:'approve'})).rejects.toThrow('MEDIA_NOT_FOUND');
 await expect(f.review.decide(f.actorId,randomUUID(),{decision:'maybe'})).rejects.toThrow('INVALID_INPUT');
 await expect(f.review.decide(f.actorId,randomUUID(),{decision:'approve',reason:'x'})).rejects.toThrow('INVALID_INPUT');
});
