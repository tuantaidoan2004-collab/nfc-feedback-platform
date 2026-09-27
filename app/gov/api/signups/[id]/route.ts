import { AdminAuth, AdminError } from '@/lib/admin/auth';
import { ShopProvisioning } from '@/lib/admin/provisioning';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminInput, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

/** Approve a page an owner saved before having a shop (lát D4b), or refuse it and close the account it made. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    const data = await adminInput(request), id = (await context.params).id;
    if (Object.keys(data).join() !== 'decision') throw new AdminError(400, 'INVALID_INPUT');
    const provisioning = new ShopProvisioning(database());
    if (data.decision === 'approve') return adminJson({ shop: await provisioning.approveSignup(principal.adminId, id) });
    if (data.decision === 'reject') return adminJson(await provisioning.rejectSignup(principal.adminId, id));
    throw new AdminError(400, 'INVALID_INPUT');
  } catch (error) { return adminFailure(error); }
}
