import { Payments } from '@/lib/billing/payments';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure } from '@/server/owner-v2';
type Context = { params: Promise<{ shop: string }> };
// Thanh toán của quán (kịch bản mục 3b): xem, tạo yêu cầu chuyển khoản (10k kích hoạt hay trả gói), huỷ yêu cầu đang chờ.
export async function GET(_: Request, context: Context) {
  try { ownerGate(); return ownerJson(await new Payments(database()).status(await ownerCredential(), (await context.params).shop)); }
  catch (error) { return ownerFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try { ownerGate(); ownerOrigin(request);
    return ownerJson(await new Payments(database()).request(await ownerCredential(), (await context.params).shop, await ownerInput(request))); }
  catch (error) { return ownerFailure(error); }
}
export async function DELETE(request: Request, context: Context) {
  try { ownerGate(); ownerOrigin(request);
    return ownerJson(await new Payments(database()).cancel(await ownerCredential(), (await context.params).shop)); }
  catch (error) { return ownerFailure(error); }
}
