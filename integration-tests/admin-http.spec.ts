import {test as base,expect,type Page} from '@playwright/test';
import {Pool} from 'pg';
import {AdminAuth} from '../lib/admin/auth';
import {ShopProvisioning} from '../lib/admin/provisioning';
import {OwnerSetupLinks} from '../lib/owner/setup-link';
import {addExperience} from '../repository-tests/owner-fixture';
const uri=process.env.NFC_TEST_DATABASE_URL,schema=process.env.NFC_TEST_SCHEMA;
if(uri!=='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test'||!/^nfc_ui_test_[a-f0-9]{32}$/.test(schema??''))throw Error('Isolated harness required');
const secret='a-sufficiently-long-admin-secret';
const origin='http://127.0.0.1:3317';
const test=base.extend<{admin:{db:Pool;username:string}}>({admin:async({},provide)=>{
 const db=new Pool({connectionString:uri,options:`-c search_path=${schema}`});
 try{await db.query('TRUNCATE platform_admins,admin_login_limits CASCADE');
  await new AdminAuth(db).bootstrap('boss',secret,async()=>{});
  await provide({db,username:'boss'});}finally{await db.end();}
}});
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});

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
 const body={username:'boss',password:secret};
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
 expect((await request.delete(`${built}/api/owner/v2/one/impersonation`,{headers:{origin:built}})).status()).toBe(404);
 expect((await request.post(`${built}/gov/api/login`,{headers:{origin:built},data:{username:'boss',password:secret}})).status()).toBe(404);
 expect((await request.post(`${built}/gov/api/logout`,{headers:{origin:built},data:{}})).status()).toBe(404);
});

test('generate a shop, hand over the link, and the shop signs in on its own',async({page,admin})=>{
 await page.goto('/gov/login');
 await page.getByLabel('Tài khoản',{exact:true}).fill('boss');
 await page.getByLabel('Mật khẩu',{exact:true}).fill(secret);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.getByRole('heading',{name:`Xin chào, ${admin.username}`})).toBeVisible();

 await page.getByLabel('Tên shop',{exact:true}).fill('Cà Phê Ban Mai');
 await page.getByLabel('Tài khoản chủ shop',{exact:true}).fill('caphe-banmai');
 await page.getByLabel('Email chủ shop',{exact:true}).fill('chu@example.com');
 await page.getByLabel('Đường dẫn Google (bỏ trống nếu chưa có)',{exact:true}).fill('https://maps.google.com/?cid=7');
 await page.getByRole('button',{name:'Tạo shop',exact:true}).click();

 await expect(page.getByRole('heading',{name:'Gửi liên kết này cho chủ shop'})).toBeVisible();
 // Selected by a data attribute, not a class: CSS modules hash class names at build time.
 const setupUrl=(await page.locator('[data-handover] code').first().textContent())??'';
 expect(setupUrl).toContain('/owner/setup/');
 const slug=(await admin.db.query("SELECT slug FROM shops WHERE name='Cà Phê Ban Mai'")).rows[0].slug;
 await expect(page.getByRole('cell',{name:slug})).toBeVisible();

 // The shop opens the link itself and chooses a password the operator never sees.
 await page.goto(setupUrl);
 await expect(page.getByRole('heading',{name:'Đặt mật khẩu',exact:true})).toBeVisible();
 await page.getByLabel('Mật khẩu mới',{exact:true}).fill('chosen-by-the-shop');
 await page.getByLabel('Nhập lại',{exact:true}).fill('chosen-by-the-shop');
 await page.getByRole('button',{name:'Đặt mật khẩu',exact:true}).click();
 await expect(page).toHaveURL(new RegExp('/owner/login'));

 // Spent once: the same link is dead even before anyone tries the new password.
 await page.goto(setupUrl);
 await expect(page.getByRole('heading',{name:'Liên kết không dùng được'})).toBeVisible();

 await page.goto(`/ZZZ/${slug}`);
 await page.getByLabel('Tài khoản',{exact:true}).fill('caphe-banmai');
 await page.getByLabel('Mật khẩu',{exact:true}).fill('chosen-by-the-shop');
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.locator('[data-metric="opens"]')).toBeVisible();
});

async function signIn(page:Page,username:string){
 await page.goto('/gov/login');
 await page.getByLabel('Tài khoản',{exact:true}).fill('boss');
 await page.getByLabel('Mật khẩu',{exact:true}).fill(secret);
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
}

