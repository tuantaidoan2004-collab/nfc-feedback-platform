import {test as base,expect,type Page} from '@playwright/test';
import {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {ownerFixture,addExperience} from '../repository-tests/owner-fixture';
import {sessionHash} from '../lib/owner/auth';
const uri=process.env.NFC_TEST_DATABASE_URL,schema=process.env.NFC_TEST_SCHEMA;
if(uri!=='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test'||!/^nfc_ui_test_[a-f0-9]{32}$/.test(schema??''))throw Error('Isolated harness required');
const test=base.extend<{f:Awaited<ReturnType<typeof ownerFixture>>}>({f:async({},provideFixture)=>{
 const db=new Pool({connectionString:uri,options:`-c search_path=${schema}`});
 try{await db.query('TRUNCATE owner_identities_v2,shops,template_versions,owner_login_limits CASCADE');await provideFixture(await ownerFixture(db));}finally{await db.end();}
}});
const origin='http://127.0.0.1:3317';
async function login(page:Page,user:{username:string;password:string},shop='one'){
 await page.goto(`/ZZZ/${shop}`);await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
 await page.getByLabel('Tài khoản',{exact:true}).fill(user.username);await page.getByLabel('Mật khẩu',{exact:true}).fill(user.password);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.locator('[data-kpi="visits"] [data-kpi-value]')).toBeVisible();
}
// The Data view loads nothing until a period is picked.
async function data(page:Page,period='7 ngày'){await page.locator('[data-view="data"]').click();await page.getByRole('button',{name:period,exact:true}).click();await expect(page.locator('[data-metric="opens"]')).toBeVisible();}
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});
test('Publishing v2 customer→owner login→real metrics/filter/handling/export, responsive and logout',async({page,context,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // Guest page v2: the stars are in the private card, and Send saves the star and then the text.
 await page.goto('/one');await expect(page.locator('main[data-ready]')).toBeVisible();await page.locator('#private-feedback').click({force:true});
 await page.getByRole('button',{name:'2 sao',exact:true}).click();await page.locator('#message').fill('=SUM(1,2)');await page.getByRole('button',{name:'Gửi góp ý',exact:true}).click();await expect(page.locator('[data-thanks]')).toBeVisible();
 await login(page,f.users[0]);
 // Overview: totals only, each card with its own period menu.
 await expect(page.locator('[data-kpi="visits"] [data-kpi-value]')).toHaveText('1');
 await expect(page.locator('[data-kpi="private"] [data-kpi-value]')).toHaveText('1');
 await expect(page.locator('[data-kpi="unresolved"] [data-kpi-value]')).toHaveText('1');
 await expect(page.locator('[data-kpi="google"]')).toContainText('Chưa kết nối Google');
 await page.getByRole('button',{name:'Đổi khoảng thời gian: Lượt truy cập',exact:true}).click();
 await page.getByRole('menuitemradio',{name:'30 ngày',exact:true}).click();
 await expect(page.locator('[data-kpi="visits"]')).toContainText('30 ngày');
 const cookie=(await context.cookies()).find(c=>c.name==='nfc_owner_v2')!;expect(cookie).toMatchObject({httpOnly:true,sameSite:'Strict'});expect(await page.evaluate(()=>document.cookie)).not.toContain(cookie.value);
 await expect(page.getByText('=SUM(1,2)',{exact:true})).toHaveCount(0);
 await data(page);
 for(const key of ['opens','sessions','rated','feedback','unresolved'])await expect(page.locator(`[data-metric="${key}"]`)).toHaveText('1');
 // A table row per response, the face instead of "2/5", and the customer's words right under it.
 const row=page.locator('[data-feedback-table] tr[data-row]');await expect(row).toHaveCount(1);
 await expect(row.getByRole('img',{name:'2 sao'})).toHaveText('😤');
 await expect(page.locator('[data-message-for]')).toContainText('=SUM(1,2)');
 await page.getByRole('button',{name:'Ghi chú',exact:true}).click();
 await page.getByRole('combobox',{name:'Trạng thái',exact:true}).selectOption('resolved');await page.getByRole('textbox',{name:'Ghi chú nội bộ',exact:true}).fill('Đã gọi lại');await page.getByRole('button',{name:'Lưu xử lý',exact:true}).click();
 await expect(page.getByRole('status')).toHaveText('Đã lưu xử lý.');await expect(page.locator('[data-metric="unresolved"]')).toHaveText('0');
 await expect(row.locator('[data-status="resolved"]')).toHaveText('Đã xử lý');
 expect((await f.db.query('SELECT count(*)::int n FROM owner_feedback_audit')).rows[0].n).toBe(1);
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'CSV',exact:true}).click();const file=await download;
 expect(file.suggestedFilename()).toBe('nfc-v1-experiences.csv');const text=await readFile((await file.path())!,'utf8');expect(text.startsWith('\uFEFF')).toBe(true);expect(text).toContain('"\'=SUM(1,2)"');expect(text).toContain('Đã gọi lại');
 const jsonl=await context.request.get('/api/owner/v2/one/export?format=jsonl&dataset=receipts');expect(jsonl.headers()['cache-control']).toContain('no-store');const events=(await jsonl.text()).trim().split('\n').map(x=>JSON.parse(x));expect(events).toHaveLength(2);expect(events[1].message).toBe('=SUM(1,2)');
 const dict=await context.request.get('/api/owner/v2/one/export?format=dictionary&dataset=receipts');expect((await dict.json()).fields.every((f:{meaning:string})=>f.meaning)).toBe(true);
 await page.getByRole('combobox',{name:'Cảm xúc',exact:true}).selectOption('5');await expect(page.locator('[data-metric="rated"]')).toHaveText('0');
 await page.getByRole('combobox',{name:'Cảm xúc',exact:true}).selectOption('');await expect(page.locator('[data-metric="rated"]')).toHaveText('1');
 for(const width of [390,1200]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`owner-${width}.png`),fullPage:true});}
 const headers=(await context.request.get('/ZZZ/one')).headers();// Next16 development overrides HTML caching; private data endpoints remain strictly no-store.
 expect(headers['cache-control']).toBe('no-cache, must-revalidate');expect(headers['x-frame-options']).toBe('DENY');
 await page.getByRole('button',{name:'Đăng xuất'}).click();await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
 expect((await context.request.get('/api/owner/v2/one')).status()).toBe(401);expect((await f.db.query('SELECT revoked_at FROM owner_auth_sessions_v2 WHERE token_hash=$1',[sessionHash(cookie.value)])).rows[0].revoked_at).not.toBeNull();
 expect(errors).toEqual([]);
});
test('the new shell: side menu views, week chart, data only on demand, and switching shop',async({page,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await addExperience(f.db,'one',5,'Góp ý hôm nay');await addExperience(f.db,'two',4,null);
 await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'manager')",[f.users[0].id,f.shops[1]]);
 const rows:string[]=[];page.on('request',r=>{if(/\/api\/owner\/v2\/one\?/.test(r.url()))rows.push(r.url());});
 await login(page,f.users[0]);
 await expect(page.getByText('NFC Feedback',{exact:true})).toBeVisible();
 await expect(page.locator('[data-view="home"]')).toHaveAttribute('aria-current','page');
 await expect(page.locator('[data-week] li')).toHaveCount(7);
 await expect(page.locator('[data-week] [data-opens]').last()).toHaveAttribute('data-opens','1');
 await page.locator('[data-view="design"]').click();
 await expect(page.locator('[data-design-editor]')).toBeVisible();await expect(page.locator('[data-week]')).toHaveCount(0);
 await page.locator('[data-view="settings"]').click();
 await expect(page.getByRole('region',{name:'Tài khoản'})).toContainText(f.users[0].username);
 await expect(page.locator('[data-support]')).toBeVisible();
 // Opening Data asks the server for nothing until a period is chosen.
 await page.locator('[data-view="data"]').click();
 await expect(page.locator('[data-feedback-table]')).toHaveCount(0);
 expect(rows).toEqual([]);
 await page.getByRole('button',{name:'Hôm nay',exact:true}).click();
 await expect(page.locator('[data-sources] [data-source="Trực tiếp"]')).toContainText('1');
 await expect(page.locator('[data-message-for]')).toContainText('Góp ý hôm nay');
 await expect(page.getByRole('img',{name:'5 sao'})).toHaveText('🤩');
 expect(rows).toHaveLength(1);
 for(const width of [390,1200]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`data-${width}.png`),fullPage:true});}
 // One account, two shops: switching goes to the other dashboard and shows its own totals.
 const picker=page.getByRole('combobox',{name:'Shop đang xem',exact:true});
 await expect(picker).toHaveValue('one');
 await picker.selectOption('two');
 await expect(page).toHaveURL(/\/ZZZ\/two$/);
 await expect(page.locator('[data-kpi="visits"] [data-kpi-value]')).toHaveText('1');
 await expect(page.getByText('Shop two',{exact:true}).first()).toBeVisible();
 for(const width of [390,1200]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`home-${width}.png`),fullPage:true});}
 expect(errors).toEqual([]);
});
test('the page editor: save, preview in a new tab, publish, and the customer page changes only after publishing',async({page,context,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // next dev reloads every open page the first time it compiles a route; compile /one and /preview before the editor holds state.
 const warm=await context.newPage();await warm.goto('/one');await warm.goto('/preview');await warm.close();
 await login(page,f.users[0]);
 await page.locator('[data-view="design"]').click();
 await expect(page.getByLabel('Tên hiển thị',{exact:true})).toHaveValue('Shop one');
 // Without R2 settings the editor says so instead of offering an upload that would fail.
 await expect(page.locator('[data-upload-off]').first()).toContainText('Tải lên cần bật kho lưu trữ R2');
 await page.getByLabel('Tên hiển thị',{exact:true}).fill('Quán Mới Sửa');
 await page.getByRole('radio',{name:'Dạng thẻ',exact:true}).check();
 const before=await page.locator('[data-link-row]').count();
 await page.getByRole('button',{name:'Thêm nút',exact:true}).click();
 const row=page.locator('[data-link-row]').last();
 await row.getByRole('combobox',{name:'Loại',exact:true}).selectOption('phone');
 await row.getByRole('textbox',{name:'Chữ trên nút',exact:true}).fill('Gọi quán');
 await row.getByRole('textbox',{name:/Số điện thoại/}).fill('tel:0901234567');
 await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();
 await expect(page.locator('[data-design-notice]')).toContainText('Đã lưu bản nháp. Khách chưa thấy');
 await expect(page.locator('[data-link-row]')).toHaveCount(before+1);
 // A bad link is refused by the server and nothing is saved.
 await row.getByRole('textbox',{name:/Số điện thoại/}).fill('0901234567');
 await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();
 await expect(page.locator('[data-design-notice]')).toContainText('Có ô chưa hợp lệ');
 await row.getByRole('textbox',{name:/Số điện thoại/}).fill('tel:0901234567');
 const popup=page.waitForEvent('popup');
 await page.getByRole('button',{name:'Xem trước',exact:true}).click();
 const preview=await popup;await preview.waitForURL('**/preview');
 await expect(preview.getByRole('heading',{name:'Quán Mới Sửa',exact:true})).toBeVisible();
 await expect(preview.locator('main')).toHaveAttribute('data-layout','card');
 await preview.close();
 const customer=await context.newPage();await customer.goto('/one');
 await expect(customer.getByRole('heading',{name:'Shop one',exact:true})).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Phát hành',exact:true}).click();
 await expect(page.locator('[data-design-notice]')).toContainText('Đã phát hành');
 await customer.reload();
 await expect(customer.getByRole('heading',{name:'Quán Mới Sửa',exact:true})).toBeVisible();
 await expect(customer.getByRole('link',{name:'Gọi quán'})).toHaveAttribute('href','tel:0901234567');
 for(const width of [390,1200]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`design-${width}.png`),fullPage:true});}
 expect(errors).toEqual([]);
});
test('cards: nhân bản thẻ, see the fee before switching on, the card opens the page, off closes it',async({page,context,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const warm=await context.newPage();await warm.goto('/t/demo');await warm.goto('/t/zzzzz');await warm.close();
 await login(page,f.users[0]);
 await page.locator('[data-view="design"]').click();
 const panel=page.locator('[data-cards]');
 await expect(panel.locator('[data-card-fee]')).toContainText('Đang hoạt động: 0 thẻ');
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
 expect(asked).toContain('nằm trong 5 thẻ đã gồm trong gói');
 await expect(panel.locator('[data-card-fee]')).toContainText('Đang hoạt động: 1 thẻ');
 await customer.reload();await expect(customer.locator('main[data-ready]')).toBeVisible();
 await expect(customer.getByRole('heading',{name:'Shop one',exact:true})).toBeVisible();
 page.once('dialog',dialog=>void dialog.accept());
 await row.getByRole('button',{name:'Tạm tắt',exact:true}).click();
 await expect(row.locator('[data-card-state]')).toHaveText('Đã tắt');
 await customer.reload();await expect(customer.getByRole('heading',{name:'Trang chưa sẵn sàng'})).toBeVisible();
 await expect(row.getByRole('button',{name:'Bật lại',exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await panel.screenshot({path:info.outputPath('cards-390.png')});
 expect(errors).toEqual([]);
});
test('password: change it in Settings, the old one stops working, the new one signs in; other origins refused',async({page,context,f})=>{
 const a=f.users[0],next='the-new-shop-password';
 const other=await context.browser()!.newContext({baseURL:origin});
 try{
  const second=await other.newPage();await login(second,a);
  await login(page,a);
  await page.locator('[data-view="settings"]').click();
  const form=page.locator('[data-password-form]');
  await form.getByLabel('Mật khẩu hiện tại',{exact:true}).fill('not-the-password');
  await form.getByLabel('Mật khẩu mới (ít nhất 12 ký tự)',{exact:true}).fill(next);
  await form.getByLabel('Nhập lại mật khẩu mới',{exact:true}).fill(next);
  await form.getByRole('button',{name:'Đổi mật khẩu',exact:true}).click();
  await expect(form.locator('[data-password-notice]')).toHaveText('Mật khẩu hiện tại chưa đúng.');
  await form.getByLabel('Mật khẩu hiện tại',{exact:true}).fill(a.password);
  await form.getByRole('button',{name:'Đổi mật khẩu',exact:true}).click();
  await expect(form.locator('[data-password-notice]')).toContainText('Đã đổi mật khẩu');
  // The other browser is signed out; this one keeps working.
  expect((await second.request.get('/api/owner/v2/one/summary')).status()).toBe(401);
  expect((await page.request.get('/api/owner/v2/one/summary')).status()).toBe(200);
  expect((await page.request.put('/api/owner/v2/password',{headers:{Origin:'https://invalid.example'},data:{current:next,next:'another-long-password'}})).status()).toBe(403);
  await page.getByRole('button',{name:'Đăng xuất'}).click();await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
  await page.getByLabel('Tài khoản',{exact:true}).fill(a.username);await page.getByLabel('Mật khẩu',{exact:true}).fill(a.password);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.getByText('Không thể đăng nhập',{exact:false})).toBeVisible();
  await login(page,{username:a.username,password:next});
 }finally{await other.close();}
});
test('unauthorized/expired/revoked/cross-shop read write export and origin protections',async({page,context,request,f})=>{
 await addExperience(f.db);const b=await addExperience(f.db,'two');
 expect((await request.get('/api/owner/v2/one')).status()).toBe(401);
 await login(page,f.users[0]);
 for(const path of ['/api/owner/v2/two','/api/owner/v2/two/export?format=csv','/api/owner/v2/two/export?format=jsonl','/api/owner/v2/two/export?format=dictionary']){const response=await context.request.get(path);expect(response.status()).toBe(403);expect(await response.text()).not.toContain('Private fixture');}
 const input={sessionId:b.session.sessionId,expectedCaseRevision:0,expectedExperienceRevision:'2',status:'resolved',note:'Attempt'};
 expect((await context.request.patch('/api/owner/v2/two',{headers:{Origin:origin},data:input})).status()).toBe(403);
 expect((await context.request.patch('/api/owner/v2/one',{headers:{Origin:origin},data:input})).status()).toBe(404);
 for(const path of ['/api/owner/v2/login','/api/owner/v2/logout'])expect((await context.request.post(path,{headers:{Origin:'https://invalid.example'},data:{}})).status()).toBe(403);
 expect((await context.request.patch('/api/owner/v2/one',{headers:{Origin:'https://invalid.example'},data:input})).status()).toBe(403);
 const cookie=(await context.cookies()).find(c=>c.name==='nfc_owner_v2')!;
 await f.db.query("UPDATE owner_auth_sessions_v2 SET created_at=clock_timestamp()-interval '9 hours',expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",[sessionHash(cookie.value)]);
 await page.locator('[data-view="data"]').click();await page.getByRole('button',{name:'7 ngày',exact:true}).click();await expect(page.getByRole('link',{name:'Đăng nhập lại'})).toBeVisible();expect((await context.request.get('/api/owner/v2/one/export')).status()).toBe(401);
 await page.goto('/ZZZ/one');await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
 await page.goto('/t/demo');await expect(page.getByRole('button',{name:'5 sao',exact:true})).toBeEnabled();await page.goto('/demo/dashboard');await expect(page.getByRole('heading').first()).toBeVisible();
});
test('concurrent handling gives conflict, reloads latest record, preserves customer revision history',async({page,context,f})=>{
 await addExperience(f.db);await login(page,f.users[0]);
 // The page holds the row first; then another operator saves over it.
 await data(page);
 const records=(await (await context.request.get('/api/owner/v2/one')).json()).records;
 const row=records[0];await context.request.patch('/api/owner/v2/one',{headers:{Origin:origin},data:{sessionId:row.session_id,expectedCaseRevision:0,expectedExperienceRevision:'2',status:'progress',note:'Another operator'}});
 await page.getByRole('button',{name:/^Ghi chú/}).click();
 await page.getByRole('textbox',{name:'Ghi chú nội bộ',exact:true}).fill('Stale draft');await page.getByRole('button',{name:'Lưu xử lý',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('đã thay đổi');await expect(page.getByRole('textbox',{name:'Ghi chú nội bộ',exact:true})).toHaveValue('Another operator');
 expect((await f.db.query('SELECT revision::text FROM rating_experiences')).rows[0].revision).toBe('2');expect((await f.db.query('SELECT count(*)::int n FROM rating_intent_receipts')).rows[0].n).toBe(2);
 expect((await context.request.get('/api/owner/v2/one?scope=test')).status()).toBe(400);
 expect((await context.request.get(`/api/owner/v2/one?source=${randomUUID()}`)).status()).toBe(200);
 expect((await context.request.get('/api/owner/v2/one/export?format=../bad')).status()).toBe(400);
});
