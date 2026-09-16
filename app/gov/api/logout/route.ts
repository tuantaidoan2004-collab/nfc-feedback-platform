import { AdminAuth } from '@/lib/admin/auth';
import { database } from '@/server/db';
import { adminCookie, adminCookiePath, adminSessionToken, adminGate, adminOrigin, adminJson, adminFailure } from '@/server/admin';
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    await new AdminAuth(database()).logout(await adminSessionToken());
    const response = adminJson({ signedOut: true });
    response.cookies.set(adminCookie, '',
      { httpOnly: true, sameSite: 'strict', secure: new URL(request.url).protocol === 'https:', path: adminCookiePath, maxAge: 0 });
    return response;
  } catch (error) { return adminFailure(error); }
}
