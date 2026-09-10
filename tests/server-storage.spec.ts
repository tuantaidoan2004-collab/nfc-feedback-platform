import { test,expect } from '@playwright/test';
import { Pool } from 'pg';
import { randomBytes,createHash } from 'node:crypto';
test.describe('PostgreSQL shop isolation',()=>{
 test.skip(!process.env.DATABASE_URL,'Requires dedicated test PostgreSQL');
 let db:Pool;let slugA:string;let slugB:string;let idA:string;let idB:string;let owner:string;let token:string;
 test.beforeAll(async()=>{db=new Pool({connectionString:process.env.DATABASE_URL});const suffix=randomBytes(5).toString('hex');slugA=`A-${suffix}`;slugB=`B-${suffix}`;const a=await db.query('INSERT INTO shops(slug,name) VALUES($1,$2) RETURNING id',[slugA,'Shop A']);idA=a.rows[0].id;const b=await db.query('INSERT INTO shops(slug,name) VALUES($1,$2) RETURNING id',[slugB,'Shop B']);idB=b.rows[0].id;owner=(await db.query('INSERT INTO owner_users DEFAULT VALUES RETURNING id')).rows[0].id;await db.query('INSERT INTO memberships VALUES($1,$2)',[owner,idA]);token=randomBytes(32).toString('hex');await db.query("INSERT INTO owner_sessions VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),owner]);});
 test.afterAll(async()=>{if(!db)return;await db.query('DELETE FROM experiences WHERE shop_id=ANY($1::uuid[])',[[idA,idB]]);await db.query('DELETE FROM owner_sessions WHERE user_id=$1',[owner]);await db.query('DELETE FROM memberships WHERE user_id=$1',[owner]);await db.query('DELETE FROM owner_users WHERE id=$1',[owner]);await db.query('DELETE FROM shops WHERE id=ANY($1::uuid[])',[[idA,idB]]);await db.end();});
 test('server save reaches a separate owner browser; no public or cross-shop access',async({browser})=>{
  const customer=await browser.newContext();const manager=await browser.newContext();
  const base='http://127.0.0.1:3000';const path=`${base}/api/shops/${slugA}/experience`;const headers={origin:base};
  const init=await customer.request.post(path,{headers});expect(init.status()).toBe(200);
  const first=await customer.request.patch(path,{headers,data:{revision:0,rating:5}});expect(first.status()).toBe(200);
  const second=await customer.request.patch(path,{headers,data:{revision:1,rating:3,message:'Waiting too long',topic:'wait'}});expect(second.status()).toBe(200);
  expect((await customer.request.patch(path,{headers,data:{revision:0,rating:1}})).status()).toBe(409);
  expect((await customer.request.get(`${base}/api/owner/${slugA}`)).status()).toBe(401);
  expect((await customer.request.patch(path,{headers:{origin:'https://wrong.example'},data:{revision:2,rating:1}})).status()).toBe(403);
  await manager.addCookies([{name:'nfc_owner',value:token,url:base,httpOnly:true,sameSite:'Strict'}]);
  const dashboard=await manager.request.get(`${base}/api/owner/${slugA}`);expect(dashboard.headers()['cache-control']).toContain('no-store');const {records}=await dashboard.json();expect(records).toHaveLength(1);expect(records[0].rating).toBe(3);expect(records[0].message).toBe('Waiting too long');
  expect((await manager.request.get(`${base}/api/owner/${slugB}`)).status()).toBe(403);
  expect((await manager.request.patch(`${base}/api/owner/${slugB}`,{headers,data:{id:records[0].id,status:'resolved',note:'wrong tenant'}})).status()).toBe(403);
  const page=await manager.newPage();await page.goto(`${base}/ZZZ/${slugA}`);await expect(page.getByText('Waiting too long')).toBeVisible();
  const stranger=await customer.newPage();await stranger.goto(`${base}/ZZZ/${slugA}`);await expect(stranger.getByText('Waiting too long')).toHaveCount(0);
  const publicResponse=await customer.request.post(path,{headers});expect(await publicResponse.json()).not.toHaveProperty('note');
  await customer.close();await manager.close();
 });
 test('customer page persists across browser reload via server cookie',async({page})=>{
  await page.goto(`/${slugB}`);await page.getByRole('button',{name:'5 sao',exact:true}).click();await expect(page.locator('.rating-receipt')).toContainText('5/5');
  await page.getByRole('button',{name:'2 sao',exact:true}).click();await expect(page.locator('.rating-receipt')).toContainText('2/5');await page.reload();await expect(page.locator('.rating-receipt')).toContainText('2/5');
  const result=await db.query('SELECT rating FROM experiences WHERE shop_id=$1',[idB]);expect(result.rows).toEqual([{rating:2}]);
 });
});
