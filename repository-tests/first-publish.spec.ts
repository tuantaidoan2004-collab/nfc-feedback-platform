import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {AccountSignup} from '../lib/account/signup';
import {OwnerPages} from '../lib/owner/pages';
import {OwnerDesign,firstPublishOf} from '../lib/owner/design';
import {PublishReviews} from '../lib/admin/publish-reviews';
import {PublishingAdmin} from '../lib/publishing/repository';

/**
 * Kịch bản mục 4: an account that signed itself up uses everything at once, but its shop's first publish waits for Tài in
 * /gov; once he has approved one page the shop publishes on its own. Shops /gov makes never wait.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const test=base.extend<{f:{db:Pool}}>({f:async({},provide)=>{
 const schema=`nfc_first_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:4});
 try{await root.query(`CREATE SCHEMA ${schema}`);await applySchema(db);await provide({db});}
 finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const code=async(run:Promise<unknown>)=>run.then(()=>'ok',(error:{code?:string})=>error.code);
/** A signed-up owner with two pages made in the Library, the way the app makes them. */
async function signedUp(db:Pool,name='chu-quan'){
 const made=await new AccountSignup(db).create({username:name,email:`${name}@example.test`,password:'a-long-test-password'},null);
 const pages=new OwnerPages(db),token=made.session.token;
 const first=await pages.create(token,made.slug,{template:'basic-1',label:'Trang chính'}),second=await pages.create(token,made.slug,{template:'party',label:'Tiệc'});
 const shopId=(await db.query('SELECT id FROM shops WHERE slug=$1',[made.slug])).rows[0].id as string;
 return {...made,token,shopId,first:first.slug,second:second.slug};
}
const live=async(db:Pool,page:string)=>(await db.query('SELECT state,active_release_id FROM pages WHERE slug=$1',[page])).rows[0];
async function admin(db:Pool){
 return (await db.query("INSERT INTO platform_admins(username,password_salt,password_key)VALUES('tai',$1,$2)RETURNING id",['0'.repeat(32),'0'.repeat(64)])).rows[0].id as string;
}

test('a signed-up shop\'s Publish asks Tài instead: nothing goes live, one request stands, and it names the page asked last',async({f})=>{
 const s=await signedUp(f.db),design=new OwnerDesign(f.db);
 expect(await firstPublishOf(f.db,s.shopId)).toEqual({state:'needed',reason:null,page:null});
 const answer=await design.publish(s.token,s.slug,{action:'publish',expectedRevision:1},s.first);
 expect(answer).toEqual({review:'pending',revision:1});
 expect(await live(f.db,s.first)).toEqual({state:'draft',active_release_id:null});
 expect((await f.db.query('SELECT count(*)::int n FROM page_releases')).rows[0].n).toBe(0);
 expect(await firstPublishOf(f.db,s.shopId)).toEqual({state:'pending',reason:null,page:s.first});
 // The editor reads the same state.
 expect((await design.read(s.token,s.slug,s.second)).firstPublish).toEqual({state:'pending',reason:null,page:s.first});
 // Asking again from the other page moves the one request; it does not add another.
 await design.publish(s.token,s.slug,{action:'publish',expectedRevision:1},s.second);
 expect((await f.db.query('SELECT p.slug,r.state FROM publish_reviews r JOIN pages p ON p.id=r.page_id')).rows).toEqual([{slug:s.second,state:'pending'}]);
 expect((await f.db.query("SELECT action FROM shop_activity WHERE action='design.review'")).rows).toHaveLength(2);
 // The core refuses too, whoever calls it: the rule is not the editor's alone.
 const core=new PublishingAdmin(f.db,async()=>({actorId:'local-fixture'}));
 const page=(await f.db.query('SELECT shop_id "shopId",id "pageId" FROM pages WHERE slug=$1',[s.first])).rows[0];
 expect(await code(core.publish(page,1))).toBe('PUBLISH_REVIEW_REQUIRED');
 // A page that would not publish anyway is refused for that, and asks Tài nothing.
 const config=(await design.read(s.token,s.slug,s.first)).draft.config;
 const saved=await design.save(s.token,s.slug,{expectedRevision:1,config:{...config,name:'Tặng quà khi đánh giá 5 sao'}},s.first).then(()=>'saved',(e:{code?:string})=>e.code);
 expect(saved).toBe('POLICY_GOOGLE_EXCHANGE');
});

