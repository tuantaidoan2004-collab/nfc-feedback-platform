import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {AdminAuth} from '../lib/admin/auth';
import {OwnerAuth} from '../lib/owner/auth';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {OwnerDesign} from '../lib/owner/design';
import {PublishingAdmin,PublishingResolver} from '../lib/publishing/repository';

import type {SettingField} from '../lib/publishing/settings';
import type {PageConfig} from '../lib/publishing/config';
import { TEMPLATE_RELEASES } from '../lib/publishing/templates';

/**
 * Lát P2 (lib/publishing/settings.ts, docs/goi-va-trang.md mục 2): each template version says what the owner may
 * adjust. The editor draws only that, the owner's door refuses the rest, and a version's own fields travel with the
 * page when it changes version.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const MIGRATIONS=['001_core.sql','002_visit_ratings.sql','003_publishing.sql','013_short_card_codes.sql','004_owner_dashboard.sql','005_platform_admin.sql','006_owner_email_setup.sql','007_admin_impersonation.sql','008_shop_support_grants.sql','009_template_shop.sql','010_feedback_without_rating.sql','011_feedback_phone.sql','018_guest_flood_control.sql','019_admin_two_factor.sql','020_page_events.sql','021_erase_on_request.sql','012_support_levels.sql','014_account_profiles.sql','015_shop_team.sql','016_feedback_comments.sql','017_mention_notifications.sql','022_shop_profile.sql','023_media_review.sql','024_pages.sql','025_page_labels.sql','026_page_lifecycle.sql','027_page_debt.sql','028_retire_legacy.sql'];
type F={db:Pool;shops:ShopProvisioning;actorId:string};
const test=base.extend<{f:F}>({f:async({},provide)=>{
 const schema=`nfc_settings_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:5});
 try{await root.query(`CREATE SCHEMA ${schema}`);
  for(const file of MIGRATIONS)await db.query(await readFile(`db/migrations/${file}`,'utf8'));
  const actorId=await new AdminAuth(db).bootstrap('operator','a-sufficiently-long-admin-secret',async()=>{});
  await provide({db,shops:new ShopProvisioning(db),actorId});
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
async function shopOn(f:F,key:string,n=1){
 const made=await f.shops.create(f.actorId,{name:`Quán ${n}`,ownerUsername:`quan-${n}`,ownerEmail:`q${n}@example.com`,googleUrl:'https://maps.google.com/?cid=7',templateKey:key});
 await new OwnerSetupLinks(f.db).consume(made.setupToken,`password-of-quan-${n}`);
 return {...made,token:(await new OwnerAuth(f.db).login(`quan-${n}`,`password-of-quan-${n}`)).token};
}
// A second version of khuôn 6 with one field of every kind, which the code does not ship yet.
const OWN:SettingField[]=[{kind:'color',key:'glow',label:'Màu quầng',default:'#FFCC00'},{kind:'range',key:'blur',label:'Độ nhoè',min:0,max:40,step:4,default:12},
 {kind:'choice',key:'mood',label:'Không khí',options:[{value:'calm',label:'Êm'},{value:'bright',label:'Sáng'}],default:'calm'},{kind:'toggle',key:'sparkle',label:'Lấp lánh',default:false}];
const WITH_V2={...TEMPLATE_RELEASES,'big-button':[...TEMPLATE_RELEASES['big-button'],{version:2,date:'2026-10-01',notes:'Bản thử',settings:OWN}]};
const save=(d:OwnerDesign,shop:{token:string;slug:string},revision:number,config:PageConfig)=>d.save(shop.token,shop.slug,{expectedRevision:revision,config});

test('each template shows and accepts only what its version offers; content is always open',async({f})=>{
 const design=new OwnerDesign(f.db);
 const six=await shopOn(f,'big-button',1),glass=await shopOn(f,'glass',2),one=await shopOn(f,'standard',3);
 const tables=await Promise.all([six,glass,one].map(async s=>(await design.read(s.token,s.slug)).template.settings));
 expect(tables).toEqual([[],[{kind:'background',allow:['solid','gradient']},{kind:'feedbackButton'}],
  [{kind:'background',allow:['solid','gradient','media']},{kind:'watermark'},{kind:'feedbackButton'}]]);

 // Khuôn 6: nothing about the look moves; the name, the link and the buttons do.
 let state=await design.read(six.token,six.slug),c=state.draft.config;
 for(const change of [{layout:'card' as const},{background:{kind:'solid' as const,color:'#000000'}},{watermark:{...c.watermark,enabled:true}},
  {feedbackButton:{...c.feedbackButton!,color:'#FF0000'}}])
  await expect(save(design,six,state.draft.revision,{...c,...change})).rejects.toMatchObject({status:400,code:'SETTING_LOCKED'});
 await expect(save(design,six,state.draft.revision,{...c,settings:{glow:'#FFFFFF'}})).rejects.toMatchObject({status:400,code:'INVALID_SETTING'});
 await save(design,six,state.draft.revision,{...c,name:'Quán Sáu Mới',googleUrl:'https://maps.google.com/?cid=8'});

 // Khuôn 3 paints its glass scene from two colours: a gradient is open, a photo is not; the plane is open, watermark not.
 state=await design.read(glass.token,glass.slug);c=state.draft.config;
 const r=(await save(design,glass,state.draft.revision,{...c,background:{kind:'gradient',colors:['#102030','#A0B0C0'],angle:90},feedbackButton:{...c.feedbackButton!,color:'#123456'}})).revision;
 await expect(save(design,glass,r,{...c,background:{kind:'media',media:{kind:'image',url:'https://media.example/a.jpg'},loop:true}})).rejects.toMatchObject({code:'SETTING_LOCKED'});
 await expect(save(design,glass,r,{...c,watermark:{...c.watermark,enabled:true}})).rejects.toMatchObject({code:'SETTING_LOCKED'});

 // Khuôn 1 takes every kind of background and the watermark, but not the layout.
 state=await design.read(one.token,one.slug);c=state.draft.config;
 await save(design,one,state.draft.revision,{...c,background:{kind:'solid',color:'#224433'},watermark:{...c.watermark,enabled:!c.watermark.enabled}});
 await expect(save(design,one,state.draft.revision+1,{...c,layout:'card'})).rejects.toMatchObject({code:'SETTING_LOCKED'});
});

test('a value the template no longer offers stays put, so the page can still save its content',async({f})=>{
 // Set before the table existed (straight through the publishing layer, which is not the owner's door).
 const glass=await shopOn(f,'glass'),page={shopId:glass.shopId,pageId:glass.pageId},design=new OwnerDesign(f.db);
 const admin=new PublishingAdmin(f.db,async()=>({actorId:f.actorId}));
 const before=(await design.read(glass.token,glass.slug)).draft;
 const revision=await admin.saveDraft(page,before.revision,{...before.config,layout:'card',watermark:{...before.config.watermark,enabled:true}});
 const kept=(await design.read(glass.token,glass.slug)).draft;
 await save(design,glass,revision,{...kept.config,name:'Quán Kính Mới'});
 expect((await design.read(glass.token,glass.slug)).draft.config).toMatchObject({name:'Quán Kính Mới',layout:'card'});
});

test("a version's own fields: defaults on arrival, checked on every write, on the page when published, gone on the way back",async({f})=>{
 const six=await shopOn(f,'big-button'),design=new OwnerDesign(f.db,WITH_V2),resolver=new PublishingResolver(f.db);
 let state=await design.read(six.token,six.slug);
 await design.version(six.token,six.slug,{action:'version',expectedRevision:state.draft.revision,version:2});
 state=await design.read(six.token,six.slug);
 expect(state.template.settings).toEqual(OWN);
 expect(state.draft.config.settings).toEqual({glow:'#FFCC00',blur:12,mood:'calm',sparkle:false});
 const c=state.draft.config;
 for(const settings of [{...c.settings,glow:'red'},{...c.settings,blur:41},{...c.settings,blur:6},{...c.settings,mood:'loud'},{...c.settings,sparkle:'yes'},{...c.settings,other:1}])
  await expect(save(design,six,state.draft.revision,{...c,settings} as PageConfig)).rejects.toMatchObject({code:expect.stringMatching(/^INVALID_(SETTING|CONFIG)$/)});
 const saved=(await save(design,six,state.draft.revision,{...c,settings:{glow:'#00AAFF',blur:20,mood:'bright',sparkle:true}})).revision;
 await design.publish(six.token,six.slug,{action:'publish',expectedRevision:saved});
 const live=await resolver.live({slug:six.slug});
 expect([live.templateVersion,live.config.settings]).toEqual([2,{glow:'#00AAFF',blur:20,mood:'bright',sparkle:true}]);
 // Back to version 1, which has no fields: they leave the draft.
 state=await design.read(six.token,six.slug);
 await design.version(six.token,six.slug,{action:'version',expectedRevision:state.draft.revision,version:1});
 expect((await design.read(six.token,six.slug)).draft.config).not.toHaveProperty('settings');
 // A draft carrying a field its version does not have cannot be published, whoever wrote it.
 await f.db.query(`UPDATE page_drafts SET config=config||'{"settings":{"glow":"#000000"}}'::jsonb WHERE page_id=$1`,[six.pageId]);
 const stale=(await f.db.query('SELECT revision::int FROM page_drafts WHERE page_id=$1',[six.pageId])).rows[0].revision;
 await expect(design.publish(six.token,six.slug,{action:'publish',expectedRevision:stale})).rejects.toMatchObject({code:'INVALID_SETTING'});
});
