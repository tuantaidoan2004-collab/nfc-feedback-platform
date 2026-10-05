import {test as base,expect,type Page} from '@playwright/test';
import {Pool} from 'pg';
import http from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {AdminAuth} from '../lib/admin/auth';
import {code,fromBase32,newSecret,seal,stepAt} from '../lib/admin/totp';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {addExperience} from '../repository-tests/owner-fixture';
import {openEndedPost} from './open-ended-post';
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
 await signIn(page,admin.username,admin.app);

 // The template comes first: one button, then a row marked as the template with its page live and no owner.
 await page.getByRole('button',{name:'Tạo shop template',exact:true}).click();
 const templateRow=page.locator('tr[data-template]');
 await expect(templateRow).toHaveCount(1);
 await expect(templateRow).toContainText('TEMPLATE');
 await expect(templateRow).toContainText('YOUR SHOP');
 await expect(page.getByRole('button',{name:'Tạo shop template',exact:true})).toHaveCount(0);
 await expect(templateRow.getByRole('button')).toHaveCount(0);
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Đưa template về mặc định mới',exact:true}).click();
 await expect(page.getByRole('main')).toContainText('Template đã dùng cấu hình mặc định mới');
 expect((await admin.db.query("SELECT count(*)::int n FROM admin_audit WHERE action='template.reset'")).rows[0].n).toBe(1);
 const templateSlug=(await admin.db.query('SELECT slug FROM shops WHERE is_template')).rows[0].slug;
 expect((await page.request.get(`/${templateSlug}`)).status()).toBe(200);

 await page.getByLabel('Tên shop',{exact:true}).fill('Cà Phê Ban Mai');
 await page.getByLabel('Tài khoản chủ shop',{exact:true}).fill('caphe-banmai');
 await page.getByLabel('Email chủ shop',{exact:true}).fill('chu@example.com');
 await page.getByLabel('Place ID (bỏ trống nếu chưa có)',{exact:true}).fill('ChIJN1t_tDeuEmsRUsoyG83frY4');
 // The ten canvas templates (đợt ②); the plainest is preselected, so a hurried operator still gets a clean page.
 const choice=page.locator('select[data-template-choice]');
 await expect(choice.locator('option')).toHaveText(['Basic 1','Không gian thật','Hiện đại','Nút đơn','Interactive card · Party','Illustrate · Nha khoa','Khách sạn',
  'Dynamic movement','Nền cà phê đơn giản','Hair styling']);
 await expect(choice).toHaveValue('basic-1');
 await choice.selectOption('party');
 await page.getByRole('button',{name:'Tạo shop',exact:true}).click();

 await expect(page.getByRole('heading',{name:'Gửi liên kết này cho chủ shop'})).toBeVisible();
 // Selected by a data attribute, not a class: CSS modules hash class names at build time.
 const setupUrl=(await page.locator('[data-handover] code').first().textContent())??'';
 expect(setupUrl).toContain('/owner/setup/');
 // A7: the Google rules go with every handover, not after the shop's first mistake.
 await expect(page.locator('[data-handover-guide] a')).toHaveAttribute('href','/huong-dan-google');
 const slug=(await admin.db.query("SELECT slug FROM shops WHERE name='Cà Phê Ban Mai'")).rows[0].slug;
 await expect(page.getByRole('cell',{name:slug})).toBeVisible();
 const shopRow=page.locator('tr',{has:page.getByRole('cell',{name:slug})});
 await expect(shopRow.locator('[data-label="Trang"]')).toHaveText('1 trang');
 await expect(shopRow.locator('[data-publishing-state]')).toHaveText('đang chạy');
 // Lát S1 (audit A5): on a phone each shop is a card whose cells name their column, and nothing scrolls sideways.
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await shopRow.locator('[data-label="Chủ shop"]').evaluate(el=>getComputedStyle(el,'::before').content)).toBe('"Chủ shop"');
 await page.setViewportSize({width:1280,height:800});
 // The page is a copy of the chosen template, with the shop's name where the template had "Tên quán"; a shop made here
 // publishes at once (only a shop that signed itself up waits for its first publish).
 expect((await admin.db.query(`SELECT tv.template_key FROM shops s JOIN pages p ON p.shop_id=s.id JOIN page_releases r ON r.id=p.active_release_id
   JOIN template_versions tv ON tv.id=r.template_version_id WHERE s.slug=$1`,[slug])).rows).toEqual([{template_key:'party'}]);
 expect(await (await page.request.get(`/${slug}`)).text()).toContain('Cà Phê Ban Mai');

 // The shop opens the link itself and chooses a password the operator never sees.
 await page.goto(setupUrl);
 await expect(page.getByRole('heading',{name:'Đặt mật khẩu',exact:true})).toBeVisible();
 await page.getByLabel('Mật khẩu mới',{exact:true}).fill('chosen-by-the-shop');
 await page.getByLabel('Nhập lại',{exact:true}).fill('chosen-by-the-shop');
 await page.getByRole('button',{name:'Đặt mật khẩu',exact:true}).click();
 // Straight on to this shop's own sign-in, the way the shop experiences it: no address to find by hand.
 await expect(page).toHaveURL(`${origin}/owner/login?next=${encodeURIComponent(`/app/${slug}`)}`);
 await page.getByLabel('@handle hoặc email',{exact:true}).fill('caphe-banmai');
 await page.getByLabel('Mật khẩu',{exact:true}).fill('chosen-by-the-shop');
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page).toHaveURL(`${origin}/app/${slug}`);await expect(page.locator('[data-orb]')).toBeVisible();
 // Its page is in My Card: running, the link to open on other phones, and the way to ask the admin for changes.
 await page.goto(`/app/${slug}/my-card`);
 const card=page.locator(`[data-my-card="${slug}"]`);await expect(card.locator('[data-page-state]')).toHaveText('Đang chạy');
 await expect(card.getByRole('link',{name:'Mở trang'})).toHaveAttribute('href',`${origin}/${slug}`);
 await card.getByRole('button',{name:'Nhờ admin sửa',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('button',{name:/Nhờ admin sửa/})).toBeVisible();

 // Spent once: the same link is dead now that the password is set.
 await page.goto(setupUrl);
 await expect(page.getByRole('heading',{name:'Liên kết không dùng được'})).toBeVisible();

 // The template's account comes as a single-use link here too: no fixed `yourshop / 1` in any environment (27/09).
 await page.goto('/gov');
 await page.getByRole('button',{name:'Tạo tài khoản cho template (link đặt mật khẩu)',exact:true}).click();
 const templateLink=page.locator('[data-template-link] code');
 await expect(templateLink).toContainText('/owner/setup/');
 const templateSetup=(await templateLink.textContent())!;
 await expect(templateRow).toContainText('yourshop');
 await expect(templateRow.getByRole('button')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Tạo tài khoản cho template (link đặt mật khẩu)',exact:true})).toHaveCount(0);
 // Still signed in as the shop owner above, whose account has no access to the template: start from signed out.
 await page.context().clearCookies({name:'nfc_owner_v2'});
 const signInTemplate=async(password:string)=>{
  await page.goto(`/app/${templateSlug}`);
  await page.getByLabel('@handle hoặc email',{exact:true}).fill('yourshop');await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 };
 const inTemplate=async()=>{await expect(page).toHaveURL(`${origin}/app/${templateSlug}`);await expect(page.getByText('YOUR SHOP',{exact:true}).first()).toBeVisible();};
 await signInTemplate('1');
 await expect(page.getByText('Không thể đăng nhập',{exact:false})).toBeVisible();
 await page.goto(templateSetup);
 await page.getByLabel('Mật khẩu mới',{exact:true}).fill('template-password-one');
 await page.getByLabel('Nhập lại',{exact:true}).fill('template-password-one');
 await page.getByRole('button',{name:'Đặt mật khẩu',exact:true}).click();
 await signInTemplate('template-password-one');
 await inTemplate();

 // Password forgotten and the username locked out by failed attempts: one press closes the account and hands a new link.
 await page.context().clearCookies({name:'nfc_owner_v2'});
 for(let i=0;i<9;i++){ await signInTemplate('wrong-template-password'); await expect(page.getByText('Không thể đăng nhập',{exact:false})).toBeVisible(); }
 await page.goto('/gov');
 await page.getByRole('button',{name:'Tạo lại link đặt mật khẩu cho yourshop',exact:true}).click();
 await expect(templateLink).toContainText('/owner/setup/');
 const again=(await templateLink.textContent())!;
 expect(again).not.toBe(templateSetup);
 await expect.poll(async()=>(await admin.db.query("SELECT count(*)::int n FROM admin_audit WHERE action='template.account.link'")).rows[0].n).toBe(2);
 // The old password no longer opens it; the new link does.
 await signInTemplate('template-password-one');
 await expect(page.getByText('Không thể đăng nhập',{exact:false})).toBeVisible();
 await page.goto(again);
 await page.getByLabel('Mật khẩu mới',{exact:true}).fill('template-password-two');
 await page.getByLabel('Nhập lại',{exact:true}).fill('template-password-two');
 await page.getByRole('button',{name:'Đặt mật khẩu',exact:true}).click();
 await signInTemplate('template-password-two');
 await inTemplate();
});

