import { AdminAuth } from '@/lib/admin/auth';
import { EditDesk } from '@/lib/admin/desk';
import { askClaude } from '@/lib/admin/desk-claude';
import { database } from '@/server/db';
import { adminFailure, adminGate, adminJson, adminOrigin, adminSessionToken } from '@/server/admin';

// "Nhờ Claude" (lib/admin/desk-claude.ts): one to three calls to Claude, each a minute or two, so the function may run long.
export const maxDuration = 300;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    const id = (await context.params).id;
    const result = await askClaude(database(), principal.adminId, id);
    return adminJson({ result, desk: await new EditDesk(database()).load(id) });
  } catch (error) { return adminFailure(error); }
}
