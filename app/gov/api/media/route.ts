import { AdminAuth } from '@/lib/admin/auth';
import { MediaReview } from '@/lib/admin/media-review';
import { database } from '@/server/db';
import { adminGate, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// Cửa duyệt ảnh: the uploads waiting for a decision, oldest first.
export async function GET() {
  try {
    adminGate();
    await new AdminAuth(database()).access(await adminSessionToken());
    return adminJson({ media: await new MediaReview(database()).pending() });
  } catch (error) { return adminFailure(error); }
}
