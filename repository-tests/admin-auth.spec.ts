import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {enrolAdmin} from './owner-fixture';
import {base32,code,fromBase32,newSecret,open,seal,stepAt,stepOf} from '../lib/admin/totp';
import {randomUUID,randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {AdminAuth,adminSessionHash,authorizeAdmin,backupCodeHash} from '../lib/admin/auth';
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
  await applySchema(db);
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
 // Session mechanics are the subject here; the second factor has its own test below. Without it every call that
 // asks `authorizeAdmin` would stop at TWO_FACTOR_REQUIRED (lát A2).
 const app=await enrolAdmin(f.db,'boss');
 expect(first.token).toMatch(/^[a-f0-9]{64}$/);
 // Four hours, not the owner's eight: this token reaches every shop.
 const hours=(first.expiresAt.getTime()-Date.now())/3_600_000;
 expect(hours).toBeGreaterThan(3.9); expect(hours).toBeLessThan(4.1);
 const stored=await f.db.query('SELECT token_hash FROM admin_auth_sessions');
 expect(stored.rows.map(r=>r.token_hash)).toEqual([adminSessionHash(first.token)]);
 expect(stored.rows.some(r=>r.token_hash===first.token)).toBe(false);

 const client=await f.db.connect();
 try{expect(await authorizeAdmin(client,first.token)).toEqual({adminId:id,username:'boss',twoFactor:true});}finally{client.release();}

 // Enrolled now, so rotating the session needs a code from the app as well.
 const second=await f.auth.login('boss',secret,first.token,code(app,stepAt(new Date())));
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

// Rà bảo mật 29/09, L1. The operator's sign-in had one limit for the whole platform (20 a minute) and one per account for
// every address (5 in 15 minutes): anyone who knew /gov, or the administrator's name, could keep Tài out of it with a
// handful of requests -- during an incident, exactly when he needs it.
test('one address past its limits does not keep the administrator out from somewhere else',async({f})=>{
 test.setTimeout(120_000);
 const secret=password();await f.auth.bootstrap('boss',secret,async()=>{});
 const attacker='203.0.113.9',home='198.51.100.7',wrong='definitely-not-the-password';
 const global=async()=>Number((await f.db.query("SELECT attempts FROM admin_login_limits WHERE bucket='global'")).rows[0]?.attempts??0);
 for(let i=0;i<40;i++)await expect(f.auth.login(`nobody${i}`,wrong,undefined,undefined,attacker)).rejects.toThrow('ADMIN_LOGIN_FAILED');
 expect(await global()).toBe(5);
 await f.db.query('DELETE FROM admin_login_limits');
 for(let i=0;i<6;i++)await expect(f.auth.login('boss',wrong,undefined,undefined,attacker)).rejects.toThrow('ADMIN_LOGIN_FAILED');
 await expect(f.auth.login('boss',secret,undefined,undefined,attacker)).rejects.toThrow('ADMIN_LOGIN_FAILED');
 await expect(f.auth.login('boss',secret,undefined,undefined,home)).resolves.toBeTruthy();
 // Guesses from many addresses are still bounded for the account: twenty in fifteen minutes.
 await f.db.query('DELETE FROM admin_login_limits');
 for(let i=0;i<20;i++)await expect(f.auth.login('boss',wrong,undefined,undefined,`203.0.113.${i+10}`)).rejects.toThrow('ADMIN_LOGIN_FAILED');
 await expect(f.auth.login('boss',secret,undefined,undefined,home)).rejects.toThrow('ADMIN_LOGIN_FAILED');
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
 // Opening production (lát F6): an administrator created after migration 014 gets its badge from the script.
 await run(process.execPath,['scripts/bootstrap-admin.mjs','tai','--handle=Quitesensational','--title=Admin Tài'],
  {env:{...process.env,NFC_ADMIN_PASSWORD:secret,DATABASE_URL:`${uri}?options=-c%20search_path%3D${f.schema}`}});
 expect((await f.db.query("SELECT handle,title FROM platform_admins WHERE username='tai'")).rows).toEqual([{handle:'Quitesensational',title:'Admin Tài'}]);
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

/**
 * The second factor (lát A2). One administrator reaches every shop, so a stolen password must not be enough.
 */
const env={NFC_TOTP_KEY:'ab'.repeat(32)};
test('enrolment cannot switch itself on, and cannot lock the only administrator out halfway',async({f})=>{
 const secret=password();await f.auth.bootstrap('boss',secret,async()=>{});
 const session=(await f.auth.login('boss',secret)).token;
 // Nothing administrative works before the second factor is on -- checked where the work happens, not in a page.
 const client=await f.db.connect();
 try{await expect(authorizeAdmin(client,session)).rejects.toThrow('TWO_FACTOR_REQUIRED');}finally{client.release();}

 const started=await f.auth.beginEnrolment(session);
 expect(started.secret).toMatch(/^[A-Z2-7]{32}$/);
 expect(started.uri).toContain(`secret=${started.secret}`);
 // Started but not confirmed: the password alone still signs in, or walking away here would lock the platform.
 expect((await f.db.query('SELECT totp_enrolled_at FROM platform_admins')).rows[0].totp_enrolled_at).toBeNull();
 await expect(f.auth.login('boss',secret)).resolves.toBeTruthy();
 await expect(f.auth.confirmEnrolment(session,'000000')).rejects.toThrow('TWO_FACTOR_CODE_WRONG');
 expect((await f.db.query('SELECT totp_enrolled_at FROM platform_admins')).rows[0].totp_enrolled_at).toBeNull();

 const app=fromBase32(started.secret);
 const {codes}=await f.auth.confirmEnrolment(session,code(app,stepAt(new Date())));
 expect(codes).toHaveLength(10);
 expect(new Set(codes).size).toBe(10);
 // Only hashes are kept, so nothing can print these a second time.
 const stored=(await f.db.query('SELECT code_hash FROM admin_backup_codes')).rows.map(r=>r.code_hash);
 expect(stored).toHaveLength(10);
 for(const backup of codes)expect(stored).toContain(backupCodeHash(backup.replace('-','')));
 expect(JSON.stringify(stored)).not.toContain(codes[0].split('-')[0]);
 // The secret is never stored in the clear: reading this table must not be enough to produce codes.
 const row=(await f.db.query('SELECT totp_secret FROM platform_admins')).rows[0].totp_secret as string;
 expect(row).not.toContain(started.secret);
 expect(row).toMatch(/^[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/);
 await expect(f.auth.beginEnrolment(session)).rejects.toThrow('TWO_FACTOR_ALREADY_ON');
});

/**
 * The codes below are made from one `now`, and the server judges them by its own clock a few logins later. A 30-second
 * step boundary falling in between moves the server one step on, so "thirty seconds out" becomes sixty and is refused
 * by design: this case failed about one run in thirty (CI 27/09). Each phase starts with ten seconds of its step left.
 */
async function clearOfStepBoundary(margin=10){
 const into=(Date.now()/1000)%30;
 if(into>30-margin)await new Promise(resolve=>setTimeout(resolve,(30-into)*1000+250));
}

test('once on: the password alone is refused, a code is spent by using it, and a backup code works once',async({f})=>{
 const secret=password();await f.auth.bootstrap('boss',secret,async()=>{});
 const first=(await f.auth.login('boss',secret)).token;
 const started=await f.auth.beginEnrolment(first),app=fromBase32(started.secret);
 const {codes}=await f.auth.confirmEnrolment(first,code(app,stepAt(new Date())));

 // Administrative login allows five attempts per name per fifteen minutes, and this case deliberately makes more
 // than five. That lane has its own case above; clearing it between phases keeps this one about the second factor.
 const freshLane=()=>f.db.query('DELETE FROM admin_login_limits');

 // The password on its own, and a wrong code, answer exactly what a wrong password answers.
 await expect(f.auth.login('boss',secret)).rejects.toThrow('ADMIN_LOGIN_FAILED');
 await expect(f.auth.login('boss',secret,undefined,'000000')).rejects.toThrow('ADMIN_LOGIN_FAILED');
 await expect(f.auth.login('boss','wrong-password-entirely',undefined,code(app,stepAt(new Date())))).rejects.toThrow('ADMIN_LOGIN_FAILED');

 await freshLane();
 await clearOfStepBoundary();
 const now=new Date(),digits=code(app,stepAt(now));
 await expect(f.auth.login('boss',secret,undefined,digits)).resolves.toBeTruthy();
 // The same code inside its own thirty seconds is already spent: reading it over a shoulder buys nothing.
 await expect(f.auth.login('boss',secret,undefined,digits)).rejects.toThrow('ADMIN_LOGIN_FAILED');
 expect((await f.db.query('SELECT count(*)::int n FROM admin_totp_steps')).rows[0].n).toBe(1);

 // A phone thirty seconds out of step still works; a minute and a half out does not.
 await freshLane();
 await expect(f.auth.login('boss',secret,undefined,code(app,stepAt(now)-1))).resolves.toBeTruthy();
 await expect(f.auth.login('boss',secret,undefined,code(app,stepAt(now)-3))).rejects.toThrow('ADMIN_LOGIN_FAILED');

 // A printed code, once. The dashes are decoration; typing them or not makes no difference.
 await freshLane();
 await expect(f.auth.login('boss',secret,undefined,codes[0])).resolves.toBeTruthy();
 await expect(f.auth.login('boss',secret,undefined,codes[0])).rejects.toThrow('ADMIN_LOGIN_FAILED');
 await expect(f.auth.login('boss',secret,undefined,codes[1].replace('-',''))).resolves.toBeTruthy();
 expect(await f.auth.backupCodesLeft(first)).toBe(8);
 // Someone else's printed code is not a way in.
 await freshLane();
 const other=password();await f.auth.bootstrap('second',other,async()=>{});
 const theirs=(await f.auth.login('second',other)).token;
 const theirStart=await f.auth.beginEnrolment(theirs);
 await f.auth.confirmEnrolment(theirs,code(fromBase32(theirStart.secret),stepAt(new Date())));
 await expect(f.auth.login('second',other,undefined,codes[2])).rejects.toThrow('ADMIN_LOGIN_FAILED');
});

test('the stored secret is unusable without the key, and a missing key refuses rather than storing it bare',async()=>{
 const secret=newSecret(),sealed=seal(secret,env);
 expect(open(sealed,env).equals(secret)).toBe(true);
 // Another environment's key must not open it, and a tampered row must not either.
 expect(()=>open(sealed,{NFC_TOTP_KEY:'cd'.repeat(32)})).toThrow('TOTP_SECRET_UNREADABLE');
 const [iv,tag,body]=sealed.split(':');
 expect(()=>open(`${iv}:${tag}:${body.replace(/^../,'00')}`,env)).toThrow('TOTP_SECRET_UNREADABLE');
 // No key at all is refused outright. A second factor that quietly stores its secret in the clear is worse than
 // none, because everyone believes it is working.
 expect(()=>seal(secret,{})).toThrow('TOTP_KEY_MISSING');
 expect(()=>seal(secret,{NFC_TOTP_KEY:'too-short'})).toThrow('TOTP_KEY_MISSING');
});

test('the codes match a known RFC 6238 vector, so the app and the server agree',async()=>{
 // RFC 6238 appendix B, SHA-1, seed "12345678901234567890" as ASCII.
 const seed=Buffer.from('12345678901234567890');
 expect(code(seed,Math.floor(59/30))).toBe('287082');
 expect(code(seed,Math.floor(1111111109/30))).toBe('081804');
 expect(code(seed,Math.floor(1234567890/30))).toBe('005924');
 expect(code(seed,Math.floor(2000000000/30))).toBe('279037');
 // base32 round-trips, which is what the person types into their app.
 expect(fromBase32(base32(seed)).equals(seed)).toBe(true);
 expect(stepOf(seed,'287082',new Date(59_000))).toBe(1);
 expect(stepOf(seed,'000000',new Date(59_000))).toBeNull();
 expect(stepOf(seed,'28708',new Date(59_000))).toBeNull();
 expect(stepOf(seed,'abcdef',new Date(59_000))).toBeNull();
});
