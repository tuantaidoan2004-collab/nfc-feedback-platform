import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ownerFixture,addExperience} from './owner-fixture';
import {OwnerDashboard} from '../lib/owner/dashboard';
import {OwnerCards} from '../lib/owner/cards';
import {OwnerDesign} from '../lib/owner/design';
import {OwnerPages,OwnerPageLifecycle} from '../lib/owner/pages';
import {OwnerComments} from '../lib/owner/comments';
import {OwnerTeam} from '../lib/owner/team';
import {OwnerActivity,parseActivityQuery} from '../lib/owner/activity';
import {OwnerMedia} from '../lib/owner/media';
import {OwnerNotifications} from '../lib/owner/notifications';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {exportStream} from '../lib/owner/export';
import {parseFilters} from '../lib/owner/filters';

/**
 * C3 mặt trận 1 (docs/agents-board.md, 26/09): one shop reaching another's data. Every door of the owner's dashboard is
 * tried from shop one against shop two, two ways -- naming shop two's link outright, and standing in shop one while
 * handing in ids that belong to shop two (a card, a reply, a guest's session, a role, a member, a page, a notification,
 * a release or card to filter by). None may read, change or even confirm the existence of anything of shop two.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const MIGRATIONS=['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql','022_shop_profile.sql','023_media_review.sql','030_text_review.sql','024_pages.sql','025_page_labels.sql','026_page_lifecycle.sql','027_page_debt.sql','028_retire_legacy.sql'];
type F=Awaited<ReturnType<typeof ownerFixture>>;
const test=base.extend<{f:F}>({f:async({},provide)=>{
 const schema=`nfc_tenant_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:6});
 try{await root.query(`CREATE SCHEMA ${schema}`);for(const file of MIGRATIONS)await db.query(await readFile(`db/migrations/${file}`,'utf8'));await provide(await ownerFixture(db));}
 finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const SECRET='Bí mật của quán hai';

/** Shop two, lived in: a guest's words, a card, a reply mentioning shop one's owner, a role, members, a second page, a notification. */
async function shopTwo(f:F){
 const owner=f.users[1].token,team=new OwnerTeam(f.db),comments=new OwnerComments(f.db);
 const guest=await addExperience(f.db,'two',2,SECRET,undefined,'0901234567');
 const card=await new OwnerCards(f.db).create(owner,'two',{label:'Bàn B'});
 const roles=(await team.list(owner,'two')).roles,manager=roles.find(r=>r.name==='Quản lý')!,staff=roles.find(r=>r.name==='Nhân viên')!;
 const invited=await team.invite(owner,'two',{handle:'quan-ly-b',roleId:manager.id});
 await new OwnerSetupLinks(f.db).consume(invited.token,'password-of-quan-ly-b');
 const managerToken=(await f.auth.login('quan-ly-b','password-of-quan-ly-b')).token;
 // A reply that names shop one's owner (not a member here) and shop two's owner, who gets a notification.
 const reply=await comments.create(managerToken,'two',{sessionId:guest.session.sessionId,body:`Gọi lại khách @${f.users[0].username} @${f.users[1].username}`});
 const page=await new OwnerPages(f.db).create(owner,'two',{template:'minimal',label:'Trang B2'});
 const notification=(await f.db.query('SELECT id FROM owner_notifications WHERE user_id=$1',[f.users[1].id])).rows[0].id as string;
 const release=(await f.db.query('SELECT id FROM page_releases WHERE shop_id=$1 LIMIT 1',[f.shops[1]])).rows[0].id as string;
 return {session:guest.session.sessionId,card,reply:reply.id,manager:invited.userId,staff:staff.id,managerRole:manager.id,page:page.slug,notification,release,mentioned:reply.notified};
}
/** Everything of shop two a leak would touch, read straight from the database, to compare before and after. */
const snapshot=(f:F)=>Promise.all([
 f.db.query("SELECT session_id,feedback_message,feedback_phone FROM rating_experiences WHERE shop_id=$1",[f.shops[1]]),
 f.db.query('SELECT id,body,pinned_at,deleted_at FROM feedback_comments WHERE shop_id=$1',[f.shops[1]]),
 f.db.query('SELECT count(*)::int n FROM feedback_comment_likes l JOIN feedback_comments c ON c.id=l.comment_id WHERE c.shop_id=$1',[f.shops[1]]),
 f.db.query('SELECT id,public_code,location_label,state FROM tags WHERE shop_id=$1 ORDER BY id',[f.shops[1]]),
 f.db.query('SELECT id,name,permissions FROM shop_roles WHERE shop_id=$1 ORDER BY id',[f.shops[1]]),
 f.db.query('SELECT user_id,role,role_id,active FROM owner_memberships_v2 WHERE shop_id=$1 ORDER BY user_id',[f.shops[1]]),
 f.db.query('SELECT slug,label,state FROM pages WHERE shop_id=$1 ORDER BY slug',[f.shops[1]]),
 f.db.query('SELECT page_id,revision FROM page_drafts WHERE shop_id=$1 ORDER BY page_id',[f.shops[1]]),
 f.db.query('SELECT count(*)::int n FROM owner_feedback_cases WHERE shop_id=$1',[f.shops[1]]),
 f.db.query('SELECT id,read_at FROM owner_notifications WHERE user_id=$1',[f.users[1].id]),
 f.db.query('SELECT count(*)::int n FROM shop_support_grant_events WHERE shop_id=$1',[f.shops[1]]),
]).then(results=>results.map(r=>r.rows));
const leaks=(value:unknown)=>JSON.stringify(value).includes(SECRET)||JSON.stringify(value).includes('0901234567');

