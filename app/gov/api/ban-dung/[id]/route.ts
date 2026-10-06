import { AdminAuth } from '@/lib/admin/auth';
import { EditDesk } from '@/lib/admin/desk';
import { database } from '@/server/db';
import { adminFailure, adminGate, adminInput, adminJson, adminOrigin, adminSessionToken } from '@/server/admin';

// Bàn dựng (lib/admin/desk.ts): GET the desk of an open request; POST one change `{ op, ... }` and get the desk back.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    adminGate();
    await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson({ desk: await new EditDesk(database()).load((await context.params).id) });
  } catch (error) { return adminFailure(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson(await new EditDesk(database()).act(principal.adminId, (await context.params).id, await adminInput(request, 64 * 1024)));
  } catch (error) { return adminFailure(error); }
}
