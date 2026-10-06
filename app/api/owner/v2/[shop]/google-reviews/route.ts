import { GoogleBusiness } from '@/lib/google/business';
import { database } from '@/server/db';
import { ownerCredential, ownerFailure, ownerGate, ownerInput, ownerJson, ownerOrigin } from '@/server/owner-v2';
type Context = { params: Promise<{ shop: string }> };

/** The shop's Google reviews for Data (GET), and how the shop handles them: status and internal note (POST). */
export async function GET(_request: Request, context: Context) {
  try { ownerGate(); return ownerJson(await new GoogleBusiness(database()).reviews(await ownerCredential(), (await context.params).shop)); }
  catch (error) { return ownerFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    ownerGate(); ownerOrigin(request);
    return ownerJson(await new GoogleBusiness(database()).mark(await ownerCredential(), (await context.params).shop, await ownerInput(request, 65536)));
  } catch (error) { return ownerFailure(error); }
}
