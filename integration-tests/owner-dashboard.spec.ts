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
 * editor since 05/10: a template is published as it is, or the admin edits it (Nhờ admin sửa). A signed-out visit goes to the sign-in page and comes back to the shop after.
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
test.beforeEach(async({request})=>{for(const api of ['team','activity','cards','pages','overview','summary','pulse','google-business','design'])await request.get(`/api/owner/v2/warm/${api}`);
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
 await item.getByRole('button').first().click();
 await expect(item.getByRole('link',{name:'0961036265'})).toHaveAttribute('href','tel:0961036265');
 await item.getByLabel('Trạng thái').selectOption('resolved');await item.getByLabel(/Ghi chú nội bộ/).fill('Đã gọi lại, khách đồng ý quay lại');
 await item.getByRole('button',{name:'Lưu',exact:true}).click();await expect(item.getByRole('status')).toHaveText('Đã lưu.');
 await expect(item).toContainText('Đã xong');
 expect((await f.db.query('SELECT status,note FROM owner_feedback_cases')).rows).toEqual([{status:'resolved',note:'Đã gọi lại, khách đồng ý quay lại'}]);
 // One inbox, two sources: Google alone hides the private one.
 await page.getByRole('button',{name:'Google',exact:true}).click();await expect(page.locator('[data-item="private"]')).toHaveCount(0);
 await page.getByRole('button',{name:'Tất cả',exact:true}).click();await expect(page.locator('[data-item="private"]')).toHaveCount(1);
 for(const width of [390,1200]){await page.setViewportSize({width,height:844});expect(await noSideScroll(page)).toBe(true);await page.screenshot({path:info.outputPath(`data-${width}.png`),fullPage:true});}
 // The shop's data leaves as files; a formula a guest typed stays text in the spreadsheet.
 const csv=await (await context.request.get('/api/owner/v2/one/export?format=csv')).text();expect(csv.startsWith('﻿')).toBe(true);expect(csv).toContain('"\'=SUM(1,2)"');
 const jsonl=await context.request.get('/api/owner/v2/one/export?format=jsonl&dataset=receipts');expect(jsonl.headers()['cache-control']).toContain('no-store');
 const events=(await jsonl.text()).trim().split('\n').map(x=>JSON.parse(x));expect(events).toHaveLength(2);expect(events[1].message).toBe('=SUM(1,2)');
 const dict=await context.request.get('/api/owner/v2/one/export?format=dictionary&dataset=receipts');expect((await dict.json()).fields.every((x:{meaning:string})=>x.meaning)).toBe(true);
 expect(errors).toEqual([]);
});

