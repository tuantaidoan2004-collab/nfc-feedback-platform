import { AdminAuth } from '@/lib/admin/auth';
import { MediaReview } from '@/lib/admin/media-review';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminInput, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// Approve an upload, or refuse it with a reason the shop will read.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson({ media: await new MediaReview(database()).decide(principal.adminId, (await context.params).id, await adminInput(request)) });
  } catch (error) { return adminFailure(error); }
}
