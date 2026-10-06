import { AdminAuth, AdminError } from '@/lib/admin/auth';
import { Payments } from '@/lib/billing/payments';
import { database } from '@/server/db';
import { adminGate, adminOrigin, adminInput, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

/** Thanh toán (kịch bản mục 3b): yêu cầu chờ xác nhận, tài khoản nhận tiền và mã quét thử của nó. */
export async function GET() {
  try {
    adminGate();
    await new AdminAuth(database()).access(await adminSessionToken());
    const payments = new Payments(database());
    return adminJson({ payments: await payments.adminList(), check: await payments.payeeCheck() });
  } catch (error) { return adminFailure(error); }
}
/** "Đã nhận" hoặc "Huỷ" một yêu cầu. */
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    const data = await adminInput(request);
    if (Object.keys(data).sort().join() !== 'action,id') throw new AdminError(400, 'INVALID_INPUT');
    return adminJson(await new Payments(database()).decide(principal.adminId, data));
  } catch (error) { return adminFailure(error); }
}
/** Tài khoản nhận tiền của nền tảng. */
export async function PUT(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    const data = await adminInput(request);
    if (Object.keys(data).sort().join() !== 'accountName,accountNumber,bankBin') throw new AdminError(400, 'INVALID_INPUT');
    const payments = new Payments(database());
    await payments.setPayee(principal.adminId, data);
    return adminJson({ check: await payments.payeeCheck() });
  } catch (error) { return adminFailure(error); }
}
