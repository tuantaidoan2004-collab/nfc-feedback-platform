import { OwnerNotifications } from '@/lib/owner/notifications';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure } from '@/server/owner-v2';
// The signed-in person's bell: mentions across their shops, and marking them read.
export async function GET() {
  try { ownerGate(); return ownerJson(await new OwnerNotifications(database()).list(await ownerCredential())); }
  catch (error) { return ownerFailure(error); }
}
export async function PATCH(request: Request) {
  try { ownerGate(); ownerOrigin(request); return ownerJson(await new OwnerNotifications(database()).read(await ownerCredential(), await ownerInput(request))); }
  catch (error) { return ownerFailure(error); }
}
