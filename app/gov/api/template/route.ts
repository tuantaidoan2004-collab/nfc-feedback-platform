import { AdminAuth } from '@/lib/admin/auth';
import { ShopProvisioning } from '@/lib/admin/provisioning';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// Creates the template shop, or finishes one a failed run left without a release. Generating a shop does the same
// on its own; this lets the operator open the template before any shop exists.
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson({ template: await new ShopProvisioning(database()).ensureTemplate(principal.adminId) });
  } catch (error) { return adminFailure(error); }
}
