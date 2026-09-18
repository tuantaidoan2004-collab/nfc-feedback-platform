import { OwnerMedia } from '@/lib/owner/media';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure } from '@/server/owner-v2';
// A short-lived signed upload straight to R2 for one image or video; the file itself never passes through here.
export async function POST(request: Request, context: { params: Promise<{ shop: string }> }) {
  try { ownerGate(); ownerOrigin(request);
    return ownerJson(await new OwnerMedia(database()).presign(await ownerCredential(), (await context.params).shop, await ownerInput(request))); }
  catch (error) { return ownerFailure(error); }
}
