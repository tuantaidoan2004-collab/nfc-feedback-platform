import { AdminAuth } from '@/lib/admin/auth';
import { AdminBilling } from '@/lib/admin/billing';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminInput, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// Record a payment the operator received, or a free trial until a date (lát P5b-lite). Records are never changed.
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson({ payment: await new AdminBilling(database()).record(principal.adminId, await adminInput(request)) });
  } catch (error) { return adminFailure(error); }
}
