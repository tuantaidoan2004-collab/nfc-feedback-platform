import { AdminAuth, AdminError } from '@/lib/admin/auth';
import { EditDesk } from '@/lib/admin/desk';
import { database } from '@/server/db';
import { adminFailure, adminGate, adminJson, adminOrigin, adminSessionToken } from '@/server/admin';

// One file dropped on Bàn dựng: the bytes as the body (the screen has already shrunk a picture), its type in Content-Type, its role
// ("logo" or "anh") and name in the query. Through this app, not a signed link, so no bucket CORS is involved.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    const length = Number(request.headers.get('content-length'));
    if (!Number.isFinite(length) || length > 5 * 1024 * 1024) throw new AdminError(413, 'MEDIA_TOO_LARGE');
    const query = new URL(request.url).searchParams;
    return adminJson(await new EditDesk(database()).addFile(principal.adminId, (await context.params).id, {
      type: (request.headers.get('content-type') ?? '').split(';')[0].trim(), role: query.get('vai') ?? 'anh', name: query.get('ten') ?? '',
      bytes: Buffer.from(await request.arrayBuffer()) }));
  } catch (error) { return adminFailure(error); }
}
