import { AdminAuth, AdminError } from '@/lib/admin/auth';
import { database } from '@/server/db';
import { adminCookie, adminCookiePath, adminSessionToken, adminGate, adminOrigin, adminInput, adminJson, adminFailure } from '@/server/admin';
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const data = await adminInput(request);
    // No destination is accepted: administration always lands on /gov, so there is no redirect to validate.
    // `code` is optional in the shape but not in effect: an enrolled administrator without a valid one is refused
    // by `login`, with the same message as a wrong password (lát A2).
    if (!['code,password,username', 'password,username'].includes(Object.keys(data).sort().join())) throw new AdminError(400, 'INVALID_INPUT');
    const session = await new AdminAuth(database()).login(data.username, data.password, await adminSessionToken(), data.code);
    const response = adminJson({ signedIn: true });
    response.cookies.set(adminCookie, session.token,
      { httpOnly: true, sameSite: 'strict', secure: new URL(request.url).protocol === 'https:', path: adminCookiePath, expires: session.expiresAt });
    return response;
  } catch (error) { return adminFailure(error); }
}
