import { OwnerAuth, OwnerError } from '@/lib/owner/auth';
import { unlinkGoogle } from '@/lib/owner/google';
import { database } from '@/server/db';
import { clientAddress } from '@/server/guest-limits';
import { ownerCredential, ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure } from '@/server/owner-v2';

// "Ngắt kết nối Google" in Hồ sơ (rà bảo mật 29/09, G1): with the account's password; every other session is signed out.
export async function DELETE(request: Request) {
  try {
    ownerGate(); ownerOrigin(request);
    const data = await ownerInput(request);
    if (Object.keys(data).join() !== 'password') throw new OwnerError(400, 'INVALID_INPUT');
    return ownerJson(await new OwnerAuth(database()).withPassword(await ownerCredential(), data.password, clientAddress(request),
      (db, user) => unlinkGoogle(db, user.id, user.token)));
  } catch (error) { return ownerFailure(error); }
}
