import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type Anthropic from '@anthropic-ai/sdk';
import {AccountSignup} from '../lib/account/signup';
import {AdminAuth} from '../lib/admin/auth';
import {EditDesk,deskDoc} from '../lib/admin/desk';
import {askClaude} from '../lib/admin/desk-claude';
import {requestEdit} from '../lib/owner/edit-requests';
import {PublishingResolver} from '../lib/publishing/repository';
import {canvasTemplate} from '../lib/canvas/templates';
import {walk} from '../lib/canvas/validate';
import type {GoogleEl,ImageEl,PageDoc} from '../lib/canvas/doc';

/**
 * Bàn dựng (Tài 06/10, kịch bản 9b): one open request on one screen of /gov. What Tài pastes and drops is kept with the request; the
 * knobs and Claude change only the draft; the shop's details wait until "Phát hành", which saves them and publishes in one step;
 * the link sent to the shop shows the draft while the request is open.
 */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const store={endpoint:'https://store.example',region:'auto',accessKeyId:'k',secretAccessKey:'s'.repeat(32),bucket:'nfc-media',publicOrigin:'https://media.example'};
type F={db:Pool;adminId:string;sent:string[];desks:EditDesk};
const test=base.extend<{f:F}>({f:async({},provide)=>{
 const schema=`nfc_desk_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:4});
 try{await root.query(`CREATE SCHEMA ${schema}`);await applySchema(db);
  const adminId=await new AdminAuth(db).bootstrap('tai','a-sufficiently-long-admin-secret',async()=>{});
  const sent:string[]=[];
  const fetcher=(async(url:string,init?:RequestInit)=>{sent.push(`${init?.method??'GET'} ${new URL(url).pathname}`);return new Response(null,{status:200});}) as typeof fetch;
  await provide({db,adminId,sent,desks:new EditDesk(db,store,fetcher)});}
 finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const code=async(run:Promise<unknown>)=>run.then(()=>'ok',(error:{code?:string})=>error.code);
const JPEG=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(200,1)]);
async function opened(f:F){
 const made=await new AccountSignup(f.db).create({username:'bon-rau',email:'bonrau@example.test',password:'a-long-test-password'},null);
 const asked=await requestEdit(f.db,made.session.token,made.slug,{template:'tam-thiep',contact:'0901234567',message:'Làm giống biển hiệu 4RAU'});
 const id=(await f.db.query('SELECT id FROM edit_requests WHERE handled_at IS NULL')).rows[0].id as string;
 return {id,slug:asked.page,shopId:(await f.db.query('SELECT id FROM shops WHERE slug=$1',[made.slug])).rows[0].id as string};
}
const els=(doc:PageDoc)=>new Map([...walk(doc)].map(el=>[el.id,el]));

test('what Tài pastes and drops stays with the request; knobs change only the draft, with this request\'s pictures',async({f})=>{
 const {id,shopId}=await opened(f);
 await f.desks.act(f.adminId,id,{op:'note',who:'khach',body:'Nền đen, viền <b>vàng</b>\r\nchữ kem'});
 let desk=(await f.desks.act(f.adminId,id,{op:'note',who:'tai',body:'khách thích nút to'})).desk!;
 expect(desk.notes.map(n=>[n.who,n.body])).toEqual([['khach','Nền đen, viền bvàng/b\nchữ kem'],['tai','khách thích nút to']]);
 expect(desk.request.contactedAt).not.toBeNull();
 expect(await code(f.desks.act(f.adminId,id,{op:'note',who:'claude',body:'x'}))).toBe('INVALID_INPUT');
 // A file is what its first bytes say; it lands in the shop's folder, the shop's and approved.
 expect(await code(f.desks.addFile(f.adminId,id,{type:'image/jpeg',name:'a.jpg',role:'anh',bytes:Buffer.from('<svg/>')}))).toBe('UNSUPPORTED_MEDIA');
 expect(await code(f.desks.addFile(f.adminId,id,{type:'image/gif',name:'a.gif',role:'anh',bytes:JPEG}))).toBe('UNSUPPORTED_MEDIA');
 desk=(await f.desks.addFile(f.adminId,id,{type:'image/jpeg',name:'<anh tiem>.jpg',role:'anh',bytes:JPEG})).desk!;
 expect(f.sent).toEqual([expect.stringMatching(new RegExp(`^PUT /nfc-media/shops/${shopId}/[0-9a-f-]{36}\\.jpg$`))]);
 expect(desk.files).toEqual([expect.objectContaining({role:'anh',name:'anh tiem.jpg',kind:'image',url:expect.stringContaining(`https://media.example/shops/${shopId}/`)})]);
 expect((await f.db.query("SELECT state,uploaded_by FROM media_assets")).rows).toEqual([{state:'approved',uploaded_by:`admin:${f.adminId}`}]);
 // Palette 3 and the picture: colours of the template's third palette, the file in the photo knob, the revision moved on.
 const knobs=canvasTemplate('tam-thiep')!.knobs!,photo=knobs.photos[0].id,before=desk.draft.revision;
 expect(await code(f.desks.act(f.adminId,id,{op:'knobs',knobs:{photos:{[photo]:{mediaId:randomUUID()}}}}))).toBe('INVALID_INPUT');
 desk=(await f.desks.act(f.adminId,id,{op:'knobs',knobs:{palette:2,photos:{[photo]:{mediaId:desk.files[0].mediaId,focus:[50,30]}}}})).desk!;
 expect(desk.draft.revision).toBe(before+1);
 expect(els(desk.draft.config.doc).get(photo)).toMatchObject({src:desk.files[0].url,focus:[50,30]});
 expect(JSON.stringify(desk.draft.config.doc)).toContain(knobs.palettes[2].colors[2]);
 // A later turn of one knob keeps the others as they were.
 desk=(await f.desks.act(f.adminId,id,{op:'knobs',knobs:{texts:{'cau-chao':{vi:'Tóc gọn, đời vui'}}}})).desk!;
 expect((els(desk.draft.config.doc).get(photo) as ImageEl).src).toBe(desk.files[0].url);
 expect(desk.knobs.palette).toBe(2);
 expect(JSON.stringify(desk.draft.config.doc)).toContain('Tóc gọn, đời vui');
 // Another template starts the draft again and forgets the knobs.
 desk=(await f.desks.act(f.adminId,id,{op:'template',key:'khong-gian-that'})).desk!;
 expect([desk.draft.templateKey,desk.knobs]).toEqual(['khong-gian-that',{}]);
 expect(await code(f.desks.act(f.adminId,id,{op:'knobs',knobs:{palette:0}}))).toBe('NO_KNOBS');
});

test('the shop\'s details wait for "Phát hành": the preview and the link show them, the shop does not until it is published',async({f})=>{
 const {id,slug,shopId}=await opened(f);
 expect(await code(f.desks.act(f.adminId,id,{op:'details',details:{profile:{links:{zalo:'12345'}}}}))).toBe('INVALID_PROFILE:links.zalo.url');
 const desk=(await f.desks.act(f.adminId,id,{op:'details',details:{name:'4RAU Barbershop',placeId:'ChIJN1t_tDeuEmsRUsoyG83frY4',
  profile:{links:{instagram:'@4rau.barbershop',zalo:'0901234567'},hours:'9:00 – 21:00'}}})).desk!;
 expect((await f.db.query('SELECT name,profile FROM shops WHERE id=$1',[shopId])).rows[0].profile).toEqual({});
 const shown=els(deskDoc(desk));
 expect(shown.get('instagram')).toMatchObject({link:'https://www.instagram.com/4rau.barbershop/'});
 expect(shown.get('ten-quan')).toMatchObject({words:{vi:'4RAU Barbershop'}});
 expect(shown.get('tiktok')?.hide).toBe(true);
 // The link for the shop: the draft while the request is open, nothing for a made-up token.
 const {preview}=await f.desks.act(f.adminId,id,{op:'preview'});
 expect(preview).toMatch(/^\/xem-thu\/[A-Za-z0-9_-]{32}$/);
 expect((await f.desks.byPreview(preview!.slice(9)))?.request.id).toBe(id);
 expect(await f.desks.byPreview('A'.repeat(32))).toBeNull();
 expect((await f.db.query('SELECT preview_hash FROM edit_desks')).rows[0].preview_hash).not.toContain(preview!.slice(9));
 // Phát hành: details saved, page live under the shop's name, request closed, the link dead.
 expect(await f.desks.act(f.adminId,id,{op:'publish'})).toEqual({desk:null});
 expect((await f.db.query('SELECT name,place_id FROM shops WHERE id=$1',[shopId])).rows[0]).toEqual({name:'4RAU Barbershop',place_id:'ChIJN1t_tDeuEmsRUsoyG83frY4'});
 expect((await f.db.query('SELECT outcome,handled_by FROM edit_requests WHERE id=$1',[id])).rows[0]).toEqual({outcome:'published',handled_by:`admin:${f.adminId}`});
 const live=await new PublishingResolver(f.db).live({slug});
 expect(els(live.config.doc).get('instagram')).toMatchObject({link:'https://www.instagram.com/4rau.barbershop/'});
 expect(await f.desks.byPreview(preview!.slice(9))).toBeNull();
 expect(await code(f.desks.load(id))).toBe('NOT_FOUND');
});

/** A stand-in for the Anthropic client: each call answers with the next page in the list. */
function fakeClaude(answers:object[]){
 const calls:unknown[]=[];
 const client={beta:{messages:{stream:(params:unknown)=>{calls.push(structuredClone(params));const answer=answers[calls.length-1];
  return {finalMessage:async()=>({model:'claude-opus-5-5',stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:5,cache_read_input_tokens:0},
   content:[{type:'text',text:JSON.stringify(answer)}]})};}}}};
 return {client:client as unknown as Anthropic,calls};
}

