import { AdminAuth, AdminError } from '@/lib/admin/auth';
import { database } from '@/server/db';
import { adminSessionToken, adminGate, adminOrigin, adminInput, adminJson, adminFailure } from '@/server/admin';
/**
 * Starting an enrolment and confirming it. Both need a signed-in administrator; neither takes a name, so one
 * administrator can never begin an enrolment for another (lát A2).
 */
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const data = await adminInput(request);
    const auth = new AdminAuth(database()), token = await adminSessionToken();
    const shape = Object.keys(data).sort().join();
    if (shape === 'action' && data.action === 'begin') return adminJson(await auth.beginEnrolment(token));
    if (shape === 'action,code' && data.action === 'confirm') return adminJson(await auth.confirmEnrolment(token, data.code));
    throw new AdminError(400, 'INVALID_INPUT');
  } catch (error) { return adminFailure(error); }
}
