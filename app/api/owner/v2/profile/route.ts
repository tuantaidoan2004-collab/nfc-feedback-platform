import { OwnerProfiles } from '@/lib/owner/profile';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure } from '@/server/owner-v2';
// The signed-in person's own profile: read it, or change name, @handle, bio and pictures.
export async function GET() {
  try { ownerGate(); return ownerJson(await new OwnerProfiles(database()).get(await ownerCredential())); }
  catch (error) { return ownerFailure(error); }
}
export async function PATCH(request: Request) {
  try { ownerGate(); ownerOrigin(request);
    return ownerJson(await new OwnerProfiles(database()).update(await ownerCredential(), await ownerInput(request))); }
  catch (error) { return ownerFailure(error); }
}
