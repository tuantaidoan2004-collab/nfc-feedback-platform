import {test as base,expect,type Page} from '@playwright/test';
import {Pool} from 'pg';
import {AdminAuth} from '../lib/admin/auth';
import {code,fromBase32,newSecret,seal,stepAt} from '../lib/admin/totp';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {addExperience} from '../repository-tests/owner-fixture';
const uri=process.env.NFC_TEST_DATABASE_URL,schema=process.env.NFC_TEST_SCHEMA;
if(uri!=='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test'||!/^nfc_ui_test_[a-f0-9]{32}$/.test(schema??''))throw Error('Isolated harness required');
const secret='a-sufficiently-long-admin-secret';
const origin='http://127.0.0.1:3317';
const test=base.extend<{admin:{db:Pool;username:string;app:Buffer}}>({admin:async({},provide)=>{
 const db=new Pool({connectionString:uri,options:`-c search_path=${schema}`});
 try{await db.query('TRUNCATE platform_admins,admin_login_limits CASCADE');
  await new AdminAuth(db).bootstrap('boss',secret,async()=>{});
  // The second factor is on for every case except the one that walks the enrolment itself: otherwise each test
  // would have to enrol before it could reach the work it is actually about (lát A2).
  const app=newSecret();
  await db.query('UPDATE platform_admins SET totp_secret=$1,totp_enrolled_at=clock_timestamp()',[seal(app)]);
  await provide({db,username:'boss',app});}finally{await db.end();}
}});
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});
// next dev compiles an API the first time it is called and then reloads every open page (operations-gotchas.md).
// The owner's Settings calls the team API (lát F3); compile it before any page is open, or the owner page reloads
// back to the overview in the middle of a test. The answer (401 without a session) does not matter.
test.beforeEach(async({request})=>{for(const api of ['team','activity','comments?session=x'])await request.get(`/api/owner/v2/warm/${api}`);});

test('sign in, session cookie stays inside /gov, sign out',async({page,context,admin})=>{
 await page.goto('/gov');
 await expect(page).toHaveURL(`${origin}/gov/login`);
 await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();

 await page.getByLabel('Tài khoản',{exact:true}).fill('boss');
 await page.getByLabel('Mật khẩu',{exact:true}).fill('wrong-password-entirely');
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 // Scoped to the form: Next renders its own route announcer with role="alert" on every page.
 await expect(page.getByRole('main').getByRole('alert')).toContainText('Không thể đăng nhập');
 expect((await context.cookies()).filter(c=>c.name==='nfc_admin_v1')).toEqual([]);

 await page.getByLabel('Mật khẩu',{exact:true}).fill(secret);
 await page.getByLabel('Mã xác thực',{exact:true}).fill(code(admin.app,stepAt(new Date())));
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.getByRole('heading',{name:`Xin chào, ${admin.username}`})).toBeVisible();
 await expect(page).toHaveURL(`${origin}/gov`);

 const [cookie]=(await context.cookies()).filter(c=>c.name==='nfc_admin_v1');
 expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe('Strict');
 // The whole point of putting the API under /gov: this credential reaches every shop, so it must never be
 // attached to a customer page request.
 expect(cookie.path).toBe('/gov');
 expect(cookie.value).not.toBe('');
 const sent:string[]=[];
 page.on('request',r=>{if(r.isNavigationRequest())sent.push(r.headers()['cookie']??'');});
 await page.goto('/one');
 expect(sent.length).toBeGreaterThan(0);
 expect(sent.every(header=>!header.includes('nfc_admin_v1'))).toBe(true);

 await page.goto('/gov');
 await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();
 await expect(page).toHaveURL(`${origin}/gov/login`);
 await page.goto('/gov');
 await expect(page).toHaveURL(`${origin}/gov/login`);
});

test('the administrative API refuses cross origin, bad media type and unexpected fields',async({request,admin})=>{
 const url=`${origin}/gov/api/login`;
 const body={username:'boss',password:secret,code:code(admin.app,stepAt(new Date()))};
 expect((await request.post(url,{data:body})).status()).toBe(403);
 expect((await request.post(url,{headers:{origin:'http://127.0.0.1:9999'},data:body})).status()).toBe(403);
 expect((await request.post(url,{headers:{origin,'content-type':'text/plain'},data:JSON.stringify(body)})).status()).toBe(400);
 expect((await request.post(url,{headers:{origin},data:{...body,next:'/gov'}})).status()).toBe(400);
 expect((await request.post(url,{headers:{origin},data:{username:'boss',password:'nope-nope-nope'}})).status()).toBe(401);
 expect((await request.post(`${url}?x=1`,{headers:{origin},data:body})).status()).toBe(400);
 const ok=await request.post(url,{headers:{origin},data:body});
 expect(ok.status()).toBe(200);
 expect(ok.headers()['cache-control']).toContain('no-store');
 expect((await admin.db.query('SELECT count(*)::int n FROM admin_auth_sessions')).rows[0].n).toBe(1);
});

