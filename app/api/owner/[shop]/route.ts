import { requireOwner } from '@/server/auth';
import { database } from '@/server/db';
import { body, failure, HttpError, json, sameOrigin } from '@/server/http';
import { shopBySlug } from '@/server/shops';
export const runtime = 'nodejs';
type Context = {params:Promise<{shop:string}>};
export async function GET(request:Request,context:Context) {
 try {
  const shop=await shopBySlug((await context.params).shop); await requireOwner(shop.id);
  const page=Number(new URL(request.url).searchParams.get('page')??1);
  if (!Number.isInteger(page)||page<1||page>10000) throw new HttpError(400,'INVALID_PAGE');
  const {rows}=await database().query('SELECT id,rating,message,topic,status,note,updated_at FROM experiences WHERE shop_id=$1 AND (rating IS NOT NULL OR message<>\'\') ORDER BY updated_at DESC,id LIMIT 50 OFFSET $2',[shop.id,(page-1)*50]);
  return json({records:rows,page,pageSize:50});
 } catch(error){return failure(error);}
}
export async function PATCH(request:Request,context:Context) {
 try {
  sameOrigin(request);const shop=await shopBySlug((await context.params).shop);await requireOwner(shop.id);const data=await body(request);
  if(Object.keys(data).some(k=>!['id','status','note'].includes(k)) || typeof data.id!=='string' || !/^[a-f0-9-]{36}$/.test(data.id) || !['new','progress','resolved'].includes(String(data.status)) || typeof data.note!=='string' || data.note.length>2000) throw new HttpError(400,'INVALID_INPUT');
  const result=await database().query('UPDATE experiences SET status=$3,note=$4 WHERE shop_id=$1 AND id=$2 RETURNING id',[shop.id,data.id,data.status,data.note]);
  if(!result.rows[0]) throw new HttpError(404,'NOT_FOUND'); return json({saved:true});
 }catch(error){return failure(error);}
}
