import { shopOverview } from '@/lib/owner/overview';
import { database } from '@/server/db';
import { ownerCredential, ownerFailure, ownerGate, ownerJson } from '@/server/owner-v2';
type Context = { params: Promise<{ shop: string }> };

/** Everything the Dashboard tab shows, in one read (lib/owner/overview.ts). */
export async function GET(_request: Request, context: Context) {
  try { ownerGate(); return ownerJson(await shopOverview(database(), await ownerCredential(), (await context.params).shop)); }
  catch (error) { return ownerFailure(error); }
}
