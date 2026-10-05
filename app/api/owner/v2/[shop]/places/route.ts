import { placeStatus, savePlaceId } from '@/lib/google/places';
import { database } from '@/server/db';
import { ownerCredential, ownerFailure, ownerGate, ownerInput, ownerJson, ownerOrigin } from '@/server/owner-v2';
type Context = { params: Promise<{ shop: string }> };

/** Place ID của quán (kịch bản mục 5, thủ công): GET trả mã đã lưu, POST lưu mã chủ quán dán. */
export async function GET(_request: Request, context: Context) {
  try {
    ownerGate();
    return ownerJson(await placeStatus(database(), await ownerCredential(), (await context.params).shop));
  } catch (error) { return ownerFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    ownerGate(); ownerOrigin(request);
    const body = await ownerInput(request);
    return ownerJson(await savePlaceId(database(), await ownerCredential(), (await context.params).shop, body));
  } catch (error) { return ownerFailure(error); }
}