test('a reissued link is only issued for the owner of the named shop, and always with its audit row',async({page,admin})=>{
 const actor=(await admin.db.query('SELECT id FROM platform_admins')).rows[0].id,shops=new ShopProvisioning(admin.db);
 const one=await shops.create(actor,{name:'Quán Một',ownerUsername:'quan-mot',ownerEmail:'mot@example.com',placeId:''});
 const two=await shops.create(actor,{name:'Quán Hai',ownerUsername:'quan-hai',ownerEmail:'hai@example.com',placeId:''});
 await signIn(page,admin.username,admin.app);
 const post=(data:unknown)=>page.request.post(`${origin}/gov/api/setup-links`,{headers:{origin},data});
 const trail=async()=>(await admin.db.query("SELECT shop_id,on_behalf_of FROM admin_audit WHERE action='owner.link.reissue'")).rows;
 // The template's own reissued links (earlier test) are not this test's business.
 const resets=async()=>(await admin.db.query("SELECT count(*)::int n FROM owner_setup_tokens WHERE purpose='reset' AND user_id NOT IN (SELECT id FROM owner_identities_v2 WHERE username='yourshop')")).rows[0].n;

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
/** An owner signing in to their giao diện chính, in a browser of their own. */
async function ownerSignIn(page:Page,username:string,password:string,slug:string){
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(`/app/${slug}`);
 await page.getByLabel('@handle hoặc email',{exact:true}).fill(username);await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page).toHaveURL(`${origin}/app/${slug}`);await expect(page.locator('[data-orb]')).toBeVisible();
}
async function standIn(page:Page,shop:string,scope:'overview'|'feedback'|'design',reason:string){
 await page.goto('/gov');
 await page.getByRole('row').filter({hasText:shop}).getByRole('button',{name:'Mạo danh',exact:true}).click();
 await page.getByRole('combobox',{name:'Phạm vi',exact:true}).selectOption(scope);
 await page.getByLabel('Lý do (chủ shop sẽ đọc)',{exact:true}).fill(reason);
 await page.getByRole('button',{name:'Mở dashboard',exact:true}).click();
 // The strip says it is a support session, on every screen of it (components/qs/support-banner.tsx).
 await expect(page.locator(`[data-impersonation="${scope}"]`)).toBeVisible();
 await expect(page.locator('[data-orb]')).toBeVisible();
}
const level=(page:Page,name:string)=>page.getByRole('radio',{name:new RegExp(`^${name}`)});

test('impersonation: cookie stays on one shop, support never exports, feedback only while the owner allows it',async({page,context,browser,admin},info)=>{
 const shopName='Quán Hỗ Trợ',ownerPassword='chosen-by-the-shop';
 const made=await new ShopProvisioning(admin.db).create((await admin.db.query('SELECT id FROM platform_admins')).rows[0].id,
  {name:shopName,ownerUsername:'quan-hotro',ownerEmail:'hotro@example.com',placeId:'ChIJN1t_tDeuEmsRUsoyG83frY4'});
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
 await expect(page).toHaveURL(`${origin}/app/${made.slug}`);
 await expect(page.locator('[data-impersonation] [data-admin-badge="Quitesensational"]')).toContainText('@QuitesensationalAdmin Tài');
 await expect(page.locator('[data-impersonation]')).toContainText(overviewReason);
 await page.locator('[data-impersonation]').screenshot({path:info.outputPath('admin-badge.png')});
 // On a phone the strip wraps to several lines; the frame leaves at least that much room under the last line of every tab
 // (it once left 130px under a strip of 190, and the end of each tab stayed behind it).
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.evaluate(()=>{const strip=document.querySelector('[data-impersonation]')!.getBoundingClientRect();
  return parseFloat(getComputedStyle(document.querySelector('[data-support]')!).paddingBottom)>=innerHeight-strip.top;})).toBe(true);
 await page.setViewportSize({width:1280,height:800});
 // Overview: the guest left two stars; what they wrote stays hidden, and nothing offers to handle it.
 await page.goto(`/app/${made.slug}/data`);await expect(page.locator('[data-impersonation="overview"]')).toBeVisible();
 await expect(page.locator('[data-item="private"]')).toHaveCount(1);
 await expect(page.getByText('Góp ý kín của khách')).toHaveCount(0);
 // No profile, no sign-out of the owner's account, no switches to move.
 await page.goto(`/app/${made.slug}/cai-dat?view=profile`);
 await expect(page.getByText('Quản trị đang xem thay mặt quán: không xem được hồ sơ cá nhân.')).toBeVisible();
 await expect(page.locator('[data-sign-out]')).toHaveCount(0);
 await page.goto(`/app/${made.slug}/quan-ly`);
 for(const name of ['Tắt','Khấc 1 · Xem','Khấc 2 · Sửa','Khấc 3 · Toàn quyền'])await expect(level(page,name)).toBeDisabled();

 const cookies=(await context.cookies()).filter(c=>c.name==='nfc_impersonation_v1');
 expect(cookies.map(c=>c.path).sort()).toEqual([`/app/${made.slug}`,`/api/owner/v2/${made.slug}`].sort());
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

 // The owner, in a browser of their own, switches reading on in Quản lý.
 const owner=await browser.newContext({baseURL:origin});
 try{
  const ownerPage=await owner.newPage();
  await ownerSignIn(ownerPage,'quan-hotro',ownerPassword,made.slug);
  await ownerPage.goto(`/app/${made.slug}/quan-ly`);
  await expect(level(ownerPage,'Tắt')).toBeChecked();
  await level(ownerPage,'Khấc 1 · Xem').check();
  await expect(ownerPage.locator('[data-support="view"]')).toBeVisible();

  await page.goto('/gov');
  await expect(page.getByRole('row').filter({hasText:shopName}).locator('[data-support-level="view"]')).toBeVisible();
  await standIn(page,shopName,'feedback','Shop nhờ đọc góp ý khách để phản hồi');
  await page.goto(`/app/${made.slug}/data`);
  await expect(page.getByText('Góp ý kín của khách')).toBeVisible();
  // Reading is all position 1 gives: the item opens on a note, not a form.
  await page.locator('[data-item="private"]').getByRole('button').first().click();
  await expect(page.locator('[data-read-only]')).toBeVisible();await expect(page.getByRole('button',{name:'Lưu',exact:true})).toHaveCount(0);
  // The call-back number never reaches support, whatever the switch position (F-003).
  expect((await context.request.get(`${api}?from=2026-01-01&to=2030-01-01`)).ok()).toBe(true);
  expect(((await (await context.request.get(`${api}?from=2026-01-01&to=2030-01-01`)).json()).records as {phone:string|null}[]).every(r=>r.phone===null)).toBe(true);
  await refusedExports();
  expect((await context.request.patch(api,{headers:{Origin:origin},data:patch})).status()).toBe(403);
  expect((await admin.db.query('SELECT count(*)::int n FROM owner_feedback_cases')).rows[0].n).toBe(0);
  expect((await admin.db.query("SELECT count(*)::int n FROM admin_audit WHERE action='impersonation.export'")).rows[0].n).toBe(0);

  // Switched off: support's next request is refused at once.
  await level(ownerPage,'Tắt').check();
  await expect(ownerPage.locator('[data-support="off"]')).toBeVisible();
  const after=await context.request.get(api);
  expect(after.status()).toBe(403);
  expect(await after.json()).toEqual({error:'SUPPORT_NOT_GRANTED'});

  await page.locator('[data-impersonation]').getByRole('button',{name:'Kết thúc phiên',exact:true}).click();
  await expect(page).toHaveURL(`${origin}/gov`);
  expect((await context.cookies()).filter(c=>c.name==='nfc_impersonation_v1')).toEqual([]);
  expect((await context.request.get(api)).status()).toBe(401);
  expect((await admin.db.query('SELECT end_reason FROM admin_impersonation_sessions ORDER BY created_at')).rows).toEqual([{end_reason:'superseded'},{end_reason:'ended'}]);

  // The owner sees both visits with the reason exactly as typed, and their own two switches.
  await ownerPage.reload();
  await expect(ownerPage.locator('[data-admin-visits] [data-admin-visit]')).toHaveCount(2);
  await expect(ownerPage.locator('[data-admin-visit] [data-admin-badge="Quitesensational"]')).toHaveCount(2);
  await expect(ownerPage.locator('[data-reason]').filter({hasText:overviewReason})).toHaveText(overviewReason);
  await expect(ownerPage.locator('[data-support-history]')).toContainText('Tắt bởi quan-hotro');
  await expect(ownerPage.locator('[data-support-history]')).toContainText('Khấc 1 · Xem bởi quan-hotro');
  await expect(ownerPage.locator('[data-impersonation]')).toHaveCount(0);
  await ownerPage.screenshot({path:info.outputPath('owner-visits.png'),fullPage:true});
  // The owner, unlike support, handles the feedback.
  await ownerPage.goto(`/app/${made.slug}/data`);await ownerPage.locator('[data-item="private"]').getByRole('button').first().click();
  await expect(ownerPage.getByRole('button',{name:'Lưu',exact:true})).toBeVisible();
 }finally{await owner.close();}
});

