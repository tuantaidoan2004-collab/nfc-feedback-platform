import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {createHmac,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {OwnerAuth} from '../lib/owner/auth';
import {AccountSignup} from '../lib/account/signup';
import {advance} from '../lib/account/onboarding';
import {requestEdit} from '../lib/owner/edit-requests';
import {OwnerPages} from '../lib/owner/pages';
import {onboardingOf,homeShop,sessionAccount} from '../lib/account/workspace';
import {placeStatus,savePlaceId} from '../lib/google/places';
import {parsePlaceId,reviewLink} from '../lib/google/place-id';
import {GoogleBusiness,mapsJobs,mapsLink,openToken,receiveMaps,sealToken} from '../lib/google/business';
import {EditRequests} from '../lib/admin/edit-requests';
import {readPulse} from '../lib/owner/pulse';
import {shopOverview} from '../lib/owner/overview';

/** Đợt ① (05/10): đăng ký dùng ngay, tiến trình, Place ID dán tay, Google Business (từ tool Google Maps), nhờ admin sửa, nhịp Orb. */
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

/** What the Google Maps tool sends for one shop (~/MAps/backend/app/qs_sync.py). Invented reviews, never real ones. */
const REVIEWS=[
 {id:'tool-review-1',author:'An Nhiên',author_photo:'https://lh3.googleusercontent.com/a/x=w80-h80',rating:5,text:'Trà ngon, quán yên tĩnh.',owner_reply:'Cảm ơn bạn!',est_posted_at:'2026-10-05'},
 {id:'tool-review-2',author:'Bình',author_photo:'',rating:2,text:'',owner_reply:'',est_posted_at:'2026-09-05'},
 {id:'tool-review-3',author:'Chi',author_photo:'',rating:4,text:'Ổn.',owner_reply:'',est_posted_at:null,first_seen_at:'2026-08-06T10:00:00'},
 {id:'tool-review-4',author:'Dũng',author_photo:'',rating:9,text:'Số sao không hợp lệ',owner_reply:'',est_posted_at:'2026-10-01'},
] as Record<string,unknown>[];
const KEY=`tool-key-${'x'.repeat(24)}`,TOOL={...LOCAL,NFC_MAPS_KEY:KEY},LINK='https://maps.app.goo.gl/AbCdEf123';
const sign=(message:string,key=KEY)=>`sha256=${createHmac('sha256',key).update(message).digest('hex')}`;
/** The tool sending one shop's reading, signed like the tool signs it. */
const send=(db:Pool,event:object,key=KEY)=>{const body=JSON.stringify(event);return receiveMaps(db,body,sign(body,key),TOOL);};
const reading=(shop:string,at:string,reviews=REVIEWS,url=LINK)=>({event:'run.completed',shop,place_url:url,scraped_at:at,avg_rating:4.6,total_reviews:170,place_name:'Quán Thử Trên Maps',reviews});
/** The tool asking which shops to read, signed like the tool signs it. */
const ask=(db:Pool,now=Date.now(),key=KEY)=>{const at=String(Math.floor(now/1000));return mapsJobs(db,at,sign(`GET /api/google-maps ${at}`,key),TOOL,now);};

test('the Google Maps link is found in what owners paste; only links that open a place on Maps count',()=>{
 for(const [pasted,link] of [[LINK,LINK],[`  ${LINK}\n`,LINK],[`NHẸ TÊNH Coffee & Tea\n${LINK}`,LINK],
  ['https://www.google.com/maps/place/Qu%C3%A1n/@10.7,106.7,15z/data=!4m8','https://www.google.com/maps/place/Qu%C3%A1n/@10.7,106.7,15z/data=!4m8'],
  ['https://goo.gl/maps/xyz123','https://goo.gl/maps/xyz123'],['https://maps.google.com/?cid=123','https://maps.google.com/?cid=123']] as const)
  expect(mapsLink(pasted),pasted).toBe(link);
 for(const pasted of ['','ChIJN1t_tDeuEmsRUsoyG83frY4','http://maps.app.goo.gl/AbC','https://search.google.com/local/writereview?placeid=ChIJ',
  'https://www.google.com/search?q=quan','https://g.page/r/abc/review','https://maps.app.goo.gl.evil.test/AbC','https://user:pw@maps.app.goo.gl/AbC',
  'https://example.com/maps/x',42,null,`https://maps.app.goo.gl/${'a'.repeat(2100)}`])
  expect(mapsLink(pasted),String(pasted)).toBeNull();
});

test('Google Maps: the owner pastes the link, the tool is handed it, its signed reading lands in Google\'s shape and mirrors Maps',async({f})=>{
 const made=await make(f),t=made.session.token,business=new GoogleBusiness(f.db,TOOL);
 // Empty until the owner pastes a link; the field is offered only when the tool is set up.
 expect(await business.status(t,made.slug)).toMatchObject({connection:null,maps:true});
 expect((await new GoogleBusiness(f.db,LOCAL).status(t,made.slug)).maps).toBe(false);
 expect(await code(business.setMapsLink(t,made.slug,'https://example.com/quan'))).toBe('INVALID_MAPS_LINK');
 expect(await code(new GoogleBusiness(f.db,LOCAL).setMapsLink(t,made.slug,LINK))).toBe('MAPS_NOT_SET_UP');
 expect(await business.setMapsLink(t,made.slug,`Quán Thử\n${LINK}`)).toEqual({mapsUrl:LINK,changed:true});
 expect((await business.status(t,made.slug)).connection).toMatchObject({mode:'maps',mapsUrl:LINK,lastSyncedAt:null,locationTitle:null,requestedAt:expect.any(String)});
 // The tool asks with its key and the time; the link is handed out once, not again on the next question.
 expect(await code(ask(f.db,Date.now(),'wrong-key'))).toBe('BAD_SIGNATURE');
 const old=String(Math.floor(Date.now()/1000)-600);
 expect(await code(mapsJobs(f.db,old,sign(`GET /api/google-maps ${old}`),TOOL))).toBe('BAD_SIGNATURE');
 expect(await code(mapsJobs(f.db,null,null,TOOL))).toBe('BAD_SIGNATURE');
 expect(await ask(f.db)).toEqual({jobs:[{shop:made.slug,url:LINK}]});
 expect(await ask(f.db)).toEqual({jobs:[]});
 // Its reading: signed, for this shop and this link.
 expect(await code(send(f.db,reading(made.slug,'2026-10-05T21:00:40'),'wrong-key'))).toBe('BAD_SIGNATURE');
 expect(await code(receiveMaps(f.db,JSON.stringify(reading(made.slug,'2026-10-05T21:00:40')),null,TOOL))).toBe('BAD_SIGNATURE');
 expect(await send(f.db,{event:'test'})).toEqual({received:'test'});
 expect(await send(f.db,reading(made.slug,'2026-10-05T21:00:40'))).toEqual({received:'run.completed',synced:3});
 const status=await business.status(t,made.slug);
 // When Google was read is the tool's look (Vietnam's clock, no offset in the tool), not the moment it arrived here.
 expect(status.connection).toMatchObject({mode:'maps',locationTitle:'Quán Thử Trên Maps',averageRating:4.6,totalReviews:170,lastSyncedAt:'2026-10-05T14:00:40.000Z',lastError:null});
 // A day is the tool's estimate, kept at noon in Vietnam; without one, the day it first saw the review. The 9-star one is refused.
 expect(status.reviews).toEqual([
  {reviewId:'tool-review-1',reviewerName:'An Nhiên',reviewerPhoto:'https://lh3.googleusercontent.com/a/x=w80-h80',isAnonymous:false,stars:5,comment:'Trà ngon, quán yên tĩnh.',
   createdAt:'2026-10-05T05:00:00.000Z',updatedAt:'2026-10-05T05:00:00.000Z',reply:'Cảm ơn bạn!',replyUpdatedAt:null},
  {reviewId:'tool-review-2',reviewerName:'Bình',reviewerPhoto:null,isAnonymous:false,stars:2,comment:null,createdAt:'2026-09-05T05:00:00.000Z',updatedAt:'2026-09-05T05:00:00.000Z',reply:null,replyUpdatedAt:null},
  {reviewId:'tool-review-3',reviewerName:'Chi',reviewerPhoto:null,isAnonymous:false,stars:4,comment:'Ổn.',createdAt:'2026-08-06T05:00:00.000Z',updatedAt:'2026-08-06T05:00:00.000Z',reply:null,replyUpdatedAt:null},
 ]);
 // The same reading again (a retry, a replay) or an older one changes nothing; a newer one mirrors Maps.
 expect(await send(f.db,reading(made.slug,'2026-10-05T21:00:40',[REVIEWS[0]]))).toMatchObject({ignored:'NOT_NEWER'});
 expect(await send(f.db,reading(made.slug,'2026-10-04T21:00:40',[REVIEWS[0]]))).toMatchObject({ignored:'NOT_NEWER'});
 expect(await send(f.db,reading(made.slug,'2026-10-06T21:00:40',[REVIEWS[0],{...REVIEWS[2],owner_reply:'Cảm ơn Chi'}]))).toEqual({received:'run.completed',synced:2});
 expect((await business.status(t,made.slug)).reviews.map(r=>[r.reviewId,r.reply])).toEqual([['tool-review-1','Cảm ơn bạn!'],['tool-review-3','Cảm ơn Chi']]);
 // "Cập nhật ngay" hands the link out again at the next question; an empty reading never empties the shop.
 expect(await business.sync(t,made.slug)).toEqual({requested:true});
 expect(await ask(f.db)).toEqual({jobs:[{shop:made.slug,url:LINK}]});
 expect(await send(f.db,reading(made.slug,'2026-10-07T21:00:40',[]))).toEqual({received:'run.completed',synced:0});
 expect((await business.status(t,made.slug)).reviews.length).toBe(2);
 // A failed reading shows on the connection; the reviews stay.
 expect(await send(f.db,{event:'run.failed',shop:made.slug,place_url:LINK,error_kind:'login'})).toEqual({received:'run.failed'});
 expect(await business.status(t,made.slug)).toMatchObject({connection:{lastError:'MAPS_RUN_FAILED'},reviews:[{reviewId:'tool-review-1'},{reviewId:'tool-review-3'}]});
 expect(await code(send(f.db,{event:'run.completed',shop:made.slug,place_url:LINK,scraped_at:'hôm qua',reviews:[]}))).toBe('INVALID_INPUT');
 // Another link is another place: the old reviews go at once, and a late reading of the old link is kept out.
 const other='https://www.google.com/maps/place/Qu%C3%A1n+Kh%C3%A1c';
 expect(await business.setMapsLink(t,made.slug,other)).toEqual({mapsUrl:other,changed:true});
 expect(await business.status(t,made.slug)).toMatchObject({connection:{mapsUrl:other,lastSyncedAt:null,averageRating:null,lastError:null},reviews:[]});
 expect(await send(f.db,reading(made.slug,'2026-10-08T21:00:40'))).toMatchObject({ignored:'LINK_CHANGED'});
 // A shop with no link is not followed; without the key the address does not exist.
 const stranger=await make(f,'nguoi-khac');
 expect(await send(f.db,reading(stranger.slug,'2026-10-08T21:00:40'))).toMatchObject({ignored:'NOT_FOLLOWED'});
 expect(await code(receiveMaps(f.db,'{}',sign('{}'),LOCAL))).toBe('NOT_FOUND');
 expect(await code(mapsJobs(f.db,'1','x',LOCAL))).toBe('NOT_FOUND');
 await business.disconnect(t,made.slug);
 expect((await business.status(t,made.slug)).connection).toBeNull();
 expect((await f.db.query('SELECT count(*)::int n FROM google_reviews')).rows[0].n).toBe(0);
});

test('Google\'s score and count are the owner\'s alone (google-policy.md rule 10); a manager who reads feedback still reads the reviews',async({f})=>{
 const made=await make(f),business=new GoogleBusiness(f.db,TOOL);
 await business.setMapsLink(made.session.token,made.slug,LINK);
 await send(f.db,reading(made.slug,'2026-10-05T16:06:10'));
 const auth=new OwnerAuth(f.db),shop=(await f.db.query('SELECT id FROM shops WHERE slug=$1',[made.slug])).rows[0].id;
 const manager=async(name:string,feedback:boolean)=>{
  const id=await auth.bootstrap(name,`password-of-${name}`,async()=>{});
  await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role,feedback_override)VALUES($1,$2,'manager',$3)",[id,shop,feedback]);
  return (await auth.login(name,`password-of-${name}`)).token;
 };
 const reader=await manager('quan-ly-doc',true),plain=await manager('quan-ly',false);
 expect((await business.status(made.session.token,made.slug)).connection).toMatchObject({averageRating:4.6,totalReviews:170});
 expect(await business.status(reader,made.slug)).toMatchObject({connection:{mode:'maps',averageRating:null,totalReviews:null},canManage:false});
 expect((await business.status(reader,made.slug)).reviews.length).toBe(3);
 expect(await business.status(plain,made.slug)).toMatchObject({connection:{averageRating:null,totalReviews:null},reviews:[]});
 expect((await shopOverview(f.db,made.session.token,made.slug)).google).toEqual({rating:4.6,total:170,source:'maps',figures:true,syncedAt:'2026-10-05T09:06:10.000Z'});
 expect((await shopOverview(f.db,reader,made.slug)).google).toEqual({rating:null,total:null,source:'maps',figures:false,syncedAt:'2026-10-05T09:06:10.000Z'});
 // Only the owner pastes or changes the link.
 expect(await code(business.setMapsLink(reader,made.slug,'https://maps.app.goo.gl/Other1'))).toBe('OWNER_ROLE_REQUIRED');
});

