import { AdminAuth } from '@/lib/admin/auth';
import { EditRequests } from '@/lib/admin/edit-requests';
import { database } from '@/server/db';
import { adminFailure, adminGate, adminJson, adminOrigin, adminSessionToken } from '@/server/admin';

// A request for Tài to build a page: `{ action: 'contacted' }` once he has messaged the shop on Zalo, `{ action: 'done' }` to close
// it without publishing. Publishing the page with scripts/sua-trang.mjs closes it on its own.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson(await new EditRequests(database()).act(principal.adminId, (await context.params).id, await request.json().catch(() => null)));
  } catch (error) { return adminFailure(error); }
}
