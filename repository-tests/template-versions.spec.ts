import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {AdminAuth} from '../lib/admin/auth';
import {OwnerAuth} from '../lib/owner/auth';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {OwnerDesign} from '../lib/owner/design';
import {PublishingResolver} from '../lib/publishing/repository';
import {TEMPLATE_KEYS} from '../lib/publishing/config';
import {TEMPLATE_RELEASES,latestVersion} from '../lib/publishing/versions';

/**
 * Bản khuôn (versions.ts, docs/thiet-ke-va-khuon.md mục 16). A shop's page keeps the template version it was published
 * on. A newer version reaches it only when its owner moves the draft, looks at the preview and publishes.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const MIGRATIONS=['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql','022_shop_profile.sql','023_media_review.sql','024_pages.sql'];
type F={db:Pool;shops:ShopProvisioning;actorId:string};
const test=base.extend<{f:F}>({f:async({},provide)=>{
 const schema=`nfc_tv_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of MIGRATIONS)await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  const actorId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  await provide({db,shops:new ShopProvisioning(db),actorId});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
/** Creates a shop on a template and signs its owner in, the way the handover link does. */
async function shopOn(f:F,key:string,n=1){
 const made=await f.shops.create(f.actorId,{name:`Quán ${n}`,ownerUsername:`quan-${n}`,ownerEmail:`q${n}@example.com`,googleUrl:'https://maps.google.com/?cid=7',templateKey:key});
 await new OwnerSetupLinks(f.db).consume(made.setupToken,`password-of-quan-${n}`);
 return {...made,token:(await new OwnerAuth(f.db).login(`quan-${n}`,`password-of-quan-${n}`)).token};
}
// A second version of khuôn 6 that the code does not ship yet, so the whole path can run today.
const WITH_V2={...TEMPLATE_RELEASES,'big-button':[...TEMPLATE_RELEASES['big-button'],{version:2,date:'2026-10-01',notes:'Bản thử',settings:[]}]};

test('a page stays on its template version until the owner moves the draft, previews it and publishes',async({f})=>{
 const shop=await shopOn(f,'big-button'),design=new OwnerDesign(f.db,WITH_V2),resolver=new PublishingResolver(f.db);
 expect((await resolver.live({slug:shop.slug})).templateVersion).toBe(1);
 let state=await design.read(shop.token,shop.slug);
 expect(state.template).toEqual({key:'big-button',draft:1,live:1,versions:WITH_V2['big-button'],settings:[]});
 // Moving the draft changes nothing a guest sees.
 const moved=await design.version(shop.token,shop.slug,{action:'version',expectedRevision:state.draft.revision,version:2});
 expect(moved.revision).toBe(state.draft.revision+1);
 expect((await resolver.live({slug:shop.slug})).templateVersion).toBe(1);
 state=await design.read(shop.token,shop.slug);expect(state.template).toMatchObject({draft:2,live:1});
 // The preview shows the new version; the live page still shows the old one.
 const preview=await design.preview(shop.token,shop.slug,{action:'preview',expectedRevision:state.draft.revision});
 expect((await resolver.preview(preview.token)).templateVersion).toBe(2);
 expect((await resolver.live({slug:shop.slug})).templateVersion).toBe(1);
 await design.publish(shop.token,shop.slug,{action:'publish',expectedRevision:state.draft.revision});
 expect((await resolver.live({slug:shop.slug})).templateVersion).toBe(2);
 // And back again, the same way. Both shops' moves share one row per version.
 state=await design.read(shop.token,shop.slug);
 await design.version(shop.token,shop.slug,{action:'version',expectedRevision:state.draft.revision,version:1});
 state=await design.read(shop.token,shop.slug);expect(state.template).toMatchObject({draft:1,live:2});
 await design.publish(shop.token,shop.slug,{action:'publish',expectedRevision:state.draft.revision});
 expect((await resolver.live({slug:shop.slug})).templateVersion).toBe(1);
 const other=await shopOn(f,'big-button',2);
 await design.version(other.token,other.slug,{action:'version',expectedRevision:(await design.read(other.token,other.slug)).draft.revision,version:2});
 expect((await f.db.query("SELECT version FROM template_versions WHERE template_key='big-button' ORDER BY version")).rows).toEqual([{version:1},{version:2}]);
 // Choosing the version already in use is not a change: the revision stays and no line is written.
 const same=(await design.read(shop.token,shop.slug)).draft.revision;
 expect(await design.version(shop.token,shop.slug,{action:'version',expectedRevision:same,version:1})).toEqual({revision:same});
 expect((await f.db.query("SELECT action,target FROM shop_activity WHERE action='design.version' ORDER BY at,id")).rows).toEqual([
  {action:'design.version',target:'Bản nháp dùng khuôn bản 2'},{action:'design.version',target:'Bản nháp dùng khuôn bản 1'},
  {action:'design.version',target:'Bản nháp dùng khuôn bản 2'}]);
});

test('only a version the platform ships for this template, on the current draft',async({f})=>{
 const shop=await shopOn(f,'big-button'),design=new OwnerDesign(f.db,WITH_V2);
 const revision=(await design.read(shop.token,shop.slug)).draft.revision;
 const refused=(body:unknown,d=design)=>d.version(shop.token,shop.slug,body);
 await expect(refused({action:'version',expectedRevision:revision,version:3})).rejects.toMatchObject({status:400,code:'INVALID_TEMPLATE_VERSION'});
 // What the platform actually ships today: version 1 only, so version 2 is refused without the injected list.
 await expect(refused({action:'version',expectedRevision:revision,version:2},new OwnerDesign(f.db))).rejects.toMatchObject({code:'INVALID_TEMPLATE_VERSION'});
 await expect(refused({action:'version',expectedRevision:revision-1,version:2})).rejects.toMatchObject({status:409,code:'DRAFT_CONFLICT'});
 for(const body of [{action:'version',expectedRevision:revision,version:0},{action:'version',expectedRevision:revision,version:'2'},
  {action:'version',expectedRevision:revision,version:1.5},{action:'version',expectedRevision:revision},{action:'version',expectedRevision:revision,version:2,key:'glass'}])
  await expect(refused(body)).rejects.toMatchObject({code:'INVALID_DESIGN'});
 // A second version of khuôn 6 is not a version of any other template.
 const glass=await shopOn(f,'glass',2);
 await expect(design.version(glass.token,glass.slug,{action:'version',expectedRevision:(await design.read(glass.token,glass.slug)).draft.revision,version:2}))
  .rejects.toMatchObject({code:'INVALID_TEMPLATE_VERSION'});
 // Nothing above wrote anything.
 expect((await f.db.query("SELECT count(*)::int n FROM template_versions WHERE version>1")).rows[0].n).toBe(0);
 expect((await design.read(shop.token,shop.slug)).draft.revision).toBe(revision);
 // Someone else's shop is not reachable through this door.
 await expect(design.version(glass.token,shop.slug,{action:'version',expectedRevision:revision,version:2})).rejects.toBeInstanceOf(Error);
 expect((await design.read(shop.token,shop.slug)).template.draft).toBe(1);
});

test('a new shop starts on the newest version of its template',async({f})=>{
 let n=0;
 for(const key of TEMPLATE_KEYS){
  const shop=await shopOn(f,key,++n);
  expect((await new PublishingResolver(f.db).live({slug:shop.slug})).templateVersion).toBe(latestVersion(key));
 }
});
