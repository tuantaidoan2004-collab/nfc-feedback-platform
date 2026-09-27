import { AdminAuth } from '@/lib/admin/auth';
import { TextReview } from '@/lib/admin/text-review';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminInput, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// Approve a shop's own thank-you line, or refuse it with a reason the shop will read (lát M2b).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson({ text: await new TextReview(database()).decide(principal.adminId, (await context.params).id, await adminInput(request)) });
  } catch (error) { return adminFailure(error); }
}
