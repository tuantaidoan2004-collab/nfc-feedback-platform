import { OwnerAuth, OwnerError } from '@/lib/owner/auth';
import { database } from '@/server/db';
import { clientAddress } from '@/server/guest-limits';
import { ownerCredential, ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure } from '@/server/owner-v2';
// The signed-in owner changes their own password; other sessions of the account are signed out.
export async function PUT(request: Request) {
  try {
    ownerGate(); ownerOrigin(request);
    const data = await ownerInput(request);
    if (Object.keys(data).sort().join() !== 'current,next') throw new OwnerError(400, 'INVALID_PASSWORD');
    return ownerJson(await new OwnerAuth(database()).changePassword(await ownerCredential(), data.current, data.next, clientAddress(request)));
  } catch (error) { return ownerFailure(error); }
}
