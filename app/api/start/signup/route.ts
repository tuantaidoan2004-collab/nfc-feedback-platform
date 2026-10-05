import { AccountSignup } from '@/lib/account/signup';
import { OwnerError } from '@/lib/owner/auth';
import { database } from '@/server/db';
import { clientAddress } from '@/server/guest-limits';
import { ownerCookie, ownerEnabled, ownerFailure, ownerInput, ownerJson, ownerOrigin, ownerToken } from '@/server/owner-v2';

/**
 * Bước 1 của onboarding (kịch bản mục 4): tên đăng nhập, email, mật khẩu → tài khoản, quán và phiên đăng nhập, ngay lập tức.
 * The next step is the progress screen at 20%.
 */
export async function POST(request: Request) {
  try {
    if (!ownerEnabled()) throw new OwnerError(404, 'NOT_FOUND');
    ownerOrigin(request);
    const data = await ownerInput(request);
    const keys = Object.keys(data).filter(key => key !== 'displayName' && key !== 'kind').sort().join();
    if (keys !== 'email,password,username') throw new OwnerError(400, 'INVALID_INPUT');
    const made = await new AccountSignup(database()).create({ username: data.username, email: data.email, password: data.password, displayName: data.displayName, kind: data.kind },
      clientAddress(request), await ownerToken());
    const response = ownerJson({ next: '/bat-dau/tien-trinh', username: made.username });
    response.cookies.set(ownerCookie, made.session.token, { httpOnly: true, sameSite: 'strict', secure: new URL(request.url).protocol === 'https:', path: '/', expires: made.session.expiresAt });
    return response;
  } catch (error) { return ownerFailure(error); }
}