test('Tài approves the draft he was shown: it goes live, the shop is seen, and from then on publishes on its own',async({f})=>{
 const s=await signedUp(f.db),design=new OwnerDesign(f.db),reviews=new PublishReviews(f.db),tai=await admin(f.db);
 await design.publish(s.token,s.slug,{action:'publish',expectedRevision:1},s.first);
 const [row]=await reviews.pending();
 expect(row).toMatchObject({shop_slug:s.slug,page_slug:s.first,page_label:'Trang chính',revision:1,owner_handle:'chu-quan',owner_email:'chu-quan@example.test'});
 expect(await reviews.draft(row.page_id)).toMatchObject({slug:s.first});
 // The owner edits after the list was drawn: approving what Tài saw stops, and nothing changes.
 const config=(await design.read(s.token,s.slug,s.first)).draft.config;
 await design.save(s.token,s.slug,{expectedRevision:1,config:{...config,name:'Tên mới'}},s.first);
 expect(await code(reviews.decide(tai,row.id,{decision:'approve',revision:1}))).toBe('DRAFT_CHANGED');
 expect((await f.db.query('SELECT publish_approved_at FROM shops WHERE id=$1',[s.shopId])).rows[0].publish_approved_at).toBeNull();
 expect((await f.db.query('SELECT state FROM publish_reviews')).rows[0].state).toBe('pending');
 // The list shows the newer draft; approving that one publishes it.
 expect((await reviews.pending())[0].revision).toBe(2);
 const approved=await reviews.decide(tai,row.id,{decision:'approve',revision:2});
 expect(approved).toMatchObject({id:row.id,state:'approved'});
 expect(await live(f.db,s.first)).toEqual({state:'active',active_release_id:approved.releaseId});
 expect((await f.db.query("SELECT config_snapshot->>'name' AS name,created_by FROM page_releases")).rows).toEqual([{name:'Tên mới',created_by:`admin:${tai}`}]);
 expect((await f.db.query('SELECT action FROM admin_audit ORDER BY id')).rows.map(r=>r.action)).toEqual(['shop.first_publish.approve']);
 expect(await firstPublishOf(f.db,s.shopId)).toBeNull();
 expect(await reviews.pending()).toEqual([]);
 expect(await reviews.draft(row.page_id)).toBeNull();
 expect(await code(reviews.decide(tai,row.id,{decision:'approve',revision:3}))).toBe('REVIEW_ALREADY_DECIDED');
 // The other page publishes straight away now.
 expect(await design.publish(s.token,s.slug,{action:'publish',expectedRevision:1},s.second)).toMatchObject({revision:2});
 expect((await live(f.db,s.second)).state).toBe('active');
});

test('Tài sends a page back with a reason the owner reads; asking again opens a new request',async({f})=>{
 const s=await signedUp(f.db),design=new OwnerDesign(f.db),reviews=new PublishReviews(f.db),tai=await admin(f.db);
 await design.publish(s.token,s.slug,{action:'publish',expectedRevision:1},s.first);
 const [row]=await reviews.pending();
 expect(await code(reviews.decide(tai,row.id,{decision:'reject',reason:'  '}))).toBe('REASON_REQUIRED');
 expect(await code(reviews.decide(tai,row.id,{decision:'reject',reason:'<b>x</b>'}))).toBe('REASON_REQUIRED');
 expect(await code(reviews.decide(tai,row.id,{decision:'approve'}))).toBe('INVALID_INPUT');
 expect(await code(reviews.decide(tai,'not-an-id',{decision:'reject',reason:'x'}))).toBe('INVALID_INPUT');
 await reviews.decide(tai,row.id,{decision:'reject',reason:'Trang dùng logo của một thương hiệu khác.'});
 expect(await firstPublishOf(f.db,s.shopId)).toEqual({state:'rejected',reason:'Trang dùng logo của một thương hiệu khác.',page:s.first});
 expect(await live(f.db,s.first)).toEqual({state:'draft',active_release_id:null});
 expect(await reviews.pending()).toEqual([]);
 await design.publish(s.token,s.slug,{action:'publish',expectedRevision:1},s.first);
 expect(await firstPublishOf(f.db,s.shopId)).toEqual({state:'pending',reason:null,page:s.first});
 expect((await f.db.query('SELECT state FROM publish_reviews ORDER BY requested_at')).rows.map(r=>r.state)).toEqual(['rejected','pending']);
 // Another shop's owner never sees or moves this one.
 const other=await signedUp(f.db,'nguoi-khac');
 expect(await code(new OwnerDesign(f.db).publish(other.token,s.slug,{action:'publish',expectedRevision:1},s.first))).toBe('ACCESS_DENIED');
});

test('a shop /gov made never waits: its pages publish at once',async({f})=>{
 const shop=(await f.db.query("INSERT INTO shops(slug,name)VALUES('gov-made','Quán của Tài')RETURNING id")).rows[0].id;
 const core=new PublishingAdmin(f.db,async()=>({actorId:'local-fixture'}));
 const {pageFromTemplate}=await import('../lib/canvas/templates');
 const page=await core.createPage(shop,await core.createTemplate('basic-1',1),pageFromTemplate('basic-1','Quán của Tài'),'gov-made');
 expect(await core.publish(page,1)).toMatchObject({draftRevision:2});
 expect(await firstPublishOf(f.db,shop)).toBeNull();
 expect((await f.db.query('SELECT count(*)::int n FROM publish_reviews')).rows[0].n).toBe(0);
});
