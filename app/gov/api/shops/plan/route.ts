import { AdminAuth, AdminError } from '@/lib/admin/auth';
import { setShopPlan } from '@/lib/admin/shop-plan';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminInput, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

/** Gói của một quán và ngày trả/tặng tới (kịch bản mục 3b). */
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    const data = await adminInput(request);
    if (Object.keys(data).sort().join() !== 'paidUntil,plan,shopId') throw new AdminError(400, 'INVALID_INPUT');
    return adminJson({ billing: await setShopPlan(database(), principal.adminId, data) });
  } catch (error) { return adminFailure(error); }
}
