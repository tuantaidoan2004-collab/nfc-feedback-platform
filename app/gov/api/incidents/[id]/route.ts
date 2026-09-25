import { AdminAuth } from '@/lib/admin/auth';
import { PageIncidents } from '@/lib/admin/page-incidents';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminInput, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// Mark an emergency report handled, with what was done about it.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson({ incident: await new PageIncidents(database()).resolve(principal.adminId, (await context.params).id, await adminInput(request)) });
  } catch (error) { return adminFailure(error); }
}
