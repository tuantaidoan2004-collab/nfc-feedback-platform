import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ownerFixture,enrolAdmin} from './owner-fixture';
import {loginIdentifier} from '../lib/owner/auth';
import {OwnerProfiles} from '../lib/owner/profile';
import {AdminAuth} from '../lib/admin/auth';
import {AdminImpersonation} from '../lib/admin/impersonation';
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const MIGRATIONS=['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','022_shop_profile.sql','023_media_review.sql','024_pages.sql','025_page_labels.sql','026_page_lifecycle.sql','027_page_debt.sql','028_retire_legacy.sql'];
const test=base.extend<{f:Awaited<ReturnType<typeof ownerFixture>>}>({f:async({},provide)=>{
 const schema=`nfc_profile_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  // Tài's administrator exists before 014 runs, as on Neon: the migration gives it the handle and label he chose.
  for(const file of MIGRATIONS)await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  await new AdminAuth(db).bootstrap('tai','a-sufficiently-long-admin-secret',async()=>{});
  for(const file of ['014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql'])await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  await provide(await ownerFixture(db));
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const r2={endpoint:`https://${'0'.repeat(32)}.r2.cloudflarestorage.com`,region:'auto',accessKeyId:'key',secretAccessKey:'secret',bucket:'nfc-media',publicOrigin:'https://media.example'};
const blank={displayName:null,bio:null,avatarUrl:null,coverUrl:null};

test('sign in with the @handle, the bare handle or the email, in any case; one limit per account',async({f})=>{
 const a=f.users[0];
 expect(loginIdentifier('@Shop.One')).toEqual({kind:'username',value:'shop.one'});
 expect(loginIdentifier(' Hoa@Example.COM ')).toEqual({kind:'email',value:'hoa@example.com'});
 expect(loginIdentifier('@')).toBeNull();expect(loginIdentifier('a@b')).toBeNull();
 await f.db.query("UPDATE owner_identities_v2 SET email='hoa@example.com' WHERE id=$1",[a.id]);
 for(const name of [a.username,`@${a.username.toUpperCase()}`,'HOA@example.com'])await expect(f.auth.login(name,a.password)).resolves.toHaveProperty('token');
 // Wrong guesses by email and by handle land on the same account's limit.
 await f.db.query('DELETE FROM owner_login_limits');
 for(let i=0;i<4;i++){await expect(f.auth.login('hoa@example.com','wrong-password-x')).rejects.toThrow('LOGIN_FAILED');await expect(f.auth.login(`@${a.username}`,'wrong-password-x')).rejects.toThrow('LOGIN_FAILED');}
 await expect(f.auth.login(a.username,a.password)).rejects.toThrow('LOGIN_FAILED');
});

test('the profile: read, edit, a taken or malformed handle refused, pictures only from the own folder',async({f})=>{
 const [a,b]=f.users,profiles=new OwnerProfiles(f.db,r2);
 const mine=await profiles.get(a.token);
 expect(mine).toMatchObject({handle:a.username,displayName:null,bio:null,avatarUrl:null,uploads:true,shops:[{slug:'one',role:'owner'}]});
 await expect(profiles.update(a.token,{...blank,handle:b.username})).rejects.toMatchObject({status:409,code:'HANDLE_TAKEN'});
 for(const handle of ['ab','Có dấu','-dash',''])await expect(profiles.update(a.token,{...blank,handle})).rejects.toMatchObject({code:'INVALID_HANDLE'});
 await expect(profiles.update(a.token,{...blank,handle:a.username,bio:'x'.repeat(161)})).rejects.toMatchObject({code:'INVALID_PROFILE'});
 await expect(profiles.update(a.token,{...blank,handle:a.username,displayName:'<script>'})).rejects.toMatchObject({code:'INVALID_PROFILE'});
 await expect(profiles.update(a.token,{...blank,handle:a.username,extra:1})).rejects.toMatchObject({code:'INVALID_PROFILE'});
 const theirs=`https://media.example/users/${b.id}/${randomUUID()}.jpg`,own=`https://media.example/users/${a.id}/${randomUUID()}.webp`;
 for(const url of [theirs,'https://evil.example/users/x.jpg',`${own}?x=1`])await expect(profiles.update(a.token,{...blank,handle:a.username,avatarUrl:url})).rejects.toMatchObject({code:'INVALID_PROFILE'});
 const saved=await profiles.update(a.token,{handle:'@Chi.Hoa',displayName:'  Chị Hoa ',bio:'Chủ quán 🌿',avatarUrl:own,coverUrl:null});
 expect(saved).toMatchObject({handle:'chi.hoa',displayName:'Chị Hoa',bio:'Chủ quán 🌿',avatarUrl:own});
 // The new handle signs in; the old one no longer does.
 await expect(f.auth.login('@chi.hoa',a.password)).resolves.toHaveProperty('token');
 await expect(f.auth.login(a.username,a.password)).rejects.toThrow('LOGIN_FAILED');
 // Without a media store no picture can be set at all.
 await expect(new OwnerProfiles(f.db,null).update(a.token,{...blank,handle:'chi.hoa',avatarUrl:own})).rejects.toMatchObject({code:'INVALID_PROFILE'});
 await expect(profiles.get(undefined)).rejects.toMatchObject({status:401});
});

test('uploads: a signed PUT for an image under the own folder; no videos, no oversize, never for a stand-in',async({f})=>{
 const a=f.users[0],profiles=new OwnerProfiles(f.db,r2,()=>new Date('2026-09-18T00:00:00Z'));
 const signed=await profiles.presign(a.token,{type:'image/png',size:1000});
 expect(signed.url).toMatch(new RegExp(`^https://media\\.example/users/${a.id}/[a-f0-9-]{36}\\.png$`));
 expect(signed.upload).toContain(`/nfc-media/users/${a.id}/`);
 await expect(profiles.presign(a.token,{type:'video/mp4',size:1000})).rejects.toMatchObject({status:415});
 // F-012: same plain-object lookup as the shop uploads; here it signed a PUT with a nonsense type and extension.
 for(const name of ['constructor','toString','__proto__','valueOf','hasOwnProperty'])
  await expect(profiles.presign(a.token,{type:name,size:1000})).rejects.toMatchObject({status:415});
 await expect(profiles.presign(a.token,{type:'image/png',size:5*1024*1024+1})).rejects.toMatchObject({status:413});
 await expect(new OwnerProfiles(f.db,null).presign(a.token,{type:'image/png',size:10})).rejects.toMatchObject({status:503});
 const admins=new AdminAuth(f.db),adminId=(await f.db.query("SELECT id FROM platform_admins WHERE username='tai'")).rows[0].id;
 const token=(await admins.login('tai','a-sufficiently-long-admin-secret')).token;await enrolAdmin(f.db);
 const stand=await new AdminImpersonation(f.db).start(token,{shopId:f.shops[0],ownerUserId:a.id,scope:'overview',reason:'Kiểm tra hồ sơ giúp shop'});
 const credential={impersonation:stand.token};
 await expect(profiles.get(credential)).rejects.toMatchObject({code:'IMPERSONATION_READ_ONLY'});
 await expect(profiles.update(credential,{...blank,handle:'taken-over'})).rejects.toMatchObject({code:'IMPERSONATION_READ_ONLY'});
 await expect(profiles.presign(credential,{type:'image/png',size:10})).rejects.toMatchObject({code:'IMPERSONATION_READ_ONLY'});
 expect(adminId).toBeTruthy();
});

test('migration 014: Tài is @Quitesensational · Admin Tài; account routes are not shop slugs; rollback refuses filled profiles',async({f})=>{
 expect((await f.db.query("SELECT handle,title FROM platform_admins WHERE username='tai'")).rows).toEqual([{handle:'Quitesensational',title:'Admin Tài'}]);
 await expect(f.db.query("UPDATE shops SET slug='Profile' WHERE id=$1",[f.shops[0]])).rejects.toThrow('shops_account_routes_reserved');
 await expect(f.db.query("UPDATE owner_identities_v2 SET display_name=' x' WHERE id=$1",[f.users[0].id])).rejects.toThrow('check');
 const rollback=await readFile('db/rollback/014_account_profiles.sql','utf8'),db=await f.db.connect();
 try{
  await db.query("UPDATE owner_identities_v2 SET bio='Xin chào' WHERE id=$1",[f.users[0].id]);
  await db.query('BEGIN');await expect(db.query(rollback)).rejects.toThrow('PROFILES_PRESENT');await db.query('ROLLBACK');
  await db.query('UPDATE owner_identities_v2 SET bio=NULL');
  await db.query('BEGIN');await db.query(rollback);
  expect((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema=current_schema() AND column_name IN ('display_name','bio','avatar_url','cover_url','handle','title')")).rows[0].n).toBe(0);
  await db.query('ROLLBACK');
 }finally{db.release();}
});
