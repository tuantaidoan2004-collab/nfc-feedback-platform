import {test as base,expect,type Page} from '@playwright/test';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {ownerFixture,addExperience} from '../repository-tests/owner-fixture';
import {sessionHash} from '../lib/owner/auth';
import {AccountSignup} from '../lib/account/signup';
import {TAB_KEYS,TAB_LABELS} from '../components/qs/tabs-config';
const uri=process.env.NFC_TEST_DATABASE_URL,schema=process.env.NFC_TEST_SCHEMA;
if(uri!=='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test'||!/^nfc_ui_test_[a-f0-9]{32}$/.test(schema??''))throw Error('Isolated harness required');
const test=base.extend<{f:Awaited<ReturnType<typeof ownerFixture>>}>({f:async({},provideFixture)=>{
 const db=new Pool({connectionString:uri,options:`-c search_path=${schema}`});
 try{await db.query('TRUNCATE owner_identities_v2,shops,template_versions,owner_login_limits CASCADE');await provideFixture(await ownerFixture(db));}finally{await db.end();}
}});
const origin='http://127.0.0.1:3317';
/**
 * The giao diện chính (đợt ①–②, kịch bản mục 6–9): the Orb's screen at /app/<shop>, six tabs at /app/<shop>/<tab>. No page
 * editor, and no publishing by the shop (Tài 06/10): the shop picks a template and leaves its Zalo, Tài matches the page to the
 * shop and publishes it (scripts/sua-trang.mjs). A signed-out visit goes to the sign-in page and comes back to the shop after.
 */
