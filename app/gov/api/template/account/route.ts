import { AdminAuth } from '@/lib/admin/auth';
import { ShopProvisioning } from '@/lib/admin/provisioning';
import { database } from '@/server/db';
import { nfcEnv } from '@/server/env';
import { adminGate, adminOrigin, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// The template's test sign-in (yourshop / 1). Its password is weak by request, so production never issues it; there the
// same account comes with a single-use link to choose a strong password instead (lát F6).
async function productionLink(adminId: string) {
  const account = await new ShopProvisioning(database()).templateAccountLink(adminId);
  const origin = process.env.APP_ORIGIN;
  return adminJson({ account: { username: account.username, created: account.created, slug: account.slug, expiresAt: account.expiresAt,
    setupUrl: origin ? `${origin}/owner/setup/${account.setupToken}` : null } });
}
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    if (nfcEnv() === 'production') return await productionLink(principal.adminId);
    return adminJson({ account: await new ShopProvisioning(database()).ensureTemplateAccount(principal.adminId, true) });
  } catch (error) { return adminFailure(error); }
}

// Puts that sign-in back to yourshop / 1 and clears its throttle, for when the password is unknown or locked out.
export async function PUT(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    if (nfcEnv() === 'production') return await productionLink(principal.adminId);
    return adminJson({ account: await new ShopProvisioning(database()).resetTemplateAccount(principal.adminId, true) });
  } catch (error) { return adminFailure(error); }
}
