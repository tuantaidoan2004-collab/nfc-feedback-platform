import { NextResponse } from 'next/server';
import { OwnerDesign } from '@/lib/owner/design';
import { OwnerError } from '@/lib/owner/auth';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure, privateHeaders } from '@/server/owner-v2';
type Context = { params: Promise<{ shop: string }> };

// The Design & Link editor: read the draft and the live page, save the draft, move it to another template version,
// preview it, publish it.
export async function GET(_request: Request, context: Context) {
  try { ownerGate(); return ownerJson(await new OwnerDesign(database()).read(await ownerCredential(), (await context.params).shop)); }
  catch (error) { return ownerFailure(error); }
}
export async function PUT(request: Request, context: Context) {
  try { ownerGate(); ownerOrigin(request);
    return ownerJson(await new OwnerDesign(database()).save(await ownerCredential(), (await context.params).shop, await ownerInput(request))); }
  catch (error) { return ownerFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    ownerGate(); ownerOrigin(request);
    const body = await ownerInput(request), design = new OwnerDesign(database()), slug = (await context.params).shop;
    const action = body && typeof body === 'object' ? (body as Record<string, unknown>).action : undefined;
    if (action === 'publish') return ownerJson(await design.publish(await ownerCredential(), slug, body));
    if (action === 'version') return ownerJson(await design.version(await ownerCredential(), slug, body));
    if (action !== 'preview') throw new OwnerError(400, 'INVALID_DESIGN');
    // The preview token is a capability: it goes into an HttpOnly cookie for /preview and never into the response body.
    const preview = await design.preview(await ownerCredential(), slug, body);
    const response = NextResponse.json({ preview: '/preview', expiresAt: preview.expiresAt }, { headers: privateHeaders });
    response.cookies.set('nfc_preview', preview.token, { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'strict', path: '/', expires: preview.expiresAt });
    return response;
  } catch (error) { return ownerFailure(error); }
}
