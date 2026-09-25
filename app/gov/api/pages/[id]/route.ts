import { AdminAuth } from '@/lib/admin/auth';
import { PageIncidents } from '@/lib/admin/page-incidents';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminInput, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// Pause, resume or close one page of a shop (lát P4).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson({ page: await new PageIncidents(database()).act(principal.adminId, (await context.params).id, await adminInput(request)) });
  } catch (error) { return adminFailure(error); }
}
