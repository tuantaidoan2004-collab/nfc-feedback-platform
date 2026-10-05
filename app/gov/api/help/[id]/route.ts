import { AdminAuth } from '@/lib/admin/auth';
import { HelpRequests } from '@/lib/admin/help';
import { database } from '@/server/db';
import { adminFailure, adminGate, adminJson, adminOrigin, adminSessionToken } from '@/server/admin';

// Marks a "nhờ admin tạo giúp" request as done.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson(await new HelpRequests(database()).done(principal.adminId, (await context.params).id));
  } catch (error) { return adminFailure(error); }
}
