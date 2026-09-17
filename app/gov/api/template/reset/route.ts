import { AdminAuth } from '@/lib/admin/auth';
import { ShopProvisioning } from '@/lib/admin/provisioning';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// Publishes the current built-in defaults on the template. Shops created earlier keep their own page.
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson({ template: await new ShopProvisioning(database()).resetTemplate(principal.adminId) });
  } catch (error) { return adminFailure(error); }
}