test('production gate keeps administration closed even with the flag true',async({request})=>{
 test.skip(process.env.NFC_TEST_PRODUCTION!=='true','Requires harness production build');
 const built='http://127.0.0.1:3319';
 for(const path of ['/gov','/gov/login'])expect((await request.get(`${built}${path}`)).status()).toBe(404);
 for(const method of ['post','delete'] as const)
  expect((await request[method](`${built}/gov/api/impersonations`,{headers:{origin:built},data:{}})).status()).toBe(404);
 for(const path of ['/gov/api/template','/gov/api/template/account'])
  expect((await request.post(`${built}${path}`,{headers:{origin:built}})).status()).toBe(404);
 expect((await request.delete(`${built}/api/owner/v2/one/impersonation`,{headers:{origin:built}})).status()).toBe(404);
 expect((await request.post(`${built}/gov/api/login`,{headers:{origin:built},data:{username:'boss',password:secret}})).status()).toBe(404);
 expect((await request.post(`${built}/gov/api/logout`,{headers:{origin:built},data:{}})).status()).toBe(404);
});

test('generate a shop, hand over the link, and the shop signs in on its own',async({page,admin})=>{
 await page.goto('/gov/login');
 await page.getByLabel('Tài khoản',{exact:true}).fill('boss');
 await page.getByLabel('Mật khẩu',{exact:true}).fill(secret);
 await page.getByLabel('Mã xác thực',{exact:true}).fill(code(admin.app,stepAt(new Date())));
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.getByRole('heading',{name:`Xin chào, ${admin.username}`})).toBeVisible();

 // The template comes first: one button, then a row marked as the template with its page live and no owner.
 await page.getByRole('button',{name:'Tạo shop khuôn',exact:true}).click();
 const templateRow=page.locator('tr[data-template]');
 await expect(templateRow).toHaveCount(1);
 await expect(templateRow).toContainText('KHUÔN');
 await expect(templateRow).toContainText('YOUR SHOP');
 await expect(page.getByRole('button',{name:'Tạo shop khuôn',exact:true})).toHaveCount(0);
 await expect(templateRow.getByRole('button')).toHaveCount(0);
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Đưa khuôn về mặc định mới',exact:true}).click();
 await expect(page.getByRole('main')).toContainText('Khuôn đã dùng cấu hình mặc định mới');
 expect((await admin.db.query("SELECT count(*)::int n FROM admin_audit WHERE action='template.reset'")).rows[0].n).toBe(1);
 const templateSlug=(await admin.db.query('SELECT slug FROM shops WHERE is_template')).rows[0].slug;
 expect((await page.request.get(`/${templateSlug}`)).status()).toBe(200);

 await page.getByLabel('Tên shop',{exact:true}).fill('Cà Phê Ban Mai');
 await page.getByLabel('Tài khoản chủ shop',{exact:true}).fill('caphe-banmai');
 await page.getByLabel('Email chủ shop',{exact:true}).fill('chu@example.com');
 await page.getByLabel('Đường dẫn Google (bỏ trống nếu chưa có)',{exact:true}).fill('https://maps.google.com/?cid=7');
 // Six templates to choose from (A33); khuôn 1 is preselected so a hurried operator still gets the original page.
 const choice=page.locator('select[data-template-choice]');
 await expect(choice.locator('option')).toHaveText(['1 · Bản gốc','2 · Tối giản','3 · Kính','4 · Chồng thẻ','5 · Ánh sáng tụ','6 · Nút lớn']);
 await expect(choice).toHaveValue('standard');
 await choice.selectOption('glass');
 await page.getByRole('button',{name:'Tạo shop',exact:true}).click();

 await expect(page.getByRole('heading',{name:'Gửi liên kết này cho chủ shop'})).toBeVisible();
 // Selected by a data attribute, not a class: CSS modules hash class names at build time.
 const setupUrl=(await page.locator('[data-handover] code').first().textContent())??'';
 expect(setupUrl).toContain('/owner/setup/');
 const slug=(await admin.db.query("SELECT slug FROM shops WHERE name='Cà Phê Ban Mai'")).rows[0].slug;
 await expect(page.getByRole('cell',{name:slug})).toBeVisible();
 // The chosen skeleton is the release's template, and it reaches the guest page as a skin hook only.
 expect((await admin.db.query(`SELECT tv.template_key FROM shops s JOIN pages p ON p.shop_id=s.id JOIN page_releases r ON r.id=p.active_release_id
   JOIN template_versions tv ON tv.id=r.template_version_id WHERE s.slug=$1`,[slug])).rows).toEqual([{template_key:'glass'}]);
 expect(await (await page.request.get(`/${slug}`)).text()).toContain('data-template="glass"');

 // The shop opens the link itself and chooses a password the operator never sees.
 await page.goto(setupUrl);
 await expect(page.getByRole('heading',{name:'Đặt mật khẩu',exact:true})).toBeVisible();
 await page.getByLabel('Mật khẩu mới',{exact:true}).fill('chosen-by-the-shop');
 await page.getByLabel('Nhập lại',{exact:true}).fill('chosen-by-the-shop');
 await page.getByRole('button',{name:'Đặt mật khẩu',exact:true}).click();
 // Straight on to this shop's own sign-in, the way the shop experiences it: no address to find by hand.
 await expect(page).toHaveURL(`${origin}/owner/login?next=${encodeURIComponent(`/ZZZ/${slug}`)}`);
 await page.getByLabel('@handle hoặc email',{exact:true}).fill('caphe-banmai');
 await page.getByLabel('Mật khẩu',{exact:true}).fill('chosen-by-the-shop');
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.locator('[data-kpi="visits"] [data-kpi-value]')).toBeVisible();
 await expect(page).toHaveURL(`${origin}/ZZZ/${slug}`);
 // The customer page is right there, to open on other phones: Trang bio drops down into every link (lát F1).
 const bio=page.locator(`[data-customer-link="${origin}/${slug}"]`);await expect(bio).toBeVisible();
 await bio.getByRole('button',{name:/Trang bio/}).click();
 await expect(bio.locator(`tr[data-landing="${slug}"]`).getByRole('link',{name:'Truy cập'})).toHaveAttribute('href',`${origin}/${slug}`);

 // The editor draws what khuôn 3's version offers (lát P2): the two-colour scene and the plane, nothing else.
 await page.locator('[data-view="design"]').click();
 await expect(page.locator('[data-setting="background"] select option')).toHaveText(['Chuyển màu','Một màu']);
 await expect(page.locator('[data-setting="feedbackButton"]')).toBeVisible();
 await expect(page.locator('[data-setting="layout"], [data-setting="watermark"]')).toHaveCount(0);

 // Spent once: the same link is dead now that the password is set.
 await page.goto(setupUrl);
 await expect(page.getByRole('heading',{name:'Liên kết không dùng được'})).toBeVisible();

 // The template's test account, issued from /gov outside production, opens the template's own dashboard.
 await page.goto('/gov');
 await page.getByRole('button',{name:'Tạo tài khoản test cho khuôn',exact:true}).click();
 await expect(page.getByRole('main')).toContainText('yourshop / 1');
 await expect(templateRow).toContainText('yourshop');
 await expect(templateRow.getByRole('button')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Tạo tài khoản test cho khuôn',exact:true})).toHaveCount(0);
 // Still signed in as the shop owner above, whose account has no access to the template: start from signed out.
 await page.context().clearCookies({name:'nfc_owner_v2'});
 await page.goto(`/ZZZ/${templateSlug}`);
 await page.getByLabel('@handle hoặc email',{exact:true}).fill('yourshop');
 await page.getByLabel('Mật khẩu',{exact:true}).fill('1');
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.getByText('YOUR SHOP',{exact:true}).first()).toBeVisible();await expect(page.locator('[data-kpi="visits"] [data-kpi-value]')).toBeVisible();

 // Password unknown and the username locked out by failed attempts: one press puts both back.
 await admin.db.query("UPDATE owner_identities_v2 SET password_key=repeat('0',64) WHERE username='yourshop'");
 await page.context().clearCookies({name:'nfc_owner_v2'});
 for(let i=0;i<9;i++){
  await page.goto(`/ZZZ/${templateSlug}`);
  await page.getByLabel('@handle hoặc email',{exact:true}).fill('yourshop');await page.getByLabel('Mật khẩu',{exact:true}).fill('1');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page.getByText('Không thể đăng nhập',{exact:false})).toBeVisible();
 }
 await page.goto('/gov');
 await page.getByRole('button',{name:'Đặt lại tài khoản test (yourshop / 1)',exact:true}).click();
 await expect(page.getByRole('main')).toContainText('yourshop / 1');
 // The button's request lands after the notice appears, so wait for the record rather than reading once.
 await expect.poll(async()=>(await admin.db.query("SELECT count(*)::int n FROM admin_audit WHERE action='template.account.reset'")).rows[0].n).toBe(1);
 await page.goto(`/ZZZ/${templateSlug}`);
 await page.getByLabel('@handle hoặc email',{exact:true}).fill('yourshop');await page.getByLabel('Mật khẩu',{exact:true}).fill('1');
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.getByText('YOUR SHOP',{exact:true}).first()).toBeVisible();await expect(page.locator('[data-kpi="visits"] [data-kpi-value]')).toBeVisible();
});

