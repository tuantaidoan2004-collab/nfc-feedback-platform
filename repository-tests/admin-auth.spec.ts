import {test as base,expect} from '@playwright/test';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {AdminAuth,adminSessionHash,authorizeAdmin} from '../lib/admin/auth';
import {recordAdminAction} from '../lib/admin/audit';
import {OwnerAuth} from '../lib/owner/auth';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const password=()=>`admin-${randomBytes(12).toString('hex')}`;
const test=base.extend<{f:{db:Pool;auth:AdminAuth;owner:OwnerAuth;shopId:string;schema:string}}>({f:async({},provideFixture)=>{
 const schema=`nfc_admin_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of ['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql'])await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  const shopId=(await db.query("INSERT INTO shops(slug,name)VALUES($1,'Fixture shop')RETURNING id",[`s${randomUUID().slice(0,8)}`])).rows[0].id;
  await provideFixture({db,auth:new AdminAuth(db),owner:new OwnerAuth(db),shopId,schema});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});

test('bootstrap needs authority and refuses weak credentials',async({f})=>{
 await expect(f.auth.bootstrap('boss',password(),async()=>{throw Error('DENIED');})).rejects.toThrow('DENIED');
 expect((await f.db.query('SELECT count(*)::int n FROM platform_admins')).rows[0].n).toBe(0);
 // Administrative passwords must clear a higher bar than owner ones; this one is valid for an owner.
 await expect(f.auth.bootstrap('boss','owner-length-ok',async()=>{})).rejects.toThrow('INVALID_CREDENTIAL');
 await expect(f.auth.bootstrap('NO SPACES',password(),async()=>{})).rejects.toThrow('INVALID_CREDENTIAL');
 expect((await f.db.query('SELECT count(*)::int n FROM platform_admins')).rows[0].n).toBe(0);
});

test('login stores only a hash, rotates, revokes and expires',async({f})=>{
 const secret=password(),id=await f.auth.bootstrap('Boss',secret,async()=>{});
 const first=await f.auth.login('boss',secret);
 expect(first.token).toMatch(/^[a-f0-9]{64}$/);
 // Four hours, not the owner's eight: this token reaches every shop.
 const hours=(first.expiresAt.getTime()-Date.now())/3_600_000;
 expect(hours).toBeGreaterThan(3.9); expect(hours).toBeLessThan(4.1);
 const stored=await f.db.query('SELECT token_hash FROM admin_auth_sessions');
 expect(stored.rows.map(r=>r.token_hash)).toEqual([adminSessionHash(first.token)]);
 expect(stored.rows.some(r=>r.token_hash===first.token)).toBe(false);

 const client=await f.db.connect();
 try{expect(await authorizeAdmin(client,first.token)).toEqual({adminId:id,username:'boss'});}finally{client.release();}

 const second=await f.auth.login('boss',secret,first.token);
 const after=await f.db.connect();
 try{await expect(authorizeAdmin(after,first.token)).rejects.toThrow('ADMIN_LOGIN_REQUIRED');
  expect((await authorizeAdmin(after,second.token)).adminId).toBe(id);}finally{after.release();}

 await f.auth.logout(second.token);
 const out=await f.db.connect();
 try{await expect(authorizeAdmin(out,second.token)).rejects.toThrow('ADMIN_LOGIN_REQUIRED');
  await expect(authorizeAdmin(out,undefined)).rejects.toThrow('ADMIN_LOGIN_REQUIRED');
  await expect(authorizeAdmin(out,'not-a-token')).rejects.toThrow('ADMIN_LOGIN_REQUIRED');
  const expired=randomBytes(32).toString('hex');
  await f.db.query(`INSERT INTO admin_auth_sessions(token_hash,admin_id,created_at,expires_at)VALUES($1,$2,clock_timestamp()-interval '5 hours',clock_timestamp()-interval '1 hour')`,[adminSessionHash(expired),id]);
  await expect(authorizeAdmin(out,expired)).rejects.toThrow('ADMIN_LOGIN_REQUIRED');}finally{out.release();}
});

test('wrong password, unknown name and a deactivated admin are one indistinguishable failure',async({f})=>{
 const secret=password();await f.auth.bootstrap('boss',secret,async()=>{});
 await expect(f.auth.login('boss',`${secret}x`)).rejects.toThrow('ADMIN_LOGIN_FAILED');
 await expect(f.auth.login('ghost',secret)).rejects.toThrow('ADMIN_LOGIN_FAILED');
 await expect(f.auth.login('boss',12345)).rejects.toThrow('ADMIN_LOGIN_FAILED');
 expect((await f.db.query('SELECT count(*)::int n FROM admin_auth_sessions')).rows[0].n).toBe(0);
 await f.db.query('UPDATE platform_admins SET active=false');
 await expect(f.auth.login('boss',secret)).rejects.toThrow('ADMIN_LOGIN_FAILED');
});

test('administrative login holds a lock and buckets of its own, not the owner ones',async({f})=>{
 const secret=password();await f.auth.bootstrap('boss',secret,async()=>{});
 const keys=(await f.db.query("SELECT hashtextextended('nfc-owner-login-v2',0)::text o,hashtextextended('nfc-admin-login-v1',0)::text a")).rows[0];
 expect(keys.a).not.toBe(keys.o);
 const holder=await f.db.connect();
 try{
  await holder.query('BEGIN');
  // Holding this lock blocks an administrative login, which is what identifies the lock it actually takes.
  // The owner lock is deliberately not held here: it is database wide, so grabbing it would fail any owner
  // spec running on the other worker. The key comparison above covers the part that cannot be exercised.
  await holder.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-admin-login-v1',0))");
  await expect(f.auth.login('boss',secret)).rejects.toThrow('ADMIN_LOGIN_FAILED');
 }finally{await holder.query('ROLLBACK');holder.release();}
 await expect(f.auth.login('boss',secret)).resolves.toBeTruthy();
 // A blocked attempt returns before touching a bucket, so only the successful login is counted here, and it
 // lands in the administrative table alone: owner throttling cannot be exhausted by administrative traffic
 // and, because the tables are separate, the reverse cannot happen either.
 expect((await f.db.query('SELECT count(*)::int n FROM admin_login_limits')).rows[0].n).toBeGreaterThan(0);
 expect((await f.db.query('SELECT count(*)::int n FROM owner_login_limits')).rows[0].n).toBe(0);
});

test('administrative throttle stops guessing even when the password becomes right',async({f})=>{
 const secret=password();await f.auth.bootstrap('boss',secret,async()=>{});
 for(let i=0;i<5;i++)await expect(f.auth.login('boss','definitely-not-the-password')).rejects.toThrow('ADMIN_LOGIN_FAILED');
 await expect(f.auth.login('boss',secret)).rejects.toThrow('ADMIN_LOGIN_FAILED');
 expect((await f.db.query('SELECT count(*)::int n FROM admin_auth_sessions')).rows[0].n).toBe(0);
});

test('audit is append only and separates work done on behalf of an owner',async({f})=>{
 const id=await f.auth.bootstrap('boss',password(),async()=>{});
 const ownerId=await f.owner.bootstrap('shopkeeper','owner-password-ok',async()=>{});
 await recordAdminAction(f.db,id,{action:'shop.create',shopId:f.shopId,detail:{plan:'month'}});
 await recordAdminAction(f.db,id,{action:'config.edit',shopId:f.shopId,onBehalfOf:ownerId});
 const rows=(await f.db.query('SELECT action,shop_id,on_behalf_of,detail FROM admin_audit ORDER BY id')).rows;
 expect(rows.map(r=>r.action)).toEqual(['shop.create','config.edit']);
 expect(rows[0].on_behalf_of).toBeNull();
 expect(rows[1].on_behalf_of).toBe(ownerId);
 expect(rows[0].detail).toEqual({plan:'month'});
 await expect(f.db.query("UPDATE admin_audit SET action='tampered'")).rejects.toThrow('IMMUTABLE_PUBLISHING_RECORD');
 await expect(f.db.query('DELETE FROM admin_audit')).rejects.toThrow('IMMUTABLE_PUBLISHING_RECORD');
 await expect(recordAdminAction(f.db,id,{action:'Bad Action'})).rejects.toThrow('INVALID_AUDIT_ACTION');
 await expect(recordAdminAction(f.db,id,{action:'shop.create',detail:{blob:'x'.repeat(5000)}})).rejects.toThrow('AUDIT_DETAIL_TOO_LARGE');
 expect((await f.db.query('SELECT count(*)::int n FROM admin_audit')).rows[0].n).toBe(2);
});

test('a password created by the bootstrap script opens a session through the library',async({f})=>{
 // scripts/bootstrap-admin.mjs repeats the KDF parameters because Node cannot import the TypeScript module.
 // This is the guard against the two drifting apart: the script writes the hash, the library reads it.
 const secret='a-sufficiently-long-admin-secret';
 await run(process.execPath,['scripts/bootstrap-admin.mjs','scripted'],
  {env:{...process.env,NFC_ADMIN_PASSWORD:secret,DATABASE_URL:`${uri}?options=-c%20search_path%3D${f.schema}`}});
 expect((await f.db.query('SELECT password_scheme FROM platform_admins')).rows[0].password_scheme).toBe('scrypt-131072-8-1');
 const session=await f.auth.login('scripted',secret);
 expect(session.token).toMatch(/^[a-f0-9]{64}$/);
 await expect(f.auth.login('scripted',`${secret}x`)).rejects.toThrow('ADMIN_LOGIN_FAILED');
 expect((await f.db.query("SELECT action FROM admin_audit")).rows.map(r=>r.action)).toEqual(['admin.bootstrap']);
});

test('rollback refuses to discard administrative identities or the audit trail',async({f})=>{
 const sql=await readFile('db/rollback/005_platform_admin.sql','utf8');
 await f.auth.bootstrap('boss',password(),async()=>{});
 const db=await f.db.connect();
 try{await expect(db.query(`BEGIN;${sql}COMMIT;`)).rejects.toThrow('ADMIN_DATA_EXISTS');await db.query('ROLLBACK');}finally{db.release();}
 expect((await f.db.query('SELECT count(*)::int n FROM platform_admins')).rows[0].n).toBe(1);
});

test('a forgotten password is reset in place, revoking sessions and leaving the trail intact',async({f})=>{
 // An administrator cannot be deleted and recreated: admin_audit references the actor and refuses DELETE, so
 // the only way back from a forgotten password is a reset that keeps the same identity.
 const url=`${uri}?options=-c%20search_path%3D${f.schema}`;
 const first='a-sufficiently-long-admin-secret',second='another-long-enough-admin-secret';
 await run(process.execPath,['scripts/bootstrap-admin.mjs','scripted'],{env:{...process.env,NFC_ADMIN_PASSWORD:first,DATABASE_URL:url}});
 const before=await f.auth.login('scripted',first);
 await run(process.execPath,['scripts/bootstrap-admin.mjs','scripted','--reset'],{env:{...process.env,NFC_ADMIN_PASSWORD:second,DATABASE_URL:url}});

 await expect(f.auth.login('scripted',first)).rejects.toThrow('ADMIN_LOGIN_FAILED');
 await expect(f.auth.login('scripted',second)).resolves.toBeTruthy();
 const client=await f.db.connect();
 try{await expect(authorizeAdmin(client,before.token)).rejects.toThrow('ADMIN_LOGIN_REQUIRED');}finally{client.release();}

 expect((await f.db.query('SELECT count(*)::int n FROM platform_admins')).rows[0].n).toBe(1);
 expect((await f.db.query('SELECT action FROM admin_audit ORDER BY id')).rows.map(r=>r.action)).toEqual(['admin.bootstrap','admin.password_reset']);
 await expect(run(process.execPath,['scripts/bootstrap-admin.mjs','ghost','--reset'],{env:{...process.env,NFC_ADMIN_PASSWORD:second,DATABASE_URL:url}}))
  .rejects.toThrow(/No administrator named ghost/);
});

test('a piped password is read to end of stream, with or without a trailing newline',async({f})=>{
 // Reading to end of line instead of end of stream left the process waiting forever on input that carried no
 // newline, and it exited on an unsettled await having written nothing at all.
 const url=`${uri}?options=-c%20search_path%3D${f.schema}`;
 // A minimal environment, so the variable that short-circuits the prompt cannot leak in from this process.
 const env={PATH:process.env.PATH??'',NODE_ENV:process.env.NODE_ENV,DATABASE_URL:url};
 const bare='piped-password-no-newline',withNewline='piped-password-with-newline';
 execFileSync(process.execPath,['scripts/bootstrap-admin.mjs','piped'],{env,input:bare});
 await expect(f.auth.login('piped',bare)).resolves.toBeTruthy();
 execFileSync(process.execPath,['scripts/bootstrap-admin.mjs','piped','--reset'],{env,input:`${withNewline}\n`});
 await expect(f.auth.login('piped',withNewline)).resolves.toBeTruthy();
 await expect(f.auth.login('piped',bare)).rejects.toThrow('ADMIN_LOGIN_FAILED');
});