test('position 2: support edits and publishes the page in a design session, sees no figures, and the owner sees the visit',async({page,browser,admin})=>{
 const shopName='Quán Sửa Hộ',ownerPassword='chosen-by-the-shop';
 const made=await new ShopProvisioning(admin.db).create((await admin.db.query('SELECT id FROM platform_admins')).rows[0].id,
  {name:shopName,ownerUsername:'quan-suaho',ownerEmail:'suaho@example.com',placeId:'ChIJN1t_tDeuEmsRUsoyG83frY4'});
 await new OwnerSetupLinks(admin.db).consume(made.setupToken,ownerPassword);
 await addExperience(admin.db,made.slug,2,'Không cho quản trị thấy');
 const owner=await browser.newContext({baseURL:origin});
 try{
  const ownerPage=await owner.newPage();
  await ownerSignIn(ownerPage,'quan-suaho',ownerPassword,made.slug);
  await ownerPage.goto(`/app/${made.slug}/quan-ly`);
  await level(ownerPage,'Khấc 2 · Sửa').check();
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
  // No figures and no rows: the session reaches the page and nothing else.
  expect((await page.request.get(`/api/owner/v2/${made.slug}/summary`)).status()).toBe(403);
  await expect(page.getByText('Không cho quản trị thấy')).toHaveCount(0);
  // The page itself, through the design API (no editor since 05/10; the admin's edits go the same way): saved, published,
  // both on the books, and the strip still above the owner's tabs.
  await page.goto(`/app/${made.slug}/my-card`);await expect(page.locator('[data-impersonation="design"]')).toBeVisible();
  const designApi=`/api/owner/v2/${made.slug}/design`,headers={Origin:origin};
  const state=await (await page.request.get(designApi)).json();
  const saved=await page.request.put(designApi,{headers,data:{expectedRevision:state.draft.revision,config:{...state.draft.config,name:'Quán Đã Sửa Hộ'}}});
  expect(saved.status()).toBe(200);
  expect((await page.request.post(designApi,{headers,data:{action:'publish',expectedRevision:(await saved.json()).revision}})).status()).toBe(200);
  expect((await admin.db.query("SELECT action FROM admin_audit WHERE action LIKE 'impersonation.design.%' ORDER BY id")).rows.map(r=>r.action))
   .toEqual(['impersonation.design.save','impersonation.design.publish']);
  expect((await (await page.request.get(designApi)).json()).live.config.name).toBe('Quán Đã Sửa Hộ');
  // The owner sees the visit and its reason.
  await ownerPage.goto(`/app/${made.slug}/quan-ly`);
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
 const shop=await new ShopProvisioning(admin.db).create(actor,{name:'Quán Chờ Ảnh',ownerUsername:'quan-cho-anh',ownerEmail:'cho@example.com',placeId:''});
 // Uploads whose signed link expired long ago, so they can be decided at once.
 const queue=(url:string,age='1 hour')=>admin.db.query(`INSERT INTO media_assets(shop_id,url,kind,content_type,size_bytes,uploaded_by,created_at)
  VALUES($1,$2,'image','image/jpeg',204800,'owner:x',clock_timestamp()-$3::interval)RETURNING id`,[shop.shopId,url,age]).then(r=>r.rows[0].id as string);
 const first=await queue('https://media.example/cho/1.jpg'),second=await queue('https://media.example/cho/2.jpg');
 // Rà bảo mật 29/09, C3b-1: one uploaded just now, whose link still works, so its file can still change.
 const fresh=await queue('https://media.example/cho/3.jpg','0 seconds');
 await page.clock.install();
 await page.goto('/gov/login');
 await page.getByLabel('Tài khoản',{exact:true}).fill('boss');
 await page.getByLabel('Mật khẩu',{exact:true}).fill(secret);
 await page.getByLabel('Mã xác thực',{exact:true}).fill(code(admin.app,stepAt(new Date())));
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 const panel=page.locator('[data-media-review]');
 await expect(panel.getByRole('heading')).toContainText('Ảnh chờ duyệt');
 await expect(panel.locator('[data-media-item]')).toHaveCount(3);
 const waiting=panel.locator(`[data-media-item="${fresh}"]`);
 await expect(waiting.locator('[data-media-uploading]')).toContainText('duyệt được từ');
 await expect(waiting.getByRole('button',{name:'Duyệt',exact:true})).toBeDisabled();
 await expect(waiting.getByRole('button',{name:'Từ chối…',exact:true})).toBeDisabled();
 await expect(panel.locator(`[data-media-item="${first}"] [data-media-uploading]`)).toHaveCount(0);
 await expect(panel.locator(`[data-media-item="${first}"] img`)).toHaveAttribute('src','https://media.example/cho/1.jpg');
 await expect(panel.locator(`[data-media-item="${first}"]`)).toContainText('Quán Chờ Ảnh');
 await panel.locator(`[data-media-item="${first}"]`).getByRole('button',{name:'Duyệt',exact:true}).click();
 await expect(panel.locator(`[data-media-item="${first}"]`)).toHaveCount(0);
 await panel.locator(`[data-media-item="${second}"]`).getByRole('button',{name:'Từ chối…',exact:true}).click();
 await panel.getByLabel('Lý do (shop sẽ đọc)').fill('Logo của một thương hiệu khác');
 await panel.getByRole('button',{name:'Xác nhận từ chối',exact:true}).click();
 await expect(panel.locator(`[data-media-item="${second}"]`)).toHaveCount(0);
 // The panel's clock passes the link's lifetime and its buttons open; the server's clock has not, and it still refuses --
 // by the panel, and by hand.
 await page.clock.fastForward('06:05');
 await expect(waiting.locator('[data-media-uploading]')).toHaveCount(0);
 await waiting.getByRole('button',{name:'Duyệt',exact:true}).click();
 await expect(panel.getByRole('alert')).toContainText('Link tải lên của tệp này còn hiệu lực');
 const early=await page.request.post(`/gov/api/media/${fresh}`,{headers:{origin},data:{decision:'approve'}});
 expect([early.status(),(await early.json()).error]).toEqual([409,'MEDIA_STILL_UPLOADING']);
 // Once it has really expired, it is decided like any other.
 await admin.db.query("UPDATE media_assets SET created_at=clock_timestamp()-interval '1 hour' WHERE id=$1",[fresh]);
 await waiting.getByRole('button',{name:'Duyệt',exact:true}).click();
 await expect(panel.locator('[data-media-empty]')).toBeVisible();
 expect((await admin.db.query('SELECT id,state,reason,reviewed_by FROM media_assets ORDER BY created_at,id')).rows.map(r=>[r.id,r.state,r.reason,r.reviewed_by]).sort())
  .toEqual([[first,'approved',null,actor],[second,'rejected','Logo của một thương hiệu khác',actor],[fresh,'approved',null,actor]].sort());
 expect((await admin.db.query("SELECT action FROM admin_audit WHERE action LIKE 'media.%' ORDER BY id")).rows.map(r=>r.action)).toEqual(['media.approve','media.reject','media.approve']);
 // Cross-origin decisions are refused like every other administrative write.
 expect((await page.request.post(`/gov/api/media/${first}`,{headers:{Origin:'https://evil.example'},data:{decision:'approve'}})).status()).toBe(403);
});

// Lát P4: an owner's emergency stop reaches /gov; the operator starts the page again and records how it was handled.
test('page incidents: an emergency stop waits in /gov, is lifted, handled and recorded; the guest sees the page paused meanwhile',async({page,admin})=>{
 const actor=(await admin.db.query('SELECT id FROM platform_admins')).rows[0].id;
 const shop=await new ShopProvisioning(admin.db).create(actor,{name:'Quán Tạm Dừng',ownerUsername:'quan-tam-dung',ownerEmail:'dung@example.com',placeId:''});
 const {PublishingAdmin}=await import('../lib/publishing/repository');
 await new PublishingAdmin(admin.db,async()=>({actorId:'owner:fixture'})).pausePage({shopId:shop.shopId,pageId:shop.pageId},'emergency');
 const incident=(await admin.db.query("INSERT INTO page_incidents(shop_id,page_id,reported_by,reason)VALUES($1,$2,$3,'Nút Google mở sai link')RETURNING id",
  [shop.shopId,shop.pageId,shop.ownerUserId])).rows[0].id as string;
 const guest=await page.request.get(`/${shop.slug}`);
 expect(guest.status()).toBe(200);expect(await guest.text()).toContain('Trang tạm ngừng');
 expect((await page.request.get('/gov/api/incidents')).status()).toBe(401);
 await signIn(page,admin.username,admin.app);
 const row=page.locator(`[data-incident="${incident}"]`);
 await expect(row).toContainText('Quán Tạm Dừng');await expect(row).toContainText('Nút Google mở sai link');
 await expect(row.locator('[data-incident-state]')).toContainText('chủ quán dừng khẩn cấp');
 await row.getByRole('button',{name:'Mở lại trang',exact:true}).click();
 await expect(row.locator('[data-incident-state]')).toHaveText('đang chạy');
 expect(await (await page.request.get(`/${shop.slug}`)).text()).not.toContain('Trang tạm ngừng');
 page.once('dialog',dialog=>void dialog.accept('Đã gọi chủ quán, lỗi do link Google cũ'));
 await row.getByRole('button',{name:'Đã xử lý',exact:true}).click();
 await expect(page.locator('[data-incidents-empty]')).toBeVisible();
 expect((await admin.db.query("SELECT action FROM admin_audit WHERE action LIKE 'page.%' ORDER BY id")).rows.map(r=>r.action)).toEqual(['page.resume','page.incident.resolve']);
 expect((await page.request.post(`/gov/api/pages/${shop.pageId}`,{headers:{Origin:'https://evil.example'},data:{action:'close'}})).status()).toBe(403);
});

// Kịch bản mục 4: an account that signed itself up uses everything at once, but its shop's first publish waits here: Tài sees
// the page as the guest would, approves that very draft, or sends it back with a reason the owner reads in the editor.
test('first publish: a signed-up shop\'s page waits in /gov with its picture, is approved or sent back, each decision on the record',async({page,browser,admin})=>{
 const {AccountSignup}=await import('../lib/account/signup');
 const {OwnerPages}=await import('../lib/owner/pages');
 const {OwnerDesign}=await import('../lib/owner/design');
 const ask=async(handle:string)=>{
  const made=await new AccountSignup(admin.db).create({username:handle,email:`${handle}@example.test`,password:'a-long-test-password'},null);
  const page=await new OwnerPages(admin.db).create(made.session.token,made.slug,{template:'basic-1',label:'Trang chính'});
  expect(await new OwnerDesign(admin.db).publish(made.session.token,made.slug,{action:'publish',expectedRevision:1},page.slug)).toEqual({review:'pending',revision:1});
  const pageId=(await admin.db.query('SELECT id FROM pages WHERE slug=$1',[page.slug])).rows[0].id as string;
  return {...made,page:page.slug,pageId};
 };
 const first=await ask('quan-cho-duyet'),second=await ask('quan-bi-tra-lai');
 // Nothing of it without a signed-in operator.
 expect((await page.request.get(`/gov/xem/${first.pageId}`)).status()).toBe(404);
 expect((await page.request.post(`/gov/api/publish-reviews/${randomUUID()}`,{headers:{origin},data:{decision:'reject',reason:'Chưa được'}})).status()).toBe(401);
 expect(await (await page.request.get(`/${first.page}`)).text()).not.toContain('data-google');
 await signIn(page,admin.username,admin.app);
 const panel=page.locator('[data-publish-reviews]');
 const item=panel.locator(`[data-publish-review="${first.page}"]`);
 await expect(item).toContainText('Quán của @quan-cho-duyet');
 await expect(item).toContainText('@quan-cho-duyet');await expect(item).toContainText('quan-cho-duyet@example.test');
 // The draft as the guest would get it: drawn small here, full size behind the link.
 await expect(item.frameLocator('iframe').locator('main.cv')).toBeVisible();
 await expect(item.getByRole('link',{name:'Mở bản nháp ↗'})).toHaveAttribute('href',`/gov/xem/${first.pageId}`);
 const draft=await page.request.get(`/gov/xem/${first.pageId}`);expect(draft.status()).toBe(200);
 expect(await draft.text()).toContain('Quán của @quan-cho-duyet');
 await item.getByRole('button',{name:'Duyệt và phát hành'}).click();
 await expect(item).toHaveCount(0);
 expect(await (await page.request.get(`/${first.page}`)).text()).toContain('data-google');
 // Sent back, with a reason the owner will read.
 const other=panel.locator(`[data-publish-review="${second.page}"]`);
 await other.getByRole('button',{name:'Chưa duyệt…'}).click();
 await other.getByLabel('Lý do (chủ quán sẽ đọc)').fill('Trang dùng tên của một thương hiệu khác');
 await other.getByRole('button',{name:'Gửi lại cho chủ quán'}).click();
 await expect(panel.locator('[data-publish-reviews-empty]')).toBeVisible();
 expect((await admin.db.query("SELECT action FROM admin_audit WHERE action LIKE 'shop.first_publish.%' ORDER BY id")).rows.map(r=>r.action))
  .toEqual(['shop.first_publish.approve','shop.first_publish.reject']);
 // A draft that no longer waits is not on show; a decision from another site is refused like every administrative write.
 expect((await page.request.get(`/gov/xem/${first.pageId}`)).status()).toBe(404);
 const decided=(await admin.db.query('SELECT id FROM publish_reviews ORDER BY requested_at LIMIT 1')).rows[0].id;
 expect((await page.request.post(`/gov/api/publish-reviews/${decided}`,{headers:{Origin:'https://evil.example'},data:{decision:'reject',reason:'x'}})).status()).toBe(403);
 // The owner reads why in My Card, and can ask again.
 await admin.db.query('UPDATE shops SET onboarded_at=clock_timestamp() WHERE slug=$1',[second.slug]);
 const owner=await browser.newContext({baseURL:origin});
 try{
  const o=await owner.newPage();await ownerSignIn(o,'quan-bi-tra-lai','a-long-test-password',second.slug);
  await o.setViewportSize({width:1280,height:900});await o.goto(`/app/${second.slug}/my-card`);
  const card=o.locator(`[data-my-card="${second.page}"]`);await expect(card.locator('[data-page-state]')).toHaveText('Chưa được duyệt');
  await card.getByRole('button',{name:'Phát hành / Nhờ sửa',exact:true}).click();
  const sheet=o.getByRole('dialog');await expect(sheet.getByText('Admin nhắn: “Trang dùng tên của một thương hiệu khác”',{exact:false})).toBeVisible();
  await sheet.getByRole('button',{name:/Phát hành luôn/}).click();await expect(sheet.locator('[data-done="review"]')).toBeVisible({timeout:20_000});
 }finally{await owner.close();}
});

/**
 * Lát D4c: a stand-in for Google on 3329 (the harness points the dev app's two Google addresses at it). It does what
 * Google does for this flow: remembers the PKCE challenge and nonce on /auth, sends the browser back with a code, and on
 * /token checks the client's secret, the verifier and the redirect before answering with an ID token for `google.who`.
 */
const GOOGLE_CLIENT='harness-client.apps.googleusercontent.com';
const google={who:{sub:'5550001',email:'chu.moi@gmail.com',email_verified:true} as Record<string,unknown>,
 codes:new Map<string,{nonce:string|null;challenge:string|null;redirect:string|null;who:Record<string,unknown>}>()};
let fakeGoogle:http.Server;
test.beforeAll(async()=>{
 fakeGoogle=http.createServer(async(req,res)=>{
  const url=new URL(req.url!,'http://127.0.0.1:3329');
  if(url.pathname==='/auth'){
   const code=randomUUID();
   google.codes.set(code,{nonce:url.searchParams.get('nonce'),challenge:url.searchParams.get('code_challenge'),redirect:url.searchParams.get('redirect_uri'),who:{...google.who}});
   // A page the person clicks on, as Google's account chooser is: the way back then starts on this other site, and a
   // SameSite=Strict cookie stays behind -- a 302 here would have kept the app's own page as the initiator and hidden that.
   const back=`${url.searchParams.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(url.searchParams.get('state')??'')}`.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
   res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(`<!doctype html><a id="choose-account" href="${back}">Chọn tài khoản</a>`);return;
  }
  if(url.pathname==='/token'){
   let body='';for await(const chunk of req)body+=chunk;
   const form=new URLSearchParams(body),entry=google.codes.get(form.get('code')??'');
   const ok=entry&&form.get('client_id')===GOOGLE_CLIENT&&form.get('client_secret')==='harness-google-secret'&&form.get('redirect_uri')===entry.redirect
    &&createHash('sha256').update(form.get('code_verifier')??'').digest('base64url')===entry.challenge;
   if(!ok){res.writeHead(400,{'content-type':'application/json'});res.end('{"error":"invalid_grant"}');return;}
   google.codes.delete(form.get('code')!);
   const claims={iss:'https://accounts.google.com',aud:GOOGLE_CLIENT,exp:Math.floor(Date.now()/1000)+300,nonce:entry.nonce,...entry.who};
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id_token:`e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`}));return;
  }
  res.writeHead(404);res.end();
 });
 // Every interface: the browser reaches it as localhost (another site), the app's server as 127.0.0.1.
 await new Promise<void>(resolve=>fakeGoogle.listen(3329,()=>resolve()));
});
test.afterAll(()=>new Promise<void>(resolve=>fakeGoogle.close(()=>resolve())));