test('a reissued link is only issued for the owner of the named shop, and always with its audit row',async({page,admin})=>{
 const actor=(await admin.db.query('SELECT id FROM platform_admins')).rows[0].id,shops=new ShopProvisioning(admin.db);
 const one=await shops.create(actor,{name:'Quán Một',ownerUsername:'quan-mot',ownerEmail:'mot@example.com',googleUrl:''});
 const two=await shops.create(actor,{name:'Quán Hai',ownerUsername:'quan-hai',ownerEmail:'hai@example.com',googleUrl:''});
 await signIn(page,admin.username,admin.app);
 const post=(data:unknown)=>page.request.post(`${origin}/gov/api/setup-links`,{headers:{origin},data});
 const trail=async()=>(await admin.db.query("SELECT shop_id,on_behalf_of FROM admin_audit WHERE action='owner.link.reissue'")).rows;
 const resets=async()=>(await admin.db.query("SELECT count(*)::int n FROM owner_setup_tokens WHERE purpose='reset'")).rows[0].n;

 expect((await post({ownerUserId:one.ownerUserId,shopId:two.shopId})).status()).toBe(404);
 expect((await post({ownerUserId:one.ownerUserId,shopId:'not-a-uuid'})).status()).toBe(400);
 expect(await trail()).toEqual([]);
 expect(await resets()).toBe(0);

 const ok=await post({ownerUserId:one.ownerUserId,shopId:one.shopId});
 expect(ok.status()).toBe(200);
 expect(await trail()).toEqual([{shop_id:one.shopId,on_behalf_of:one.ownerUserId}]);
 expect(await resets()).toBe(1);
});

