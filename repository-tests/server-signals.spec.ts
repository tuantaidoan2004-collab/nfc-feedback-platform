import {applySchema} from './schema';
import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {recentSignals,writeSignals} from '../lib/admin/signals';

/** Tín hiệu máy chủ (lát B3 phần hai, migration 033): counted per kind, code and Vietnamese day, kept 30 days. */
const uri='postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if(process.env.NFC_TEST_DATABASE_URL!==uri)throw Error('Local test fixture required');
const test=base.extend<{db:Pool}>({db:async({},provide)=>{
 const schema=`nfc_signals_test_${randomUUID().replaceAll('-','')}`,root=new Pool({connectionString:uri}),db=new Pool({connectionString:uri,options:`-c search_path=${schema}`,max:2});
 try{await root.query(`CREATE SCHEMA ${schema}`);await applySchema(db);await provide(db);}
 finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
}});
const hoursAgo=(hours:number)=>new Date(Date.now()-hours*3600_000);
const rows=(db:Pool)=>db.query("SELECT kind,code,to_char(day,'YYYY-MM-DD') AS day,count::int AS count,first_at,last_at FROM server_signals ORDER BY kind,code,day").then(r=>r.rows);

test('signals add up per kind, code and Vietnamese day; a month back is forgotten; nothing but the short lists fits',async({db})=>{
 expect(await recentSignals(db)).toEqual([]);
 // Two writes of the same signal on the same day are one row: counts add, the first and last times widen.
 const [early,late]=[hoursAgo(4),hoursAgo(1)];
 await writeSignals(db,[{kind:'csp',code:'img-src external',count:2,first:hoursAgo(3),last:hoursAgo(2)}]);
 await writeSignals(db,[{kind:'csp',code:'img-src external',count:3,first:early,last:late}]);
 const [one]=await rows(db);
 expect(one).toMatchObject({kind:'csp',code:'img-src external',count:5});
 expect([one.first_at.getTime(),one.last_at.getTime()]).toEqual([early.getTime(),late.getTime()]);
 // The day is Vietnam's (UTC+7): 18:00 UTC is already the next day there.
 const utcMidnight=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),new Date().getUTCDate()-3));
 const evening=new Date(utcMidnight.getTime()+18*3600_000),vietnamDay=new Date(utcMidnight.getTime()+24*3600_000).toISOString().slice(0,10);
 await writeSignals(db,[{kind:'unexpected',code:'owner Error 57P01',count:1,first:evening,last:evening}]);
 expect((await rows(db)).find(r=>r.kind==='unexpected')?.day).toBe(vietnamDay);
 // What is older than 30 days goes at the next write.
 await db.query("INSERT INTO server_signals VALUES('csp','img-src blob',(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-31,1,clock_timestamp(),clock_timestamp())");
 await writeSignals(db,[{kind:'guest_refused',code:'rating 403 ORIGIN_NOT_ALLOWED chrome-ios',count:4,first:hoursAgo(0.5),last:hoursAgo(0.1)}]);
 expect((await rows(db)).map(r=>r.code)).not.toContain('img-src blob');
 // /gov's view: the last seven days, one line per signal, newest first.
 expect((await recentSignals(db))!.map(s=>[s.kind,s.code,s.count])).toEqual([
  ['guest_refused','rating 403 ORIGIN_NOT_ALLOWED chrome-ios',4],['csp','img-src external',5],['unexpected','owner Error 57P01',1]]);
 // Anything a request might have chosen does not fit the column.
 for(const code of ['<script>','x'.repeat(201),'a;b',"it's"])
  await expect(db.query("INSERT INTO server_signals VALUES('csp',$1,current_date,1,now(),now())",[code]),code).rejects.toThrow('check constraint');
 await expect(db.query("INSERT INTO server_signals VALUES('other','x',current_date,1,now(),now())")).rejects.toThrow('check constraint');
 // Before migration 033 runs, /gov reads null instead of failing.
 await db.query('DROP TABLE server_signals');
 expect(await recentSignals(db)).toBeNull();
});
