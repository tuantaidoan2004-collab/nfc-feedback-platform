import { AdminAuth } from '@/lib/admin/auth';
import { PublishReviews } from '@/lib/admin/publish-reviews';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminInput, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// A self-signed-up shop's first publish: approve the revision Tài was shown, or send it back with a reason (kịch bản mục 4).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson({ review: await new PublishReviews(database()).decide(principal.adminId, (await context.params).id, await adminInput(request)) });
  } catch (error) { return adminFailure(error); }
}