test('the refresh token is sealed: it opens only with the same key and any change is refused',async()=>{
 const sealed=sealToken('1//refresh-token-value',LOCAL);
 expect(sealed).not.toContain('refresh-token-value');
 expect(openToken(sealed,LOCAL)).toBe('1//refresh-token-value');
 expect(()=>openToken(sealed,{NFC_GOOGLE_TOKEN_KEY:'z'.repeat(40)})).toThrow();
 const [v,iv,body,tag]=sealed.split('.');
 // A change for certain: the first character carries six bits of ciphertext. Writing 'AA' over the last two left the
 // bytes as they were whenever they already decoded to it (about 1 run in 256, red at random until 05/10).
 expect(()=>openToken([v,iv,(body[0]==='A'?'B':'A')+body.slice(1),tag].join('.'),LOCAL)).toThrow();
 expect(()=>sealToken('x',{})).toThrow('GOOGLE_TOKEN_KEY_MISSING');
});

test('"nhờ admin sửa": one open request per page, asking again adds the words, the page lists it, Tài sees it and closes it',async({f})=>{
 const made=await make(f),t=made.session.token;
 const page=await new OwnerPages(f.db).create(t,made.slug,{template:'basic-1',label:'Trang chính'});
 expect(page.revision).toBe(1);
 expect(await requestEdit(f.db,t,made.slug,{page:page.slug,message:'Đổi ảnh bìa <b>giúp</b>'})).toEqual({page:page.slug,waiting:true});
 expect(await requestEdit(f.db,t,made.slug,{page:page.slug,message:'Thêm số điện thoại'})).toEqual({page:page.slug,waiting:true});
 expect(await code(requestEdit(f.db,t,made.slug,{page:'khong-co'}))).toBe('PAGE_NOT_FOUND');
 const listed=(await new OwnerPages(f.db).list(t,made.slug)).pages[0];
 expect(listed).toMatchObject({slug:page.slug,state:'draft',unpublished:true,editRequest:{message:'Đổi ảnh bìa bgiúp/b\n—\nThêm số điện thoại'}});
 const admin=(await f.db.query("INSERT INTO platform_admins(username,password_salt,password_key)VALUES('tai',$1,$2)RETURNING id",['0'.repeat(32),'0'.repeat(64)])).rows[0].id;
 const open=await new EditRequests(f.db).open();
 expect(open).toHaveLength(1);
 expect(open[0]).toMatchObject({shop_slug:made.slug,page_slug:page.slug,owner_handle:'chu-quan'});
 await new EditRequests(f.db).done(admin,open[0].id);
 expect(await new EditRequests(f.db).open()).toHaveLength(0);
 expect((await new OwnerPages(f.db).list(t,made.slug)).pages[0].editRequest).toBeNull();
 expect(await code(new EditRequests(f.db).done(admin,open[0].id))).toBe('REQUEST_ALREADY_HANDLED');
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
