import { GoogleBusiness } from '@/lib/google/business';
import { OwnerError } from '@/lib/owner/auth';
import { database } from '@/server/db';
import { ownerCredential, ownerFailure, ownerGate, ownerInput, ownerJson, ownerOrigin } from '@/server/owner-v2';
type Context = { params: Promise<{ shop: string }> };

/** Google Business of the shop (kịch bản mục 5): status and reviews; connect to the Google Maps tool (its one shop), sync, disconnect. */
export async function GET(_request: Request, context: Context) {
  try { ownerGate(); return ownerJson(await new GoogleBusiness(database()).status(await ownerCredential(), (await context.params).shop)); }
  catch (error) { return ownerFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    ownerGate(); ownerOrigin(request);
    const body = await ownerInput(request), slug = (await context.params).shop, business = new GoogleBusiness(database()), credential = await ownerCredential();
    if (body.action === 'maps') return ownerJson(await business.connectMaps(credential, slug));
    if (body.action === 'sync') return ownerJson(await business.sync(credential, slug));
    if (body.action === 'disconnect') return ownerJson(await business.disconnect(credential, slug));
    throw new OwnerError(400, 'INVALID_INPUT');
  } catch (error) { return ownerFailure(error); }
}
