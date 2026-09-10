import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { database } from '@/server/db';
import { hash } from '@/server/auth';
import { body, failure, HttpError, json, sameOrigin } from '@/server/http';
import { shopBySlug } from '@/server/shops';
import { topics } from '@/lib/copy';
export const runtime = 'nodejs';
type Context = { params: Promise<{shop:string}> };
export async function POST(request: Request, context: Context) {
  try {
    sameOrigin(request); const shop = await shopBySlug((await context.params).shop);
    const name = `nfc_exp_${shop.id}`; const saved = (await cookies()).get(name)?.value;
    const token = saved && /^[a-f0-9]{64}$/.test(saved) ? saved : randomBytes(32).toString('hex');
    const {rows} = await database().query('INSERT INTO experiences(shop_id,token_hash) VALUES($1,$2) ON CONFLICT(shop_id,token_hash) DO UPDATE SET token_hash=excluded.token_hash RETURNING rating,revision,message,topic',[shop.id,hash(token)]);
    const response = json(rows[0]); response.cookies.set(name,token,{httpOnly:true,secure:new URL(process.env.APP_ORIGIN!).protocol==='https:',sameSite:'strict',path:`/api/shops/${shop.slug}/experience`,maxAge:60*60*24*30}); return response;
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    sameOrigin(request); const shop = await shopBySlug((await context.params).shop);
    const token = (await cookies()).get(`nfc_exp_${shop.id}`)?.value;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401,'EXPERIENCE_REQUIRED');
    const input = await body(request);
    if (Object.keys(input).some(k => !['revision','rating','message','topic'].includes(k)) || !Number.isSafeInteger(input.revision) || Number(input.revision)<0 || Number(input.revision)>2147483646) throw new HttpError(400,'INVALID_INPUT');
    if (input.rating !== undefined && (!Number.isInteger(input.rating) || Number(input.rating)<1 || Number(input.rating)>5)) throw new HttpError(400,'INVALID_RATING');
    if (input.message !== undefined && (typeof input.message!=='string' || !input.message.trim() || input.message.length>2000)) throw new HttpError(400,'INVALID_MESSAGE');
    if (input.topic !== undefined && !topics.includes(input.topic as typeof topics[number])) throw new HttpError(400,'INVALID_TOPIC');
    if (input.rating === undefined && input.message === undefined) throw new HttpError(400,'EMPTY_UPDATE');
    const {rows} = await database().query(`UPDATE experiences SET rating=coalesce($3,rating),message=coalesce($4,message),topic=coalesce($5,topic),status=CASE WHEN $4::text IS NULL THEN status ELSE 'new' END,revision=revision+1,updated_at=now() WHERE shop_id=$1 AND token_hash=$2 AND revision=$6 RETURNING rating,revision,message,topic`,[shop.id,hash(token),input.rating??null,typeof input.message==='string'?input.message.trim():null,input.topic??null,input.revision]);
    if (!rows[0]) throw new HttpError(409,'REVISION_CONFLICT'); return json(rows[0]);
  } catch (error) { return failure(error); }
}