async function signIn(page:Page,username:string,app:Buffer){
 await page.goto('/gov/login');
 await page.getByLabel('Tài khoản',{exact:true}).fill('boss');
 await page.getByLabel('Mật khẩu',{exact:true}).fill(secret);
 await page.getByLabel('Mã xác thực',{exact:true}).fill(code(app,stepAt(new Date())));
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.getByRole('heading',{name:`Xin chào, ${username}`})).toBeVisible();
}
async function standIn(page:Page,shop:string,scope:'overview'|'feedback',reason:string){
 await page.goto('/gov');
 await page.getByRole('row').filter({hasText:shop}).getByRole('button',{name:'Mạo danh',exact:true}).click();
 await page.getByRole('combobox',{name:'Phạm vi',exact:true}).selectOption(scope);
 await page.getByLabel('Lý do (chủ shop sẽ đọc)',{exact:true}).fill(reason);
 await page.getByRole('button',{name:'Mở dashboard',exact:true}).click();
 await expect(page.locator(`[data-impersonation="${scope}"]`)).toBeVisible();
 // The banner is server-rendered; wait for the client's own data so clicks land after hydration.
 await expect(page.locator('[data-kpi="visits"] [data-kpi-value]')).toBeVisible();
}

test('impersonation: cookie stays on one shop, support never exports, feedback only while the owner allows it',async({page,context,browser,admin},info)=>{
 const shopName='Quán Hỗ Trợ',ownerPassword='chosen-by-the-shop';
 const made=await new ShopProvisioning(admin.db).create((await admin.db.query('SELECT id FROM platform_admins')).rows[0].id,
  {name:shopName,ownerUsername:'quan-hotro',ownerEmail:'hotro@example.com',googleUrl:'https://maps.google.com/?cid=9'});
 await new OwnerSetupLinks(admin.db).consume(made.setupToken,ownerPassword);
 const x=await addExperience(admin.db,made.slug,2,'Góp ý kín của khách');
 const api=`/api/owner/v2/${made.slug}`;
 const patch={sessionId:x.session.sessionId,expectedCaseRevision:0,expectedExperienceRevision:'2',status:'resolved',note:'Sửa hộ'};
 const exports=['experiences','page_visits','receipts'].flatMap(dataset=>['csv','jsonl','dictionary'].map(format=>`${api}/export?dataset=${dataset}&format=${format}`));
 const refusedExports=async()=>{for(const url of exports){
  const response=await context.request.get(url);
  expect(response.status(),url).toBe(403);
  expect(await response.json()).toEqual({error:'IMPERSONATION_NO_EXPORT'});
 }};
 const overviewReason='Kiểm tra <b>số liệu</b> giúp shop, theo yêu cầu qua Zalo';
 // How support appears to shops (migration 014): the handle beside the neon tick, and a label.
 await admin.db.query("UPDATE platform_admins SET handle='Quitesensational',title='Admin Tài'");
 await signIn(page,admin.username,admin.app);
 await standIn(page,shopName,'overview',overviewReason);
 await expect(page).toHaveURL(`${origin}/ZZZ/${made.slug}`);
 await expect(page.locator('[data-impersonation] [data-admin-badge="Quitesensational"]')).toContainText('@QuitesensationalAdmin Tài');
 await page.locator('[data-impersonation]').screenshot({path:info.outputPath('admin-badge.png')});
 await expect(page.locator('[data-view="profile"]')).toHaveCount(0);
 await expect(page.locator('[data-kpi="private"] [data-kpi-value]')).toHaveText('1');
 await page.locator('[data-view="data"]').click();await page.getByRole('button',{name:'7 ngày',exact:true}).click();
 await expect(page.locator('[data-metric="feedback"]')).toHaveText('1');
 await expect(page.locator('[data-message-for]')).toContainText('Nội dung góp ý đang ẩn với bạn.');
 await expect(page.getByText('Góp ý kín của khách')).toHaveCount(0);
 for(const name of ['Lưu xử lý','Đăng xuất',/^Ghi chú/])await expect(page.getByRole('button',{name})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'CSV',exact:true})).toHaveCount(0);
 await page.locator('[data-view="settings"]').click();
 for(const name of ['Tắt','Khấc 1 · Xem','Khấc 2 · Sửa','Khấc 3 · Toàn quyền'])await expect(page.getByRole('radio',{name:new RegExp(`^${name}`)})).toBeDisabled();

 const cookies=(await context.cookies()).filter(c=>c.name==='nfc_impersonation_v1');
 expect(cookies.map(c=>c.path).sort()).toEqual([`/ZZZ/${made.slug}`,`/api/owner/v2/${made.slug}`].sort());
 expect(cookies.every(c=>c.httpOnly&&c.sameSite==='Strict')).toBe(true);
 const sent:string[]=[];
 page.on('request',r=>{if(r.isNavigationRequest())sent.push(r.headers()['cookie']??'');});
 await page.goto(`/${made.slug}`);
 expect(sent.length).toBeGreaterThan(0);
 expect(sent.every(header=>!header.includes('nfc_impersonation_v1'))).toBe(true);

 // By hand, with the browser's cookies: the interface is not what refuses.
 const read=await context.request.get(api);
 expect(read.status()).toBe(200);
 expect(await read.text()).not.toContain('Góp ý kín của khách');
 const write=await context.request.patch(api,{headers:{Origin:origin},data:patch});
 expect(write.status()).toBe(403);
 expect(await write.json()).toEqual({error:'IMPERSONATION_READ_ONLY'});
 const flip=await context.request.put(`${api}/support`,{headers:{Origin:origin},data:{level:'full'}});
 expect(flip.status()).toBe(403);
 expect(await flip.json()).toEqual({error:'IMPERSONATION_READ_ONLY'});
 await refusedExports();
 // The owner API of any other shop is out of reach: the cookie is not even sent there.
 expect((await context.request.get('/api/owner/v2/one')).status()).toBe(401);
 // Feedback is refused while the switch is off, even when asked for directly.
 const early=await context.request.post('/gov/api/impersonations',{headers:{origin},
  data:{shopId:made.shopId,ownerUserId:made.ownerUserId,scope:'feedback',reason:'Đọc góp ý khi chưa được phép'}});
 expect(early.status()).toBe(403);
 expect(await early.json()).toEqual({error:'SUPPORT_NOT_GRANTED'});

 // The owner, in a browser of their own, switches reading on.
 const owner=await browser.newContext({baseURL:origin});
 try{
  const ownerPage=await owner.newPage();
  await ownerPage.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await ownerPage.goto(`/ZZZ/${made.slug}`);
  await ownerPage.getByLabel('@handle hoặc email',{exact:true}).fill('quan-hotro');
  await ownerPage.getByLabel('Mật khẩu',{exact:true}).fill(ownerPassword);
  await ownerPage.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await ownerPage.locator('[data-view="settings"]').click();
  const level=(name:string)=>ownerPage.getByRole('radio',{name:new RegExp(`^${name}`)});
  await expect(level('Tắt')).toBeChecked();
  await level('Khấc 1 · Xem').check();
  await expect(ownerPage.locator('[data-support="view"]')).toBeVisible();

  await page.goto('/gov');
  await expect(page.getByRole('row').filter({hasText:shopName}).locator('[data-support-level="view"]')).toBeVisible();
  await standIn(page,shopName,'feedback','Shop nhờ đọc góp ý khách để phản hồi');
  await page.locator('[data-view="data"]').click();await page.getByRole('button',{name:'7 ngày',exact:true}).click();
  await expect(page.getByText('Góp ý kín của khách')).toBeVisible();
  await expect(page.locator('[data-row] [data-info-button]').first()).toBeVisible();
  // The call-back number never reaches support, whatever the switch position (F-003).
  expect((await context.request.get(`${api}?from=2026-01-01&to=2030-01-01`)).ok()).toBe(true);
  expect(((await (await context.request.get(`${api}?from=2026-01-01&to=2030-01-01`)).json()).records as {phone:string|null}[]).every(r=>r.phone===null)).toBe(true);
  await expect(page.getByRole('button',{name:/^Ghi chú/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Lưu xử lý'})).toHaveCount(0);
  // Position 1 lets support read, not reply: replying needs position 3.
  await expect(page.locator('[data-reply]')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'CSV',exact:true})).toHaveCount(0);
  await refusedExports();
  expect((await context.request.patch(api,{headers:{Origin:origin},data:patch})).status()).toBe(403);
  expect((await admin.db.query('SELECT count(*)::int n FROM owner_feedback_cases')).rows[0].n).toBe(0);
  expect((await admin.db.query("SELECT count(*)::int n FROM admin_audit WHERE action='impersonation.export'")).rows[0].n).toBe(0);

  // Switched off: support's next request is refused at once.
  await level('Tắt').check();
  await expect(ownerPage.locator('[data-support="off"]')).toBeVisible();
  const after=await context.request.get(api);
  expect(after.status()).toBe(403);
  expect(await after.json()).toEqual({error:'SUPPORT_NOT_GRANTED'});

  await page.getByRole('button',{name:'Kết thúc phiên',exact:true}).click();
  await expect(page).toHaveURL(`${origin}/gov`);
  expect((await context.cookies()).filter(c=>c.name==='nfc_impersonation_v1')).toEqual([]);
  expect((await context.request.get(api)).status()).toBe(401);
  expect((await admin.db.query('SELECT end_reason FROM admin_impersonation_sessions ORDER BY created_at')).rows).toEqual([{end_reason:'superseded'},{end_reason:'ended'}]);

  // The owner sees both visits with the reason exactly as typed, and their own two switches.
  await ownerPage.reload();
  await ownerPage.locator('[data-view="settings"]').click();
  await expect(ownerPage.locator('[data-admin-visits] [data-admin-visit]')).toHaveCount(2);
  await expect(ownerPage.locator('[data-admin-visit] [data-admin-badge="Quitesensational"]')).toHaveCount(2);
  await expect(ownerPage.locator('[data-reason]').filter({hasText:overviewReason})).toHaveText(overviewReason);
  await expect(ownerPage.locator('[data-support-history]')).toContainText('Tắt bởi quan-hotro');
  await expect(ownerPage.locator('[data-support-history]')).toContainText('Khấc 1 · Xem bởi quan-hotro');
  await expect(ownerPage.locator('[data-impersonation]')).toHaveCount(0);
  await ownerPage.locator('[data-view="data"]').click();await ownerPage.getByRole('button',{name:'7 ngày',exact:true}).click();
  // The owner, unlike support at position 1, can reply under the feedback (lát F4).
  await ownerPage.locator('[data-reply]').first().click();
  await expect(ownerPage.getByLabel('Phản hồi nội bộ',{exact:true})).toBeVisible();
  await expect(ownerPage.getByRole('link',{name:'CSV',exact:true})).toBeVisible();
 }finally{await owner.close();}
});

