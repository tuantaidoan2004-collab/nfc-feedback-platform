import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {AdminAuth} from '../lib/admin/auth';
import {TextReview} from '../lib/admin/text-review';
import {PublishingAdmin,PublishingResolver} from '../lib/publishing/repository';
import {queueThanks} from '../lib/publishing/thanks';
import {validateConfig,type PageConfig} from '../lib/publishing/config';
/**
 * Lát M2b (migration 030): the shop's own thank-you line publishes only once an administrator approved those exact words
 * for that shop, or for the template shop a new shop is cloned from. The live page keeps its line meanwhile.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const test=base.extend<{f:{db:Pool;shops:ShopProvisioning;texts:TextReview;actorId:string}}>({f:async({},provide)=>{
 const schema=`nfc_text_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:3});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  await applySchema(db);
  const actorId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  await provide({db,shops:new ShopProvisioning(db),texts:new TextReview(db),actorId});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const line={vi:'Cảm ơn bạn đã ghé Tiệm Mây, hẹn gặp lại!',en:'Thanks for stopping by Tiệm Mây!'};
const failure=async(run:Promise<unknown>)=>run.then(()=>'ok',(error:{code?:string})=>error.code);
async function draftOf(f:{db:Pool},pageId:string){const row=(await f.db.query('SELECT revision,config FROM page_drafts WHERE page_id=$1',[pageId])).rows[0];return {revision:Number(row.revision),config:validateConfig(row.config)};}
async function save(f:{db:Pool;actorId:string},page:{shopId:string;pageId:string},config:PageConfig){
 const admin=new PublishingAdmin(f.db,async()=>({actorId:`admin:${f.actorId}`}));
 const {revision}=await draftOf(f,page.pageId);const next=await admin.saveDraft(page,revision,config);
 const client=await f.db.connect();try{await queueThanks(client,page.shopId,config,'owner:test');}finally{client.release();}
 return {admin,next};
}

test('new words wait, refuse to publish, keep the live page as it was, and publish once approved',async({f})=>{
 const made=await f.shops.create(f.actorId,{name:'Tiệm Mây',ownerUsername:'tiem-may',ownerEmail:'may@example.com',placeId:''});
 const page={shopId:made.shopId,pageId:made.pageId};
 const {config}=await draftOf(f,page.pageId);
 const {admin,next}=await save(f,page,{...config,thanks:line});
 expect(await failure(admin.publish(page,next))).toBe('THANKS_PENDING');
 expect((await new PublishingResolver(f.db).live({slug:made.slug})).config.thanks).toBeUndefined();
 const [waiting]=await f.texts.pending();
 expect(waiting).toMatchObject({shop_id:made.shopId,text_vi:line.vi,text_en:line.en,submitted_by:'owner:test'});
 // Saving the same words again queues nothing more.
 const again=await save(f,page,{...config,thanks:line});
 expect(await f.texts.pending()).toHaveLength(1);
 await f.texts.decide(f.actorId,waiting.id,{decision:'approve'});
 await again.admin.publish(page,again.next);
 expect((await new PublishingResolver(f.db).live({slug:made.slug})).config.thanks).toEqual(line);
 expect((await f.db.query("SELECT action FROM admin_audit WHERE action='text.approve'")).rows).toHaveLength(1);
});

test('refused words stay refused until they change; another shop\'s approval opens nothing; the default needs none',async({f})=>{
 const one=await f.shops.create(f.actorId,{name:'Quán Một',ownerUsername:'quan-mot',ownerEmail:'mot@example.com',placeId:''});
 const two=await f.shops.create(f.actorId,{name:'Quán Hai',ownerUsername:'quan-hai',ownerEmail:'hai@example.com',placeId:''});
 const pageOne={shopId:one.shopId,pageId:one.pageId},pageTwo={shopId:two.shopId,pageId:two.pageId};
 const base=(await draftOf(f,one.pageId)).config;
 const first=await save(f,pageOne,{...base,thanks:line});
 const [row]=await f.texts.pending();
 expect(await failure(f.texts.decide(f.actorId,row.id,{decision:'reject',reason:'   '}))).toBe('REASON_REQUIRED');
 await f.texts.decide(f.actorId,row.id,{decision:'reject',reason:'Tên quán sai chính tả'});
 expect(await failure(first.admin.publish(pageOne,first.next))).toBe('THANKS_REJECTED');
 expect(await failure(f.texts.decide(f.actorId,row.id,{decision:'approve'}))).toBe('TEXT_ALREADY_REVIEWED');
 // Same words at another shop: that shop's own review, not the first shop's decision.
 const other=await save(f,pageTwo,{...(await draftOf(f,two.pageId)).config,thanks:line});
 expect(await failure(other.admin.publish(pageTwo,other.next))).toBe('THANKS_PENDING');
 // Words that were never saved through the editor (a hand-made draft) have no review at all.
 const admin=new PublishingAdmin(f.db,async()=>({actorId:`admin:${f.actorId}`}));
 const hand=await admin.saveDraft(pageOne,first.next,{...base,thanks:{vi:'Chưa ai gửi duyệt câu này',en:'Nobody sent this'}});
 expect(await failure(admin.publish(pageOne,hand))).toBe('THANKS_UNKNOWN');
 // Back to the platform's line: publishes at once.
 const plain=await admin.saveDraft(pageOne,hand,base);
 expect(await failure(admin.publish(pageOne,plain))).toBe('ok');
});

test('a line approved on the template shop carries to a shop cloned from it, and a template change keeps the line',async({f})=>{
 const template=await f.shops.ensureTemplate(f.actorId);
 const tpage={shopId:template.shopId,pageId:template.pageId};
 const t=await save(f,tpage,{...(await draftOf(f,template.pageId)).config,thanks:line});
 await f.texts.decide(f.actorId,(await f.texts.pending())[0].id,{decision:'approve'});
 await t.admin.publish(tpage,t.next);
 // "Tạo shop mới" clones the template's live page, line included, and publishes it: the template's approval counts.
 const made=await f.shops.create(f.actorId,{name:'Quán Ba',ownerUsername:'quan-ba',ownerEmail:'ba@example.com',placeId:''});
 expect((await new PublishingResolver(f.db).live({slug:made.slug})).config.thanks).toEqual(line);
 const page={shopId:made.shopId,pageId:made.pageId};
 const admin=new PublishingAdmin(f.db,async()=>({actorId:`admin:${f.actorId}`}));
 const moved=await admin.changeTemplate(page,(await draftOf(f,made.pageId)).revision,'minimal');
 expect((await draftOf(f,made.pageId)).config.thanks).toEqual(line);
 expect(await failure(admin.publish(page,moved.revision))).toBe('ok');
});