test('Nhờ Claude: a page that fails the platform\'s checks goes back with the reasons; the one that passes lands in the draft, never live',async({f})=>{
 const {id,shopId}=await opened(f);
 const desk=(await f.desks.addFile(f.adminId,id,{type:'image/jpeg',name:'bien-hieu.jpg',role:'logo',bytes:JPEG})).desk!;
 const logo=desk.files[0].url,doc=structuredClone(canvasTemplate('khong-gian-that')!.doc);
 // First answer: a picture from somewhere else, the Google button below the first screen, a Zalo link written into a button.
 const wrong=structuredClone(doc);
 for(const el of walk(wrong)){if(el.t==='image')el.src='https://elsewhere.example/a.jpg';if(el.t==='google')(el as GoogleEl).y=700;}
 const right=structuredClone(doc);
 for(const el of walk(right))if(el.t==='image'&&el.id==='polaroid')el.src=logo;
 const answer=(page:PageDoc)=>({template:'khong-gian-that',summary:'Dùng ảnh biển hiệu.',reply:'Anh xem giúp em ạ.',questions:['Giờ mở cửa?'],
  details_json:JSON.stringify({profile:{links:{instagram:'@4rau.barbershop'}}}),doc_json:JSON.stringify(page)});
 const {client,calls}=fakeClaude([answer(wrong),answer(right)]);
 const result=await askClaude(f.db,f.adminId,id,{client,fetcher:(async()=>new Response(JPEG,{headers:{'content-type':'image/jpeg'}})) as typeof fetch,desk:f.desks});
 expect(result).toMatchObject({template:'khong-gian-that',tries:2,questions:['Giờ mở cửa?']});
 const second=calls[1] as {messages:{role:string;content:unknown}[]};
 expect(second.messages.map(m=>m.role)).toEqual(['user','assistant','user']);
 expect(String(second.messages[2].content)).toMatch(/không phải tệp của yêu cầu này[\s\S]*Luật Google/);
 // The first message carries the pictures themselves, so Claude sees the sign.
 expect(JSON.stringify((calls[0] as {messages:{content:unknown}[]}).messages[0].content)).toContain('"type":"image"');
 const after=await f.desks.load(id);
 expect(after.draft.templateKey).toBe('khong-gian-that');
 expect(after.details).toEqual({profile:{links:{instagram:{url:'https://www.instagram.com/4rau.barbershop/'}}}});
 expect(after.notes.at(-1)).toMatchObject({who:'claude',body:'Dùng ảnh biển hiệu.\nCòn thiếu: Giờ mở cửa?'});
 expect((await f.db.query('SELECT state,active_release_id FROM pages WHERE shop_id=$1',[shopId])).rows[0].active_release_id).toBeNull();
 // Three failures in a row: nothing changes and Tài is told to hand it to Claude Code.
 const stubborn=fakeClaude([answer(wrong),answer(wrong),answer(wrong)]);
 expect(await code(askClaude(f.db,f.adminId,id,{client:stubborn.client,fetcher:(async()=>new Response(JPEG)) as typeof fetch,desk:f.desks}))).toBe('CLAUDE_PAGE_REFUSED');
 expect((await f.desks.load(id)).draft.revision).toBe(after.draft.revision);
});
