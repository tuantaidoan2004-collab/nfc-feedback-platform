import { AdminAuth } from '@/lib/admin/auth';
import { EditRequests } from '@/lib/admin/edit-requests';
import { database } from '@/server/db';
import { adminFailure, adminGate, adminJson, adminOrigin, adminSessionToken } from '@/server/admin';

// Closes a "Nhờ admin sửa" request by hand; publishing the edit with scripts/sua-trang.mjs closes it on its own.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson(await new EditRequests(database()).done(principal.adminId, (await context.params).id));
  } catch (error) { return adminFailure(error); }
}
