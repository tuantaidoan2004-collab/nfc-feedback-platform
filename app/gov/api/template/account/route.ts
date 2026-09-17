import { AdminAuth } from '@/lib/admin/auth';
import { ShopProvisioning } from '@/lib/admin/provisioning';
import { database } from '@/server/db';
import { nfcEnv } from '@/server/env';
import { adminGate, adminOrigin, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// The template's test sign-in (yourshop / 1). Its password is weak by request, so production never issues it.
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson({ account: await new ShopProvisioning(database()).ensureTemplateAccount(principal.adminId, nfcEnv() !== 'production') });
  } catch (error) { return adminFailure(error); }
}