test("naming shop two's link: every door of the dashboard refuses shop one's owner, and nothing of shop two moves",async({f})=>{
 const b=await shopTwo(f),before=await snapshot(f),a=f.users[0].token;
 const dashboard=new OwnerDashboard(f.db),cards=new OwnerCards(f.db),design=new OwnerDesign(f.db),pages=new OwnerPages(f.db),life=new OwnerPageLifecycle(f.db),
  comments=new OwnerComments(f.db),team=new OwnerTeam(f.db),activity=new OwnerActivity(f.db),media=new OwnerMedia(f.db);
 const doors:[string,()=>Promise<unknown>][]=[
  ['dashboard.read',()=>dashboard.read(a,'two',parseFilters(new URLSearchParams()))],['dashboard.summary',()=>dashboard.summary(a,'two')],
  ['dashboard.update',()=>dashboard.update(a,'two',{sessionId:b.session,expectedCaseRevision:0,expectedExperienceRevision:'2',status:'resolved',note:'x'})],
  ['dashboard.setSupport',()=>dashboard.setSupport(a,'two',{level:'full'})],
  ['cards.list',()=>cards.list(a,'two')],['cards.create',()=>cards.create(a,'two',{label:'x'})],['cards.update',()=>cards.update(a,'two',{id:b.card.id,label:'x'})],
  ['design.read',()=>design.read(a,'two')],['design.save',()=>design.save(a,'two',{expectedRevision:2,config:{}})],
  ['design.publish',()=>design.publish(a,'two',{action:'publish',expectedRevision:2})],['design.preview',()=>design.preview(a,'two',{action:'preview',expectedRevision:2})],
  ['design.version',()=>design.version(a,'two',{action:'version',expectedRevision:2,version:1})],['design.template',()=>design.template(a,'two',{action:'template',expectedRevision:2,template:'glass'})],
  ['pages.list',()=>pages.list(a,'two')],['pages.create',()=>pages.create(a,'two',{copy:'two',label:''})],['pages.rename',()=>pages.rename(a,'two',{page:'two',label:'x'})],
  ['pages.pause',()=>life.pause(a,'two',{action:'pause',page:'two',reason:'x'})],['pages.resume',()=>life.resume(a,'two',{action:'resume',page:'two'})],
  ['comments.list',()=>comments.list(a,'two',b.session)],['comments.create',()=>comments.create(a,'two',{sessionId:b.session,body:'x'})],
  ['comments.change',()=>comments.change(a,'two',{id:b.reply,op:'pin',value:true})],['comments.remove',()=>comments.remove(a,'two',{id:b.reply})],
  ['team.list',()=>team.list(a,'two')],['team.invite',()=>team.invite(a,'two',{handle:'ke-la',roleId:b.staff})],
  ['team.change',()=>team.change(a,'two',{op:'remove',userId:b.manager})],['team.roles',()=>team.roles(a,'two','DELETE',{id:b.staff})],
  ['activity.list',()=>activity.list(a,'two',parseActivityQuery(new URLSearchParams()))],
  ['media.presign',()=>media.presign(a,'two',{type:'image/jpeg',size:1000})],['export',()=>f.auth.access(a,'two','export')],
 ];
 for(const [name,door] of doors)await expect(door(),name).rejects.toMatchObject({status:403,code:'ACCESS_DENIED'});
 expect(await snapshot(f)).toEqual(before);
});

