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
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.locator('[data-metric="opens"]')).toBeVisible();
}
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});
test('Publishing v2 customer→owner login→real metrics/filter/handling/export, responsive and logout',async({page,context,f},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/one');const star=page.getByRole('button',{name:'2 sao',exact:true});await expect(star).toBeEnabled();await star.click();
 await expect(page.locator('.rating-receipt')).toContainText('2/5');await page.locator('#message').fill('=SUM(1,2)');await page.getByRole('button',{name:'Gửi góp ý',exact:true}).click();await expect(page.locator('#message')).toHaveValue('');
 await login(page,f.users[0]);
 for(const key of ['opens','sessions','rated','feedback','unresolved'])await expect(page.locator(`[data-metric="${key}"]`)).toHaveText('1');
 const cookie=(await context.cookies()).find(c=>c.name==='nfc_owner_v2')!;expect(cookie).toMatchObject({httpOnly:true,sameSite:'Strict'});expect(await page.evaluate(()=>document.cookie)).not.toContain(cookie.value);
 await expect(page.getByText('=SUM(1,2)',{exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Trạng thái',exact:true}).selectOption('resolved');await page.getByRole('textbox',{name:'Ghi chú nội bộ',exact:true}).fill('Đã gọi lại');await page.getByRole('button',{name:'Lưu xử lý',exact:true}).click();
 await expect(page.getByRole('status')).toHaveText('Đã lưu xử lý.');await expect(page.locator('[data-metric="unresolved"]')).toHaveText('0');
 expect((await f.db.query('SELECT count(*)::int n FROM owner_feedback_audit')).rows[0].n).toBe(1);
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'CSV',exact:true}).click();const file=await download;
 expect(file.suggestedFilename()).toBe('nfc-v1-experiences.csv');const text=await readFile((await file.path())!,'utf8');expect(text.startsWith('\uFEFF')).toBe(true);expect(text).toContain('"\'=SUM(1,2)"');expect(text).toContain('Đã gọi lại');
 const jsonl=await context.request.get('/api/owner/v2/one/export?format=jsonl&dataset=receipts');expect(jsonl.headers()['cache-control']).toContain('no-store');const events=(await jsonl.text()).trim().split('\n').map(x=>JSON.parse(x));expect(events).toHaveLength(2);expect(events[1].message).toBe('=SUM(1,2)');
 const dict=await context.request.get('/api/owner/v2/one/export?format=dictionary&dataset=receipts');expect((await dict.json()).fields.every((f:{meaning:string})=>f.meaning)).toBe(true);
 await page.getByRole('combobox',{name:'Số sao',exact:true}).selectOption('5');await page.getByRole('button',{name:'Lọc dữ liệu',exact:true}).click();await expect(page.locator('[data-metric="rated"]')).toHaveText('0');
 await page.getByRole('combobox',{name:'Số sao',exact:true}).selectOption('');await page.getByRole('button',{name:'Lọc dữ liệu',exact:true}).click();await expect(page.locator('[data-metric="rated"]')).toHaveText('1');
 for(const width of [390,1200]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`owner-${width}.png`),fullPage:true});}
 const headers=(await context.request.get('/ZZZ/one')).headers();// Next16 development overrides HTML caching; private data endpoints remain strictly no-store.
 expect(headers['cache-control']).toBe('no-cache, must-revalidate');expect(headers['x-frame-options']).toBe('DENY');
 await page.getByRole('button',{name:'Đăng xuất'}).click();await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
 expect((await context.request.get('/api/owner/v2/one')).status()).toBe(401);expect((await f.db.query('SELECT revoked_at FROM owner_auth_sessions_v2 WHERE token_hash=$1',[sessionHash(cookie.value)])).rows[0].revoked_at).not.toBeNull();
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
 await page.getByRole('combobox',{name:'Số sao',exact:true}).selectOption('2');await page.getByRole('button',{name:'Lọc dữ liệu',exact:true}).click();await expect(page.getByRole('link',{name:'Đăng nhập lại'})).toBeVisible();expect((await context.request.get('/api/owner/v2/one/export')).status()).toBe(401);
 await page.goto('/ZZZ/one');await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
 await page.goto('/t/demo');await expect(page.getByRole('button',{name:'5 sao',exact:true})).toBeEnabled();await page.goto('/demo/dashboard');await expect(page.getByRole('heading').first()).toBeVisible();
});
test('concurrent handling gives conflict, reloads latest record, preserves customer revision history',async({page,context,f})=>{
 await addExperience(f.db);await login(page,f.users[0]);
 const records=(await (await context.request.get('/api/owner/v2/one')).json()).records;
 const row=records[0];await context.request.patch('/api/owner/v2/one',{headers:{Origin:origin},data:{sessionId:row.session_id,expectedCaseRevision:0,expectedExperienceRevision:'2',status:'progress',note:'Another operator'}});
 await page.getByRole('textbox',{name:'Ghi chú nội bộ',exact:true}).fill('Stale draft');await page.getByRole('button',{name:'Lưu xử lý',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('đã thay đổi');await expect(page.getByRole('textbox',{name:'Ghi chú nội bộ',exact:true})).toHaveValue('Another operator');
 expect((await f.db.query('SELECT revision::text FROM rating_experiences')).rows[0].revision).toBe('2');expect((await f.db.query('SELECT count(*)::int n FROM rating_intent_receipts')).rows[0].n).toBe(2);
 expect((await context.request.get('/api/owner/v2/one?scope=test')).status()).toBe(400);
 expect((await context.request.get(`/api/owner/v2/one?source=${randomUUID()}`)).status()).toBe(200);
 expect((await context.request.get('/api/owner/v2/one/export?format=../bad')).status()).toBe(400);
});
