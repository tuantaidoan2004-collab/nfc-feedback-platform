import { AdminError } from '@/lib/admin/auth';
import { AdminImpersonation } from '@/lib/admin/impersonation';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminInput, adminJson, adminFailure, adminSessionToken } from '@/server/admin';
import { setImpersonationCookies } from '@/server/owner-v2';

// The response of an administrative request sets a cookie for the shop's paths, not for /gov: that is where the
// dashboard and its API will read it, and nowhere else.
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const data = await adminInput(request);
    if (Object.keys(data).sort().join() !== 'ownerUserId,reason,scope,shopId') throw new AdminError(400, 'INVALID_INPUT');
    const opened = await new AdminImpersonation(database()).start(await adminSessionToken(), data);
    const response = adminJson({ url: `/app/${opened.slug}`, scope: opened.scope, expiresAt: opened.expiresAt });
    setImpersonationCookies(response, request, opened.slug, opened.token, opened.expiresAt);
    return response;
  } catch (error) { return adminFailure(error); }
}

export async function DELETE(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const ended = await new AdminImpersonation(database()).endForAdmin(await adminSessionToken());
    const response = adminJson({ ended: !!ended });
    if (ended) setImpersonationCookies(response, request, ended.slug, null);
    return response;
  } catch (error) { return adminFailure(error); }
}
