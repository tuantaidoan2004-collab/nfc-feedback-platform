import { OwnerPages } from '@/lib/owner/pages';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure } from '@/server/owner-v2';
type Context = { params: Promise<{ shop: string }> };

// The shop's pages (lát P3): list them, make a new one (a copy, or a template from the library), rename one.
export async function GET(_request: Request, context: Context) {
  try { ownerGate(); return ownerJson(await new OwnerPages(database()).list(await ownerCredential(), (await context.params).shop)); }
  catch (error) { return ownerFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try { ownerGate(); ownerOrigin(request); return ownerJson(await new OwnerPages(database()).create(await ownerCredential(), (await context.params).shop, await ownerInput(request))); }
  catch (error) { return ownerFailure(error); }
}
export async function PATCH(request: Request, context: Context) {
  try { ownerGate(); ownerOrigin(request); return ownerJson(await new OwnerPages(database()).rename(await ownerCredential(), (await context.params).shop, await ownerInput(request))); }
  catch (error) { return ownerFailure(error); }
}
