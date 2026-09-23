import { AdminAuth, AdminError } from '@/lib/admin/auth';
import { ShopProvisioning } from '@/lib/admin/provisioning';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminInput, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

export async function GET() {
  try {
    adminGate();
    await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson({ shops: await new ShopProvisioning(database()).list() });
  } catch (error) { return adminFailure(error); }
}

export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    const data = await adminInput(request);
    // templateKey is optional so a caller from before the six templates still gets khuôn 1.
    const fields = Object.keys(data).filter(key => key !== 'templateKey').sort().join();
    if (fields !== 'googleUrl,name,ownerEmail,ownerUsername') throw new AdminError(400, 'INVALID_INPUT');
    const shop = await new ShopProvisioning(database()).create(principal.adminId, data);
    // The link is shown once, in a no-store response, because only its hash is kept. Losing it means issuing
    // a replacement rather than looking the old one up.
    const origin = process.env.APP_ORIGIN;
    return adminJson({ shop: { ...shop, setupUrl: origin ? `${origin}/owner/setup/${shop.setupToken}` : null } });
  } catch (error) { return adminFailure(error); }
}
