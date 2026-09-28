import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {OwnerAuth} from '../lib/owner/auth';
import {GoogleAccounts} from '../lib/owner/google';
import {ShopSignups} from '../lib/start/signup';
import {readDraftInput} from '../lib/start/draft';
/** Lát D4c (migration 032): a Google account opens only the account it is linked to, and is linked only on purpose. */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const test=base.extend<{f:{db:Pool;auth:OwnerAuth;google:GoogleAccounts;signups:ShopSignups}}>({f:async({},provide)=>{
 const schema=`nfc_google_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,application_name:schema,max:3});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of ['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql','022_shop_profile.sql','023_media_review.sql','030_text_review.sql','024_pages.sql','025_page_labels.sql','026_page_lifecycle.sql','027_page_debt.sql','028_retire_legacy.sql','029_shop_signups.sql','032_google_sign_in.sql'])
   await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  await provide({db,auth:new OwnerAuth(db),google:new GoogleAccounts(db),signups:new ShopSignups(db)});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const failure=async(run:Promise<unknown>)=>run.then(()=>'ok',(error:{code?:string})=>error.code);
const draft=readDraftInput({name:'Quán Google',template:'standard'});

test('saving with Google makes an account with Google\'s email and no password, and Google opens it',async({f})=>{
 const saved=await f.signups.create({draft,username:'quan-google',zalo:null,google:{sub:'111',email:'chu@gmail.com'}},null);
 const row=(await f.db.query('SELECT email,google_sub FROM owner_identities_v2 WHERE id=$1',[saved.userId])).rows[0];
 expect(row).toEqual({email:'chu@gmail.com',google_sub:'111'});
 // No password was ever chosen: nothing typed opens it.
 await expect(f.auth.login('quan-google','any-password-at-all')).rejects.toThrow('LOGIN_FAILED');
 expect((await f.google.signIn('111')).userId).toBe(saved.userId);
 // The same Google account cannot make a second one; an unknown one opens nothing.
 expect(await failure(f.signups.create({draft,username:'quan-google-2',zalo:null,google:{sub:'111',email:'other@gmail.com'}},null))).toBe('GOOGLE_ALREADY_LINKED');
 expect(await failure(f.google.signIn('999'))).toBe('GOOGLE_NOT_LINKED');
 // A closed account stays closed to Google too.
 await f.db.query('UPDATE owner_identities_v2 SET active=false WHERE id=$1',[saved.userId]);
 expect(await failure(f.google.signIn('111'))).toBe('GOOGLE_NOT_LINKED');
});

test('linking needs a live session, happens once, and never takes a Google account from another; email alone links nothing',async({f})=>{
 const id=await f.auth.bootstrap('co-mat-khau','a-long-owner-password',async()=>{});
 await f.db.query("UPDATE owner_identities_v2 SET email='same@gmail.com' WHERE id=$1",[id]);
 // A Google account with the same email is still not this account until it is linked on purpose.
 expect(await failure(f.google.signIn('222'))).toBe('GOOGLE_NOT_LINKED');
 expect(await failure(f.google.link(undefined,'222'))).toBe('LOGIN_REQUIRED');
 const {token}=await f.auth.login('co-mat-khau','a-long-owner-password');
 expect(await f.google.link(token,'222')).toEqual({linked:true});
 expect(await f.google.link(token,'222')).toEqual({linked:true});
 expect(await failure(f.google.link(token,'333'))).toBe('GOOGLE_OTHER_LINKED');
 expect((await f.google.signIn('222')).userId).toBe(id);
 const other=await f.auth.bootstrap('nguoi-khac','another-long-password',async()=>{});
 const theirs=(await f.auth.login('nguoi-khac','another-long-password')).token;
 expect(await failure(f.google.link(theirs,'222'))).toBe('GOOGLE_ALREADY_LINKED');
 expect((await f.db.query('SELECT google_sub FROM owner_identities_v2 WHERE id=$1',[other])).rows[0].google_sub).toBeNull();
});
