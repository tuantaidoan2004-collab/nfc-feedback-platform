import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {OwnerAuth} from '../lib/owner/auth';
import {AccountSignup} from '../lib/account/signup';
import {advance,requestHelp} from '../lib/account/onboarding';
import {onboardingOf,homeShop,sessionAccount} from '../lib/account/workspace';
import {placeStatus,savePlaceId} from '../lib/google/places';
import {parsePlaceId,reviewLink} from '../lib/google/place-id';
import {GoogleBusiness,openToken,sealToken} from '../lib/google/business';
import {HelpRequests} from '../lib/admin/help';
import {readPulse} from '../lib/owner/pulse';

/** Đợt ① (05/10): đăng ký dùng ngay, tiến trình, Place ID dán tay, Google Business giả lập, nhờ tạo giúp, nhịp Orb. */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const LOCAL={NFC_ENV:'local',NFC_GOOGLE_TOKEN_KEY:'k'.repeat(40)};
const test=base.extend<{f:{db:Pool;signup:AccountSignup}}>({f:async({},provide)=>{
 const schema=`nfc_onboarding_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:4});
 try{await root.query(`CREATE SCHEMA ${schema}`);await applySchema(db);await provide({db,signup:new AccountSignup(db)});}
 finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const code=async(run:Promise<unknown>)=>run.then(()=>'ok',(error:{code?:string})=>error.code);
const make=(f:{signup:AccountSignup},name='chu-quan')=>f.signup.create({username:name,email:`${name}@example.test`,password:'a-long-test-password',displayName:'Chủ Quán',kind:'cafe'},'203.0.113.9');

test('signing up makes the account, an active shop of its own and a session at once; the shop waits for onboarding',async({f})=>{
 const made=await make(f);
 const shop=(await f.db.query('SELECT name,self_signup,publishing_state,business_kind,publish_approved_at,onboarded_at FROM shops WHERE slug=$1',[made.slug])).rows[0];
 expect(shop).toEqual({name:'Quán của @chu-quan',self_signup:true,publishing_state:'active',business_kind:'cafe',publish_approved_at:null,onboarded_at:null});
 expect((await f.db.query('SELECT display_name FROM owner_identities_v2 WHERE id=$1',[made.userId])).rows[0].display_name).toBe('Chủ Quán');
 expect(await sessionAccount(f.db,made.session.token)).toEqual({id:made.userId,username:'chu-quan'});
 expect(await homeShop(f.db,made.userId)).toMatchObject({slug:made.slug,self_signup:true,onboarded_at:null});
 // The shop opens to its owner straight away (it is active).
 expect((await new OwnerAuth(f.db).access(made.session.token,made.slug,'shell')).role).toBe('owner');
 expect(await code(make(f))).toBe('OWNER_ALREADY_EXISTS');
 expect(await code(f.signup.create({username:'x',email:'x@example.test',password:'a-long-test-password'},null))).toBe('INVALID_USERNAME');
 expect(await code(f.signup.create({username:'ngan-qua',email:'n@example.test',password:'short'},null))).toBe('WEAK_PASSWORD');
});

test('onboarding moves forward only: template done or skipped, dashboard needs a review link, finish needs dashboard',async({f})=>{
 const made=await make(f),t=made.session.token;
 const shopId=(await f.db.query('SELECT id FROM shops WHERE slug=$1',[made.slug])).rows[0].id;
 expect(await code(advance(f.db,t,made.slug,{step:'finish'}))).toBe('DASHBOARD_STEP_REQUIRED');
 expect(await code(advance(f.db,t,made.slug,{step:'dashboard'}))).toBe('GOOGLE_LINK_REQUIRED');
 await advance(f.db,t,made.slug,{step:'template',value:'skipped'});
 await savePlaceId(f.db,t,made.slug,{placeId:'ChIJN1t_tDeuEmsRUsoyG83frY4'});
 await advance(f.db,t,made.slug,{step:'dashboard'});
 await advance(f.db,t,made.slug,{step:'finish'});
 expect(await onboardingOf(f.db,shopId)).toMatchObject({template:'skipped',dashboard:true,done:true});
 // Done stays done: a later "skip" does not undo a template already made.
 await f.db.query("UPDATE shops SET onboarding_template='done' WHERE id=$1",[shopId]);
 await advance(f.db,t,made.slug,{step:'template',value:'skipped'});
 expect((await onboardingOf(f.db,shopId)).template).toBe('done');
 expect(await code(advance(f.db,t,made.slug,{step:'nonsense'}))).toBe('INVALID_STEP');
 // Another account cannot move this shop.
 const other=await make(f,'nguoi-khac');
 expect(await code(advance(f.db,other.session.token,made.slug,{step:'finish'}))).toBe('ACCESS_DENIED');
});

test('a pasted Place ID saves the ID and the review link built from it; the shop keeps its own name',async({f})=>{
 const made=await make(f),t=made.session.token,placeId='ChIJN1t_tDeuEmsRUsoyG83frY4';
 expect(await placeStatus(f.db,t,made.slug)).toEqual({name:'Quán của @chu-quan',placeId:null,reviewLink:null});
 expect(await savePlaceId(f.db,t,made.slug,{placeId})).toEqual({placeId,reviewLink:reviewLink(placeId)});
 expect(await placeStatus(f.db,t,made.slug)).toEqual({name:'Quán của @chu-quan',placeId,reviewLink:reviewLink(placeId)});
 expect(reviewLink(placeId)).toBe('https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4');
 for(const placeId of ['short','<b>ChIJabcdefghijk</b>','https://example.com/review',42,null])
  expect(await code(savePlaceId(f.db,t,made.slug,{placeId}))).toBe('INVALID_PLACE_ID');
 // Another account cannot set this shop's Place ID.
 const other=await make(f,'nguoi-khac');
 expect(await code(savePlaceId(f.db,other.session.token,made.slug,{placeId}))).toBe('ACCESS_DENIED');
});

test('a Place ID is found in what people actually paste: the bare ID, the finder\'s line, a Google link that carries one',()=>{
 const id='ChIJN1t_tDeuEmsRUsoyG83frY4';
 for(const pasted of [id,`  ${id}\n`,`Place ID: ${id}`,`place id ${id}`,`https://search.google.com/local/writereview?placeid=${id}`,
  `https://www.google.com/maps/search/?api=1&query=Qu%C3%A1n&query_place_id=${id}`,`https://maps.google.com/?place_id=${id}`])
  expect(parsePlaceId(pasted),pasted).toBe(id);
 for(const pasted of ['','ChIJ','https://maps.app.goo.gl/abc123','https://g.page/r/CQ1234567890/review','<script>',`${id}<`,'x'.repeat(2049)])
  expect(parsePlaceId(pasted),pasted).toBeNull();
});

