import { OwnerProfiles } from '@/lib/owner/profile';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure } from '@/server/owner-v2';
// A short-lived signed upload for a profile picture or cover, under the person's own folder on R2.
export async function POST(request: Request) {
  try { ownerGate(); ownerOrigin(request);
    return ownerJson(await new OwnerProfiles(database()).presign(await ownerCredential(), await ownerInput(request))); }
  catch (error) { return ownerFailure(error); }
}
