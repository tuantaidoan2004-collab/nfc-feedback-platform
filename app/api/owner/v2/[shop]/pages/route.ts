import { OwnerPageLifecycle, OwnerPages } from '@/lib/owner/pages';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure } from '@/server/owner-v2';
type Context = { params: Promise<{ shop: string }> };

// The shop's pages (lát P3, P4): list them, make one (a copy, or a template from the library), rename one, stop one
// at once and start it again.
export async function GET(_request: Request, context: Context) {
  try { ownerGate(); return ownerJson(await new OwnerPages(database()).list(await ownerCredential(), (await context.params).shop)); }
  catch (error) { return ownerFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    ownerGate(); ownerOrigin(request);
    const body = await ownerInput(request), slug = (await context.params).shop;
    // The emergency stop and its lifting (lát P4); anything else makes a page.
    if (body.action === 'pause') return ownerJson(await new OwnerPageLifecycle(database()).pause(await ownerCredential(), slug, body));
    if (body.action === 'resume') return ownerJson(await new OwnerPageLifecycle(database()).resume(await ownerCredential(), slug, body));
    return ownerJson(await new OwnerPages(database()).create(await ownerCredential(), slug, body));
  }
  catch (error) { return ownerFailure(error); }
}
export async function PATCH(request: Request, context: Context) {
  try { ownerGate(); ownerOrigin(request); return ownerJson(await new OwnerPages(database()).rename(await ownerCredential(), (await context.params).shop, await ownerInput(request))); }
  catch (error) { return ownerFailure(error); }
}
