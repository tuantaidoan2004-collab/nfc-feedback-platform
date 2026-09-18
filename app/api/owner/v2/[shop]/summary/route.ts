import { OwnerDashboard } from '@/lib/owner/dashboard';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerJson, ownerFailure } from '@/server/owner-v2';
type Context = { params: Promise<{ shop: string }> };
// The dashboard's first, light view: totals and the account, no feedback rows.
export async function GET(_request: Request, context: Context) {
  try { ownerGate(); return ownerJson(await new OwnerDashboard(database()).summary(await ownerCredential(), (await context.params).shop)); }
  catch (error) { return ownerFailure(error); }
}
