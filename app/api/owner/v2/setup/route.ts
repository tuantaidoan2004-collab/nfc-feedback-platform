import { OwnerError } from '@/lib/owner/auth';
import { OwnerSetupLinks } from '@/lib/owner/setup-link';
import { database } from '@/server/db';
import { clientAddress } from '@/server/guest-limits';
import { ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure, safeDestination } from '@/server/owner-v2';

// No session is required or created here: the link itself is the only credential, and it is spent on use.
export async function POST(request: Request) {
  try {
    ownerGate(); ownerOrigin(request);
    const data = await ownerInput(request);
    if (Object.keys(data).sort().join() !== 'password,token') throw new OwnerError(400, 'INVALID_INPUT');
    const links = new OwnerSetupLinks(database()), userId = await links.consume(data.token, data.password, clientAddress(request));
    // The shop is sent on to its own dashboard's sign-in, not to a login page that asks it to find the address.
    const slug = await links.dashboardSlug(userId);
    return ownerJson({ ready: true, next: slug ? safeDestination(`/ZZZ/${slug}`) : null });
  } catch (error) { return ownerFailure(error); }
}
