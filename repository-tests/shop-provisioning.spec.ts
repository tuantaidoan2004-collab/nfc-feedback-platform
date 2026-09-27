import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {OwnerAuth,authorize} from '../lib/owner/auth';
import {AdminAuth} from '../lib/admin/auth';
import {recordAdminAction} from '../lib/admin/audit';
/** The shop's page (migration 024): provisioning returns both ids. */
const pageOf=(m:{shopId:string;pageId:string})=>({shopId:m.shopId,pageId:m.pageId});
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const test=base.extend<{f:{db:Pool;shops:ShopProvisioning;links:OwnerSetupLinks;auth:OwnerAuth;actorId:string}}>({f:async({},provide)=>{
 const schema=`nfc_prov_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of ['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql','022_shop_profile.sql','023_media_review.sql','024_pages.sql','025_page_labels.sql','026_page_lifecycle.sql','027_page_debt.sql','028_retire_legacy.sql'])
   await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  const actorId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  await provide({db,shops:new ShopProvisioning(db),links:new OwnerSetupLinks(db),auth:new OwnerAuth(db),actorId});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const input={name:'Cà Phê Bàn Số 3',ownerUsername:'quan-caphe',ownerEmail:'Chu@Example.COM',googleUrl:'https://maps.google.com/?cid=1'};

test('one call builds a live page, a card that is not live yet, and an owner who has no password',async({f})=>{
 const made=await f.shops.create(f.actorId,input);
 // Five characters from an alphabet without 0/o, 1/l/i (lib/short-code.ts).
 expect(made.slug).toMatch(/^[2-9a-hjkmnp-z]{5}$/);
 expect(made.tagCode).toMatch(/^[2-9a-hjkmnp-z]{5}$/);
 expect(made.ownerEmail).toBe('chu@example.com');

 const shop=(await f.db.query('SELECT s.slug,s.name,s.google_url,s.publishing_state,p.active_release_id FROM shops s JOIN pages p ON p.shop_id=s.id WHERE s.id=$1',[made.shopId])).rows[0];
 expect(shop).toMatchObject({slug:made.slug,name:'Cà Phê Bàn Số 3',google_url:'https://maps.google.com/?cid=1',publishing_state:'active'});
 expect(shop.active_release_id).not.toBeNull();
 // The card has to be written and tested by hand before anyone can scan it, so it starts prepared.
 expect((await f.db.query('SELECT public_code,state FROM tags WHERE shop_id=$1',[made.shopId])).rows).toEqual([{public_code:made.tagCode,state:'prepared'}]);
 expect((await f.db.query("SELECT role,active FROM owner_memberships_v2 WHERE user_id=$1 AND shop_id=$2",[made.ownerUserId,made.shopId])).rows).toEqual([{role:'owner',active:true}]);
 await expect(f.auth.login('quan-caphe','any-password-at-all')).rejects.toThrow('LOGIN_FAILED');

 const template=(await f.db.query('SELECT id,slug FROM shops WHERE is_template')).rows[0];
 const audit=(await f.db.query('SELECT action,shop_id,detail FROM admin_audit ORDER BY id')).rows;
 expect(audit).toEqual([{action:'template.create',shop_id:template.id,detail:{slug:template.slug}},
  {action:'shop.create',shop_id:made.shopId,detail:{slug:made.slug,tagCode:made.tagCode,ownerUsername:'quan-caphe',templateKey:'standard'}}]);
});

test('the link the operator hands over is what opens the account',async({f})=>{
 const made=await f.shops.create(f.actorId,input);
 expect(await f.links.inspect(made.setupToken)).toMatchObject({username:'quan-caphe',purpose:'setup'});
 const hours=(made.setupExpiresAt.getTime()-Date.now())/3_600_000;
 expect(hours).toBeGreaterThan(47.9); expect(hours).toBeLessThan(48.1);

 await f.links.consume(made.setupToken,'chosen-by-the-shop');
 const session=await f.auth.login('quan-caphe','chosen-by-the-shop');
 const client=await f.db.connect();
 try{
  const access=await authorize(client,session.token,made.slug,'overview');
  expect(access).toMatchObject({shopId:made.shopId,role:'owner'});
 }finally{client.release();}
});

test('refuses input that would produce an unusable shop',async({f})=>{
 for(const bad of [{name:''},{name:'x'.repeat(101)},{ownerUsername:'NO SPACES'},{ownerEmail:'khong-phai-email'},
   {googleUrl:'http://maps.google.com/'},{googleUrl:'javascript:alert(1)'},{googleUrl:'https://quan.example/danh-gia'},{googleUrl:'https://maps.google.com/?cid=1&rating=5'},
   // A template key is looked up in a closed list; inherited names must not slip through (operations-gotchas, F-012).
   {templateKey:'unknown'},{templateKey:'constructor'},{templateKey:'__proto__'},{templateKey:null},{templateKey:1},{templateKey:'Glass'}])
  await expect(f.shops.create(f.actorId,{...input,...bad})).rejects.toThrow('INVALID_INPUT');
 expect((await f.db.query('SELECT count(*)::int n FROM shops')).rows[0].n).toBe(0);
 // A missing Google link is not an error: every page ships with the generic one until the shop supplies theirs.
 const made=await f.shops.create(f.actorId,{...input,googleUrl:undefined});
 expect((await f.db.query('SELECT google_url FROM shops WHERE id=$1',[made.shopId])).rows[0].google_url).toBe('https://maps.google.com/');
});

test('shops share one renderer and never share a slug, a card code or an owner',async({f})=>{
 const one=await f.shops.create(f.actorId,input);
 const two=await f.shops.create(f.actorId,{...input,ownerUsername:'quan-tra',ownerEmail:'tra@example.com'});
 expect(one.slug).not.toBe(two.slug);
 expect(one.tagCode).not.toBe(two.tagCode);
 expect((await f.db.query('SELECT count(*)::int n FROM template_versions')).rows[0].n).toBe(1);
 await expect(f.shops.create(f.actorId,input)).rejects.toThrow('OWNER_ALREADY_EXISTS');
 // A refusal must leave nothing behind. Creating the shop before discovering the owner was taken left a live
 // page with no owner: public, and with nobody able to sign in and change it.
 expect((await f.db.query('SELECT count(*)::int n FROM shops WHERE NOT is_template')).rows[0].n).toBe(2);
 expect((await f.db.query('SELECT count(*)::int n FROM tags')).rows[0].n).toBe(2);

 const all=await f.shops.list();
 // The template is listed first and apart; it has no owner, no card and no switch.
 expect(all[0]).toMatchObject({is_template:true,name:'YOUR SHOP',owner_user_id:null,tags:0,support_level:'off'});
 const rows=all.filter(r=>!r.is_template);
 expect(rows).toHaveLength(2);
 expect(rows.map(r=>r.owner_username).sort()).toEqual(['quan-caphe','quan-tra']);
 expect(rows.every(r=>r.publishing_state==='active'&&r.tags===1&&r.active_tags===0&&r.last_seen===null)).toBe(true);
});

test('a reissued link is audited against the owner\'s own shop, or not issued at all',async({f})=>{
 const one=await f.shops.create(f.actorId,input);
 const two=await f.shops.create(f.actorId,{...input,ownerUsername:'quan-tra',ownerEmail:'tra@example.com'});
 const audit=(shopId:string,ownerUserId:string)=>(db:Parameters<typeof recordAdminAction>[0])=>
  recordAdminAction(db,f.actorId,{action:'owner.link.reissue',shopId,onBehalfOf:ownerUserId});
 const count=async(sql:string)=>(await f.db.query(sql)).rows[0].n;
 const tokens='SELECT count(*)::int n FROM owner_setup_tokens',trail="SELECT count(*)::int n FROM admin_audit WHERE action='owner.link.reissue'";

 // Naming another shop would attribute the reissue to it. Refused before anything is written.
 await expect(f.links.reissue(one.ownerUserId,two.shopId,audit(two.shopId,one.ownerUserId))).rejects.toThrow('OWNER_NOT_FOUND');
 expect(await count(tokens)).toBe(2);
 expect(await count(trail)).toBe(0);

 const link=await f.links.reissue(one.ownerUserId,one.shopId,audit(one.shopId,one.ownerUserId));
 expect(await f.links.inspect(link.token)).toMatchObject({purpose:'reset',username:'quan-caphe'});
 expect((await f.db.query("SELECT actor_id,shop_id,on_behalf_of FROM admin_audit WHERE action='owner.link.reissue'")).rows)
  .toEqual([{actor_id:f.actorId,shop_id:one.shopId,on_behalf_of:one.ownerUserId}]);

 // An audit write that fails takes the new link with it, and the reset link it would have retired stays open.
 await expect(f.links.reissue(one.ownerUserId,one.shopId,async db=>{await audit(one.shopId,one.ownerUserId)(db);throw Error('AUDIT_FAILED');}))
  .rejects.toThrow('AUDIT_FAILED');
 expect(await count(tokens)).toBe(3);
 expect(await count(trail)).toBe(1);
 expect(await f.links.inspect(link.token)).not.toBeNull();

 // Tài confirmed 2026-09-16: membership decides, not the shop's state. A shop that is not live still needs a way in;
 // a suspended one gains nothing, because its dashboard stays closed. A membership that ended does not.
 await f.db.query("UPDATE shops SET publishing_state='suspended' WHERE id=$1",[one.shopId]);
 await expect(f.links.reissue(one.ownerUserId,one.shopId,audit(one.shopId,one.ownerUserId))).resolves.toBeTruthy();
 await f.db.query('UPDATE owner_memberships_v2 SET active=false WHERE user_id=$1',[one.ownerUserId]);
 await expect(f.links.reissue(one.ownerUserId,one.shopId,audit(one.shopId,one.ownerUserId))).rejects.toThrow('OWNER_NOT_FOUND');
 expect(await count(trail)).toBe(2);
});

test('the template shop is created once, even when asked at the same time, and repaired if left unpublished',async({f})=>{
 const {templateConfig}=await import('../lib/publishing/config');
 // Ten callers through a pool as small as production's: holding a connection while waiting would starve it.
 const schema=(await f.db.query('SELECT current_schema() s')).rows[0].s;
 const small=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:3,connectionTimeoutMillis:5000});
 let made:{shopId:string}[];
 try{made=await Promise.all(Array.from({length:10},()=>new ShopProvisioning(small).ensureTemplate(f.actorId)));}finally{await small.end();}
 expect(new Set(made.map(t=>t.shopId)).size).toBe(1);
 const row=(await f.db.query(`SELECT s.name,s.publishing_state,r.config_snapshot FROM shops s JOIN pages p ON p.shop_id=s.id JOIN page_releases r ON r.id=p.active_release_id WHERE s.is_template`)).rows;
 expect(row).toEqual([{name:'YOUR SHOP',publishing_state:'active',config_snapshot:templateConfig()}]);
 // A background is a picture, never a video (Tài 26/09): khuôn 1 starts on the still of the clip it once played.
 expect(row[0].config_snapshot.background).toEqual({kind:'media',media:{kind:'image',url:'/media/stem-background.jpg'},loop:true});
 expect((await f.db.query("SELECT count(*)::int n FROM admin_audit WHERE action='template.create'")).rows[0].n).toBe(1);
 expect((await f.db.query('SELECT count(*)::int n FROM owner_memberships_v2')).rows[0].n).toBe(0);
 // The database refuses a second template even if the code were bypassed.
 await expect(f.db.query("INSERT INTO shops(slug,name,is_template)VALUES('second-template','Two',true)")).rejects.toThrow('shops_one_template');

 // A run that died between the insert and the publish leaves a dark template; the next call finishes it.
 await f.db.query('UPDATE shops SET is_template=false WHERE is_template');
 await f.db.query("INSERT INTO shops(slug,name,is_template)VALUES('half-made','YOUR SHOP',true)");
 const repaired=await f.shops.ensureTemplate(f.actorId);
 expect(repaired.slug).toBe('half-made');
 expect((await f.db.query('SELECT s.publishing_state,p.active_release_id IS NOT NULL released FROM shops s JOIN pages p ON p.shop_id=s.id WHERE s.is_template')).rows).toEqual([{publishing_state:'active',released:true}]);
 // Repair is not creation: the audit trail records only the template that was actually made.
 expect((await f.db.query("SELECT count(*)::int n FROM admin_audit WHERE action='template.create'")).rows[0].n).toBe(1);

 const sql=await readFile('db/rollback/009_template_shop.sql','utf8'),db=await f.db.connect();
 try{await expect(db.query(`BEGIN;${sql}COMMIT;`)).rejects.toThrow('TEMPLATE_SHOP_EXISTS');await db.query('ROLLBACK');}finally{db.release();}
});

test('a new shop starts from the template as it stands now, with its own name and Google link, and keeps it',async({f})=>{
 const {PublishingAdmin}=await import('../lib/publishing/repository');
 const {templateConfig}=await import('../lib/publishing/config');
 const first=await f.shops.create(f.actorId,input);
 const release=async(shopId:string)=>(await f.db.query('SELECT r.config_snapshot c FROM shops s JOIN pages p ON p.shop_id=s.id JOIN page_releases r ON r.id=p.active_release_id WHERE s.id=$1',[shopId])).rows[0].c;
 expect(await release(first.shopId)).toEqual({...templateConfig(),name:'Cà Phê Bàn Số 3',googleUrl:'https://maps.google.com/?cid=1'});

 // The operator changes the template: later shops follow, earlier ones do not.
 const template=await f.shops.ensureTemplate(f.actorId),admin=new PublishingAdmin(f.db,async()=>({actorId:f.actorId}));
 const changed={...templateConfig(),text:{question:{vi:'Hôm nay thế nào?',en:'How was today?'}},
  links:[{label:{vi:'Đặt lịch',en:'Book'},url:'https://example.com/book',icon:'booking' as const}]};
 const revision=Number((await f.db.query('SELECT revision FROM page_drafts WHERE shop_id=$1',[template.shopId])).rows[0].revision);
 await admin.publish(pageOf(template),await admin.saveDraft(pageOf(template),revision,changed));
 const second=await f.shops.create(f.actorId,{...input,ownerUsername:'quan-tra',ownerEmail:'tra@example.com',googleUrl:undefined});
 expect(await release(second.shopId)).toEqual({...changed,name:'Cà Phê Bàn Số 3',googleUrl:'https://maps.google.com/'});
 expect(await release(first.shopId)).toEqual({...templateConfig(),name:'Cà Phê Bàn Số 3',googleUrl:'https://maps.google.com/?cid=1'});
 // Configuration only: the template's visits, cards and owners never travel.
 expect((await f.db.query('SELECT count(*)::int n FROM tags WHERE shop_id=$1',[template.shopId])).rows[0].n).toBe(0);
});

test('resetting the template publishes the current defaults as a new release; shops made earlier keep theirs',async({f})=>{
 const {templateConfig}=await import('../lib/publishing/config');const {PublishingAdmin}=await import('../lib/publishing/repository');
 const template=await f.shops.ensureTemplate(f.actorId),admin=new PublishingAdmin(f.db,async()=>({actorId:f.actorId}));
 // Stand in for a template published before the new defaults existed.
 const draft=Number((await f.db.query('SELECT revision FROM page_drafts WHERE shop_id=$1',[template.shopId])).rows[0].revision);
 const {feedbackButton:_unused,...old}=templateConfig();void _unused;
 const saved=await admin.saveDraft(pageOf(template),draft,{...old,schemaVersion:1,links:[]});await admin.publish(pageOf(template),saved);
 const before=await f.shops.create(f.actorId,{name:'Quán Trước',ownerUsername:'quan-truoc',ownerEmail:'truoc@example.com',googleUrl:''});
 const oldRelease=(await f.db.query('SELECT active_release_id id FROM pages WHERE shop_id=$1',[template.shopId])).rows[0].id;
 const reset=await f.shops.resetTemplate(f.actorId);
 expect(reset).toMatchObject({shopId:template.shopId,slug:template.slug});
 const live=(await f.db.query('SELECT r.id,r.config_snapshot FROM shops s JOIN pages p ON p.shop_id=s.id JOIN page_releases r ON r.id=p.active_release_id WHERE s.id=$1',[template.shopId])).rows[0];
 expect(live.id).toBe(reset.releaseId);expect(live.id).not.toBe(oldRelease);
 expect(live.config_snapshot).toEqual(templateConfig());
 expect((await f.db.query('SELECT count(*)::int n FROM page_releases WHERE id=$1',[oldRelease])).rows[0].n).toBe(1);
 expect((await f.db.query("SELECT shop_id,detail->>'releaseId' release FROM admin_audit WHERE action='template.reset'")).rows).toEqual([{shop_id:template.shopId,release:reset.releaseId}]);
 const kept=(await f.db.query('SELECT r.config_snapshot c FROM shops s JOIN pages p ON p.shop_id=s.id JOIN page_releases r ON r.id=p.active_release_id WHERE s.id=$1',[before.shopId])).rows[0].c;
 expect(kept.schemaVersion).toBe(1);expect(kept.links).toEqual([]);
 const after=await f.shops.create(f.actorId,{name:'Quán Sau',ownerUsername:'quan-sau',ownerEmail:'sau@example.com',googleUrl:''});
 const fresh=(await f.db.query('SELECT r.config_snapshot c FROM shops s JOIN pages p ON p.shop_id=s.id JOIN page_releases r ON r.id=p.active_release_id WHERE s.id=$1',[after.shopId])).rows[0].c;
 expect(fresh).toEqual({...templateConfig(),name:'Quán Sau'});
});
test('only the exact built-in media paths are accepted, and only as their own kind',async()=>{
 const {validateConfig,templateConfig,STEM_BACKGROUND}=await import('../lib/publishing/config');
 const withBackground=(media:unknown)=>({...templateConfig(),background:{kind:'media',media,loop:true}});
 expect(validateConfig(withBackground({kind:'video',url:STEM_BACKGROUND.video})).background).toMatchObject({kind:'media'});
 expect(validateConfig(withBackground({kind:'image',url:STEM_BACKGROUND.still})).background).toMatchObject({kind:'media'});
 for(const media of [{kind:'image',url:STEM_BACKGROUND.video},{kind:'video',url:STEM_BACKGROUND.still},{kind:'video',url:'/media/other.mp4'},
   {kind:'video',url:'/media/stem-background.mp4?x=1'},{kind:'video',url:'constructor'},{kind:'video',url:'http://example.com/a.mp4'}])
  expect(()=>validateConfig(withBackground(media))).toThrow('INVALID_CONFIG');
 // A logo is an image and never a built-in video.
 expect(()=>validateConfig({...templateConfig(),logo:{kind:'image',url:STEM_BACKGROUND.video}})).toThrow('INVALID_CONFIG');
});

test('the template account comes with a single-use link, never a fixed password, in every environment (lát F6)',async({f})=>{
 const provisioning=new ShopProvisioning(f.db),adminId=(await f.db.query('SELECT id FROM platform_admins LIMIT 1')).rows[0].id;
 const first=await provisioning.templateAccountLink(adminId);
 expect(first).toMatchObject({username:'yourshop',created:true});
 const auth=new OwnerAuth(f.db);
 await expect(auth.login('yourshop','1')).rejects.toThrow('LOGIN_FAILED');
 // Asking again replaces the link: the first one no longer works.
 const second=await provisioning.templateAccountLink(adminId);
 expect(second.created).toBe(false);
 const links=new OwnerSetupLinks(f.db);
 await links.consume(second.setupToken,'a-strong-template-password');
 await expect(links.consume(first.setupToken,'another-strong-password')).rejects.toThrow('SETUP_LINK_INVALID');
 const session=await auth.login('@yourshop','a-strong-template-password');
 await expect(auth.access(session.token,first.slug,'design')).resolves.toMatchObject({role:'owner'});
 // A shop cloned from the template gets the template's page, not its account.
 const made=await f.shops.create(f.actorId,input);
 await expect(auth.access(session.token,made.slug,'overview')).rejects.toThrow('ACCESS_DENIED');
 // Asking once more closes the account: the chosen password stops working and the open session is signed out.
 await provisioning.templateAccountLink(adminId);
 await expect(auth.login('@yourshop','a-strong-template-password')).rejects.toThrow('LOGIN_FAILED');
 await expect(auth.access(session.token,first.slug,'design')).rejects.toThrow();
 expect((await f.db.query("SELECT count(*)::int n FROM admin_audit WHERE action='template.account.link'")).rows[0].n).toBe(3);
});

test('A33: each of the six templates is a bare skeleton with its own template row, and carries no account content',async({f})=>{
 const {TEMPLATE_KEYS,templateConfig,validateConfig}=await import('../lib/publishing/config');
 const {assertPublishable}=await import('../lib/publishing/policy');
 const {PublishingResolver}=await import('../lib/publishing/repository');
 expect(TEMPLATE_KEYS).toEqual(['standard','minimal','glass','deco','spotlight','big-button']);
 for(const key of TEMPLATE_KEYS){
  const skeleton=templateConfig(key);
  expect(()=>assertPublishable(validateConfig(skeleton))).not.toThrow();
  // Placeholder content only: the slots an account fills hold nobody's name, link, logo or picture.
  expect({name:skeleton.name,googleUrl:skeleton.googleUrl,logo:skeleton.logo,poster:skeleton.poster}).toEqual({name:'YOUR SHOP',googleUrl:'https://maps.google.com/',logo:null,poster:null});
  if(key!=='standard')expect(skeleton.links).toEqual([]);
 }
 const resolver=new PublishingResolver(f.db);
 for(const [i,key] of TEMPLATE_KEYS.entries()){
  const made=await f.shops.create(f.actorId,{...input,ownerUsername:`khuon-${i}`,ownerEmail:`khuon${i}@example.com`,templateKey:key});
  const page=await resolver.live({slug:made.slug});
  expect(page.template).toBe(key);
  // The account's own content lands in the skeleton; the look is the template's.
  expect({name:page.config.name,googleUrl:page.config.googleUrl}).toEqual({name:input.name,googleUrl:input.googleUrl});
  if(key!=='standard')expect({layout:page.config.layout,background:page.config.background}).toEqual({layout:templateConfig(key).layout,background:templateConfig(key).background});
 }
 // One row per template, shared by every shop on it, and no shop or sign-in attached to a skeleton.
 expect((await f.db.query('SELECT template_key FROM template_versions ORDER BY template_key')).rows.map(r=>r.template_key)).toEqual([...TEMPLATE_KEYS].sort());
 expect((await f.db.query('SELECT count(*)::int n FROM shops WHERE is_template')).rows[0].n).toBe(1);
 // Omitting the key means khuôn 1, so a caller from before A33 still gets the original page.
 const old=await f.shops.create(f.actorId,{...input,ownerUsername:'cu-truoc',ownerEmail:'cu@example.com'});
 expect((await resolver.live({slug:old.slug})).template).toBe('standard');
});

test('A33: two shops asking for a brand-new template at the same moment share one template row',async({f})=>{
 await Promise.all(['a','b','c'].map(x=>f.shops.create(f.actorId,{...input,ownerUsername:`dua-${x}`,ownerEmail:`${x}@example.com`,templateKey:'spotlight'})));
 expect((await f.db.query("SELECT count(*)::int n FROM template_versions WHERE template_key='spotlight'")).rows[0].n).toBe(1);
});
