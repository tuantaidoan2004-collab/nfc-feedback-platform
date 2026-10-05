import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {createHmac,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {OwnerAuth} from '../lib/owner/auth';
import {AccountSignup} from '../lib/account/signup';
import {advance,requestHelp} from '../lib/account/onboarding';
import {onboardingOf,homeShop,sessionAccount} from '../lib/account/workspace';
import {placeStatus,savePlaceId} from '../lib/google/places';
import {parsePlaceId,reviewLink} from '../lib/google/place-id';
import {GoogleBusiness,openToken,receiveMaps,sealToken} from '../lib/google/business';
import {HelpRequests} from '../lib/admin/help';
import {readPulse} from '../lib/owner/pulse';
import {shopOverview} from '../lib/owner/overview';

/** Đợt ① (05/10): đăng ký dùng ngay, tiến trình, Place ID dán tay, Google Business (từ tool Google Maps), nhờ tạo giúp, nhịp Orb. */
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

/** A stand-in for the Google Maps tool's API (~/MAps): GET /api/overview and /api/reviews, for its key only. Invented reviews, never real ones. */
function mapsTool(key:string){
 const state={down:false,keys:[] as string[],items:[
  {id:'tool-review-1',author:'An Nhiên',author_photo:'https://lh3.googleusercontent.com/a/x=w80-h80',rating:5,text:'Trà ngon, quán yên tĩnh.',owner_reply:'Cảm ơn bạn!',est_posted_at:'2026-10-05',first_seen_at:'2026-10-05T16:06:10'},
  {id:'tool-review-2',author:'Bình',author_photo:'',rating:2,text:'',owner_reply:'',est_posted_at:'2026-09-05',first_seen_at:'2026-10-05T15:07:28'},
  {id:'tool-review-3',author:'Chi',author_photo:'',rating:4,text:'Ổn.',owner_reply:'',est_posted_at:null,first_seen_at:'2026-08-06T10:00:00'},
  {id:'tool-review-4',author:'Dũng',author_photo:'',rating:9,text:'Số sao không hợp lệ',owner_reply:'',est_posted_at:'2026-10-01',first_seen_at:'2026-10-01T09:00:00'},
 ] as Record<string,unknown>[]};
 const fetcher=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(state.down)throw new TypeError('fetch failed');
  const url=new URL(String(input)),given=new Headers(init?.headers).get('X-API-Key')??'';state.keys.push(given);
  if(given!==key)return Response.json({detail:'Thiếu hoặc sai khoá'},{status:401});
  if(url.pathname==='/api/overview')return Response.json({place_name:'Quán Thử Trên Maps',current:{scraped_at:'2026-10-05T16:06:10',avg_rating:4.6,total_reviews:170}});
  if(url.pathname==='/api/reviews')return Response.json({items:url.searchParams.get('page')==='1'?state.items:[],total:state.items.length});
  return new Response('not found',{status:404});
 }) as typeof fetch;
 return {state,fetcher};
}
const toolEnv=(key:string,slug:string)=>({...LOCAL,NFC_MAPS_URL:'http://127.0.0.1:8000/',NFC_MAPS_KEY:key,NFC_MAPS_SHOP:slug});

