import { OwnerError } from '@/lib/owner/auth';
import { OwnerSetupLinks } from '@/lib/owner/setup-link';
import { database } from '@/server/db';
import { ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure } from '@/server/owner-v2';

// No session is required or created here: the link itself is the only credential, and it is spent on use.
export async function POST(request: Request) {
  try {
    ownerGate(); ownerOrigin(request);
    const data = await ownerInput(request);
    if (Object.keys(data).sort().join() !== 'password,token') throw new OwnerError(400, 'INVALID_INPUT');
    await new OwnerSetupLinks(database()).consume(data.token, data.password);
    return ownerJson({ ready: true });
  } catch (error) { return ownerFailure(error); }
}
