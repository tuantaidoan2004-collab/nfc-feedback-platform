import { AdminAuth } from '@/lib/admin/auth';
import { AdminBilling } from '@/lib/admin/billing';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminInput, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// Where shops send money (lát P5b-lite): entered by the operator here, kept in the database, never in the code.
export async function PUT(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson({ settings: await new AdminBilling(database()).saveSettings(principal.adminId, await adminInput(request, 720_000)) });
  } catch (error) { return adminFailure(error); }
}
