import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { OwnerError, type OwnerCredential } from '@/lib/owner/auth';
import { nfcEnvDeclared } from './env';
import { fromThisSite } from './same-origin';
export const ownerEnabled=()=>nfcEnvDeclared()&&process.env.NFC_OWNER_V2_ENABLED==='true';
export const ownerCookie='nfc_owner_v2';
export async function ownerToken(){return (await cookies()).get(ownerCookie)?.value;}
// An administrator standing in for an owner carries a cookie of its own, scoped to that one shop's dashboard and
// API paths. When both are present the impersonation wins: it is the narrower of the two, read-only and short.
export const impersonationCookie='nfc_impersonation_v1';
export const impersonationPaths=(slug:string)=>[`/app/${slug}`,`/api/owner/v2/${slug}`];
/**
 * Written as raw headers on purpose. `response.cookies.set` keys cookies by name, so a second call for the same
 * name on another path silently replaces the first, and only one of the two paths ever received the cookie.
 * Pass null to clear. The slug must already be validated: it becomes part of a cookie attribute.
 */
export function setImpersonationCookies(response:NextResponse,request:Request,slug:string,token:string|null,expires?:Date){
 const secure=new URL(request.url).protocol==='https:';
 const lifetime=token?`Expires=${expires!.toUTCString()}`:'Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
 for(const path of impersonationPaths(slug))
  response.headers.append('Set-Cookie',`${impersonationCookie}=${token??''}; Path=${path}; ${lifetime}; HttpOnly; SameSite=Strict${secure?'; Secure':''}`);
}
export async function ownerCredential():Promise<OwnerCredential>{
 const jar=await cookies(),impersonation=jar.get(impersonationCookie);
 return impersonation?{impersonation:impersonation.value}:jar.get(ownerCookie)?.value;
}
export function ownerGate(){if(!ownerEnabled())throw new OwnerError(404,'NOT_FOUND');}
export const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
export const ownerJson=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:privateHeaders});
export const ownerFailure=(error:unknown)=>{
 if(error instanceof OwnerError)return ownerJson({error:error.code},error.status);
 // Same rule as adminFailure: the generic answer keeps its cause in the server log, name and message only.
 console.error('OWNER_UNEXPECTED',error instanceof Error?`${error.name}: ${error.message}`:String(error));
 return ownerJson({error:'SERVICE_UNAVAILABLE'},503);
};
export function ownerOrigin(request:Request){if(!fromThisSite(request,process.env.APP_ORIGIN))throw new OwnerError(403,'ORIGIN_NOT_ALLOWED');}
/**
 * Which page of the shop a write is about (migration 024): `page` in the JSON body, taken off before the body reaches
 * the handler. Writes never read the query string (ownerInput refuses one), so a page cannot ride in on a URL.
 */
export function ownerPage(body:Record<string,unknown>):[Record<string,unknown>,string|null]{
 const {page,...rest}=body;
 if(page!==undefined&&typeof page!=='string')throw new OwnerError(400,'INVALID_INPUT');
 return [rest,page??null];
}
/** `limit`: 16 KB for every form, raised only where a picture travels in the body (the payment QR, lát P5b-lite). */
export async function ownerInput(request:Request,limit=16384){
 if(new URL(request.url).search || request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new OwnerError(400,'INVALID_INPUT');
 const reader=request.body?.getReader();if(!reader)throw new OwnerError(400,'INVALID_INPUT');const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new OwnerError(413,'BODY_TOO_LARGE');}chunks.push(value);}
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new OwnerError(400,'INVALID_INPUT');return value as Record<string,unknown>;
 }catch(error){if(error instanceof OwnerError)throw error;throw new OwnerError(400,'INVALID_INPUT');}finally{reader.releaseLock();}
}
// Where a sign-in may send the browser next: the giao diện chính, a shop's Orb, or one of its tabs. Nothing else.
export const safeDestination=(value:unknown)=>typeof value==='string'&&/^\/app(\/[A-Za-z0-9][A-Za-z0-9-]{0,62}(\/[a-z-]{2,20})?)?$/.test(value)?value:null;
