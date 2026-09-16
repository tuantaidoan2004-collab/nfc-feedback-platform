import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {OwnerAuth,authorize} from '../lib/owner/auth';
import {AdminAuth} from '../lib/admin/auth';
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const test=base.extend<{f:{db:Pool;shops:ShopProvisioning;links:OwnerSetupLinks;auth:OwnerAuth;actorId:string}}>({f:async({},provide)=>{
 const schema=`nfc_prov_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of ['001_core.sql','002_visit_ratings.sql','003_publishing.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql'])
   await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  const actorId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  await provide({db,shops:new ShopProvisioning(db),links:new OwnerSetupLinks(db),auth:new OwnerAuth(db),actorId});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const input={name:'Cà Phê Bàn Số 3',ownerUsername:'quan-caphe',ownerEmail:'Chu@Example.COM',googleUrl:'https://maps.google.com/?cid=1'};

test('one call builds a live page, a card that is not live yet, and an owner who has no password',async({f})=>{
 const made=await f.shops.create(f.actorId,input);
 expect(made.slug).toMatch(/^[a-z0-9]{12}$/);
 expect(made.tagCode).toMatch(/^[a-z0-9]{12}$/);
 expect(made.ownerEmail).toBe('chu@example.com');

 const shop=(await f.db.query('SELECT slug,name,google_url,publishing_state,active_release_id FROM shops WHERE id=$1',[made.shopId])).rows[0];
 expect(shop).toMatchObject({slug:made.slug,name:'Cà Phê Bàn Số 3',google_url:'https://maps.google.com/?cid=1',publishing_state:'active'});
 expect(shop.active_release_id).not.toBeNull();
 // The card has to be written and tested by hand before anyone can scan it, so it starts prepared.
 expect((await f.db.query('SELECT public_code,state FROM tags WHERE shop_id=$1',[made.shopId])).rows).toEqual([{public_code:made.tagCode,state:'prepared'}]);
 expect((await f.db.query("SELECT role,active FROM owner_memberships_v2 WHERE user_id=$1 AND shop_id=$2",[made.ownerUserId,made.shopId])).rows).toEqual([{role:'owner',active:true}]);
 await expect(f.auth.login('quan-caphe','any-password-at-all')).rejects.toThrow('LOGIN_FAILED');

 const audit=(await f.db.query('SELECT action,shop_id,detail FROM admin_audit ORDER BY id')).rows;
 expect(audit).toEqual([{action:'shop.create',shop_id:made.shopId,detail:{slug:made.slug,tagCode:made.tagCode,ownerUsername:'quan-caphe'}}]);
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
   {googleUrl:'http://maps.google.com/'},{googleUrl:'javascript:alert(1)'}])
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
 expect((await f.db.query('SELECT count(*)::int n FROM shops')).rows[0].n).toBe(2);
 expect((await f.db.query('SELECT count(*)::int n FROM tags')).rows[0].n).toBe(2);

 const rows=await f.shops.list();
 expect(rows).toHaveLength(2);
 expect(rows.map(r=>r.owner_username).sort()).toEqual(['quan-caphe','quan-tra']);
 expect(rows.every(r=>r.publishing_state==='active'&&r.tags===1&&r.active_tags===0&&r.last_seen===null)).toBe(true);
});