test('Google Business from the Google Maps tool: only the shop it follows connects, reviews arrive in Google\'s shape and mirror the tool',async({f})=>{
 const made=await make(f),t=made.session.token,key=`tool-key-${'x'.repeat(24)}`,tool=mapsTool(key),env=toolEnv(key,made.slug.toUpperCase());
 const business=new GoogleBusiness(f.db,env,tool.fetcher);
 expect(await business.status(t,made.slug)).toMatchObject({connection:null,maps:true});
 expect(await business.connectMaps(t,made.slug)).toEqual({connected:true,mode:'maps',synced:3});
 const status=await business.status(t,made.slug);
 // When Google was read is the tool's last look (Vietnam's clock, no offset in the tool), not the moment of the sync.
 expect(status.connection).toMatchObject({mode:'maps',locationTitle:'Quán Thử Trên Maps',averageRating:4.6,totalReviews:170,lastSyncedAt:'2026-10-05T09:06:10.000Z',lastError:null});
 // A day is the tool's estimate, kept at noon in Vietnam; without one, the day the tool first saw the review. The 9-star one is refused.
 expect(status.reviews).toEqual([
  {reviewId:'tool-review-1',reviewerName:'An Nhiên',reviewerPhoto:'https://lh3.googleusercontent.com/a/x=w80-h80',isAnonymous:false,stars:5,comment:'Trà ngon, quán yên tĩnh.',
   createdAt:'2026-10-05T05:00:00.000Z',updatedAt:'2026-10-05T05:00:00.000Z',reply:'Cảm ơn bạn!',replyUpdatedAt:null},
  {reviewId:'tool-review-2',reviewerName:'Bình',reviewerPhoto:null,isAnonymous:false,stars:2,comment:null,createdAt:'2026-09-05T05:00:00.000Z',updatedAt:'2026-09-05T05:00:00.000Z',reply:null,replyUpdatedAt:null},
  {reviewId:'tool-review-3',reviewerName:'Chi',reviewerPhoto:null,isAnonymous:false,stars:4,comment:'Ổn.',createdAt:'2026-08-06T05:00:00.000Z',updatedAt:'2026-08-06T05:00:00.000Z',reply:null,replyUpdatedAt:null},
 ]);
 // The key goes to the tool in its header, and nowhere else.
 expect(tool.state.keys.length).toBeGreaterThan(0);
 expect(tool.state.keys.every(k=>k===key)).toBe(true);
 // The next sync mirrors the tool: a review Google no longer shows goes, a reply written since shows.
 tool.state.items=[tool.state.items[0],{...tool.state.items[2],owner_reply:'Cảm ơn Chi'}];
 expect(await business.sync(t,made.slug)).toEqual({synced:2});
 expect((await business.status(t,made.slug)).reviews.map(r=>[r.reviewId,r.reply])).toEqual([['tool-review-1','Cảm ơn bạn!'],['tool-review-3','Cảm ơn Chi']]);
 // An empty answer never empties the shop.
 tool.state.items=[];
 expect(await business.sync(t,made.slug)).toEqual({synced:0});
 expect((await business.status(t,made.slug)).reviews.length).toBe(2);
 // The tool off, or a wrong key: the reviews stay, the error is kept on the connection.
 tool.state.down=true;
 expect(await code(business.sync(t,made.slug))).toBe('MAPS_UNREACHABLE');
 tool.state.down=false;
 expect(await code(new GoogleBusiness(f.db,{...env,NFC_MAPS_KEY:'wrong-key'},tool.fetcher).sync(t,made.slug))).toBe('MAPS_REFUSED');
 expect(await business.status(t,made.slug)).toMatchObject({connection:{lastError:'MAPS_REFUSED'},reviews:[{reviewId:'tool-review-1'},{reviewId:'tool-review-3'}]});
 // Another shop cannot reach the tool; without the tool set up, nobody can.
 const other=await make(f,'nguoi-khac');
 expect(await business.status(other.session.token,other.slug)).toMatchObject({connection:null,maps:false});
 expect(await code(business.connectMaps(other.session.token,other.slug))).toBe('NOT_FOUND');
 expect(await code(new GoogleBusiness(f.db,LOCAL,tool.fetcher).connectMaps(t,made.slug))).toBe('NOT_FOUND');
 expect(await code(new GoogleBusiness(f.db,LOCAL,tool.fetcher).sync(t,made.slug))).toBe('MAPS_NOT_SET_UP');
 await business.disconnect(t,made.slug);
 expect((await business.status(t,made.slug)).connection).toBeNull();
 expect((await f.db.query('SELECT count(*)::int n FROM google_reviews')).rows[0].n).toBe(0);
});

