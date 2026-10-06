import { addBranch } from '@/lib/account/branches';
import { database } from '@/server/db';
import { ownerCredential, ownerFailure, ownerGate, ownerInput, ownerJson, ownerOrigin } from '@/server/owner-v2';
type Context = { params: Promise<{ shop: string }> };

/** Thêm địa chỉ quán dưới gói VIP (G3b, kịch bản mục 13): tên và Place ID; trả slug của quán mới để chuyển sang. */
export async function POST(request: Request, context: Context) {
  try {
    ownerGate(); ownerOrigin(request);
    return ownerJson(await addBranch(database(), await ownerCredential(), (await context.params).shop, await ownerInput(request)), 201);
  } catch (error) { return ownerFailure(error); }
}
