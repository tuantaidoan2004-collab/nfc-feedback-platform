import { AdminAuth, AdminError } from '@/lib/admin/auth';
import { recordAdminAction } from '@/lib/admin/audit';
import { OwnerSetupLinks } from '@/lib/owner/setup-link';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminInput, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// Only a hash of a link is stored, so a lost one cannot be looked up: it has to be replaced. Issuing a
// replacement retires the previous link, which also makes this the way to cut off one sent to the wrong place.
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    const data = await adminInput(request);
    if (Object.keys(data).sort().join() !== 'ownerUserId,shopId') throw new AdminError(400, 'INVALID_INPUT');
    if (typeof data.ownerUserId !== 'string' || typeof data.shopId !== 'string') throw new AdminError(400, 'INVALID_INPUT');
    const link = await new OwnerSetupLinks(database()).issue(data.ownerUserId, 'reset');
    await recordAdminAction(database(), principal.adminId,
      { action: 'owner.link.reissue', shopId: data.shopId, onBehalfOf: data.ownerUserId });
    const origin = process.env.APP_ORIGIN;
    return adminJson({ expiresAt: link.expiresAt, setupUrl: origin ? `${origin}/owner/setup/${link.token}` : null });
  } catch (error) { return adminFailure(error); }
}