test('D4c: an owner signs up with Google, signs in with Google, and an older account links Google from Cài đặt → Hồ sơ; nothing links by email',async({browser,admin})=>{
 // Fresh names per run: the harness keeps one database for the whole file, so a repeated run must not meet its own rows.
 const run=`${Date.now()}`.slice(-9),sub=(n:number)=>`${n}${run}`;
 const context=await browser.newContext({baseURL:origin}),o=await context.newPage();
 // The app, and the stand-in for Google at localhost:3329 -- a different site, as Google is.
 await o.route('**/*',r=>{const url=new URL(r.request().url());return url.hostname==='127.0.0.1'||url.host==='localhost:3329'?r.continue():r.abort();});
 const googleLogin=async()=>{await context.clearCookies();await o.goto('/owner/login');await o.locator('[data-google-login] button').click();await o.locator('#choose-account').click();};
 // Signing up with Google (kịch bản mục 4, bước 1): no email typed, no password; the account and its shop exist at once, and
 // the onboarding goes on.
 google.who={sub:sub(1),email:`chu.moi.${run}@gmail.com`,email_verified:true};
 await o.goto('/bat-dau');
 await o.getByLabel('Tên của bạn').fill('Chủ Mới');await o.getByRole('button',{name:'Tiếp tục',exact:true}).click();
 await o.getByRole('button',{name:/Cà phê/}).click();
 await o.getByLabel('Tên đăng nhập').fill(`google-${run}`);
 await o.getByRole('button',{name:'Tiếp tục với Google'}).click();await o.locator('#choose-account').click();
 await expect(o).toHaveURL(/\/bat-dau\/tien-trinh$/);
 expect((await admin.db.query("SELECT email,google_sub FROM owner_identities_v2 WHERE username=$1",[`google-${run}`])).rows).toEqual([{email:`chu.moi.${run}@gmail.com`,google_sub:sub(1)}]);
 expect((await admin.db.query(`SELECT s.self_signup,s.business_kind FROM owner_memberships_v2 m JOIN shops s ON s.id=m.shop_id JOIN owner_identities_v2 i ON i.id=m.user_id
  WHERE i.username=$1`,[`google-${run}`])).rows).toEqual([{self_signup:true,business_kind:'cafe'}]);
 // Signed out, the same Google account signs back in, to the onboarding it has not finished.
 await googleLogin();await expect(o).toHaveURL(/\/bat-dau\/tien-trinh$/);
 // A Google account no account is linked to opens nothing and says what to do -- even when its email matches an account.
 const actor=(await admin.db.query('SELECT id FROM platform_admins LIMIT 1')).rows[0].id;
 const owner=await new ShopProvisioning(admin.db).create(actor,{name:'Quán Có Mật Khẩu',ownerUsername:`co-mat-khau-${run}`,ownerEmail:`cu.${run}@gmail.com`,placeId:''});
 await new OwnerSetupLinks(admin.db).consume(owner.setupToken,'old-owner-password');
 google.who={sub:sub(2),email:`cu.${run}@gmail.com`,email_verified:true};
 await googleLogin();
 await expect(o).toHaveURL(/\/owner\/login\?google=GOOGLE_NOT_LINKED$/);
 await expect(o.locator('[data-google-notice]')).toContainText('chưa nối với tài khoản nào');
 // Linked on purpose, from Cài đặt → Hồ sơ, while signed in with the password: then Google opens that shop.
 const passwordSignIn=async(page:Page)=>{await page.goto(`/app/${owner.slug}`);
  await page.getByLabel('@handle hoặc email',{exact:true}).fill(`co-mat-khau-${run}`);await page.getByLabel('Mật khẩu',{exact:true}).fill('old-owner-password');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).toHaveURL(`${origin}/app/${owner.slug}`);
  await page.goto(`/app/${owner.slug}/cai-dat?view=profile`);};
 await passwordSignIn(o);
 // G1 (rà bảo mật 29/09): linking asks for the account's password, and a wrong one goes nowhere near Google.
 const connect=o.locator('[data-google-connect]'),typed=connect.getByLabel('Mật khẩu hiện tại (để chắc đây là bạn)');
 await typed.fill('not-the-owner-password');await connect.getByRole('button').click();
 await expect(o.locator('[data-google-notice]')).toContainText('Mật khẩu hiện tại chưa đúng');
 await expect(o.locator('[data-google-link]')).toHaveAttribute('data-google-link','none');
 await typed.fill('old-owner-password');await connect.getByRole('button').click();await o.locator('#choose-account').click();
 await expect(o.locator('[data-google-notice]')).toContainText('Đã kết nối Google');
 await expect(o.locator('[data-google-link]')).toHaveAttribute('data-google-link','linked');
 expect((await admin.db.query("SELECT google_sub FROM owner_identities_v2 WHERE username=$1",[`co-mat-khau-${run}`])).rows[0].google_sub).toBe(sub(2));
 await googleLogin();
 await expect(o).toHaveURL(new RegExp(`/app/${owner.slug}$`));await expect(o.locator('[data-orb]')).toBeVisible();
 // G1: unlinking, from a session signed in with the password, asks for the password too and signs out every other
 // session -- here the one Google just opened; then Google opens nothing.
 const byPassword=await browser.newContext({baseURL:origin}),p=await byPassword.newPage();
 await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await passwordSignIn(p);
 await p.locator('[data-google-unlink-open]').click();
 const unlink=p.locator('[data-google-unlink]');
 await unlink.getByLabel('Mật khẩu hiện tại',{exact:true}).fill('wrong-password-here');await unlink.getByRole('button',{name:'Ngắt kết nối Google',exact:true}).click();
 await expect(unlink.locator('[data-google-unlink-notice]')).toContainText('Mật khẩu hiện tại chưa đúng');
 await unlink.getByLabel('Mật khẩu hiện tại',{exact:true}).fill('old-owner-password');await unlink.getByRole('button',{name:'Ngắt kết nối Google',exact:true}).click();
 await expect(p.locator('[data-google-notice]')).toContainText('Đã ngắt kết nối Google');
 await expect(p.locator('[data-google-link]')).toHaveAttribute('data-google-link','none');
 expect((await admin.db.query("SELECT google_sub FROM owner_identities_v2 WHERE username=$1",[`co-mat-khau-${run}`])).rows[0].google_sub).toBeNull();
 await o.reload();await expect(o.getByLabel('@handle hoặc email',{exact:true})).toBeVisible();
 await googleLogin();await expect(o).toHaveURL(/\/owner\/login\?google=GOOGLE_NOT_LINKED$/);
 await byPassword.close();
 // An unverified address, and a trip this browser never started, open nothing.
 google.who={sub:sub(3),email:`new.${run}@example.com`,email_verified:false};
 await googleLogin();
 await expect(o).toHaveURL(/\/owner\/login\?google=GOOGLE_EMAIL_UNVERIFIED$/);
 const stray=await o.request.get('/api/owner/v2/google/callback?code=x&state=y');
 expect(await stray.text()).toContain('google=TRIP_INVALID');expect(stray.headers()['set-cookie']??'').not.toContain('nfc_owner_v2=');
 // The door to Google itself: only this site's own pages may open it.
 expect((await o.request.post('/api/owner/v2/google/start',{headers:{origin:'https://evil.test','content-type':'application/x-www-form-urlencoded'},data:'intent=login'})).status()).toBe(403);
 // Rà bảo mật 29/09, U1: and a script that sends this site's headers still cannot make it hold a body without end.
 expect(await openEndedPost('/api/owner/v2/google/start','application/x-www-form-urlencoded',20_000)).toBe(413);
 await context.close();
});
