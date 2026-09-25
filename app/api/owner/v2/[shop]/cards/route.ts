import { OwnerCards } from '@/lib/owner/cards';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure, ownerPage } from '@/server/owner-v2';
type Context = { params: Promise<{ shop: string }> };
// The shop's NFC cards: list with the running fee, add one ("nhân bản thẻ"), rename, switch on or off.
export async function GET(_request: Request, context: Context) {
  try { ownerGate(); return ownerJson(await new OwnerCards(database()).list(await ownerCredential(), (await context.params).shop)); }
  catch (error) { return ownerFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try { ownerGate(); ownerOrigin(request); const [body, page] = ownerPage(await ownerInput(request));
    return ownerJson(await new OwnerCards(database()).create(await ownerCredential(), (await context.params).shop, body, page)); }
  catch (error) { return ownerFailure(error); }
}
export async function PATCH(request: Request, context: Context) {
  try { ownerGate(); ownerOrigin(request); return ownerJson(await new OwnerCards(database()).update(await ownerCredential(), (await context.params).shop, await ownerInput(request))); }
  catch (error) { return ownerFailure(error); }
}