test('Google Business, sample mode: owner connects, reviews arrive in Google\'s shape, members with feedback read them, disconnect clears',async({f})=>{
 const made=await make(f),t=made.session.token,business=new GoogleBusiness(f.db,LOCAL);
 expect((await business.status(t,made.slug)).connection).toBeNull();
 const connected=await business.connectSimulated(t,made.slug);
 expect(connected).toMatchObject({connected:true,mode:'simulated'});
 const status=await business.status(t,made.slug);
 expect(status.connection).toMatchObject({mode:'simulated',totalReviews:expect.any(Number)});
 expect(status.reviews.length).toBe(connected.synced);
 expect(status.reviews.every(r=>r.stars>=1&&r.stars<=5)).toBe(true);
 expect((await business.sync(t,made.slug)).synced).toBe(connected.synced);
 // Production never simulates.
 expect(await code(new GoogleBusiness(f.db,{NFC_ENV:'production'}).connectSimulated(t,made.slug))).toBe('NOT_FOUND');
 await business.disconnect(t,made.slug);
 expect((await business.status(t,made.slug)).connection).toBeNull();
 expect((await f.db.query('SELECT count(*)::int n FROM google_reviews')).rows[0].n).toBe(0);
});

test('the refresh token is sealed: it opens only with the same key and any change is refused',async()=>{
 const sealed=sealToken('1//refresh-token-value',LOCAL);
 expect(sealed).not.toContain('refresh-token-value');
 expect(openToken(sealed,LOCAL)).toBe('1//refresh-token-value');
 expect(()=>openToken(sealed,{NFC_GOOGLE_TOKEN_KEY:'z'.repeat(40)})).toThrow();
 const [v,iv,body,tag]=sealed.split('.');
 expect(()=>openToken([v,iv,body.slice(0,-2)+'AA',tag].join('.'),LOCAL)).toThrow();
 expect(()=>sealToken('x',{})).toThrow('GOOGLE_TOKEN_KEY_MISSING');
});

test('"nhờ admin tạo giúp": one open request per shop, Tài sees it and closes it',async({f})=>{
 const made=await make(f),t=made.session.token;
 expect(await requestHelp(f.db,t,made.slug,{message:'Dựng giúp em <b>trang</b>'})).toEqual({requested:true,already:false});
 expect(await requestHelp(f.db,t,made.slug,{})).toEqual({requested:true,already:true});
 const admin=(await f.db.query("INSERT INTO platform_admins(username,password_salt,password_key)VALUES('tai',$1,$2)RETURNING id",['0'.repeat(32),'0'.repeat(64)])).rows[0].id;
 const open=await new HelpRequests(f.db).open();
 expect(open).toHaveLength(1);
 expect(open[0]).toMatchObject({slug:made.slug,username:'chu-quan',message:'Dựng giúp em btrang/b'});
 await new HelpRequests(f.db).done(admin,open[0].id);
 expect(await new HelpRequests(f.db).open()).toHaveLength(0);
 expect(await code(new HelpRequests(f.db).done(admin,open[0].id))).toBe('HELP_ALREADY_HANDLED');
});

test('the Orb\'s pulse counts taps, Google taps, private feedback and five stars since the last ask, for the owner only',async({f})=>{
 const made=await make(f),t=made.session.token;
 const shopId=(await f.db.query('SELECT id FROM shops WHERE slug=$1',[made.slug])).rows[0].id;
 const first=await readPulse(f.db,t,made.slug,null);
 expect(first).toMatchObject({taps:0,google:0,feedback:0,good:0});
 for(const name of ['page_opened','google_tapped','feedback_sent'])
  await f.db.query("INSERT INTO page_events(shop_id,scope,entry_key,name,at)VALUES($1,'live','direct:x',$2,clock_timestamp())",[shopId,name]);
 await f.db.query("INSERT INTO page_events(shop_id,scope,entry_key,name)VALUES($1,'test','direct:x','google_tapped')",[shopId]);
 const next=await readPulse(f.db,t,made.slug,first.cursor);
 expect(next).toMatchObject({taps:3,google:1,feedback:1,good:0});
 expect(await readPulse(f.db,t,made.slug,next.cursor)).toMatchObject({taps:0,google:0,feedback:0});
 expect(await code(readPulse(f.db,t,made.slug,'not a date'))).toBe('INVALID_SINCE');
 const other=await make(f,'nguoi-la');
 expect(await code(readPulse(f.db,other.session.token,made.slug,null))).toBe('ACCESS_DENIED');
});
