import { NextResponse } from 'next/server';
import { authorizationUrl, googleSettings, newTrip, sealTrip, type GoogleIntent } from '@/lib/owner/google';
import { OwnerAuth, OwnerError, username } from '@/lib/owner/auth';
import { businessKind, displayName } from '@/lib/account/signup';
import { ownerEnabled, ownerToken, safeDestination } from '@/server/owner-v2';
import { database } from '@/server/db';
import { clientAddress } from '@/server/guest-limits';
import { fromThisSite } from '@/server/same-origin';
import { boundedText, HttpError } from '@/server/http';
import { tripCookie, tripSecret } from '@/server/google';

/**
 * Leaves for Google (lát D4c). A plain form post from this site's own pages -- the sign-in page, the builder's save step,
 * Hồ sơ -- so it works without script and Google's page opens as a whole-page navigation. What the trip is for is
 * checked here, before leaving, and again when it comes back.
 */
const back = (origin: string, path: string, code: string) => NextResponse.redirect(`${origin}${path}${path.includes('?') ? '&' : '?'}google=${code}`, 303);
/** What a refused password check says on the way back to Hồ sơ; its own words, not the sign-in page's. */
const LINK_REFUSED: Record<string, string> = { WRONG_PASSWORD: 'LINK_WRONG_PASSWORD', TOO_MANY_ATTEMPTS: 'LINK_TOO_MANY', INVALID_PASSWORD: 'LINK_PASSWORD_REQUIRED', LOGIN_REQUIRED: 'LOGIN_REQUIRED' };

export async function POST(request: Request) {
  const settings = googleSettings(), origin = process.env.APP_ORIGIN;
  if (!ownerEnabled() || !settings || !origin) return new Response(null, { status: 404 });
  if (!fromThisSite(request, origin)) return new Response(null, { status: 403 });
  // Read only up to 8 KB (rà bảo mật 29/09, U1): the Origin check above is no proof against a script, and formData() would
  // hold the whole body in memory whatever its size. Every field here is short.
  let form: URLSearchParams;
  try { if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw Error(); form = new URLSearchParams(await boundedText(request, 8192)); }
  catch (error) { return new Response(null, { status: error instanceof HttpError ? error.status : 400 }); }
  const field = (name: string) => { const value = form.get(name); return typeof value === 'string' && value.length <= 1500 ? value : null; };
  let intent: GoogleIntent;
  const kind = field('intent');
  if (kind === 'login') intent = { kind, next: safeDestination(field('next')) };
  else if (kind === 'link') {
    const next = safeDestination(field('next')); if (!next) return new Response(null, { status: 400 });
    // Who is linking is read now, while this site's own page sends the session cookie -- the way back from Google will
    // not (SameSite=Strict; 28/09 on production every link attempt answered "Phiên đăng nhập đã hết") -- and carried in
    // the signed trip. And only with the account's password (rà bảo mật 29/09, G1): a session left open on someone else's
    // phone must not be enough to add a way in that outlives it.
    let userId: string;
    try { userId = await new OwnerAuth(database()).withPassword(await ownerToken(), field('password'), clientAddress(request), async (_db, user) => user.id); }
    catch (error) { return back(origin, `${next}?view=profile`, (error instanceof OwnerError && LINK_REFUSED[error.code]) || 'SERVICE_UNAVAILABLE'); }
    intent = { kind, next, userId };
  } else if (kind === 'signup') {
    // Onboarding step 1 with Google: the handle is checked now, so a trip that cannot make an account is not sent.
    const name = username((field('username') ?? '').replace(/^@/, ''));
    if (!name) return back(origin, '/bat-dau', 'INVALID_USERNAME');
    intent = { kind, username: name, displayName: displayName(field('displayName')), business: businessKind(field('kind')) };
  } else return new Response(null, { status: 400 });
  const trip = newTrip(intent);
  const response = NextResponse.redirect(authorizationUrl(settings, origin, trip), 303);
  response.headers.set('Cache-Control', 'private, no-store');
  tripCookie(response, request, sealTrip(trip, tripSecret()));
  return response;
}
