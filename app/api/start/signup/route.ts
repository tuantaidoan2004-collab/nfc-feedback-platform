import { OwnerError } from '@/lib/owner/auth';
import { DraftError } from '@/lib/start/draft';
import { ShopSignups } from '@/lib/start/signup';
import { database } from '@/server/db';
import { clientAddress } from '@/server/guest-limits';
import { ownerEnabled, ownerFailure, ownerInput, ownerJson, ownerOrigin } from '@/server/owner-v2';
import { openStartDraft, startEnabled } from '@/server/start';

/**
 * "Lưu trang của tôi" (lát D4b): the signed draft plus the account the owner chooses. The account exists from here;
 * the page waits for an administrator (lib/start/signup.ts). The draft is read from its signature, never from what the
 * form says about it, so the name that waits for approval is the one the trip-wire already passed.
 */
export async function POST(request: Request) {
  try {
    if (!startEnabled() || !ownerEnabled()) throw new OwnerError(404, 'NOT_FOUND');
    ownerOrigin(request);
    const data = await ownerInput(request);
    const fields = Object.keys(data).filter(key => key !== 'zalo').sort().join();
    if (fields !== 'email,password,token,username' || typeof data.token !== 'string') throw new OwnerError(400, 'INVALID_INPUT');
    let draft;
    try { draft = openStartDraft(data.token); }
    catch (error) { if (error instanceof DraftError) throw new OwnerError(error.code === 'DRAFT_EXPIRED' ? 410 : 400, error.code); throw error; }
    const saved = await new ShopSignups(database()).create({ draft, username: data.username, email: data.email, password: data.password, zalo: data.zalo },
      clientAddress(request));
    return ownerJson({ saved: true, username: saved.username });
  } catch (error) { return ownerFailure(error); }
}