test('position 2: support edits and publishes the page in a design session, sees no figures, and the owner sees the visit',async({page,browser,admin})=>{
 const shopName='Quán Sửa Hộ',ownerPassword='chosen-by-the-shop';
 const made=await new ShopProvisioning(admin.db).create((await admin.db.query('SELECT id FROM platform_admins')).rows[0].id,
  {name:shopName,ownerUsername:'quan-suaho',ownerEmail:'suaho@example.com',googleUrl:'https://maps.google.com/?cid=11'});
 await new OwnerSetupLinks(admin.db).consume(made.setupToken,ownerPassword);
 await addExperience(admin.db,made.slug,2,'Không cho quản trị thấy');
 const owner=await browser.newContext({baseURL:origin});
 try{
  const ownerPage=await owner.newPage();
  await ownerPage.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await ownerPage.goto(`/ZZZ/${made.slug}`);
  await ownerPage.getByLabel('@handle hoặc email',{exact:true}).fill('quan-suaho');await ownerPage.getByLabel('Mật khẩu',{exact:true}).fill(ownerPassword);
  await ownerPage.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await ownerPage.locator('[data-view="settings"]').click();
  await ownerPage.getByRole('radio',{name:/^Khấc 2 · Sửa/}).check();
  await expect(ownerPage.locator('[data-support="edit"]')).toBeVisible();

  await signIn(page,admin.username,admin.app);
  await expect(page.getByRole('row').filter({hasText:shopName}).locator('[data-support-level="edit"]')).toBeVisible();
  await page.getByRole('row').filter({hasText:shopName}).getByRole('button',{name:'Mạo danh',exact:true}).click();
  // toBeDisabled does not read <option disabled>; the attribute is what the browser honours.
  await expect(page.getByRole('option',{name:/^Chỉ số liệu tổng quan/})).toHaveAttribute('disabled','');
  await page.getByRole('combobox',{name:'Phạm vi',exact:true}).selectOption('design');
  await page.getByLabel('Lý do (chủ shop sẽ đọc)',{exact:true}).fill('Shop nhờ đổi tên hiển thị và thêm nút gọi');
  await page.getByRole('button',{name:'Mở dashboard',exact:true}).click();
  await expect(page.locator('[data-impersonation="design"]')).toBeVisible();
  // Only the editor: no totals, no rows, no other menu entries.
  await expect(page.locator('[data-design-editor] input').first()).toBeVisible();
  await expect(page.locator('[data-view]')).toHaveCount(1);
  await expect(page.locator('[data-kpi]')).toHaveCount(0);
  await expect(page.getByText('Không cho quản trị thấy')).toHaveCount(0);
  expect((await page.request.get(`/api/owner/v2/${made.slug}/summary`)).status()).toBe(403);
  await page.getByLabel('Tên hiển thị',{exact:true}).fill('Quán Đã Sửa Hộ');
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Phát hành',exact:true}).click();
  await expect(page.locator('[data-design-notice]')).toContainText('Đã phát hành');
  expect((await admin.db.query("SELECT count(*)::int n FROM admin_audit WHERE action='impersonation.design.publish'")).rows[0].n).toBe(1);
  await ownerPage.goto(`/${made.slug}`);await expect(ownerPage.getByRole('heading',{name:'Quán Đã Sửa Hộ',exact:true})).toBeVisible();
  // The owner sees the visit and its reason.
  await ownerPage.goto(`/ZZZ/${made.slug}`);await ownerPage.locator('[data-view="settings"]').click();
  await expect(ownerPage.locator('[data-admin-visit]')).toContainText('Sửa giao diện');
  await expect(ownerPage.locator('[data-reason]')).toHaveText('Shop nhờ đổi tên hiển thị và thêm nút gọi');
 }finally{await owner.close();}
});

