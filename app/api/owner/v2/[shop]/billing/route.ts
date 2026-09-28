import { OwnerBilling } from '@/lib/owner/billing';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerJson, ownerFailure } from '@/server/owner-v2';

// The shop's billing tab (lát P5b-lite): only the owner, signed in as themself.
export async function GET(_request: Request, context: { params: Promise<{ shop: string }> }) {
  try { ownerGate(); return ownerJson(await new OwnerBilling(database()).get(await ownerCredential(), (await context.params).shop)); }
  catch (error) { return ownerFailure(error); }
}
