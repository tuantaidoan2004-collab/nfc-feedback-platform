import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {AdminAuth} from '../lib/admin/auth';
import {OwnerAuth,authorize} from '../lib/owner/auth';
import {ShopSignups,SIGNUP_LIMITS,zaloNumber} from '../lib/start/signup';
import {readDraftInput} from '../lib/start/draft';
/**
 * Lát D4b (migration 029): "Lưu trang của tôi" makes the account and a request that waits; /gov approves it into a
 * shop, or refuses it and closes the account. Tài 27/09: chờ duyệt.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const test=base.extend<{f:{db:Pool;signups:ShopSignups;shops:ShopProvisioning;auth:OwnerAuth;actorId:string}}>({f:async({},provide)=>{
 const schema=`nfc_signup_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:3});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of ['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql','022_shop_profile.sql','023_media_review.sql','024_pages.sql','025_page_labels.sql','026_page_lifecycle.sql','027_page_debt.sql','028_retire_legacy.sql','029_shop_signups.sql'])
   await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  const actorId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  await provide({db,signups:new ShopSignups(db),shops:new ShopProvisioning(db),auth:new OwnerAuth(db),actorId});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const draft=readDraftInput({name:'Tiệm Bánh Mây',template:'glass',kind:'food',hours:['noon','morning'],goals:['google']});
const input=(name:string,extra:Record<string,unknown>={})=>({draft,username:name,email:`${name}@example.com`,password:'owner-chose-this-one',zalo:'+84 961 036 265',...extra});
const failure=async(run:Promise<unknown>)=>run.then(()=>'saved',(error:{code?:string})=>error.code);

test('saving makes a closed-to-guests request and an account that can sign in, with nothing built yet',async({f})=>{
 const saved=await f.signups.create(input('@Banh-May',{email:' Banh-May@Example.com '}),null);
 expect(saved.username).toBe('banh-may');
 const row=(await f.db.query('SELECT shop_name,template_key,kind,hours,goals,zalo,decision,shop_id FROM shop_signups WHERE id=$1',[saved.id])).rows[0];
 expect(row).toEqual({shop_name:'Tiệm Bánh Mây',template_key:'glass',kind:'food',hours:['morning','noon'],goals:['google'],zalo:'0961036265',decision:null,shop_id:null});
 expect((await f.db.query('SELECT count(*)::int n FROM shops WHERE NOT is_template')).rows[0].n).toBe(0);
 const session=await f.auth.login('banh-may','owner-chose-this-one');
 expect(session.userId).toBeTruthy();
 expect(await f.signups.waiting()).toEqual([expect.objectContaining({shop_name:'Tiệm Bánh Mây',username:'banh-may',email:'banh-may@example.com'})]);
 // Taken names, bad input, and the same address twice.
 expect(await failure(f.signups.create(input('banh-may',{email:'new@example.com'}),null))).toBe('OWNER_ALREADY_EXISTS');
 expect(await failure(f.signups.create(input('someone-else',{email:'banh-may@example.com'}),null))).toBe('OWNER_ALREADY_EXISTS');
 expect(await failure(f.signups.create(input('ab'),null))).toBe('INVALID_USERNAME');
 expect(await failure(f.signups.create(input('valid-name',{email:'nope'}),null))).toBe('INVALID_EMAIL');
 expect(await failure(f.signups.create(input('valid-name',{password:'short'}),null))).toBe('WEAK_PASSWORD');
 expect(await failure(f.signups.create(input('valid-name',{zalo:'12'}),null))).toBe('INVALID_ZALO');
 expect([zaloNumber(''),zaloNumber('0961.036.265'),zaloNumber('+84961036265'),zaloNumber('abc')]).toEqual([null,'0961036265','0961036265',undefined]);
});

test('three brakes: per address, per hour for the platform, and a ceiling on what may wait',async({f})=>{
 for(let i=0;i<SIGNUP_LIMITS.perAddressPerHour;i++)expect(await failure(f.signups.create(input(`from-home-${i}`),'203.0.113.9'))).toBe('saved');
 expect(await failure(f.signups.create(input('from-home-x'),'203.0.113.9'))).toBe('TOO_MANY_ATTEMPTS');
 // A refusal is still counted and kept: the limiter row is committed with the refusal, not rolled back with it.
 expect(await failure(f.signups.create(input('from-home-y'),'203.0.113.9'))).toBe('TOO_MANY_ATTEMPTS');
 expect(await failure(f.signups.create(input('from-work'),'198.51.100.7'))).toBe('saved');
 await f.db.query("UPDATE owner_login_limits SET attempts=$1 WHERE bucket='signup-global'",[SIGNUP_LIMITS.perHour]);
 expect(await failure(f.signups.create(input('from-cafe'),'192.0.2.1'))).toBe('TOO_MANY_ATTEMPTS');
 await f.db.query("UPDATE owner_login_limits SET window_start=clock_timestamp()-interval '61 minutes' WHERE bucket='signup-global'");
 // The ceiling: as many waiting as allowed, then the next one waits for room.
 await f.db.query(`INSERT INTO owner_identities_v2(username,password_salt,password_key,email)
  SELECT 'filler-'||g,repeat('0',32),repeat('0',64),'filler-'||g||'@example.com' FROM generate_series(1,$1) g`,[SIGNUP_LIMITS.waiting-4]);
 await f.db.query("INSERT INTO shop_signups(owner_user_id,shop_name,template_key) SELECT id,'Filler','standard' FROM owner_identities_v2 WHERE username LIKE 'filler-%'");
 expect((await f.db.query('SELECT count(*)::int n FROM shop_signups WHERE decision IS NULL')).rows[0].n).toBe(SIGNUP_LIMITS.waiting);
 expect(await failure(f.signups.create(input('one-too-many'),null))).toBe('SIGNUPS_FULL');
 expect((await f.db.query("SELECT count(*)::int n FROM owner_identities_v2 WHERE username IN ('from-home-x','from-home-y','from-cafe','one-too-many')")).rows[0].n).toBe(0);
});

test('approving builds the shop as "Tạo shop mới" does, once, and the owner signs in to it',async({f})=>{
 const saved=await f.signups.create(input('banh-may'),null);
 const [one,two]=await Promise.allSettled([f.shops.approveSignup(f.actorId,saved.id),f.shops.approveSignup(f.actorId,saved.id)]);
 // Claimed first: one of two clicks builds, the other is told it is decided.
 expect([one.status,two.status].sort()).toEqual(['fulfilled','rejected']);
 const made=(one.status==='fulfilled'?one:two as PromiseFulfilledResult<{slug:string;tagCode:string}>).value;
 const shop=(await f.db.query(`SELECT s.id,s.name,s.publishing_state,p.active_release_id,d.config->>'name' page_name,tv.template_key FROM shops s JOIN pages p ON p.shop_id=s.id
  JOIN page_drafts d ON d.page_id=p.id JOIN template_versions tv ON tv.id=d.template_version_id WHERE s.slug=$1`,[made.slug])).rows[0];
 expect(shop).toMatchObject({name:'Tiệm Bánh Mây',publishing_state:'active',page_name:'Tiệm Bánh Mây',template_key:'glass'});
 expect(shop.active_release_id).not.toBeNull();
 expect((await f.db.query('SELECT state FROM tags WHERE shop_id=$1',[shop.id])).rows).toEqual([{state:'prepared'}]);
 expect((await f.db.query('SELECT decision,shop_id FROM shop_signups WHERE id=$1',[saved.id])).rows[0]).toEqual({decision:'approved',shop_id:shop.id});
 expect(await f.signups.waiting()).toEqual([]);
 const audit=(await f.db.query("SELECT action,shop_id,detail FROM admin_audit WHERE action LIKE 'signup.%'")).rows;
 expect(audit).toEqual([{action:'signup.approve',shop_id:shop.id,detail:{slug:made.slug,tagCode:made.tagCode,templateKey:'glass'}}]);
 const session=await f.auth.login('banh-may','owner-chose-this-one');
 const client=await f.db.connect();
 try{expect(await authorize(client,session.token,made.slug,'design')).toMatchObject({shopId:shop.id,role:'owner'});}finally{client.release();}
 expect(await failure(f.shops.rejectSignup(f.actorId,saved.id))).toBe('SIGNUP_DECIDED');
});

test('an approval that stopped half way is finished by approving again; a refusal closes the account',async({f})=>{
 const half=await f.signups.create(input('half-way'),null);
 // As if the first approval had claimed the request and then failed before the shop was made.
 await f.db.query("UPDATE shop_signups SET decision='approved',decided_at=clock_timestamp()-interval '1 minute',decided_by=$2 WHERE id=$1",[half.id,f.actorId]);
 expect(await f.signups.waiting()).toEqual([expect.objectContaining({username:'half-way',decision:'approved'})]);
 // Within two minutes it may still be building in another request: not taken over.
 expect(await failure(f.shops.approveSignup(f.actorId,half.id))).toBe('SIGNUP_DECIDED');
 await f.db.query("UPDATE shop_signups SET decided_at=clock_timestamp()-interval '3 minutes' WHERE id=$1",[half.id]);
 const made=await f.shops.approveSignup(f.actorId,half.id);
 expect((await f.db.query('SELECT s.slug FROM shop_signups g JOIN shops s ON s.id=g.shop_id WHERE g.id=$1',[half.id])).rows).toEqual([{slug:made.slug}]);

 const refused=await f.signups.create(input('refused'),null);
 const session=await f.auth.login('refused','owner-chose-this-one');
 await f.shops.rejectSignup(f.actorId,refused.id);
 expect((await f.db.query('SELECT decision FROM shop_signups WHERE id=$1',[refused.id])).rows[0].decision).toBe('rejected');
 expect((await f.db.query("SELECT active FROM owner_identities_v2 WHERE username='refused'")).rows[0].active).toBe(false);
 expect((await f.db.query('SELECT revoked_at FROM owner_auth_sessions_v2 WHERE user_id=$1',[session.userId])).rows[0].revoked_at).not.toBeNull();
 await expect(f.auth.login('refused','owner-chose-this-one')).rejects.toThrow('LOGIN_FAILED');
 expect(await failure(f.shops.approveSignup(f.actorId,refused.id))).toBe('SIGNUP_DECIDED');
 expect(await failure(f.shops.approveSignup(f.actorId,'not-an-id'))).toBe('SIGNUP_NOT_FOUND');
});