/**
 * The enrolment itself, through the screens a person actually sees (lát A2). Every other case here starts with the
 * second factor already on, so without this one the three screens would ship untested.
 */
test('enrolment: administration is unreachable until the second factor is on, and the codes are shown once',async({page,admin})=>{
 // Back to an administrator who has not enrolled, which is how bootstrap leaves one.
 await admin.db.query('UPDATE platform_admins SET totp_secret=NULL,totp_enrolled_at=NULL');
 await page.goto('/gov/login');
 await page.getByLabel('Tài khoản',{exact:true}).fill('boss');
 await page.getByLabel('Mật khẩu',{exact:true}).fill(secret);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 // Signed in, but the work is not there: the enrolment screen is, and nothing else.
 await expect(page.locator('[data-two-factor="start"]')).toBeVisible();
 await expect(page.getByRole('heading',{name:`Xin chào, ${admin.username}`})).toHaveCount(0);
 // And not reachable by calling the API directly either, which is the half a page alone would leave open.
 expect((await page.request.get(`${origin}/gov/api/shops`)).status()).toBe(403);

 await page.getByRole('button',{name:'Bắt đầu',exact:true}).click();
 const shown=await page.locator('[data-totp-secret]').innerText();
 expect(shown).toMatch(/^[A-Z2-7]{32}$/);
 // A wrong code changes nothing: the administrator is still able to sign in with the password alone.
 await page.getByLabel('Mã 6 số đang hiện trong ứng dụng',{exact:true}).fill('000000');
 await page.getByRole('button',{name:'Bật xác thực hai bước',exact:true}).click();
 // Narrowed to main: Next renders __next-route-announcer__ with role=alert on every page (operations-gotchas.md).
 await expect(page.getByRole('main').getByRole('alert')).toContainText('Mã không đúng');
 expect((await admin.db.query('SELECT totp_enrolled_at FROM platform_admins')).rows[0].totp_enrolled_at).toBeNull();

 await page.getByLabel('Mã 6 số đang hiện trong ứng dụng',{exact:true}).fill(code(fromBase32(shown),stepAt(new Date())));
 await page.getByRole('button',{name:'Bật xác thực hai bước',exact:true}).click();
 await expect(page.locator('[data-two-factor="codes"]')).toBeVisible();
 const codes=await page.locator('[data-backup-codes] code').allInnerTexts();
 expect(codes).toHaveLength(10);
 // The way on is closed until the person says they kept the codes; there is no second chance to read them.
 const enter=page.getByRole('button',{name:'Vào quản trị',exact:true});
 await expect(enter).toBeDisabled();
 await page.getByRole('checkbox',{name:'Tôi đã lưu mười mã này'}).check();
 await enter.click();
 await expect(page.getByRole('heading',{name:`Xin chào, ${admin.username}`})).toBeVisible();
 await page.reload();
 await expect(page.locator('[data-backup-codes]')).toHaveCount(0);
});

