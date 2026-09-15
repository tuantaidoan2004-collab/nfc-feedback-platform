import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { OwnerError } from '@/lib/owner/auth';
import { nfcEnvDeclared } from './env';
export const ownerEnabled=()=>nfcEnvDeclared()&&process.env.NFC_OWNER_V2_ENABLED==='true';
export const ownerCookie='nfc_owner_v2';
export async function ownerToken(){return (await cookies()).get(ownerCookie)?.value;}
export function ownerGate(){if(!ownerEnabled())throw new OwnerError(404,'NOT_FOUND');}
export const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
export const ownerJson=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:privateHeaders});
export const ownerFailure=(error:unknown)=>error instanceof OwnerError?ownerJson({error:error.code},error.status):ownerJson({error:'SERVICE_UNAVAILABLE'},503);
export function ownerOrigin(request:Request){const expected=process.env.APP_ORIGIN;
 if(!expected||new URL(expected).origin!==expected||request.headers.get('origin')!==expected||(request.headers.has('sec-fetch-site')&&request.headers.get('sec-fetch-site')!=='same-origin'))throw new OwnerError(403,'ORIGIN_NOT_ALLOWED');}
export async function ownerInput(request:Request){
 if(new URL(request.url).search || request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new OwnerError(400,'INVALID_INPUT');
 const reader=request.body?.getReader();if(!reader)throw new OwnerError(400,'INVALID_INPUT');const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new OwnerError(413,'BODY_TOO_LARGE');}chunks.push(value);}
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new OwnerError(400,'INVALID_INPUT');return value as Record<string,unknown>;
 }catch(error){if(error instanceof OwnerError)throw error;throw new OwnerError(400,'INVALID_INPUT');}finally{reader.releaseLock();}
}
export const safeDestination=(value:unknown)=>typeof value==='string'&&/^\/ZZZ\/[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(value)?value:null;
