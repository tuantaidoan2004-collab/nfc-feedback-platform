import { AdminAuth } from '@/lib/admin/auth';
import { ShopProvisioning } from '@/lib/admin/provisioning';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// The template's sign-in, in every environment: a single-use link to choose a strong password (lát F6). The fixed
// `yourshop / 1` once issued outside production is gone (27/09): with the repository public it was a known password.
// Asking again closes the account and issues a fresh link.
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    const account = await new ShopProvisioning(database()).templateAccountLink(principal.adminId);
    const origin = process.env.APP_ORIGIN;
    return adminJson({ account: { username: account.username, created: account.created, slug: account.slug, expiresAt: account.expiresAt,
      setupUrl: origin ? `${origin}/owner/setup/${account.setupToken}` : null } });
  } catch (error) { return adminFailure(error); }
}