test('impersonation: cookie stays on one shop, the server refuses writes and overview exports sent by hand, the owner reads the reason',async({page,context,browser,admin})=>{
 const shopName='Quán Hỗ Trợ',ownerPassword='chosen-by-the-shop';
 const made=await new ShopProvisioning(admin.db).create((await admin.db.query('SELECT id FROM platform_admins')).rows[0].id,
  {name:shopName,ownerUsername:'quan-hotro',ownerEmail:'hotro@example.com',googleUrl:'https://maps.google.com/?cid=9'});
 await new OwnerSetupLinks(admin.db).consume(made.setupToken,ownerPassword);
 const x=await addExperience(admin.db,made.slug,2,'Góp ý kín của khách');
 const api=`/api/owner/v2/${made.slug}`;
 const patch={sessionId:x.session.sessionId,expectedCaseRevision:0,expectedExperienceRevision:'2',status:'resolved',note:'Sửa hộ'};
 const exports=['experiences','page_visits','receipts'].flatMap(dataset=>['csv','jsonl','dictionary'].map(format=>`${api}/export?dataset=${dataset}&format=${format}`));
 const overviewReason='Kiểm tra <b>số liệu</b> giúp shop, theo yêu cầu qua Zalo';

 await signIn(page,admin.username);
 await standIn(page,shopName,'overview',overviewReason);
 await expect(page).toHaveURL(`${origin}/ZZZ/${made.slug}`);
 await expect(page.locator('[data-metric="feedback"]')).toHaveText('1');
 await expect(page.getByText('Góp ý kín của khách')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Lưu xử lý'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Đăng xuất'})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'CSV',exact:true})).toHaveCount(0);

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
 for(const url of exports){
  const response=await context.request.get(url);
  expect(response.status(),url).toBe(403);
  expect(await response.text()).not.toContain('Góp ý kín của khách');
 }
 // The owner API of any other shop is out of reach: the cookie is not even sent there.
 expect((await context.request.get('/api/owner/v2/one')).status()).toBe(401);

 // Feedback scope replaces the overview session: bulk export works, writing still does not.
 await standIn(page,shopName,'feedback','Shop nhờ đọc góp ý khách để phản hồi');
 await expect(page.getByText('Góp ý kín của khách')).toBeVisible();
 await expect(page.getByRole('button',{name:'Lưu xử lý'})).toHaveCount(0);
 const csv=await context.request.get(`${api}/export?dataset=experiences&format=csv`);
 expect(csv.status()).toBe(200);
 expect(await csv.text()).toContain('Góp ý kín của khách');
 expect((await context.request.patch(api,{headers:{Origin:origin},data:patch})).status()).toBe(403);
 expect((await admin.db.query('SELECT count(*)::int n FROM owner_feedback_cases')).rows[0].n).toBe(0);
 expect((await admin.db.query("SELECT detail->>'rows' n FROM admin_audit WHERE action='impersonation.export'")).rows).toEqual([{n:'1'}]);

 await page.getByRole('button',{name:'Kết thúc phiên',exact:true}).click();
 await expect(page).toHaveURL(`${origin}/gov`);
 expect((await context.cookies()).filter(c=>c.name==='nfc_impersonation_v1')).toEqual([]);
 expect((await context.request.get(api)).status()).toBe(401);
 expect((await admin.db.query('SELECT end_reason FROM admin_impersonation_sessions ORDER BY created_at')).rows).toEqual([{end_reason:'superseded'},{end_reason:'ended'}]);

 // The owner, in a browser of their own, sees both visits with the reason exactly as typed.
 const owner=await browser.newContext({baseURL:origin});
 try{
  const ownerPage=await owner.newPage();
  await ownerPage.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await ownerPage.goto(`/ZZZ/${made.slug}`);
  await ownerPage.getByLabel('Tài khoản',{exact:true}).fill('quan-hotro');
  await ownerPage.getByLabel('Mật khẩu',{exact:true}).fill(ownerPassword);
  await ownerPage.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const visits=ownerPage.locator('[data-admin-visits] [data-admin-visit]');
  await expect(visits).toHaveCount(2);
  await expect(ownerPage.locator('[data-reason]').filter({hasText:overviewReason})).toHaveText(overviewReason);
  await expect(visits.first()).toContainText('1 lần tải (1 dòng)');
  await expect(ownerPage.locator('[data-impersonation]')).toHaveCount(0);
  await expect(ownerPage.getByRole('button',{name:'Lưu xử lý'})).toBeVisible();
 }finally{await owner.close();}
});
