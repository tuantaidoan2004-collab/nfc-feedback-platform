import {test as base,expect} from '@playwright/test';
import {Pool} from 'pg';
import {AdminAuth} from '../lib/admin/auth';
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
 expect((await request.post(`${built}/gov/api/login`,{headers:{origin:built},data:{username:'boss',password:secret}})).status()).toBe(404);
 expect((await request.post(`${built}/gov/api/logout`,{headers:{origin:built},data:{}})).status()).toBe(404);
});