test('production: the tool sends its whole list signed with its key; older answers, bad signatures and other events change nothing',async({f})=>{
 const made=await make(f),t=made.session.token,key=`tool-key-${'z'.repeat(24)}`,env={...LOCAL,NFC_MAPS_KEY:key,NFC_MAPS_SHOP:made.slug};
 const sign=(body:string,k=key)=>`sha256=${createHmac('sha256',k).update(body).digest('hex')}`;
 const send=(event:object,k=key)=>{const body=JSON.stringify(event);return receiveMaps(f.db,body,sign(body,k),env);};
 const items=mapsTool(key).state.items,business=new GoogleBusiness(f.db,env);
 const run=(at:string,reviews=items)=>({event:'run.completed',run_id:9,scraped_at:at,avg_rating:4.6,total_reviews:170,place_name:'Quán Thử Trên Maps',reviews,new_reviews:[],rating_changed:[],removed:[],alerts:[]});
 // No address in production: nothing to ask and no button, until the tool sends.
 expect(await business.status(t,made.slug)).toMatchObject({connection:null,maps:false});
 expect(await send({event:'test',message:'Webhook hoạt động'})).toEqual({received:'test'});
 expect(await code(send(run('2026-10-05T21:00:40'),'wrong-key'))).toBe('BAD_SIGNATURE');
 expect(await code(receiveMaps(f.db,JSON.stringify(run('2026-10-05T21:00:40')),null,env))).toBe('BAD_SIGNATURE');
 expect(await send(run('2026-10-05T21:00:40'))).toEqual({received:'run.completed',synced:3});
 expect((await business.status(t,made.slug)).connection).toMatchObject({mode:'maps',locationTitle:'Quán Thử Trên Maps',averageRating:4.6,totalReviews:170,lastSyncedAt:'2026-10-05T14:00:40.000Z'});
 expect((await business.status(t,made.slug)).reviews.map(r=>r.reviewId)).toEqual(['tool-review-1','tool-review-2','tool-review-3']);
 // The same answer again (a retry, a replay) or an older one: kept out.
 expect(await send(run('2026-10-05T21:00:40',[items[0]]))).toMatchObject({ignored:'NOT_NEWER'});
 expect(await send(run('2026-10-04T21:00:40',[items[0]]))).toMatchObject({ignored:'NOT_NEWER'});
 expect((await business.status(t,made.slug)).reviews.length).toBe(3);
 // A newer one mirrors the tool.
 expect(await send(run('2026-10-06T21:00:40',[items[0],items[2]]))).toEqual({received:'run.completed',synced:2});
 expect((await business.status(t,made.slug)).reviews.map(r=>r.reviewId)).toEqual(['tool-review-1','tool-review-3']);
 // A failed look at Google shows on the connection; the reviews stay.
 expect(await send({event:'run.failed',run_id:10,error:'Phiên Google hết hạn',error_kind:'login'})).toEqual({received:'run.failed'});
 expect(await business.status(t,made.slug)).toMatchObject({connection:{lastError:'MAPS_RUN_FAILED'},reviews:[{reviewId:'tool-review-1'},{reviewId:'tool-review-3'}]});
 expect(await code(send({event:'run.completed',scraped_at:'hôm qua',reviews:[]}))).toBe('INVALID_INPUT');
 // Without the key the address does not exist; a shop that is not there is said so.
 expect(await code(receiveMaps(f.db,'{}',sign('{}'),LOCAL))).toBe('NOT_FOUND');
 const body='{"event":"run.completed"}';
 expect(await code(receiveMaps(f.db,body,sign(body),{...env,NFC_MAPS_SHOP:'khong-co'}))).toBe('MAPS_SHOP_MISSING');
});

test('Google\'s score and count are the owner\'s alone (google-policy.md rule 10); a manager who reads feedback still reads the reviews',async({f})=>{
 const made=await make(f),key=`tool-key-${'y'.repeat(24)}`,tool=mapsTool(key),business=new GoogleBusiness(f.db,toolEnv(key,made.slug),tool.fetcher);
 await business.connectMaps(made.session.token,made.slug);
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
 // Only the owner connects the tool.
 expect(await code(business.connectMaps(reader,made.slug))).toBe('OWNER_ROLE_REQUIRED');
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