test('Library → a template → Phát hành luôn puts a new page live; Nhờ admin sửa leaves another waiting for the admin',async({page,context,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // next dev reloads every open page the first time it compiles a route; compile the guest page and the templates first.
 const warm=await context.newPage();await warm.goto('/one');await warm.goto('/templates/party?anh=1');await warm.goto('/templates/basic-1?ten=x');await warm.close();
 await page.setViewportSize({width:1280,height:900});
 await login(page,f.users[0]);await tab(page,'library');
 // Home: the shop's one page, as a picture.
 await expect(page.locator('[data-page]')).toHaveCount(1);
 await page.getByRole('button',{name:'Template',exact:true}).click();
 await expect(page.locator('[data-template]')).toHaveCount(10);
 await page.getByLabel('Tìm template').fill('party');await expect(page.locator('[data-template]')).toHaveCount(1);
 await page.getByRole('button',{name:'Xem mẫu Interactive card · Party'}).click();
 // The template in a phone with the shop's name, and the two ways on.
 const sheet=page.getByRole('dialog',{name:'Mẫu Interactive card · Party'});
 await expect(sheet.frameLocator('iframe').locator('main.cv')).toBeVisible();
 await page.screenshot({path:info.outputPath('template-1280.png')});
 await sheet.getByRole('button',{name:/Phát hành luôn/}).click();
 await expect(sheet.locator('[data-done="live"]')).toBeVisible({timeout:20_000});
 const made=async()=>(await f.db.query(`SELECT p.slug,p.state FROM pages p JOIN shops s ON s.id=p.shop_id WHERE s.slug='one' AND p.slug<>'one' ORDER BY p.created_at`)).rows;
 const [live]=await made();expect(live.state).toBe('active');
 // Live for guests at once, with the shop's Google button; the template itself never changed.
 const guest=await context.newPage();await guest.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await guest.goto(`/${live.slug}`);await expect(guest.locator('main[data-ready]')).toBeVisible();
 expect(await (await page.request.get(`/${live.slug}`)).text()).toContain('data-google');
 await sheet.getByRole('button',{name:'Xong',exact:true}).click();await expect(sheet).toHaveCount(0);
 // Another template, for the admin to edit: a draft with the owner's words, nothing live, until the admin publishes it.
 await page.getByLabel('Tìm template').fill('basic 1');
 await page.getByRole('button',{name:'Xem mẫu Basic 1'}).click();
 const second=page.getByRole('dialog',{name:'Mẫu Basic 1'});
 await second.getByRole('button',{name:/Nhờ admin sửa/}).click();
 await second.getByLabel(/Bạn muốn sửa gì/).fill('Thay ảnh bìa bằng ảnh quán');
 await second.getByRole('button',{name:/Gửi yêu cầu/}).click();
 await expect(second.locator('[data-done="edit"]')).toBeVisible({timeout:20_000});
 const [,waiting]=await made();expect(waiting.state).toBe('draft');
 expect((await f.db.query('SELECT e.message,e.handled_at FROM edit_requests e JOIN pages p ON p.id=e.page_id WHERE p.slug=$1',[waiting.slug])).rows)
  .toEqual([{message:'Thay ảnh bìa bằng ảnh quán',handled_at:null}]);
 expect(await (await page.request.get(`/${waiting.slug}`)).text()).not.toContain('data-google');
 // My Card: the three pages, each with what it is doing now.
 await tab(page,'my-card');await expect(page.locator('[data-my-card]')).toHaveCount(3);
 await expect(page.locator(`[data-my-card="${live.slug}"] [data-page-state]`)).toHaveText('Đang chạy');
 await expect(page.locator(`[data-my-card="${waiting.slug}"] [data-page-state]`)).toHaveText('Chờ admin sửa');
 // Opened again, the waiting page takes more words for the admin rather than a second request.
 await page.locator(`[data-my-card="${waiting.slug}"]`).getByRole('button',{name:'Gửi thêm ý cho admin'}).click();
 await expect(page.getByRole('dialog').getByText('Bạn đã nhắn: “Thay ảnh bìa bằng ảnh quán”')).toBeVisible();
 // The sheet on a phone.
 await page.setViewportSize({width:390,height:844});expect(await noSideScroll(page)).toBe(true);
 await page.screenshot({path:info.outputPath('page-sheet-390.png')});
 expect(errors).toEqual([]);
});

test('a shop that signed itself up sends its first page to Quite Sensational instead of publishing it',async({page})=>{
 const db=new Pool({connectionString:uri,options:`-c search_path=${schema}`});
 try{
  const made=await new AccountSignup(db).create({username:'tu-dang-ky',email:'tu-dang-ky@example.test',password:'a-long-test-password'},null);
  await db.query('UPDATE shops SET onboarded_at=clock_timestamp() WHERE slug=$1',[made.slug]);
  await page.setViewportSize({width:1280,height:900});
  await login(page,{username:'tu-dang-ky',password:'a-long-test-password'},made.slug);
  await tab(page,'library',made.slug);await page.getByRole('button',{name:'Template',exact:true}).click();
  await page.getByRole('button',{name:'Xem mẫu Basic 1'}).click();
  const sheet=page.getByRole('dialog',{name:'Mẫu Basic 1'});
  // Creating the page and sending it: a few seconds on a CI runner, which ran this suite three times slower than a Mac.
  await sheet.getByRole('button',{name:/Phát hành luôn/}).click();
  await expect(sheet.locator('[data-done="review"]')).toBeVisible({timeout:20_000});
  const rows=(await db.query("SELECT r.state,p.slug,p.state page_state FROM publish_reviews r JOIN pages p ON p.id=r.page_id")).rows;
  expect(rows).toEqual([{state:'pending',slug:expect.any(String),page_state:'draft'}]);
  expect(await (await page.request.get(`/${rows[0].slug}`)).text()).not.toContain('data-google');
  await tab(page,'my-card',made.slug);
  await expect(page.locator(`[data-my-card="${rows[0].slug}"] [data-page-state]`)).toHaveText('Chờ duyệt lần đầu');
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

test('Cài đặt → Thanh toán shows the two plans, monthly and yearly, while everything is free in the trial',async({page,f})=>{
 await login(page,f.users[0]);await page.goto('/app/one/cai-dat?view=billing');
 await expect(page.getByText('Đang trong giai đoạn trải nghiệm — mọi thứ miễn phí')).toBeVisible();
 await expect(page.getByText('100.000đ',{exact:false})).toBeVisible();await expect(page.getByText('120.000đ',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:/Theo năm/}).click();
 await expect(page.getByText('1.000.000đ',{exact:false})).toBeVisible();await expect(page.getByText('1.200.000đ',{exact:false})).toBeVisible();
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
