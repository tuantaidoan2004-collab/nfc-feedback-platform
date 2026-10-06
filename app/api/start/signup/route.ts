import { AccountSignup } from '@/lib/account/signup';
import { OwnerError } from '@/lib/owner/auth';
import { database } from '@/server/db';
import { clientAddress } from '@/server/guest-limits';
import { ownerCookie, ownerEnabled, ownerFailure, ownerInput, ownerJson, ownerOrigin, ownerToken } from '@/server/owner-v2';

/**
 * Bước 1 của onboarding (kịch bản mục 4): tên đăng nhập, email, mật khẩu → tài khoản, quán và phiên đăng nhập, ngay lập tức.
 * The next step is the progress screen at 20%. With `join` (G3, nhân viên): the account, a request to join that shop, and the
 * waiting screen.
 */
export async function POST(request: Request) {
  try {
    if (!ownerEnabled()) throw new OwnerError(404, 'NOT_FOUND');
    ownerOrigin(request);
    const data = await ownerInput(request);
    const keys = Object.keys(data).filter(key => !['displayName', 'kind', 'join', 'message'].includes(key)).sort().join();
    if (keys !== 'email,password,username') throw new OwnerError(400, 'INVALID_INPUT');
    const signup = new AccountSignup(database()), base = { username: data.username, email: data.email, password: data.password, displayName: data.displayName };
    // Staff (G3) have no shop until its owner approves them: they wait on /bat-dau/cho-duyet.
    const made = 'join' in data ? await signup.createStaff({ ...base, join: data.join, message: data.message }, clientAddress(request), await ownerToken())
      : await signup.create({ ...base, kind: data.kind }, clientAddress(request), await ownerToken());
    const response = ownerJson({ next: made.join ? '/bat-dau/cho-duyet' : '/bat-dau/tien-trinh', username: made.username, shop: made.join?.name ?? null });
    response.cookies.set(ownerCookie, made.session.token, { httpOnly: true, sameSite: 'strict', secure: new URL(request.url).protocol === 'https:', path: '/', expires: made.session.expiresAt });
    return response;
  } catch (error) { return ownerFailure(error); }
}
