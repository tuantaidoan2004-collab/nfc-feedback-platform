import { AdminAuth, AdminError } from '@/lib/admin/auth';
import { database } from '@/server/db';
import { adminCookie, adminCookiePath, adminSessionToken, adminGate, adminOrigin, adminInput, adminJson, adminFailure } from '@/server/admin';
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const data = await adminInput(request);
    // No destination is accepted: administration always lands on /gov, so there is no redirect to validate.
    if (Object.keys(data).sort().join() !== 'password,username') throw new AdminError(400, 'INVALID_INPUT');
    const session = await new AdminAuth(database()).login(data.username, data.password, await adminSessionToken());
    const response = adminJson({ signedIn: true });
    response.cookies.set(adminCookie, session.token,
      { httpOnly: true, sameSite: 'strict', secure: new URL(request.url).protocol === 'https:', path: adminCookiePath, expires: session.expiresAt });
    return response;
  } catch (error) { return adminFailure(error); }
}
