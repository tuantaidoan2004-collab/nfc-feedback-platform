import { readPulse } from '@/lib/owner/pulse';
import { database } from '@/server/db';
import { ownerCredential, ownerFailure, ownerGate, ownerJson } from '@/server/owner-v2';

export async function GET(request: Request, context: { params: Promise<{ shop: string }> }) {
  try {
    ownerGate();
    return ownerJson(await readPulse(database(), await ownerCredential(), (await context.params).shop, new URL(request.url).searchParams.get('since')));
  } catch (error) { return ownerFailure(error); }
}