// Cửa duyệt ảnh (migration 023): the operator sees each waiting upload with the file itself, approves it, or refuses it
// with a reason the shop will read. Nothing without a signed-in operator with the second factor.
test('image gate: waiting uploads are approved or refused from /gov, each decision on the record',async({page,admin})=>{
 expect((await page.request.get('/gov/api/media')).status()).toBe(401);
 const actor=(await admin.db.query('SELECT id FROM platform_admins')).rows[0].id;
 await admin.db.query('TRUNCATE media_assets');
 const shop=await new ShopProvisioning(admin.db).create(actor,{name:'Quán Chờ Ảnh',ownerUsername:'quan-cho-anh',ownerEmail:'cho@example.com',googleUrl:''});
 const queue=(url:string)=>admin.db.query(`INSERT INTO media_assets(shop_id,url,kind,content_type,size_bytes,uploaded_by)VALUES($1,$2,'image','image/jpeg',204800,'owner:x')RETURNING id`,[shop.shopId,url]).then(r=>r.rows[0].id as string);
 const first=await queue('https://media.example/cho/1.jpg'),second=await queue('https://media.example/cho/2.jpg');
 await page.goto('/gov/login');
 await page.getByLabel('Tài khoản',{exact:true}).fill('boss');
 await page.getByLabel('Mật khẩu',{exact:true}).fill(secret);
 await page.getByLabel('Mã xác thực',{exact:true}).fill(code(admin.app,stepAt(new Date())));
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 const panel=page.locator('[data-media-review]');
 await expect(panel.getByRole('heading')).toContainText('Ảnh chờ duyệt');
 await expect(panel.locator('[data-media-item]')).toHaveCount(2);
 await expect(panel.locator(`[data-media-item="${first}"] img`)).toHaveAttribute('src','https://media.example/cho/1.jpg');
 await expect(panel.locator(`[data-media-item="${first}"]`)).toContainText('Quán Chờ Ảnh');
 await panel.locator(`[data-media-item="${first}"]`).getByRole('button',{name:'Duyệt',exact:true}).click();
 await expect(panel.locator(`[data-media-item="${first}"]`)).toHaveCount(0);
 await panel.locator(`[data-media-item="${second}"]`).getByRole('button',{name:'Từ chối…',exact:true}).click();
 await panel.getByLabel('Lý do (shop sẽ đọc)').fill('Logo của một thương hiệu khác');
 await panel.getByRole('button',{name:'Xác nhận từ chối',exact:true}).click();
 await expect(panel.locator('[data-media-empty]')).toBeVisible();
 expect((await admin.db.query('SELECT id,state,reason,reviewed_by FROM media_assets ORDER BY created_at,id')).rows.map(r=>[r.id,r.state,r.reason,r.reviewed_by]).sort())
  .toEqual([[first,'approved',null,actor],[second,'rejected','Logo của một thương hiệu khác',actor]].sort());
 expect((await admin.db.query("SELECT action FROM admin_audit WHERE action LIKE 'media.%' ORDER BY id")).rows.map(r=>r.action)).toEqual(['media.approve','media.reject']);
 // Cross-origin decisions are refused like every other administrative write.
 expect((await page.request.post(`/gov/api/media/${first}`,{headers:{Origin:'https://evil.example'},data:{decision:'approve'}})).status()).toBe(403);
});
