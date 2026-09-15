import { NextResponse } from 'next/server';
import { publishingEnabled } from '@/server/publishing-runtime';
import { database } from '@/server/db';
import { PublishingResolver } from '@/lib/publishing/repository';
import { body, sameOrigin } from '@/server/http';
export async function POST(request: Request) {
  if (!publishingEnabled()) return new Response(null,{status:404});
  try {
    sameOrigin(request); const input = await body(request);
    if (Object.keys(input).join() !== 'token' || typeof input.token !== 'string') throw Error();
    const preview = await new PublishingResolver(database()).preview(input.token);
    const response = new NextResponse(null,{status:204,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
    response.cookies.set('nfc_preview',input.token,{httpOnly:true,secure:new URL(request.url).protocol==='https:',sameSite:'strict',path:'/',expires:preview.expiresAt});
    return response;
  } catch { return NextResponse.json({error:'PREVIEW_UNAVAILABLE'},{status:403,headers:{'Cache-Control':'private, no-store'}}); }
}