async function login(page:Page,user:{username:string;password:string},shop='one'){
 await page.goto(`/app/${shop}`);await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
 await page.getByLabel('@handle hoặc email',{exact:true}).fill(user.username);await page.getByLabel('Mật khẩu',{exact:true}).fill(user.password);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/app/${shop}$`));
 await expect(page.locator('[data-orb]')).toBeVisible();
}
const tab=async(page:Page,key:string,shop='one')=>{await page.goto(`/app/${shop}/${key}`);await expect(page.getByRole('heading',{level:1,name:TAB_LABELS[key as keyof typeof TAB_LABELS],exact:true})).toBeVisible();};
const noSideScroll=(page:Page)=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
/**
 * What the frame cuts off: it hides sideways overflow, so a too-wide card leaves no scroll to notice, only a missing edge (a
 * table once widened Quản lý past a phone, its "Tạm dừng ngay" out of reach). Anything past the screen's right edge that is
 * not inside its own sideways scroller.
 */
const clipped=(page:Page)=>page.evaluate(()=>[...document.querySelectorAll('main *')].filter(el=>{
 const box=el.getBoundingClientRect();if(!box.width||box.right<=innerWidth+1)return false;
 for(let up=el.parentElement;up;up=up.parentElement){const x=getComputedStyle(up).overflowX;if(x==='auto'||x==='scroll')return false;}
 return true;}).map(el=>`${el.tagName}.${String(el.className).slice(0,30)}`));
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});
// next dev compiles an API on its first call and reloads every open page (operations-gotchas.md): compile the ones the tabs
// call before any page exists. The answers (401 without a session) do not matter.
test.beforeEach(async({request})=>{for(const api of ['team','activity','cards','pages','overview','summary','pulse','google-business','google-reviews','edit-requests'])await request.get(`/api/owner/v2/warm/${api}`);
 for(const api of ['profile','notifications'])await request.get(`/api/owner/v2/${api}`);});

test('sign-in lands on the Orb; every tab has its address and a way back; the theme stays; signing out ends the session',async({page,context,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await login(page,f.users[0]);
 await expect(page.getByText('Shop one',{exact:true}).first()).toBeVisible();
 const cookie=(await context.cookies()).find(c=>c.name==='nfc_owner_v2')!;expect(cookie).toMatchObject({httpOnly:true,sameSite:'Strict'});
 expect(await page.evaluate(()=>document.cookie)).not.toContain(cookie.value);
 // The Orb opens the tabs (a tap, or Space); each is a place of its own. The orbs drift and spring on purpose, so the tap on a
 // small orb is sent to it directly rather than aimed at where it is flying past.
 await page.keyboard.press('Space');await expect(page.locator('[data-orb-hub]')).toHaveAttribute('aria-expanded','true');
 await page.locator('[data-orb-tab="data"]').dispatchEvent('click');
 await expect(page).toHaveURL(/\/app\/one\/data$/);await expect(page.getByRole('heading',{level:1,name:'Data',exact:true})).toBeVisible();
 for(const key of TAB_KEYS){
  await tab(page,key);
  for(const width of [390,1200]){await page.setViewportSize({width,height:844});expect(await noSideScroll(page),`${key} ${width}`).toBe(true);
   expect(await clipped(page),`${key} ${width}`).toEqual([]);}
  await page.screenshot({path:info.outputPath(`tab-${key}.png`)});
 }
 await page.getByRole('button',{name:'Về Orb'}).click();await expect(page).toHaveURL(/\/app\/one$/);
 expect((await page.goto('/app/one/khong-co'))!.status()).toBe(404);
 // White by default; a choice survives a reload, painted by the server from the cookie.
 await page.goto('/app/one');await expect(page.locator('.qs').first()).toHaveAttribute('data-theme','light');
 await page.getByRole('button',{name:/Giao diện sáng/}).click();await expect(page.locator('.qs').first()).toHaveAttribute('data-theme','dark');
 await page.reload();await expect(page.locator('.qs').first()).toHaveAttribute('data-theme','dark');
 const headers=(await context.request.get('/app/one')).headers();expect(headers['x-frame-options']).toBe('DENY');
 // Signing out is in Cài đặt; the session is gone for good, not just the cookie.
 await tab(page,'cai-dat');await page.locator('[data-sign-out]').click();
 await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
 expect((await context.request.get('/api/owner/v2/one')).status()).toBe(401);
 expect((await f.db.query('SELECT revoked_at FROM owner_auth_sessions_v2 WHERE token_hash=$1',[sessionHash(cookie.value)])).rows[0].revoked_at).not.toBeNull();
 expect(errors).toEqual([]);
});

test('Data: a guest\'s private feedback arrives with its stars, words and number; the owner marks it handled; exports keep formulas inert',async({page,context,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/one');await expect(page.locator('main[data-ready]')).toBeVisible();await page.locator('#private-feedback').click({force:true});
 await page.getByRole('button',{name:'2 sao',exact:true}).click();await page.locator('#message').fill('=SUM(1,2)');
 await page.getByLabel('Số điện thoại, nếu muốn quản lý gọi lại').fill('0961 036 265');
 await page.getByRole('button',{name:'Gửi góp ý',exact:true}).click();await expect(page.locator('[data-thanks]')).toBeVisible();
 await login(page,f.users[0]);await tab(page,'data');
 const item=page.locator('[data-item="private"]');await expect(item).toHaveCount(1);
 await expect(item).toContainText('=SUM(1,2)');await expect(item.getByLabel('2 trên 5 sao')).toBeVisible();await expect(item).toContainText('Mới');
 await expect(item).toContainText('Cần xử lý');await expect(page.getByRole('tab',{name:/Cần xử lý/})).toContainText('1');
 // The whole line opens the detail panel (the tool's): the number to call back, the status, the internal note.
 await item.click();const panel=page.getByRole('dialog',{name:'Chi tiết góp ý riêng'});
 await expect(panel.getByRole('link',{name:'0961036265'})).toHaveAttribute('href','tel:0961036265');
 await panel.getByRole('textbox').fill('Đã gọi lại, khách đồng ý quay lại');
 await panel.getByRole('button',{name:'Lưu ghi chú',exact:true}).click();await expect(panel.getByRole('status')).toHaveText('Đã lưu.');
 await panel.getByRole('radio',{name:'Đã xử lý',exact:true}).click();await expect(panel.getByRole('radio',{name:'Đã xử lý',exact:true})).toHaveAttribute('aria-checked','true');
 await expect(panel.getByRole('button',{name:'Mở lại',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);
 await expect(item).toContainText('Đã xử lý');await expect(item).not.toContainText('Cần xử lý');await expect(item).toContainText('📝 Đã gọi lại');
 expect((await f.db.query('SELECT status,note FROM owner_feedback_cases')).rows).toEqual([{status:'resolved',note:'Đã gọi lại, khách đồng ý quay lại'}]);
 // One inbox, two sources: Google alone hides the private one; the search finds words and notes.
 await page.getByLabel('Nguồn').selectOption('google');await expect(page.locator('[data-item="private"]')).toHaveCount(0);
 await page.getByLabel('Nguồn').selectOption('');await expect(page.locator('[data-item="private"]')).toHaveCount(1);
 await page.getByLabel('Tìm').fill('dong y quay');await expect(page.locator('[data-item="private"]')).toHaveCount(1);
 await page.getByLabel('Tìm').fill('không có chữ này');await expect(page.locator('[data-item="private"]')).toHaveCount(0);
 await page.getByRole('button',{name:/Xoá lọc/}).click();await expect(page.locator('[data-item="private"]')).toHaveCount(1);
 for(const width of [390,1200]){await page.setViewportSize({width,height:844});expect(await noSideScroll(page)).toBe(true);await page.screenshot({path:info.outputPath(`data-${width}.png`),fullPage:true});}
 // The shop's data leaves as files; a formula a guest typed stays text in the spreadsheet.
 const csv=await (await context.request.get('/api/owner/v2/one/export?format=csv')).text();expect(csv.startsWith('﻿')).toBe(true);expect(csv).toContain('"\'=SUM(1,2)"');
 const jsonl=await context.request.get('/api/owner/v2/one/export?format=jsonl&dataset=receipts');expect(jsonl.headers()['cache-control']).toContain('no-store');
 const events=(await jsonl.text()).trim().split('\n').map(x=>JSON.parse(x));expect(events).toHaveLength(2);expect(events[1].message).toBe('=SUM(1,2)');
 const dict=await context.request.get('/api/owner/v2/one/export?format=dictionary&dataset=receipts');expect((await dict.json()).fields.every((x:{meaning:string})=>x.meaning)).toBe(true);
 // Google reviews leave the same way, under the same permission; the shop has none yet, so only the header.
 const reviews=await (await context.request.get('/api/owner/v2/one/export?format=csv&dataset=google_reviews&from=2000-01-01')).text();
 expect(reviews.startsWith('\uFEFF')).toBe(true);expect(reviews.trim()).toBe('"schemaVersion","dataset","review_id","reviewer_name","stars","comment","created_at","reply","status","note","first_seen_at","removed_at"');
 expect(errors).toEqual([]);
});

test('Library → a template → the shop leaves its Zalo for Tài: a draft waits, nothing goes live, My Card follows it; another template restyles the page',async({page,context,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // next dev reloads every open page the first time it compiles a route; compile the guest page and the templates first.
 const warm=await context.newPage();await warm.goto('/one');await warm.goto('/templates/party?anh=1&ten=x');await warm.goto('/templates/basic-1?ten=x');await warm.close();
 await page.setViewportSize({width:1280,height:900});
 await login(page,f.users[0]);await tab(page,'library');
 // Home: the shop's one page, as a picture.
 await expect(page.locator('[data-page]')).toHaveCount(1);
 await page.getByRole('button',{name:'Template',exact:true}).click();
 // What picking a template leads to, before anything is picked.
 await expect(page.locator('[data-how-it-works]')).toContainText('Admin Tài nhắn Zalo, khớp mẫu với quán');
 await expect(page.locator('[data-template]')).toHaveCount(11);
 await page.getByLabel('Tìm template').fill('party');await expect(page.locator('[data-template]')).toHaveCount(1);
 await page.getByRole('button',{name:'Xem mẫu Interactive card · Party'}).click();
 // The template in a phone with the shop's name, why Tài makes it the shop's, and one way on.
 const sheet=page.getByRole('dialog',{name:'Mẫu Interactive card · Party'});
 await expect(sheet.frameLocator('iframe').locator('main.cv')).toBeVisible();
 await expect(sheet.getByText('Mẫu cần khớp với quán của bạn')).toBeVisible();
 await expect(sheet.getByRole('button',{name:/Phát hành/})).toHaveCount(0);
 // A shop that has a page says which page takes the look; this one wants a new page.
 await sheet.getByRole('radio',{name:/Một trang mới/}).check();
 await page.screenshot({path:info.outputPath('template-1280.png')});
 await sheet.getByLabel('Số Zalo của bạn').fill('0912 34');
 await sheet.getByRole('button',{name:'Nhờ Admin Tài dựng trang này'}).click();
 await expect(sheet.getByText('Số điện thoại Việt Nam, 10 số',{exact:false})).toBeVisible();
 await sheet.getByLabel('Số Zalo của bạn').fill('0912 345 678');
 await sheet.getByLabel(/Ghi chú cho Admin Tài/).fill('Quán trà sữa, màu xanh lá');
 await sheet.getByRole('button',{name:'Nhờ Admin Tài dựng trang này'}).click();
 const sent=sheet.locator('[data-sent]');await expect(sent).toBeVisible({timeout:20_000});
 const made=async()=>(await f.db.query(`SELECT p.slug,p.state FROM pages p JOIN shops s ON s.id=p.shop_id WHERE s.slug='one' AND p.slug<>'one' ORDER BY p.created_at`)).rows;
 const [waiting]=await made();expect(waiting.state).toBe('draft');
 await expect(sent).toHaveAttribute('data-sent',waiting.slug);await expect(sent.getByRole('link',{name:'Mở Zalo'})).toHaveAttribute('href','https://zalo.me/0961036265');
 expect((await f.db.query('SELECT e.template_key,e.contact,e.message,e.handled_at FROM edit_requests e JOIN pages p ON p.id=e.page_id WHERE p.slug=$1',[waiting.slug])).rows)
  .toEqual([{template_key:'party',contact:'0912345678',message:'Quán trà sữa, màu xanh lá',handled_at:null}]);
 // Nothing reaches guests before Tài publishes it.
 expect(await (await page.request.get(`/${waiting.slug}`)).text()).not.toContain('data-google');
 await sheet.getByRole('button',{name:'Xong',exact:true}).click();await expect(sheet).toHaveCount(0);
 // My Card: both pages, each with where it stands; the waiting one shows its steps and takes more words, its Zalo remembered.
 await tab(page,'my-card');await expect(page.locator('[data-my-card]')).toHaveCount(2);
 await expect(page.locator('[data-my-card="one"] [data-page-state]')).toHaveText('Đang chạy');
 await expect(page.locator(`[data-my-card="${waiting.slug}"] [data-page-state]`)).toHaveText('Chờ Admin Tài');
 await page.locator(`[data-my-card="${waiting.slug}"]`).getByRole('button',{name:'Xem tiến độ'}).click();
 const opened=page.getByRole('dialog');
 await expect(opened.getByText('Bạn đã nhắn: “Quán trà sữa, màu xanh lá”')).toBeVisible();
 await opened.getByRole('button',{name:/Gửi thêm ghi chú cho Admin Tài/}).click();
 await expect(opened.getByLabel('Số Zalo của bạn')).toHaveValue('0912 345 678');
 // The sheet on a phone.
 await page.setViewportSize({width:390,height:844});expect(await noSideScroll(page)).toBe(true);
 await page.screenshot({path:info.outputPath('page-sheet-390.png')});
 await opened.getByRole('button',{name:'Đóng'}).click();
 // Another template for the live page: a new look waits for Tài; guests keep the page they have.
 await page.setViewportSize({width:1280,height:900});await tab(page,'library');await page.getByRole('button',{name:'Template',exact:true}).click();
 await page.getByLabel('Tìm template').fill('basic 1');await page.getByRole('button',{name:'Xem mẫu Basic 1'}).click();
 const restyle=page.getByRole('dialog',{name:'Mẫu Basic 1'});
 // The shop's first page comes first, already chosen (the fixture's pages carry no name, so it shows its link).
 await expect(restyle.getByRole('radio',{name:/Đổi giao diện “one”/})).toBeChecked();
 await restyle.getByRole('button',{name:'Nhờ Admin Tài dựng trang này'}).click();await expect(restyle.locator('[data-sent="one"]')).toBeVisible({timeout:20_000});
 expect((await f.db.query("SELECT tv.template_key FROM page_drafts d JOIN template_versions tv ON tv.id=d.template_version_id JOIN pages p ON p.id=d.page_id WHERE p.slug='one'")).rows[0].template_key).toBe('basic-1');
 expect((await f.db.query("SELECT tv.template_key FROM pages p JOIN page_releases r ON r.id=p.active_release_id JOIN template_versions tv ON tv.id=r.template_version_id WHERE p.slug='one'")).rows[0].template_key).not.toBe('basic-1');
 expect(errors).toEqual([]);
});

test('Google reviews as the tool shows them: Dashboard counts what needs handling and draws the months; Data marks several at once',async({page,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const shop=(await f.db.query("SELECT id FROM shops WHERE slug='one'")).rows[0].id,link='https://maps.app.goo.gl/AbCdEf123';
 await f.db.query(`INSERT INTO google_business_connections(shop_id,mode,maps_url,location_title,average_rating,total_reviews,last_synced_at)
   VALUES($1,'maps',$2,'Quán Thử Trên Maps',4.2,3,clock_timestamp())`,[shop,link]);
 const ago=(days:number)=>new Date(Date.now()-days*86400000).toISOString();
 await f.db.query(`INSERT INTO google_reviews(shop_id,review_id,reviewer_name,stars,comment,created_at,updated_at,reply_comment,status) VALUES
   ($1,'r-low','An',1,'Chờ lâu quá.',$2,$2,NULL,'new'),($1,'r-mid','Bình',2,NULL,$3,$3,NULL,'seen'),($1,'r-top','Chi',5,'Ngon.',$4,$4,'Cảm ơn Chi!','seen')`,[shop,ago(2),ago(40),ago(70)]);
 await page.setViewportSize({width:1280,height:900});
 await login(page,f.users[0]);await tab(page,'dashboard');
 // "Số liệu của quán" keeps its look and gains one line; the months and the stars are a card of their own.
 const needs=page.locator('[data-needs]');await expect(needs).toContainText('2 đánh giá ≤ 3★ chưa trả lời');
 await expect(page.getByRole('heading',{name:'Đánh giá theo tháng'})).toBeVisible();await expect(page.getByRole('img',{name:'Đánh giá theo tháng'})).toBeVisible();
 await expect(page.getByTitle(/^5 sao: 1 đánh giá/)).toBeAttached();
 await page.screenshot({path:info.outputPath('dashboard-google-1280.png'),fullPage:true});
 await needs.click();await expect(page).toHaveURL(/\/app\/one\/data\?xem=can-xu-ly$/);
 await expect(page.getByRole('tab',{name:/Cần xử lý/})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('[data-item="google"]')).toHaveCount(2);
 // Both at once, as the tool does: the box above the list picks the page.
 await page.getByLabel('Chọn mọi đánh giá Google ở trang này').click();await expect(page.getByText('Đã chọn 2')).toBeVisible();
 await page.getByRole('button',{name:'Đã xử lý',exact:true}).click();
 await expect(page.getByText('Không còn gì cần xử lý 🎉')).toBeVisible();
 await expect.poll(async()=>(await f.db.query('SELECT review_id,status FROM google_reviews ORDER BY review_id')).rows)
  .toEqual([{review_id:'r-low',status:'handled'},{review_id:'r-mid',status:'handled'},{review_id:'r-top',status:'seen'}]);
 // The answered one: its reply, and the way to answer on Google Maps.
 await page.getByRole('tab',{name:/^Tất cả/}).click();await page.locator('[data-item="google"]',{hasText:'Chi'}).click();
 const panel=page.getByRole('dialog',{name:'Chi tiết đánh giá'});await expect(panel).toContainText('Cảm ơn Chi!');
 await expect(panel.getByRole('link',{name:/Trả lời trên Google Maps/})).toHaveAttribute('href',link);
 await page.screenshot({path:info.outputPath('data-google-1280.png')});
 await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);
 // Gone from Maps: out of the list, kept under "Đã bị xoá / ẩn".
 await f.db.query("UPDATE google_reviews SET removed_at=clock_timestamp() WHERE review_id='r-mid'");
 await page.reload();await page.getByRole('tab',{name:/^Tất cả/}).click();
 await expect(page.locator('[data-item="google"]')).toHaveCount(2);
 await page.getByLabel('Phạm vi').selectOption('removed');
 await expect(page.locator('[data-item="google"]')).toHaveCount(1);await expect(page.locator('[data-item="google"]')).toContainText('Đã bị xoá');
 await page.setViewportSize({width:390,height:844});expect(await noSideScroll(page)).toBe(true);
 expect(errors).toEqual([]);
});

test('a shop that signed itself up gets its first page from Tài: it asks, he publishes it with the shop\'s details, and guests see only those',async({page})=>{
 const db=new Pool({connectionString:uri,options:`-c search_path=${schema}`});
 try{
  const made=await new AccountSignup(db).create({username:'tu-dang-ky',email:'tu-dang-ky@example.test',password:'a-long-test-password'},null);
  await db.query('UPDATE shops SET onboarded_at=clock_timestamp() WHERE slug=$1',[made.slug]);
  await page.setViewportSize({width:1280,height:900});
  await login(page,{username:'tu-dang-ky',password:'a-long-test-password'},made.slug);
  await tab(page,'library',made.slug);await page.getByRole('button',{name:'Template',exact:true}).click();
  await page.getByRole('button',{name:'Xem mẫu Basic 1'}).click();
  const sheet=page.getByRole('dialog',{name:'Mẫu Basic 1'});
  // No page yet, so no page to choose: the template makes the shop's first one. A few seconds on a slow CI runner.
  await expect(sheet.getByRole('radio')).toHaveCount(0);
  await sheet.getByLabel('Số Zalo của bạn').fill('0912345678');
  await sheet.getByRole('button',{name:'Nhờ Admin Tài dựng trang này'}).click();
  await expect(sheet.locator('[data-sent]')).toBeVisible({timeout:20_000});
  const slug=(await db.query('SELECT p.slug FROM edit_requests e JOIN pages p ON p.id=e.page_id')).rows[0].slug as string;
  expect(await (await page.request.get(`/${slug}`)).text()).not.toContain('data-google');
  // Tài has the shop's details from Zalo; the agent publishes (scripts/sua-trang.mjs does these steps in one transaction).
  const {saveShopDetails}=await import('../lib/admin/shop-details');
  const {PublishingAdmin}=await import('../lib/publishing/repository');
  const {AdminAuth}=await import('../lib/admin/auth');
  const adminId=await new AdminAuth(db).bootstrap('tai-dung-trang','a-sufficiently-long-admin-secret',async()=>{});
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   await saveShopDetails(client,adminId,(await client.query('SELECT id FROM shops WHERE slug=$1',[made.slug])).rows[0].id,
    {name:'Nhẹ Tênh Tea',placeId:'ChIJN1t_tDeuEmsRUsoyG83frY4',profile:{links:{zalo:'0912345678',tiktok:'@nhetenh'}}});
   const row=(await client.query('SELECT p.shop_id,p.id,d.revision FROM pages p JOIN page_drafts d ON d.page_id=p.id WHERE p.slug=$1',[slug])).rows[0];
   await new PublishingAdmin(client,async()=>({actorId:`admin:${adminId}`})).publish({shopId:row.shop_id,pageId:row.id},Number(row.revision));
   await client.query("UPDATE edit_requests SET handled_at=clock_timestamp(),handled_by='agent',outcome='published'");
   await client.query('COMMIT');
  }finally{client.release();}
  // Live, as the shop: its name, its Zalo and TikTok; Instagram, which it does not have, is not there at all.
  const live=await (await page.request.get(`/${slug}`)).text();
  expect(live).toContain('data-google');expect(live).toContain('Nhẹ Tênh Tea');
  expect(live).toContain('https://zalo.me/0912345678');expect(live).toContain('https://www.tiktok.com/@nhetenh');
  expect(live).not.toContain('https://www.instagram.com/');expect(live).not.toContain('https://zalo.me/"');
  await tab(page,'my-card',made.slug);
  await expect(page.locator(`[data-my-card="${slug}"] [data-page-state]`)).toHaveText('Đang chạy');
 }finally{await db.end();}
});

test('cards: nhân bản thẻ, confirm before switching on, the card opens the page, off closes it; My Card shows it under its page',async({page,context,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const warm=await context.newPage();await warm.goto('/t/zzzzz');await warm.close();
 await login(page,f.users[0]);await tab(page,'quan-ly');
 const panel=page.locator('[data-cards]');
 await expect(panel.locator('[data-card-count]')).toHaveText('Đang hoạt động: 0 thẻ.');
 await panel.getByLabel('Tên thẻ mới',{exact:true}).fill('Bàn 3');
 await panel.getByRole('button',{name:'Nhân bản thẻ',exact:true}).click();
 await expect(panel.locator('[data-cards-notice]')).toContainText('Đã nhân bản thẻ "Bàn 3"');
 const row=panel.locator('tr[data-card]');await expect(row).toHaveCount(1);
 const code=(await row.getAttribute('data-card'))!;expect(code).toMatch(/^[2-9a-hjkmnp-z]{5}$/);
 await expect(row).toContainText(`/t/${code}`);await expect(row.locator('[data-card-state]')).toHaveText('Chưa kích hoạt');
 const customer=await context.newPage();await customer.goto(`/t/${code}`);
 await expect(customer.getByRole('heading',{name:'Trang chưa sẵn sàng'})).toBeVisible();
 let asked='';page.once('dialog',dialog=>{asked=dialog.message();void dialog.accept();});
 await row.getByRole('button',{name:'Kích hoạt',exact:true}).click();
 await expect(row.locator('[data-card-state]')).toHaveText('Đang hoạt động');
 // Cards carry no fee in the app (Tài, 26/09): the confirmations say what happens, never what it costs.
 expect(asked).toContain('Khách chạm thẻ là mở trang ngay.');expect(asked).not.toMatch(/phí|gói|đ\/tháng/);
 await expect(panel.locator('[data-card-count]')).toHaveText('Đang hoạt động: 1 thẻ.');
 await customer.reload();await expect(customer.locator('main[data-ready]')).toBeVisible();
 page.once('dialog',dialog=>{asked=dialog.message();void dialog.accept();});
 await row.getByRole('button',{name:'Tạm tắt',exact:true}).click();
 await expect(row.locator('[data-card-state]')).toHaveText('Đã tắt');expect(asked).not.toMatch(/phí|gói|đ\/tháng/);
 await customer.reload();await expect(customer.getByRole('heading',{name:'Trang chưa sẵn sàng'})).toBeVisible();
 await expect(row.getByRole('button',{name:'Bật lại',exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});expect(await noSideScroll(page)).toBe(true);
 await panel.screenshot({path:info.outputPath('cards-390.png')});
 await tab(page,'my-card');
 const card=page.locator('[data-my-card="one"]');await expect(card).toContainText('Bàn 3');await expect(card).toContainText(`/t/${code}`);await expect(card).toContainText('Đã tắt');
 expect(errors).toEqual([]);
});

test('emergency stop: the owner stops a page with a note, guests see it paused, the report reaches the platform, and the owner starts it again',async({page,f})=>{
 await login(page,f.users[0]);await tab(page,'quan-ly');
 const row=page.locator('[data-stop-page="one"]');await expect(row).toContainText('Đang chạy');
 page.once('dialog',dialog=>void dialog.accept('Nút Google mở sai link'));
 await row.getByRole('button',{name:'Tạm dừng ngay'}).click();
 await expect(row).toContainText('Bạn đã tạm dừng');
 expect(await (await page.request.get('/one')).text()).toContain('Trang tạm ngừng');
 expect((await f.db.query('SELECT reason,state FROM page_incidents')).rows).toEqual([{reason:'Nút Google mở sai link',state:'open'}]);
 await row.getByRole('button',{name:'Mở lại'}).click();
 await expect(row).toContainText('Đang chạy');
 expect(await (await page.request.get('/one')).text()).not.toContain('Trang tạm ngừng');
});

test('password: change it in Cài đặt → Hồ sơ, the old one stops working, other devices are signed out, other origins refused',async({page,context,f})=>{
 const a=f.users[0],next='the-new-shop-password';
 const other=await context.browser()!.newContext({baseURL:origin});
 try{
  const second=await other.newPage();await login(second,a);
  await login(page,a);await page.goto('/app/one/cai-dat?view=profile');
  await page.getByLabel('Mật khẩu hiện tại',{exact:true}).fill('not-the-password');
  await page.getByLabel('Mật khẩu mới (ít nhất 12 ký tự)',{exact:true}).fill(next);
  await page.getByLabel('Nhập lại mật khẩu mới',{exact:true}).fill(next);
  await page.getByRole('button',{name:'Đổi mật khẩu',exact:true}).click();
  await expect(page.getByText('Mật khẩu hiện tại chưa đúng.')).toBeVisible();
  await page.getByLabel('Mật khẩu hiện tại',{exact:true}).fill(a.password);
  await page.getByRole('button',{name:'Đổi mật khẩu',exact:true}).click();
  await expect(page.getByText(/Đã đổi mật khẩu/)).toBeVisible();
  // The other browser is signed out; this one keeps working.
  expect((await second.request.get('/api/owner/v2/one/summary')).status()).toBe(401);
  expect((await page.request.get('/api/owner/v2/one/summary')).status()).toBe(200);
  expect((await page.request.put('/api/owner/v2/password',{headers:{Origin:'https://invalid.example'},data:{current:next,next:'another-long-password'}})).status()).toBe(403);
  await page.locator('[data-sign-out]').click();await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
  await page.getByLabel('@handle hoặc email',{exact:true}).fill(a.username);await page.getByLabel('Mật khẩu',{exact:true}).fill(a.password);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.getByText('Không thể đăng nhập',{exact:false})).toBeVisible();
  await login(page,{username:a.username,password:next});
 }finally{await other.close();}
});

test('profile: edit name, @handle and bio in Cài đặt → Hồ sơ, then sign in with the new @handle or the email',async({page,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const a=f.users[0];
 await login(page,a);await page.goto('/app/one/cai-dat?view=profile');
 const profile=page.locator('[data-profile]');
 await expect(profile.locator('[data-profile-handle]')).toHaveText(`@${a.username}`);
 await expect(profile).toContainText('Chủ shop');await expect(profile).toContainText('Tham gia');
 // A handle someone else has is refused and nothing changes.
 await profile.getByRole('button',{name:'Chỉnh sửa hồ sơ'}).click();
 const form=profile.locator('[data-profile-form]');
 await form.getByLabel('@handle (dùng để đăng nhập)').fill(f.users[1].username);
 await form.getByRole('button',{name:'Lưu hồ sơ'}).click();
 await expect(profile.locator('[data-profile-notice]')).toContainText('đã có người dùng');
 await form.getByLabel('Tên hiển thị').fill('Chị Hoa');
 await form.getByLabel('@handle (dùng để đăng nhập)').fill('@Hoa.Cafe');
 await form.getByLabel('Giới thiệu').fill('Chủ quán cà phê góc phố');
 await form.getByRole('button',{name:'Lưu hồ sơ'}).click();
 await expect(profile.locator('[data-profile-notice]')).toContainText('Từ giờ đăng nhập bằng @hoa.cafe');
 await expect(profile.locator('[data-profile-name]')).toHaveText('Chị Hoa');
 await expect(profile.locator('[data-profile-bio]')).toHaveText('Chủ quán cà phê góc phố');
 expect((await f.db.query('SELECT username,display_name FROM owner_identities_v2 WHERE id=$1',[a.id])).rows).toEqual([{username:'hoa.cafe',display_name:'Chị Hoa'}]);
 // Pictures come only from the account's own folder; other origins are refused.
 expect((await page.request.patch('/api/owner/v2/profile',{headers:{Origin:origin},data:{handle:'hoa.cafe',displayName:null,bio:null,avatarUrl:'https://evil.example/x.jpg',coverUrl:null}})).status()).toBe(400);
 expect((await page.request.patch('/api/owner/v2/profile',{headers:{Origin:'https://invalid.example'},data:{handle:'x-y-z',displayName:null,bio:null,avatarUrl:null,coverUrl:null}})).status()).toBe(403);
 await page.setViewportSize({width:390,height:844});expect(await noSideScroll(page)).toBe(true);
 await page.screenshot({path:info.outputPath('profile-390.png'),fullPage:true});
 await page.locator('[data-sign-out]').click();
 // A Vietnamese phone keyboard puts marks into the handle (Telex: "yourshop" becomes "yoủshop"); the page says so.
 await page.getByLabel('@handle hoặc email',{exact:true}).fill('@hoa.cafè');await expect(page.locator('[data-accent-hint]')).toBeVisible();
 await page.getByLabel('@handle hoặc email',{exact:true}).fill('@hoa.cafe');await expect(page.locator('[data-accent-hint]')).toHaveCount(0);
 await login(page,{username:'@hoa.cafe',password:a.password});
 await page.goto('/app/one/cai-dat');await page.locator('[data-sign-out]').click();await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
 await f.db.query("UPDATE owner_identities_v2 SET email='hoa@example.com' WHERE id=$1",[a.id]);
 await login(page,{username:'Hoa@Example.com',password:a.password});
 expect(errors).toEqual([]);
});

test('team: invite a Nhân viên by link, they see only what the role allows; roles like Discord; the owner searches the history with ⌘K',async({page,context,browser,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // The setup page must not reload after its link is spent: compile it and its API before any page is open.
 const warm=await context.newPage();await warm.goto(`/owner/setup/${'0'.repeat(64)}`);await warm.goto('/owner/login?next=/app/one');
 await warm.request.post('/api/owner/v2/setup',{headers:{Origin:origin},data:{token:'0'.repeat(64),password:'not-a-real-password'}});await warm.close();
 await addExperience(f.db,'one',2,'Lời khách riêng tư');
 await login(page,f.users[0]);await tab(page,'quan-ly');
 const team=page.locator('[data-team]');
 await expect(team.locator('[data-member]')).toHaveCount(1);
 const invite=team.locator('[data-invite]');
 await invite.getByLabel('@handle',{exact:true}).fill('@An.NV');
 await invite.locator('select').selectOption({label:'Nhân viên'});
 await invite.getByRole('button',{name:'Tạo tài khoản'}).click();
 const url=(await team.locator('[data-setup-link] code').textContent())!;
 expect(url).toMatch(/\/owner\/setup\/[a-f0-9]{64}$/);
 await expect(team.locator('[data-member="an.nv"]')).toContainText('chưa đặt mật khẩu');
 // Roles, Discord-style: two to start with, and the owner makes another with its own switches.
 const roles=page.locator('[data-roles]');
 await expect(roles.locator('[data-role]')).toHaveCount(2);
 await roles.getByRole('button',{name:'+ Tạo vai'}).click();
 const editor=roles.locator('[data-role-editor]');
 await editor.getByLabel('Tên vai',{exact:true}).fill('Thu ngân');await editor.getByLabel('Biểu tượng',{exact:true}).fill('💵');
 await editor.getByRole('switch',{name:'Xem lịch sử hoạt động'}).check();
 await editor.getByRole('button',{name:'Lưu vai'}).click();
 await expect(roles.locator('[data-role="Thu ngân"]')).toContainText('Xem lịch sử hoạt động');
 await page.screenshot({path:info.outputPath('team-1280.png'),fullPage:true});
 // An opens the link on their own phone, chooses a password, signs in with the @handle, and lands in the shop.
 const other=await browser.newContext({baseURL:origin});
 try{
  const an=await other.newPage();await an.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await an.goto(new URL(url).pathname);
  await an.getByLabel('Mật khẩu mới',{exact:true}).fill('an-chooses-this-one');await an.getByLabel('Nhập lại',{exact:true}).fill('an-chooses-this-one');
  await an.getByRole('button',{name:'Đặt mật khẩu'}).click();
  await expect(an.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
  await an.getByLabel('@handle hoặc email',{exact:true}).fill('@an.nv');await an.getByLabel('Mật khẩu',{exact:true}).fill('an-chooses-this-one');
  await an.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(an).toHaveURL(/\/app\/one$/);
  // A Nhân viên sees that a guest left stars, never what the guest wrote; no history; and cannot stop a page.
  await an.goto('/app/one/data');await expect(an.locator('[data-item="private"]')).toHaveCount(1);
  await expect(an.getByText('Lời khách riêng tư')).toHaveCount(0);
  await an.goto('/app/one/cai-dat');await expect(an.getByText('Vai của bạn chưa được xem lịch sử hoạt động.')).toBeVisible();
  await an.goto('/app/one/quan-ly');await expect(an.getByText('Chỉ chủ quán tạm dừng hoặc mở lại được trang.')).toBeVisible();
  await expect(an.getByRole('button',{name:'Tạm dừng ngay'})).toHaveCount(0);
 }finally{await other.close();}
 // The owner reads the history; ⌘K (Ctrl+K) jumps to the search, which ignores accents.
 await tab(page,'cai-dat');
 const history=page.locator('[data-activity]');
 await expect(history.locator('[data-activity-row]')).toHaveCount(2);
 await page.keyboard.press('Control+k');
 await expect(history.locator('[data-activity-search]')).toBeFocused();
 await page.keyboard.type('thu ngan');
 await expect(history.locator('[data-activity-row]')).toHaveCount(1);
 await expect(history.locator('[data-activity-row]')).toHaveAttribute('data-activity-row','role.create');
 // Typing @ lists accounts, accents and case aside; picking one filters the history to that person.
 await history.locator('[data-activity-search]').fill('');await page.keyboard.type('@AN');
 await expect(history.locator('[data-mention]')).toHaveCount(1);await expect(history.locator('[data-mention]')).toHaveAttribute('data-mention','an.nv');
 await page.keyboard.press('Enter');
 await expect(history.locator('[data-mentions]')).toHaveCount(0);await expect(history.locator('[data-activity-search]')).toHaveValue('');
 await expect(history.getByText('Không có hoạt động nào khớp.')).toBeVisible();
 await page.setViewportSize({width:390,height:844});expect(await noSideScroll(page)).toBe(true);
 await page.screenshot({path:info.outputPath('activity-390.png'),fullPage:true});
 expect(errors).toEqual([]);
});

test('Cài đặt → Thanh toán shows the three plans, monthly and yearly, while a shop not yet billed has everything free',async({page,f})=>{
 await login(page,f.users[0]);await page.goto('/app/one/cai-dat?view=billing');
 await expect(page.getByText('Đang trong giai đoạn trải nghiệm — mọi thứ miễn phí')).toBeVisible();
 for(const price of ['50.000đ','70.000đ','120.000đ'])await expect(page.getByText(price,{exact:false})).toBeVisible();
 await page.getByRole('button',{name:/Theo năm/}).click();
 for(const price of ['500.000đ','700.000đ','1.200.000đ'])await expect(page.getByText(price,{exact:false})).toBeVisible();
});

test('H1: the giao diện chính works under its policy -- every tab, the page pictures, a page sheet -- and nothing is refused',async({page,f})=>{
 const refused:string[]=[];page.on('console',m=>{if(/Content.Security.Policy|Refused to/i.test(m.text()))refused.push(m.text());});
 await login(page,f.users[0]);
 const policy=(await page.request.get('/app/one')).headers()['content-security-policy']??'';
 expect(policy).toContain("frame-ancestors 'none'");expect(policy).toContain("'strict-dynamic'");
 for(const key of TAB_KEYS)await tab(page,key);
 // The Library frames each page's picture and each template's: framed by this app, so allowed.
 await tab(page,'library');await expect(page.frameLocator('iframe').first().locator('main.cv')).toBeVisible();
 // A page's sheet frames the page as guests see it. (next dev may reload the tab while it compiles a route: click again.)
 await expect(async()=>{await page.locator('[data-page] button').first().click();await expect(page.getByRole('dialog')).toBeVisible({timeout:2000});}).toPass({timeout:20_000});
 await expect(page.getByRole('dialog').frameLocator('iframe').locator('main.cv')).toBeVisible();
 expect(refused).toEqual([]);
});

test('unauthorized, expired, cross-shop and cross-origin requests are refused; the owner API rejects what it should',async({page,context,request,f})=>{
 await addExperience(f.db);const b=await addExperience(f.db,'two');
 expect((await request.get('/api/owner/v2/one')).status()).toBe(401);
 expect((await page.goto('/app/one'))!.url()).toContain('/owner/login?next=%2Fapp%2Fone');
 await login(page,f.users[0]);
 for(const path of ['/api/owner/v2/two','/api/owner/v2/two/export?format=csv','/api/owner/v2/two/export?format=jsonl','/api/owner/v2/two/export?format=dictionary']){const response=await context.request.get(path);expect(response.status()).toBe(403);expect(await response.text()).not.toContain('Private fixture');}
 // Another shop's giao diện chính does not open.
 await page.goto('/app/two');await expect(page.getByRole('heading',{name:'Không mở được'})).toBeVisible();
 const input={sessionId:b.session.sessionId,expectedCaseRevision:0,expectedExperienceRevision:'2',status:'resolved',note:'Attempt'};
 expect((await context.request.patch('/api/owner/v2/two',{headers:{Origin:origin},data:input})).status()).toBe(403);
 expect((await context.request.patch('/api/owner/v2/one',{headers:{Origin:origin},data:input})).status()).toBe(404);
 for(const path of ['/api/owner/v2/login','/api/owner/v2/logout'])expect((await context.request.post(path,{headers:{Origin:'https://invalid.example'},data:{}})).status()).toBe(403);
 expect((await context.request.patch('/api/owner/v2/one',{headers:{Origin:'https://invalid.example'},data:input})).status()).toBe(403);
 const records=(await (await context.request.get('/api/owner/v2/one')).json()).records;
 expect((await context.request.post('/api/owner/v2/one/comments',{headers:{Origin:origin},data:{sessionId:records[0].session_id,body:'   '}})).status()).toBe(400);
 expect((await context.request.post('/api/owner/v2/one/comments',{headers:{Origin:'https://invalid.example'},data:{sessionId:records[0].session_id,body:'x'}})).status()).toBe(403);
 expect((await context.request.get('/api/owner/v2/one?scope=test')).status()).toBe(400);
 expect((await context.request.get(`/api/owner/v2/one?source=${randomUUID()}`)).status()).toBe(200);
 expect((await context.request.get('/api/owner/v2/one/export?format=../bad')).status()).toBe(400);
 // An expired session: the API says so, and the frame sends the person to sign in again.
 const cookie=(await context.cookies()).find(c=>c.name==='nfc_owner_v2')!;
 await f.db.query("UPDATE owner_auth_sessions_v2 SET created_at=clock_timestamp()-interval '9 hours',expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",[sessionHash(cookie.value)]);
 expect((await context.request.get('/api/owner/v2/one/export')).status()).toBe(401);
 await page.goto('/app/one/data');await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
 // The cookie-era dashboard, the sample one and the old dashboard address are gone (lát A3, đợt ①).
 for(const path of ['/demo/dashboard','/api/owner/one'])expect((await context.request.get(path)).status(),path).toBe(404);
 expect(new URL((await context.request.get('/ZZZ/one',{maxRedirects:0})).headers()['location']??'http://x/',origin).pathname).toBe('/app/one');
});
