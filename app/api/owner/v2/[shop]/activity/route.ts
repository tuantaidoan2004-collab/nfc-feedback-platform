import { OwnerActivity, parseActivityQuery } from '@/lib/owner/activity';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerJson, ownerFailure } from '@/server/owner-v2';
// The shop's activity history (lát F3): filtered by person, kind, days and accent-blind words.
export async function GET(request: Request, context: { params: Promise<{ shop: string }> }) {
  try { ownerGate();
    return ownerJson(await new OwnerActivity(database()).list(await ownerCredential(), (await context.params).shop, parseActivityQuery(new URL(request.url).searchParams))); }
  catch (error) { return ownerFailure(error); }
}
