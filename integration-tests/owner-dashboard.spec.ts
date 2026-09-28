import {test as base,expect,type Page} from '@playwright/test';
import {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {ownerFixture,addExperience} from '../repository-tests/owner-fixture';
import {sessionHash} from '../lib/owner/auth';
import {OwnerTeam} from '../lib/owner/team';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
const uri=process.env.NFC_TEST_DATABASE_URL,schema=process.env.NFC_TEST_SCHEMA;
if(uri!=='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test'||!/^nfc_ui_test_[a-f0-9]{32}$/.test(schema??''))throw Error('Isolated harness required');
const test=base.extend<{f:Awaited<ReturnType<typeof ownerFixture>>}>({f:async({},provideFixture)=>{
 const db=new Pool({connectionString:uri,options:`-c search_path=${schema}`});
 try{await db.query('TRUNCATE owner_identities_v2,shops,template_versions,owner_login_limits CASCADE');await provideFixture(await ownerFixture(db));}finally{await db.end();}
}});
const origin='http://127.0.0.1:3317';
// Lát S1: at a phone's width (this suite's default) Hoạt động, Cài đặt, Hồ sơ and sign-out sit behind "Thêm", as a person
// reaches them; these open it first when needed.
async function openView(page:Page,view:string){const button=page.locator(`[data-view="${view}"]`);if(!(await button.isVisible()))await page.locator('[data-more-button]').click();await button.click();}
async function signOut(page:Page){const button=page.getByRole('button',{name:'Đăng xuất'});if(!(await button.isVisible()))await page.locator('[data-more-button]').click();await button.click();}
async function login(page:Page,user:{username:string;password:string},shop='one'){
 await page.goto(`/ZZZ/${shop}`);await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
 await page.getByLabel('@handle hoặc email',{exact:true}).fill(user.username);await page.getByLabel('Mật khẩu',{exact:true}).fill(user.password);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.locator('[data-kpi="visits"] [data-kpi-value]')).toBeVisible();
}
// The Data view loads nothing until a period is picked.
async function data(page:Page,period='7 ngày'){await page.locator('[data-view="data"]').click();await page.getByRole('button',{name:period,exact:true}).click();await expect(page.locator('[data-metric="opens"]')).toBeVisible();}
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});
// next dev compiles an API on its first call and reloads every open page (operations-gotchas.md): compile the ones the
// dashboard calls after it has opened before any page exists. The answers (401 without a session) do not matter.
test.beforeEach(async({request})=>{for(const api of ['team','activity','comments?session=x','cards','pages'])await request.get(`/api/owner/v2/warm/${api}`);for(const api of ['profile','notifications'])await request.get(`/api/owner/v2/${api}`);});
test('Publishing v2 customer→owner login→real metrics/filter/handling/export, responsive and logout',async({page,context,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // Guest page v2: the stars are in the private card, and Send saves the star and then the text.
 await page.goto('/one');await expect(page.locator('main[data-ready]')).toBeVisible();await page.locator('#private-feedback').click({force:true});
 await page.getByRole('button',{name:'2 sao',exact:true}).click();await page.locator('#message').fill('=SUM(1,2)');await page.getByRole('button',{name:'Gửi góp ý',exact:true}).click();await expect(page.locator('[data-thanks]')).toBeVisible();
 await login(page,f.users[0]);
 // Overview: totals only, each card with its own period menu.
 await expect(page.locator('[data-kpi="visits"] [data-kpi-value]')).toHaveText('1');
 await expect(page.locator('[data-kpi="private"] [data-kpi-value]')).toHaveText('1');
 // No processing status since lát F4: the "not handled" card is gone.
 await expect(page.locator('[data-kpi="unresolved"]')).toHaveCount(0);
 await expect(page.locator('[data-kpi="google"]')).toContainText('Chưa kết nối Google');
 await page.getByRole('button',{name:'Đổi khoảng thời gian: Lượt truy cập',exact:true}).click();
 await page.getByRole('menuitemradio',{name:'30 ngày',exact:true}).click();
 await expect(page.locator('[data-kpi="visits"]')).toContainText('30 ngày');
 const cookie=(await context.cookies()).find(c=>c.name==='nfc_owner_v2')!;expect(cookie).toMatchObject({httpOnly:true,sameSite:'Strict'});expect(await page.evaluate(()=>document.cookie)).not.toContain(cookie.value);
 await expect(page.getByText('=SUM(1,2)',{exact:true})).toHaveCount(0);
 await data(page);
 for(const key of ['opens','sessions','rated','feedback'])await expect(page.locator(`[data-metric="${key}"]`)).toHaveText('1');
 await expect(page.locator('[data-metric="unresolved"]')).toHaveCount(0);await expect(page.getByRole('combobox',{name:'Xử lý'})).toHaveCount(0);
 // A comment thread per response, as on YouTube: the face as the picture, the kind and relative time, ⓘ for details.
 const row=page.locator('[data-feedback-threads] [data-row]');await expect(row).toHaveCount(1);
 await expect(row.getByRole('img',{name:'2 sao'})).toHaveText('😤');
 await expect(row.locator('[data-kind]')).toHaveText('Riêng tư');await expect(row.locator('time').first()).toHaveText(/giây trước|phút trước/);
 await expect(page.locator('[data-message-for]')).toContainText('=SUM(1,2)');
 await row.locator('[data-info-button]').click();await expect(row.locator('[data-info]')).toContainText('Lúc');await expect(row.locator('[data-info]')).toContainText('Trực tiếp');
 // A reply: written, liked, edited (marked as such, the old text kept), pinned.
 await row.locator('[data-reply]').click();
 await row.getByLabel('Phản hồi nội bộ',{exact:true}).fill('Đã gọi lại');await row.locator('[data-composer]').getByRole('button',{name:'Phản hồi'}).click();
 const reply=row.locator('[data-comment]');await expect(reply).toHaveCount(1);
 await expect(row.locator('[data-replies-toggle]')).toHaveText(/1 phản hồi/);
 await expect(reply.locator('[data-comment-author]')).toHaveText(`@${f.users[0].username}`);await expect(reply.locator('[data-comment-body]')).toHaveText('Đã gọi lại');
 await reply.locator('[data-like]').click();await expect(row.locator('[data-comment] [data-like]')).toHaveAttribute('aria-pressed','true');await expect(row.locator('[data-comment] [data-like]')).toHaveText('1');
 await row.locator('[data-comment]').getByRole('button',{name:'Thêm thao tác'}).click();await row.getByRole('menuitem',{name:'Sửa'}).click();
 await row.getByLabel('Sửa phản hồi',{exact:true}).fill('Đã gọi lại, khách đồng ý quay lại');await row.locator('[data-comment] [data-composer]').getByRole('button',{name:'Phản hồi'}).click();
 await expect(row.locator('[data-comment]')).toContainText('(đã chỉnh sửa)');await expect(row.locator('[data-comment-body]')).toHaveText('Đã gọi lại, khách đồng ý quay lại');
 await row.locator('[data-comment]').getByRole('button',{name:'Thêm thao tác'}).click();await row.getByRole('menuitem',{name:'Ghim'}).click();
 await expect(row.locator('[data-comment]')).toContainText('📌 Đã ghim');
 await row.locator('[data-info-button]').click();await expect(row.locator('[data-info]')).toHaveCount(0);
 await row.screenshot({path:info.outputPath('thread-1200.png')});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await row.screenshot({path:info.outputPath('thread-390.png')});await page.setViewportSize({width:1200,height:844});
 expect((await f.db.query('SELECT count(*)::int n FROM feedback_comment_revisions')).rows[0].n).toBe(1);
 expect((await f.db.query("SELECT action FROM shop_activity WHERE action LIKE 'comment.%' ORDER BY id")).rows.map(r=>r.action)).toEqual(['comment.create','comment.edit','comment.pin']);
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'CSV',exact:true}).click();const file=await download;
 expect(file.suggestedFilename()).toBe('nfc-v1-experiences.csv');const text=await readFile((await file.path())!,'utf8');expect(text.startsWith('\uFEFF')).toBe(true);expect(text).toContain('"\'=SUM(1,2)"');
 // The replies are the shop's data too: they leave in their own file (lát F4).
 const replies=await (await context.request.get('/api/owner/v2/one/export?format=csv&dataset=comments')).text();expect(replies).toContain('Đã gọi lại, khách đồng ý quay lại');expect(replies).toContain(f.users[0].username);
 const jsonl=await context.request.get('/api/owner/v2/one/export?format=jsonl&dataset=receipts');expect(jsonl.headers()['cache-control']).toContain('no-store');const events=(await jsonl.text()).trim().split('\n').map(x=>JSON.parse(x));expect(events).toHaveLength(2);expect(events[1].message).toBe('=SUM(1,2)');
 const dict=await context.request.get('/api/owner/v2/one/export?format=dictionary&dataset=receipts');expect((await dict.json()).fields.every((f:{meaning:string})=>f.meaning)).toBe(true);
 await page.getByRole('combobox',{name:'Cảm xúc',exact:true}).selectOption('5');await expect(page.locator('[data-metric="rated"]')).toHaveText('0');
 await page.getByRole('combobox',{name:'Cảm xúc',exact:true}).selectOption('');await expect(page.locator('[data-metric="rated"]')).toHaveText('1');
 for(const width of [390,1200]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`owner-${width}.png`),fullPage:true});}
 const headers=(await context.request.get('/ZZZ/one')).headers();// Next16 development overrides HTML caching; private data endpoints remain strictly no-store.
 expect(headers['cache-control']).toBe('no-cache, must-revalidate');expect(headers['x-frame-options']).toBe('DENY');
 await signOut(page);await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
 expect((await context.request.get('/api/owner/v2/one')).status()).toBe(401);expect((await f.db.query('SELECT revoked_at FROM owner_auth_sessions_v2 WHERE token_hash=$1',[sessionHash(cookie.value)])).rows[0].revoked_at).not.toBeNull();
 expect(errors).toEqual([]);
});
// Lát S1 (audit A3, A4): each view has its own address and Back returns to the last one; on a phone the navigation is a
// bar at the bottom of the screen whose "Thêm" holds the rest, sign-out included; the theme chosen survives a reload.
test('views have addresses, Back returns to the last one, a phone gets a bottom bar, and the theme is remembered',async({page,f})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await login(page,f.users[0]);
 await page.locator('[data-view="data"]').click();await expect(page).toHaveURL(/\?view=data$/);
 await openView(page,'settings');await expect(page).toHaveURL(/\?view=settings$/);
 await page.goBack();await expect(page.locator('[data-view="data"]')).toHaveAttribute('aria-current','page');
 await page.goBack();await expect(page.locator('[data-view="home"]')).toHaveAttribute('aria-current','page');
 await expect(page.locator('[data-kpi="visits"]')).toBeVisible();
 // A link straight to a view opens that view.
 await page.goto('/ZZZ/one?view=settings');await expect(page.locator('[data-view="settings"]')).toHaveAttribute('aria-current','page');
 await expect(page.locator('[data-support]')).toBeVisible();
 // A phone: the bar sits at the bottom, every target in it at least 44px; the rest opens from "Thêm" and closes on choosing.
 await page.setViewportSize({width:390,height:844});
 const nav=page.getByRole('navigation',{name:'Phần của dashboard'});
 const bar=(await nav.boundingBox())!;expect(bar.y+bar.height).toBeGreaterThan(840);
 const targets=nav.locator('[data-view="home"], [data-view="data"], [data-view="design"], [data-more-button]');
 await expect(targets).toHaveCount(4);
 for(const box of await targets.evaluateAll(els=>els.map(el=>el.getBoundingClientRect()).map(r=>[r.width,r.height])))expect(Math.min(...box)).toBeGreaterThanOrEqual(44);
 await expect(page.locator('[data-view="activity"]')).toBeHidden();
 await page.locator('[data-more-button]').click();
 await expect(page.locator('[data-view="profile"]')).toBeVisible();await expect(page.getByRole('button',{name:'Đăng xuất'})).toBeVisible();
 await openView(page,'profile');
 await expect(page).toHaveURL(/\?view=profile$/);await expect(page.locator('[data-view="profile"]')).toBeHidden();
 await expect(page.locator('[data-more-button]')).toHaveAttribute('data-active','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 // Daylight, chosen by hand, is still daylight after a reload: the server paints it from the cookie.
 await page.locator('[data-more-button]').click();await page.locator('[data-theme-choice="light"]').click();
 await expect(page.locator('.platform')).toHaveAttribute('data-theme','light');
 await page.reload();await expect(page.locator('.platform')).toHaveAttribute('data-theme','light');
 await expect(page.locator('[data-view="profile"]')).toHaveAttribute('aria-current','page');
 expect(errors).toEqual([]);
});
test('the new shell: side menu views, week chart, data only on demand, and switching shop',async({page,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await addExperience(f.db,'one',5,'Góp ý hôm nay');await addExperience(f.db,'two',4,null);
 await f.db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'manager')",[f.users[0].id,f.shops[1]]);
 const rows:string[]=[];page.on('request',r=>{if(/\/api\/owner\/v2\/one\?/.test(r.url()))rows.push(r.url());});
 await login(page,f.users[0]);
 await expect(page.locator('[data-brand]')).toContainText('Quite Sensational');
 await expect(page.locator('[data-view="home"]')).toHaveAttribute('aria-current','page');
 await expect(page.locator('[data-week] li')).toHaveCount(7);
 await expect(page.locator('[data-week] [data-opens]').last()).toHaveAttribute('data-opens','1');
 await page.locator('[data-view="design"]').click();
 await expect(page.locator('[data-design-editor]')).toBeVisible();await expect(page.locator('[data-week]')).toHaveCount(0);
 // Which template version the draft and the live page wear (versions.ts): here both are version 1.
 await expect(page.locator('[data-template-state]')).toContainText('bản nháp dùng bản 1, trang khách cũng đang chạy bản này.');
 await openView(page,'settings');
 await expect(page.getByRole('region',{name:'Tài khoản'})).toContainText(f.users[0].username);
 await expect(page.locator('[data-support]')).toBeVisible();
 // Opening Data asks the server for nothing until a period is chosen.
 await page.locator('[data-view="data"]').click();
 await expect(page.locator('[data-feedback-threads]')).toHaveCount(0);
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
// Lát M3: the owner switches a block of the page off and on in the editor; guests see it only after publishing.
test('the editor switches the poster block off and on, and the guest page follows once published',async({page,context,f})=>{
 // Publishing asks "Phát hành bản này?"; the owner says yes.
 page.on('dialog',dialog=>void dialog.accept());
 const warm=await context.newPage();await warm.goto('/one');await warm.close();
 await login(page,f.users[0]);
 await page.locator('[data-view="design"]').click();
 const poster=page.locator('[data-section="poster"] [data-section-visible]');
 await expect(poster).toBeChecked();await expect(page.locator('[data-section="links"] [data-section-visible]')).toBeChecked();
 await poster.uncheck();
 await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();await expect(page.locator('[data-design-notice]')).toContainText('Đã lưu bản nháp');
 const guest=await context.newPage();await guest.goto('/one');await expect(guest.locator('main[data-ready]')).toBeVisible();
 await expect(guest.locator('.guest-poster')).toHaveCount(1);
 await page.getByRole('button',{name:'Phát hành',exact:true}).click();await expect(page.locator('[data-design-notice]')).toContainText('Đã phát hành');
 await guest.reload();await expect(guest.locator('main[data-ready]')).toBeVisible();
 await expect(guest.locator('.guest-poster')).toHaveCount(0);await expect(guest.locator('[data-google]')).toBeInViewport();
 await poster.check();
 await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();await expect(page.locator('[data-design-notice]')).toContainText('Đã lưu bản nháp');
 await page.getByRole('button',{name:'Phát hành',exact:true}).click();await expect(page.locator('[data-design-notice]')).toContainText('Đã phát hành');
 await guest.reload();await expect(guest.locator('.guest-poster')).toHaveCount(1);
});

test('M2b: the shop writes its own thank-you line; it publishes only once approved, and the guest reads it before Google',async({page,context,f})=>{
 page.on('dialog',dialog=>void dialog.accept());
 // The fixture's template has no thank-you card; template 1 has (manifest effects.thankYouSeconds).
 const revision=Number((await f.db.query('SELECT revision FROM page_drafts WHERE page_id=$1',[f.pages[0].pageId])).rows[0].revision);
 const moved=await f.admin.changeTemplate(f.pages[0],revision,'standard');await f.admin.publish(f.pages[0],moved.revision);
 const warm=await context.newPage();await warm.goto('/one');await warm.close();
 await login(page,f.users[0]);
 await page.locator('[data-view="design"]').click();
 const box=page.locator('[data-thanks-editor]'),state=box.locator('[data-thanks-state]');
 await expect(state).toHaveAttribute('data-thanks-state','default');
 // A line that asks for stars never saves (google-policy.md luật 3, 7).
 await box.getByLabel('Tiếng Việt',{exact:true}).fill('Cho quán 5 sao nhé!');
 await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();
 await expect(page.locator('[data-design-notice]')).toContainText('không được nhắc sao');
 await box.getByLabel('Tiếng Việt',{exact:true}).fill('Cảm ơn bạn đã ghé Shop one, hẹn gặp lại!');
 await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();await expect(page.locator('[data-design-notice]')).toContainText('Đã lưu bản nháp');
 await expect(state).toHaveAttribute('data-thanks-state','pending');
 expect((await f.db.query("SELECT text_vi,text_en,state FROM text_reviews")).rows).toEqual([{text_vi:'Cảm ơn bạn đã ghé Shop one, hẹn gặp lại!',text_en:'Thank you for stopping by!',state:'pending'}]);
 // Waiting words do not publish, and the live page keeps the platform's line meanwhile.
 await page.getByRole('button',{name:'Phát hành',exact:true}).click();
 await expect(page.locator('[data-design-notice]')).toContainText('đang chờ nền tảng duyệt');
 const guest=await context.newPage();await guest.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const thanksOnTap=async()=>{await guest.goto('/one');await expect(guest.locator('main[data-ready]')).toBeVisible();
  await guest.locator('[data-google]').click();const title=guest.locator('.thanks-title');await expect(title).toBeVisible();return title.textContent();};
 expect(await thanksOnTap()).toBe('Cảm ơn quý khách đã ghé!');
 // Approved (in /gov; admin-http.spec.ts drives that screen), it publishes, and the guest reads it.
 await f.db.query("UPDATE text_reviews SET state='approved',reviewed_at=clock_timestamp()");
 await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();await expect(state).toHaveAttribute('data-thanks-state','approved');
 await page.getByRole('button',{name:'Phát hành',exact:true}).click();await expect(page.locator('[data-design-notice]')).toContainText('Đã phát hành');
 expect(await thanksOnTap()).toBe('Cảm ơn bạn đã ghé Shop one, hẹn gặp lại!');
 // The platform's line comes back with one button, and needs no review.
 await box.getByRole('button',{name:'Dùng lại lời mặc định'}).click();await expect(state).toHaveAttribute('data-thanks-state','default');
 await page.getByRole('button',{name:'Phát hành',exact:true}).click();await expect(page.locator('[data-design-notice]')).toContainText('Đã phát hành');
 expect(await thanksOnTap()).toBe('Cảm ơn quý khách đã ghé!');
});

test('P5b-lite: the owner reads what a month costs, how far the shop has paid, and how to pay',async({page,f})=>{
 await login(page,f.users[0]);
 await openView(page,'billing');
 const panel=page.locator('[data-panel="billing"]');
 await expect(panel.locator('[data-billing-state]')).toContainText('Chưa có kỳ thanh toán nào');
 await expect(panel.locator('[data-billing-transfer]')).toContainText('khi nền tảng bắt đầu thu phí');
 // Test values only, entered as the operator would in /gov.
 const adminId=(await f.db.query("INSERT INTO platform_admins(username,password_salt,password_key)VALUES('billing-admin',repeat('0',32),repeat('0',64))RETURNING id")).rows[0].id;
 await f.db.query("INSERT INTO platform_settings(key,value,updated_by)VALUES('payment',$1,$2)",[{bank:'Ngân hàng Thử',holder:'NGUYEN VAN THU',account:'0123456789',zalo:'0912345678',
  qr:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='},adminId]);
 await f.db.query("INSERT INTO shop_payments(shop_id,kind,amount_vnd,covers_until,recorded_by)VALUES($1,'payment',30000,((clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+10),$2)",[f.shops[0],adminId]);
 await page.reload();
 await expect(panel.locator('[data-billing-state]')).toContainText('Đã thanh toán tới hết ngày');
 await expect(panel.locator('[data-billing-state]')).toContainText('còn 10 ngày');
 await expect(panel.locator('[data-billing-memo]')).toHaveText('QS ONE');
 await expect(panel.locator('[data-billing-account]')).toHaveText('0123456789');
 await expect(panel.locator('[data-billing-qr]')).toBeVisible();
 await expect(panel.locator('[data-billing-zalo]')).toHaveAttribute('href','https://zalo.me/0912345678');
 await expect(panel.locator('[data-billing-history]')).toContainText('Đã nhận 30.000đ');
 // The bottom bar keeps its three; the tab sits behind "Thêm" on a phone, and its address opens it directly.
 await expect(page).toHaveURL(/\?view=billing$/);
});

test('the page editor: save, preview in a new tab, publish, and the customer page changes only after publishing',async({page,context,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // next dev reloads every open page the first time it compiles a route; compile /one and /preview before the editor holds state.
 const warm=await context.newPage();await warm.goto('/one');await warm.goto('/preview');await warm.close();
 await login(page,f.users[0]);
 // A7: the Google rules sit on the home view, with the one-page version for the staff.
 await expect(page.locator('[data-google-rules] summary')).toHaveText('Mời đánh giá Google đúng luật');
 await expect(page.locator('[data-google-rules] a')).toHaveAttribute('href','/huong-dan-google');
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
 // The label is chosen, not typed, since lát F-013: a button that names an action cannot also carry an offer.
 await row.getByRole('combobox',{name:'Chữ trên nút',exact:true}).selectOption({label:'Gọi · Call'});
 await row.getByRole('textbox',{name:/Số điện thoại/}).fill('tel:0901234567');
 await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();
 await expect(page.locator('[data-design-notice]')).toContainText('Đã lưu bản nháp. Khách chưa thấy');
 await expect(page.locator('[data-link-row]')).toHaveCount(before+1);
 // A bad link is refused by the server and nothing is saved.
 await row.getByRole('textbox',{name:/Số điện thoại/}).fill('0901234567');
 await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();
 await expect(page.locator('[data-design-notice]')).toContainText('Có ô chưa hợp lệ');
 await row.getByRole('textbox',{name:/Số điện thoại/}).fill('tel:0901234567');
 // A7: the Google button leads to Google only. Pointed at the shop's own page it could ask for stars first.
 const googleLink=page.getByLabel('Link đánh giá Google',{exact:true}),kept=await googleLink.inputValue();
 await googleLink.fill('https://quan-moi.example/danh-gia');
 await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();
 await expect(page.locator('[data-design-notice]')).toContainText('Link đánh giá Google phải là link của Google');
 await googleLink.fill(kept);
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
 await expect(customer.getByRole('link',{name:'Gọi',exact:true})).toHaveAttribute('href','tel:0901234567');
 for(const width of [390,1200]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`design-${width}.png`),fullPage:true});}
 expect(errors).toEqual([]);
});
test('cards: nhân bản thẻ, confirm before switching on, the card opens the page, off closes it',async({page,context,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const warm=await context.newPage();await warm.goto('/t/zzzzz');await warm.close();
 await login(page,f.users[0]);
 await page.locator('[data-view="design"]').click();
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
 // Cards carry no fee in the app any more (Tài, 26/09): the confirmation says what happens, not what it costs.
 expect(asked).toContain('Khách chạm thẻ là mở trang ngay.');expect(asked).not.toMatch(/phí|gói|đ\/tháng/);
 await expect(panel.locator('[data-card-count]')).toHaveText('Đang hoạt động: 1 thẻ.');
 await customer.reload();await expect(customer.locator('main[data-ready]')).toBeVisible();
 await expect(customer.getByRole('heading',{name:'Shop one',exact:true})).toBeVisible();
 page.once('dialog',dialog=>void dialog.accept());
 await row.getByRole('button',{name:'Tạm tắt',exact:true}).click();
 await expect(row.locator('[data-card-state]')).toHaveText('Đã tắt');
 await customer.reload();await expect(customer.getByRole('heading',{name:'Trang chưa sẵn sàng'})).toBeVisible();
 await expect(row.getByRole('button',{name:'Bật lại',exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await panel.screenshot({path:info.outputPath('cards-390.png')});
 // Trang bio: collapsed on the overview, drops down into every link — main page and each card — with Truy cập, no share.
 await page.setViewportSize({width:1280,height:900});
 await page.locator('[data-view="home"]').click();
 const bio=page.locator('[data-landing-pages]');
 await expect(bio.locator('tr[data-landing]')).toHaveCount(0);
 await bio.getByRole('button',{name:/Trang bio/}).click();
 await expect(bio.locator('tr[data-landing]')).toHaveCount(2);
 await expect(bio.locator('tr[data-landing="one"]')).toContainText('Trang chính');
 const bioCard=bio.locator(`tr[data-landing="${code}"]`);
 await expect(bioCard).toContainText('Bàn 3');await expect(bioCard).toContainText('Đã tắt');
 await expect(bioCard.getByRole('link',{name:'Truy cập'})).toHaveAttribute('href',new RegExp(`/t/${code}$`));
 await expect(bio.getByRole('button',{name:'Chia sẻ'})).toHaveCount(0);
 await bioCard.getByRole('button',{name:'Sao chép'}).click();
 await expect(bio.getByRole('status')).toContainText(/Đã sao chép link Bàn 3|Chưa sao chép được/);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await bio.screenshot({path:info.outputPath('bio-390.png')});
 expect(errors).toEqual([]);
});
test('password: change it in Hồ sơ, the old one stops working, the new one signs in; other origins refused',async({page,context,f})=>{
 const a=f.users[0],next='the-new-shop-password';
 const other=await context.browser()!.newContext({baseURL:origin});
 try{
  const second=await other.newPage();await login(second,a);
  await login(page,a);
  await openView(page,'profile');
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
  await signOut(page);await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
  await page.getByLabel('@handle hoặc email',{exact:true}).fill(a.username);await page.getByLabel('Mật khẩu',{exact:true}).fill(a.password);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.getByText('Không thể đăng nhập',{exact:false})).toBeVisible();
  await login(page,{username:a.username,password:next});
 }finally{await other.close();}
});
test('profile: a channel-like page, edit name, @handle and bio, then sign in with the new @handle or the email',async({page,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const a=f.users[0];
 await login(page,a);
 // The person button in the sidebar opens Hồ sơ.
 await page.locator('[data-me]').click();
 const profile=page.locator('[data-profile]');
 await expect(profile.locator('[data-profile-handle]')).toHaveText(`@${a.username}`);
 await expect(profile).toContainText('Chủ shop');await expect(profile).toContainText('Tham gia');
 await expect(page.locator('[data-password-form]')).toBeVisible();
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
 await expect(page.locator('[data-me]')).toContainText('@hoa.cafe');
 expect((await f.db.query('SELECT username,display_name FROM owner_identities_v2 WHERE id=$1',[a.id])).rows).toEqual([{username:'hoa.cafe',display_name:'Chị Hoa'}]);
 // Pictures come only from the account's own folder; other origins are refused.
 expect((await page.request.patch('/api/owner/v2/profile',{headers:{Origin:origin},data:{handle:'hoa.cafe',displayName:null,bio:null,avatarUrl:'https://evil.example/x.jpg',coverUrl:null}})).status()).toBe(400);
 expect((await page.request.patch('/api/owner/v2/profile',{headers:{Origin:'https://invalid.example'},data:{handle:'x-y-z',displayName:null,bio:null,avatarUrl:null,coverUrl:null}})).status()).toBe(403);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('profile-390.png'),fullPage:true});
 await page.setViewportSize({width:1280,height:900});
 await page.screenshot({path:info.outputPath('profile-1280.png'),fullPage:true});
 // Sign in again with the new @handle, then with the email, typed in capitals.
 await signOut(page);
 // A Vietnamese phone keyboard puts marks into the handle (Telex: "yourshop" becomes "yoủshop"); the page says so.
 await page.getByLabel('@handle hoặc email',{exact:true}).fill('@hoa.cafè');await expect(page.locator('[data-accent-hint]')).toBeVisible();
 await page.getByLabel('@handle hoặc email',{exact:true}).fill('@hoa.cafe');await expect(page.locator('[data-accent-hint]')).toHaveCount(0);
 await login(page,{username:'@hoa.cafe',password:a.password});
 await signOut(page);
 await f.db.query("UPDATE owner_identities_v2 SET email='hoa@example.com' WHERE id=$1",[a.id]);
 await login(page,{username:'Hoa@Example.com',password:a.password});
 expect(errors).toEqual([]);
});
test('team: invite a Nhân viên by link, they see only what the role allows; roles like Discord; the owner searches the history with ⌘K',async({page,context,browser,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // next dev compiles a route the first time it is hit and then reloads every open page (operations-gotchas.md): the
 // setup page would reload after its link was spent. Compile the pages and the setup API before any page is open.
 const warm=await context.newPage();await warm.goto(`/owner/setup/${'0'.repeat(64)}`);await warm.goto('/owner/login?next=/ZZZ/one');
 await warm.request.post('/api/owner/v2/setup',{headers:{Origin:origin},data:{token:'0'.repeat(64),password:'not-a-real-password'}});await warm.close();
 await addExperience(f.db,'one',2,'Lời khách riêng tư');
 await login(page,f.users[0]);
 await openView(page,'settings');
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
 await editor.screenshot({path:info.outputPath('role-editor.png')});
 await editor.getByRole('button',{name:'Lưu vai'}).click();
 await expect(roles.locator('[data-role="Thu ngân"]')).toContainText('Xem lịch sử hoạt động');
 await page.screenshot({path:info.outputPath('team-1280.png'),fullPage:true});
 // An opens the link on their own phone, chooses a password, signs in with the @handle.
 const other=await browser.newContext({baseURL:origin});
 try{
  const an=await other.newPage();await an.goto(new URL(url).pathname);
  await an.getByLabel('Mật khẩu mới',{exact:true}).fill('an-chooses-this-one');await an.getByLabel('Nhập lại',{exact:true}).fill('an-chooses-this-one');
  await an.getByRole('button',{name:'Đặt mật khẩu'}).click();
  await expect(an.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
  await an.getByLabel('@handle hoặc email',{exact:true}).fill('@an.nv');await an.getByLabel('Mật khẩu',{exact:true}).fill('an-chooses-this-one');
  await an.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(an.locator('[data-kpi="visits"] [data-kpi-value]')).toBeVisible();
  await expect(an.locator('[data-view="activity"]')).toHaveCount(0);await expect(an.locator('[data-view="design"]')).toHaveCount(0);
  await an.locator('[data-view="data"]').click();await an.getByRole('button',{name:'7 ngày',exact:true}).click();
  await expect(an.locator('[data-message-for]').first()).toContainText('Nội dung góp ý đang ẩn với bạn.');
  await expect(an.getByRole('region',{name:'Tải dữ liệu'})).toHaveCount(0);
 }finally{await other.close();}
 // The owner reads the history; ⌘K (Ctrl+K) jumps to the search, which ignores accents.
 await openView(page,'activity');
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
 await expect(history.locator('select').first()).toHaveValue(/^[0-9a-f-]{36}$/);
 await expect(history.getByText('Không có hoạt động nào khớp.')).toBeVisible();
 await history.locator('[data-activity-search]').fill('@');await expect(history.locator('[data-mention]')).toHaveCount(2);
 await page.keyboard.press('Escape');await expect(history.locator('[data-mentions]')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('activity-390.png'),fullPage:true});
 await openView(page,'settings');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('team-390.png'),fullPage:true});
 expect(errors).toEqual([]);
});
test('mentions: @ in a reply suggests who can read feedback; the one mentioned sees the bell and opens the thread',async({page,browser,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const x=await addExperience(f.db,'one',2,'Khách chê món bún');
 const team=new OwnerTeam(f.db),roles=(await team.list(f.users[0].token,'one')).roles;
 for(const [handle,role] of [['mai.ql','Quản lý'],['an.nv','Nhân viên']]){
  const invited=await team.invite(f.users[0].token,'one',{handle,roleId:roles.find(r=>r.name===role)!.id});await new OwnerSetupLinks(f.db).consume(invited.token,`password-of-${handle}`);}
 await login(page,f.users[0]);await data(page);
 const row=page.locator(`[data-row="${x.session.sessionId}"]`);
 await row.locator('[data-reply]').click();
 const box=row.getByLabel('Phản hồi nội bộ',{exact:true});await box.pressSequentially('Nhờ @');
 // an.nv cannot read feedback, so only the owner and mai.ql are offered; typing narrows, Enter picks.
 await expect(row.locator('[data-composer-mentions] [data-mention]')).toHaveCount(2);
 await box.pressSequentially('MA');await expect(row.locator('[data-composer-mentions] [data-mention]')).toHaveCount(1);
 await box.press('Enter');await expect(box).toHaveValue('Nhờ @mai.ql ');
 await box.pressSequentially('gọi lại khách');await row.locator('[data-composer]').getByRole('button',{name:'Phản hồi'}).click();
 await expect(row.locator('[data-comment-body]')).toHaveText('Nhờ @mai.ql gọi lại khách');
 await expect(row.locator('[data-comment-body] span')).toHaveText('@mai.ql');
 // mai.ql, on their own phone: the bell shows one, and opening it shows the thread with the reply.
 const other=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}});
 try{
  const mai=await other.newPage();await login(mai,{username:'mai.ql',password:'password-of-mai.ql'});
  await expect(mai.locator('[data-bell-count]')).toHaveText('1');
  await mai.locator('[data-bell]').click();
  await expect(mai.locator('[data-notification]')).toContainText(`@${f.users[0].username} đã nhắc bạn`);
  await mai.screenshot({path:info.outputPath('bell-390.png')});
  await mai.locator('[data-notification] button').click();
  const dialog=mai.locator('[data-thread-dialog]');
  await expect(dialog).toContainText('Khách chê món bún');await expect(dialog.locator('[data-comment-body]')).toHaveText('Nhờ @mai.ql gọi lại khách');
  await expect(mai.locator('[data-bell-count]')).toHaveCount(0);
  expect(await mai.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await mai.screenshot({path:info.outputPath('thread-dialog-390.png')});
  await dialog.getByRole('button',{name:'Đóng'}).click();await expect(dialog).toHaveCount(0);
  // The bell's link into another shop's dashboard opens the thread there too.
  await mai.goto(`/ZZZ/one?thread=${x.session.sessionId}`);
  await expect(mai.locator('[data-thread-dialog]')).toContainText('Khách chê món bún');expect(new URL(mai.url()).search).toBe('');
 }finally{await other.close();}
 expect(errors).toEqual([]);
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
 // The cookie-era dashboard and the sample one are gone (lát A3).
 for(const path of ['/demo/dashboard','/api/owner/one'])expect((await context.request.get(path)).status(),path).toBe(404);
});
test('two people reply at once: both replies stay, the thread reloads; the customer\'s revision history is untouched',async({page,context,f})=>{
 await addExperience(f.db);await login(page,f.users[0]);
 await data(page);
 const records=(await (await context.request.get('/api/owner/v2/one')).json()).records;
 const row=page.locator(`[data-row="${records[0].session_id}"]`);
 await row.locator('[data-reply]').click();await row.getByLabel('Phản hồi nội bộ',{exact:true}).fill('Của tôi');
 // Someone else replies while this one is still typing.
 expect((await context.request.post('/api/owner/v2/one/comments',{headers:{Origin:origin},data:{sessionId:records[0].session_id,body:'Người khác viết trước'}})).status()).toBe(200);
 await row.locator('[data-composer]').getByRole('button',{name:'Phản hồi'}).click();
 await expect(row.locator('[data-comment-body]')).toHaveText(['Người khác viết trước','Của tôi']);
 await expect(row.locator('[data-replies-toggle]')).toHaveText(/2 phản hồi/);
 expect((await context.request.post('/api/owner/v2/one/comments',{headers:{Origin:origin},data:{sessionId:records[0].session_id,body:'   '}})).status()).toBe(400);
 expect((await context.request.post('/api/owner/v2/one/comments',{headers:{Origin:'https://invalid.example'},data:{sessionId:records[0].session_id,body:'x'}})).status()).toBe(403);
 expect((await f.db.query('SELECT revision::text FROM rating_experiences')).rows[0].revision).toBe('2');expect((await f.db.query('SELECT count(*)::int n FROM rating_intent_receipts')).rows[0].n).toBe(2);
 expect((await context.request.get('/api/owner/v2/one?scope=test')).status()).toBe(400);
 expect((await context.request.get(`/api/owner/v2/one?source=${randomUUID()}`)).status()).toBe(200);
 expect((await context.request.get('/api/owner/v2/one/export?format=../bad')).status()).toBe(400);
});

// Lát P3: the page list. Every write below goes through the real HTTP routes, where the page rides in the JSON body --
// the path a repository test cannot see (lát P1 sent it in the query string, which the owner routes refuse).
test('pages: a picture of each, copy one, make one from the library, bring content over, change template, cards follow the chosen page',async({page,f})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());
 await login(page,f.users[0]);
 await page.locator('[data-view="design"]').click();
 const rows=page.locator('[data-pages] [data-page]');
 await expect(rows).toHaveCount(1);
 // Prices are shown, and nothing is charged yet (lát P5).
 await expect(page.locator('[data-pages-price]')).toContainText('mục Thanh toán');
 await expect(page.locator('[data-page="one"] [data-page-price]')).toHaveText('Miễn phí (suất miễn phí)');
 await expect(page.locator('[data-new-page] select option[value="big-button"]')).toHaveText('6 · Nút lớn — miễn phí');
 // The picture is the page drawn still: no visit is recorded for it, and only this app may frame it.
 await expect(page.frameLocator('[data-page="one"] iframe').locator('main.guest')).toBeVisible();
 await expect(page.locator('[data-page="one"] iframe')).toHaveAttribute('sandbox','allow-same-origin');
 expect((await f.db.query('SELECT count(*)::int n FROM page_visits')).rows[0].n).toBe(0);
 const thumb=await page.request.get('/ZZZ/one/thumb/one');
 expect([thumb.status(),thumb.headers()['x-frame-options']]).toEqual([200,'SAMEORIGIN']);
 expect(thumb.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
 expect((await page.request.get('/ZZZ/one/thumb/khong-co')).status()).toBe(404);

 // Copy page one: a new draft at a new link, chosen at once.
 await page.locator('[data-copy="one"]').click();
 await expect(rows).toHaveCount(2);
 const copy=(await rows.nth(1).getAttribute('data-page'))!;
 await expect(rows.nth(1)).toHaveAttribute('aria-current','true');
 await expect(page.locator('[data-page-state]').nth(1)).toHaveText('Chưa phát hành');
 // Type only once the editor has moved to the new page, or the words land in the one it is leaving.
 await expect(page.locator(`[data-design-page="${copy}"]`)).toBeVisible();
 await page.getByLabel('Tên hiển thị',{exact:true}).fill('Phòng VIP');
 await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();
 await expect(page.locator('[data-design-notice]')).toContainText('Đã lưu bản nháp');
 const names=async()=>(await f.db.query('SELECT p.slug,d.config->>\'name\' name FROM page_drafts d JOIN pages p ON p.id=d.page_id WHERE p.shop_id=$1 ORDER BY p.created_at',[f.shops[0]])).rows;
 expect(await names()).toEqual([{slug:'one',name:'Shop one'},{slug:copy,name:'Phòng VIP'}]);
 await page.getByRole('button',{name:'Phát hành',exact:true}).click();
 await expect(page.locator('[data-design-notice]')).toContainText('Đã phát hành');
 await expect(page.locator('[data-page-state]').nth(1)).toHaveText('Đang chạy');
 // A new card belongs to the chosen page.
 await page.getByLabel('Tên thẻ mới',{exact:true}).fill('Bàn VIP');
 await page.getByRole('button',{name:'Nhân bản thẻ',exact:true}).click();
 // (A copy takes no cards with it, so the one card on that page is this one.)
 await expect(page.locator('[data-cards] [data-card-page]',{hasText:copy})).toHaveCount(1);

 // From the library: template 6, nothing to adjust; its content comes from page one.
 await page.locator('[data-new-page] select').selectOption('big-button');
 await page.locator('[data-new-page] input').fill('Quầy bar');
 await page.getByRole('button',{name:'Tạo trang',exact:true}).click();
 await expect(rows).toHaveCount(3);
 await expect(rows.nth(2)).toHaveAttribute('aria-current','true');
 await expect(page.locator(`[data-design-page="${(await rows.nth(2).getAttribute('data-page'))!}"]`)).toBeVisible();
 await expect(page.locator('[data-no-settings]')).toBeVisible();
 await page.locator('[data-import] select').selectOption('one');
 await expect(page.getByLabel('Tên hiển thị',{exact:true})).toHaveValue('Shop one');
 await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();
 await expect(page.locator('[data-design-notice]')).toContainText('Đã lưu bản nháp');
 // And onto another template, keeping that content.
 await page.locator('[data-template-switch] select').selectOption('glass');
 await expect(page.locator('[data-template-state]')).toContainText('3 · Kính');
 await expect(page.getByLabel('Tên hiển thị',{exact:true})).toHaveValue('Shop one');
 await expect(page.locator('[data-setting="background"]')).toBeVisible();
 expect(errors).toEqual([]);
});

// Lát P4: the owner's emergency stop, through the page list: at once, reported, and lifted by the owner.
test('emergency stop: the owner stops a page with a note, guests see it paused, and the owner starts it again',async({page,f})=>{
 await login(page,f.users[0]);
 await page.locator('[data-view="design"]').click();
 page.once('dialog',dialog=>void dialog.accept('Nút Google mở sai link'));
 await page.locator('[data-pause="one"]').click();
 await expect(page.locator('[data-page="one"] [data-page-state]')).toHaveText('Tạm ngừng');
 expect(await (await page.request.get('/one')).text()).toContain('Trang tạm ngừng');
 expect((await f.db.query('SELECT reason,state FROM page_incidents')).rows).toEqual([{reason:'Nút Google mở sai link',state:'open'}]);
 await page.locator('[data-resume="one"]').click();
 await expect(page.locator('[data-page="one"] [data-page-state]')).toHaveText('Đang chạy');
 expect(await (await page.request.get('/one')).text()).not.toContain('Trang tạm ngừng');
});