test("standing in shop one with shop two's ids: nothing is found, nothing is read, nothing moves",async({f})=>{
 const b=await shopTwo(f),before=await snapshot(f),a=f.users[0].token;
 const cards=new OwnerCards(f.db),comments=new OwnerComments(f.db),team=new OwnerTeam(f.db),design=new OwnerDesign(f.db),pages=new OwnerPages(f.db),life=new OwnerPageLifecycle(f.db);
 const refused:[string,()=>Promise<unknown>,number,string][]=[
  ['a card',()=>cards.update(a,'one',{id:b.card.id,label:'x'}),404,'CARD_NOT_FOUND'],
  ['switching a card on',()=>cards.update(a,'one',{id:b.card.id,state:'active'}),404,'CARD_NOT_FOUND'],
  ["a guest's thread",()=>comments.list(a,'one',b.session),404,'NOT_FOUND'],
  ["replying in a guest's thread",()=>comments.create(a,'one',{sessionId:b.session,body:'x'}),404,'NOT_FOUND'],
  ['liking a reply',()=>comments.change(a,'one',{id:b.reply,op:'like',value:true}),404,'COMMENT_NOT_FOUND'],
  ['pinning a reply',()=>comments.change(a,'one',{id:b.reply,op:'pin',value:true}),404,'COMMENT_NOT_FOUND'],
  ['deleting a reply',()=>comments.remove(a,'one',{id:b.reply}),404,'COMMENT_NOT_FOUND'],
  ["a guest's case",()=>new OwnerDashboard(f.db).update(a,'one',{sessionId:b.session,expectedCaseRevision:0,expectedExperienceRevision:'2',status:'resolved',note:'x'}),404,'NOT_FOUND'],
  ['removing a member',()=>team.change(a,'one',{op:'remove',userId:b.manager}),404,'MEMBER_NOT_FOUND'],
  ['re-issuing a member link',()=>team.change(a,'one',{op:'link',userId:b.manager}),404,'MEMBER_NOT_FOUND'],
  ['editing a role',()=>team.roles(a,'one','PATCH',{id:b.managerRole,name:'Chiếm',icon:null,color:'#000000',permissions:['feedback']}),404,'ROLE_NOT_FOUND'],
  ['deleting a role',()=>team.roles(a,'one','DELETE',{id:b.staff}),404,'ROLE_NOT_FOUND'],
  ['reading a page',()=>design.read(a,'one',b.page),404,'PAGE_NOT_FOUND'],
  ['saving a page',()=>design.save(a,'one',{expectedRevision:1,config:{}},b.page),404,'PAGE_NOT_FOUND'],
  ['publishing a page',()=>design.publish(a,'one',{action:'publish',expectedRevision:1},b.page),404,'PAGE_NOT_FOUND'],
  ['a card on a page',()=>cards.create(a,'one',{label:'x'},b.page),404,'PAGE_NOT_FOUND'],
  ['copying a page',()=>pages.create(a,'one',{copy:b.page,label:''}),404,'PAGE_NOT_FOUND'],
  ['renaming a page',()=>pages.rename(a,'one',{page:b.page,label:'x'}),404,'PAGE_NOT_FOUND'],
  ['stopping a page',()=>life.pause(a,'one',{action:'pause',page:'two',reason:'x'}),404,'PAGE_NOT_FOUND'],
 ];
 for(const [what,door,status,code] of refused)await expect(door(),what).rejects.toMatchObject({status,code});
 const dashboard=new OwnerDashboard(f.db);
 // Filtering by shop two's release or card, or paging from shop two's guest, finds nothing (a cursor is a time and an id).
 const cursor=Buffer.from(JSON.stringify({time:'2100-01-01T00:00:00.000000Z',id:b.session})).toString('base64url');
 for(const query of [`release=${b.release}`,`source=${b.card.id}`,`cursor=${cursor}`]){
  const rows=await dashboard.read(a,'one',parseFilters(new URLSearchParams(query)));
  expect(leaks(rows),query).toBe(false);expect(JSON.stringify(rows.records),query).not.toContain(b.session);
  if(!query.startsWith('cursor'))expect(rows.records,query).toEqual([]);
 }
 const everything=await Promise.all([dashboard.read(a,'one',parseFilters(new URLSearchParams())),dashboard.summary(a,'one'),new OwnerCards(f.db).list(a,'one'),
  pages.list(a,'one'),team.list(a,'one'),new OwnerActivity(f.db).list(a,'one',parseActivityQuery(new URLSearchParams(`actor=${f.users[1].id}`)))]);
 expect(leaks(everything)).toBe(false);
 expect(JSON.stringify(everything)).not.toContain(b.page);expect(JSON.stringify(everything)).not.toContain(b.card.code);
 // Shop one's export carries none of shop two either.
 for(const dataset of ['experiences','page_visits','receipts','comments'] as const){
  const stream=await exportStream(f.db,a,'one',parseFilters(new URLSearchParams()),dataset,'jsonl',new AbortController().signal);
  const text=await new Response(stream).text();
  expect(leaks(text),dataset).toBe(false);expect(text,dataset).not.toContain(b.session);
 }
 // Another person's notifications cannot be marked read, and a mention of someone outside the shop notifies nobody.
 expect(await new OwnerNotifications(f.db).read(a,{ids:[b.notification]})).toEqual({marked:0});
 expect((await new OwnerNotifications(f.db).list(a)).items).toEqual([]);
 expect(b.mentioned).toBe(1);
 expect(await snapshot(f)).toEqual(before);
});
