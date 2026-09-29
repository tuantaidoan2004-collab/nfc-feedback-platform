import {test as base,expect} from '@playwright/test';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {OwnerAuth} from '../lib/owner/auth';
import {OwnerSetupLinks,setupTokenHash,ownerEmail} from '../lib/owner/setup-link';
const uri=process.env.NFC_TEST_DATABASE_URL ?? '';
if(!/^postgresql:\/\/nfc_test@127\.0\.0\.1:554(?:39|49)\/nfc_repo_test$/.test(uri))throw Error('Local test fixture required');
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const allow=async()=>{};
const noAudit=async()=>{};
// Reissuing names a shop the owner belongs to, so these accounts get one.
const shopFor=async(db:Pool,userId:string)=>{
 const shopId=(await db.query("INSERT INTO shops(slug,name)VALUES($1,'Fixture')RETURNING id",[`s${randomUUID().slice(0,8)}`])).rows[0].id as string;
 await db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')",[userId,shopId]);
 return shopId;
};
const test=base.extend<{f:{db:Pool;links:OwnerSetupLinks;auth:OwnerAuth}}>({f:async({},provide)=>{
 const schema=`nfc_setup_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:3});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of ['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','022_shop_profile.sql','009_template_shop.sql','023_media_review.sql','030_text_review.sql','024_pages.sql','025_page_labels.sql','026_page_lifecycle.sql','027_page_debt.sql','028_retire_legacy.sql'])
   await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  await provide({db,links:new OwnerSetupLinks(db),auth:new OwnerAuth(db)});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});

test('normalises an address and refuses one that cannot route',()=>{
 expect(ownerEmail('  Tai@Example.COM ')).toBe('tai@example.com');
 for(const bad of ['khong-phai-email','a@b','a b@c.vn','',null,42,`${'x'.repeat(250)}@example.com`])expect(ownerEmail(bad)).toBeNull();
});

test('provisioning needs authority, stores the address folded, and refuses a duplicate',async({f})=>{
 await expect(f.links.provision('shopkeeper','a@b.vn',async()=>{throw Error('DENIED');})).rejects.toThrow('DENIED');
 expect((await f.db.query('SELECT count(*)::int n FROM owner_identities_v2')).rows[0].n).toBe(0);
 await expect(f.links.provision('NO SPACES','a@b.vn',allow)).rejects.toThrow('INVALID_CREDENTIAL');
 await expect(f.links.provision('shopkeeper','khong-phai-email',allow)).rejects.toThrow('INVALID_CREDENTIAL');

 const made=await f.links.provision('ShopKeeper','  Tai@Example.COM  ',allow);
 expect(made.email).toBe('tai@example.com');
 const row=(await f.db.query('SELECT username,email FROM owner_identities_v2')).rows[0];
 expect(row).toEqual({username:'shopkeeper',email:'tai@example.com'});
 await expect(f.links.provision('shopkeeper','other@example.com',allow)).rejects.toThrow('OWNER_ALREADY_EXISTS');
 await expect(f.links.provision('another','TAI@example.com',allow)).rejects.toThrow('OWNER_ALREADY_EXISTS');
 expect((await f.db.query('SELECT count(*)::int n FROM owner_identities_v2')).rows[0].n).toBe(1);
});

test('a provisioned account cannot be signed into until its link is spent',async({f})=>{
 const {link}=await f.links.provision('shopkeeper','tai@example.com',allow);
 // The stored key is random, so no password matches it and the operator never held one.
 await expect(f.auth.login('shopkeeper','any-password-at-all')).rejects.toThrow('LOGIN_FAILED');
 expect(link.token).toMatch(/^[a-f0-9]{64}$/);
 const stored=(await f.db.query('SELECT token_hash,purpose,round(extract(epoch from expires_at-created_at)/3600) hours FROM owner_setup_tokens')).rows;
 expect(stored).toEqual([{token_hash:setupTokenHash(link.token),purpose:'setup',hours:'48'}]);
 expect(stored[0].token_hash).not.toBe(link.token);

 const seen=await f.links.inspect(link.token);
 expect(seen).toMatchObject({username:'shopkeeper',email:'tai@example.com',purpose:'setup'});
 // Looking is not spending.
 expect((await f.db.query('SELECT count(*)::int n FROM owner_setup_tokens WHERE used_at IS NOT NULL')).rows[0].n).toBe(0);

 await f.links.consume(link.token,'chosen-by-the-shop');
 await expect(f.auth.login('shopkeeper','chosen-by-the-shop')).resolves.toBeTruthy();
});

test('a link is spent once, expires, and is retired when a newer one is issued',async({f})=>{
 const {userId,link}=await f.links.provision('shopkeeper','tai@example.com',allow);
 await f.links.consume(link.token,'chosen-by-the-shop');
 await expect(f.links.consume(link.token,'a-different-password')).rejects.toThrow('SETUP_LINK_INVALID');
 expect(await f.links.inspect(link.token)).toBeNull();
 await expect(f.auth.login('shopkeeper','a-different-password')).rejects.toThrow('LOGIN_FAILED');

 const shopId=await shopFor(f.db,userId);
 const older=await f.links.reissue(userId,shopId,noAudit);
 const newer=await f.links.reissue(userId,shopId,noAudit);
 expect(await f.links.inspect(older.token)).toBeNull();
 expect(await f.links.inspect(newer.token)).not.toBeNull();
 await expect(f.links.consume(older.token,'yet-another-password')).rejects.toThrow('SETUP_LINK_INVALID');

 const stale=randomBytes(32).toString('hex');
 await f.db.query(`INSERT INTO owner_setup_tokens(token_hash,user_id,purpose,created_at,expires_at)
  VALUES($1,$2,'reset',clock_timestamp()-interval '72 hours',clock_timestamp()-interval '1 hour')`,[setupTokenHash(stale),userId]);
 expect(await f.links.inspect(stale)).toBeNull();
 await expect(f.links.consume(stale,'expired-link-password')).rejects.toThrow('SETUP_LINK_INVALID');
 await expect(f.links.consume('not-a-token','expired-link-password')).rejects.toThrow('SETUP_LINK_INVALID');
 await expect(f.links.reissue(randomUUID(),shopId,noAudit)).rejects.toThrow('OWNER_NOT_FOUND');
});

test('a rejected password leaves the link unspent, and a spent one ends every session',async({f})=>{
 const {userId,link}=await f.links.provision('shopkeeper','tai@example.com',allow);
 await expect(f.links.consume(link.token,'short')).rejects.toThrow('INVALID_CREDENTIAL');
 expect((await f.db.query('SELECT used_at FROM owner_setup_tokens')).rows[0].used_at).toBeNull();
 await f.links.consume(link.token,'first-chosen-password');

 const session=await f.auth.login('shopkeeper','first-chosen-password');
 const reset=await f.links.reissue(userId,await shopFor(f.db,userId),noAudit);
 await f.links.consume(reset.token,'second-chosen-password');
 expect((await f.db.query('SELECT count(*)::int n FROM owner_auth_sessions_v2 WHERE token_hash=$1 AND revoked_at IS NOT NULL',
  [(await import('../lib/owner/auth')).sessionHash(session.token)])).rows[0].n).toBe(1);
 await expect(f.auth.login('shopkeeper','first-chosen-password')).rejects.toThrow('LOGIN_FAILED');
 await expect(f.auth.login('shopkeeper','second-chosen-password')).resolves.toBeTruthy();
});

test('rollback refuses to discard addresses or issued links',async({f})=>{
 await f.links.provision('shopkeeper','tai@example.com',allow);
 const sql=await readFile('db/rollback/006_owner_email_setup.sql','utf8');
 const db=await f.db.connect();
 try{await expect(db.query(`BEGIN;${sql}COMMIT;`)).rejects.toThrow('OWNER_SETUP_DATA_EXISTS');await db.query('ROLLBACK');}finally{db.release();}
 expect((await f.db.query('SELECT count(*)::int n FROM owner_setup_tokens')).rows[0].n).toBe(1);
});

// Hold the first issue at its audit callback, after INSERT but before COMMIT. The second
// reaches its DB lock before the first commits, exercising READ COMMITTED snapshots.
test('concurrent reissues leave only the newest link usable with a production-sized pool',async({f})=>{
 const {userId}=await f.links.provision('shopkeeper','tai@example.com',allow);
 const shopId=await shopFor(f.db,userId);
 let inserted!:()=>void, release!:()=>void;
 const arrived=new Promise<void>(resolve=>{inserted=resolve;});
 const held=new Promise<void>(resolve=>{release=resolve;});
 const first=f.links.reissue(userId,shopId,async()=>{inserted();await held;});
 await arrived;
 const second=f.links.reissue(userId,shopId,noAudit);
 try {
  await expect.poll(async()=>Number((await f.db.query("SELECT count(*) n FROM pg_stat_activity WHERE application_name=current_setting('application_name') AND wait_event_type='Lock'")).rows[0].n)).toBeGreaterThan(0);
 } finally {release();}
 const [older,newer]=await Promise.all([first,second]);
 expect(await f.links.inspect(older.token)).toBeNull();
 expect(await f.links.inspect(newer.token)).not.toBeNull();
});

test('unknown setup tokens never reach the expensive crypto boundary',async({f})=>{
 const crypto=(await import('node:crypto')).default;
 const {syncBuiltinESMExports}=await import('node:module');
 const original=crypto.scrypt;let calls=0;
 crypto.scrypt=((...args:unknown[])=>{calls++;return Reflect.apply(original,crypto,args);}) as typeof crypto.scrypt;
 syncBuiltinESMExports();
 try {for(let i=0;i<3;i++)await expect(f.links.consume(randomBytes(32).toString('hex'),'valid-length-password')).rejects.toThrow('SETUP_LINK_INVALID');}
 finally {crypto.scrypt=original;syncBuiltinESMExports();}
 expect(calls).toBe(0);
});

test('setup and password change refuse a busy owner KDF slot without consuming the link',async({f})=>{
 const {link}=await f.links.provision('shopkeeper','tai@example.com',allow);
 const id=await f.auth.bootstrap('another','first-owner-password',allow);
 const session=await f.auth.login('another','first-owner-password');
 expect(id).toBeTruthy();
 const holder=await f.db.connect();
 try {
  await holder.query('BEGIN');
  await holder.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-owner-login-v2',0))");
  await expect(f.links.consume(link.token,'chosen-by-the-shop')).rejects.toThrow('TOO_MANY_ATTEMPTS');
  await expect(f.auth.changePassword(session.token,'first-owner-password','second-owner-password')).rejects.toThrow('TOO_MANY_ATTEMPTS');
  expect(await f.links.inspect(link.token)).not.toBeNull();
 } finally {await holder.query('ROLLBACK');holder.release();}
 await expect(f.links.consume(link.token,'chosen-by-the-shop')).resolves.toBeTruthy();
 await expect(f.auth.changePassword(session.token,'first-owner-password','second-owner-password')).resolves.toEqual({changed:true});
});

test('invalid-token throttling commits rejected attempts and recovers after its window',async({f})=>{
 const token=randomBytes(32).toString('hex');
 for(let i=0;i<60;i++)await expect(f.links.consume(token,'valid-length-password')).rejects.toThrow('SETUP_LINK_INVALID');
 await expect(f.links.consume(token,'valid-length-password')).rejects.toMatchObject({status:429,code:'TOO_MANY_ATTEMPTS'});
 await f.db.query("UPDATE owner_login_limits SET window_start=clock_timestamp()-interval '61 seconds' WHERE bucket='setup-global'");
 await expect(f.links.consume(token,'valid-length-password')).rejects.toThrow('SETUP_LINK_INVALID');
});

// Rà bảo mật 29/09, L1: one address trying made-up links is stopped at ten a minute, before the platform's sixty, so a
// shop setting its password from its own link is not refused because someone else is guessing.
test('one address guessing links does not use up the setup budget of every other shop',async({f})=>{
 const {link}=await f.links.provision('shopkeeper','tai@example.com',allow);
 for(let i=0;i<70;i++)await expect(f.links.consume(randomBytes(32).toString('hex'),'valid-length-password','203.0.113.9')).rejects.toThrow(/SETUP_LINK_INVALID|TOO_MANY_ATTEMPTS/);
 expect((await f.db.query("SELECT attempts FROM owner_login_limits WHERE bucket='setup-global'")).rows[0].attempts).toBe(10);
 await expect(f.links.consume(link.token,'chosen-by-the-shop','198.51.100.7')).resolves.toBeTruthy();
});

test('simultaneous consumption has exactly one winner and one expensive hash',async({f})=>{
 const {link}=await f.links.provision('shopkeeper','tai@example.com',allow);
 const crypto=(await import('node:crypto')).default;
 const {syncBuiltinESMExports}=await import('node:module');
 const original=crypto.scrypt;let calls=0;
 crypto.scrypt=((...args:unknown[])=>{calls++;return Reflect.apply(original,crypto,args);}) as typeof crypto.scrypt;
 syncBuiltinESMExports();
 try {
  const results=await Promise.allSettled(Array.from({length:6},()=>f.links.consume(link.token,'chosen-by-the-shop')));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(calls).toBe(1);
 } finally {crypto.scrypt=original;syncBuiltinESMExports();}
 expect(await f.links.inspect(link.token)).toBeNull();
 await expect(f.auth.login('shopkeeper','chosen-by-the-shop')).resolves.toBeTruthy();
});

test('admin login retains a separate bounded KDF lane while owner work is busy',async({f})=>{
 const {AdminAuth}=await import('../lib/admin/auth');
 const admin=new AdminAuth(f.db);
 await admin.bootstrap('testadmin','test-admin-password-long',allow);
 const holder=await f.db.connect();
 try {
  await holder.query('BEGIN');
  await holder.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-owner-login-v2',0))");
  await expect(admin.login('testadmin','test-admin-password-long')).resolves.toBeTruthy();
  await holder.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-admin-login-v1',0))");
  await expect(admin.login('testadmin','test-admin-password-long')).rejects.toThrow('ADMIN_LOGIN_FAILED');
 } finally {await holder.query('ROLLBACK');holder.release();}
});
