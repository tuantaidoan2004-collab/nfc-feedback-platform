import { requestHelp } from '@/lib/account/onboarding';
import { database } from '@/server/db';
import { ownerCredential, ownerFailure, ownerGate, ownerInput, ownerJson, ownerOrigin } from '@/server/owner-v2';

export async function POST(request: Request, context: { params: Promise<{ shop: string }> }) {
  try { ownerGate(); ownerOrigin(request); return ownerJson(await requestHelp(database(), await ownerCredential(), (await context.params).shop, await ownerInput(request))); }
  catch (error) { return ownerFailure(error); }
}
