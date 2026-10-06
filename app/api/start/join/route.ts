import { OwnerError, transaction } from '@/lib/owner/auth';
import { sessionAccount } from '@/lib/account/workspace';
import { findShop, joinMessage, myRequests, openJoinRequest } from '@/lib/account/join';
import { database } from '@/server/db';
import { ownerEnabled, ownerFailure, ownerInput, ownerJson, ownerOrigin, ownerToken } from '@/server/owner-v2';

/**
 * Xin vào một quán bằng tài khoản đang đăng nhập (G3): @chủ quán, link trang hay mã quán → một yêu cầu chờ chủ duyệt.
 * DELETE rút một yêu cầu còn mở. Người chưa có tài khoản xin vào lúc đăng ký (`/api/start/signup` với `join`).
 */
async function account() {
  if (!ownerEnabled()) throw new OwnerError(404, 'NOT_FOUND');
  const me = await sessionAccount(database(), await ownerToken());
  if (!me) throw new OwnerError(401, 'LOGIN_REQUIRED');
  return me;
}
export async function GET() {
  try { const me = await account(); return ownerJson(await myRequests(database(), me.id)); }
  catch (error) { return ownerFailure(error); }
}
export async function POST(request: Request) {
  try {
    ownerOrigin(request); const me = await account(), data = await ownerInput(request);
    if (!Object.keys(data).every(key => key === 'shop' || key === 'message') || !('shop' in data)) throw new OwnerError(400, 'INVALID_INPUT');
    const message = joinMessage(data.message);
    const made = await transaction(database(), async db => openJoinRequest(db, me.id, await findShop(db, data.shop), message));
    return ownerJson({ shop: made.shop.name, ...(await myRequests(database(), me.id)) });
  } catch (error) { return ownerFailure(error); }
}
export async function DELETE(request: Request) {
  try {
    ownerOrigin(request); const me = await account(), data = await ownerInput(request);
    if (typeof data.requestId !== 'string' || !/^[0-9a-f-]{36}$/.test(data.requestId)) throw new OwnerError(400, 'INVALID_INPUT');
    await database().query("UPDATE join_requests SET decided_at=clock_timestamp(),outcome='withdrawn' WHERE id=$1 AND user_id=$2 AND decided_at IS NULL", [data.requestId, me.id]);
    return ownerJson(await myRequests(database(), me.id));
  } catch (error) { return ownerFailure(error); }
}
