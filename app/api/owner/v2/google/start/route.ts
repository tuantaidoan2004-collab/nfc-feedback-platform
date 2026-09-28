import { NextResponse } from 'next/server';
import { authorizationUrl, googleSettings, newTrip, sealTrip, type GoogleIntent } from '@/lib/owner/google';
import { username } from '@/lib/owner/auth';
import { zaloNumber } from '@/lib/start/signup';
import { ownerEnabled, ownerToken, safeDestination } from '@/server/owner-v2';
import { GoogleAccounts } from '@/lib/owner/google';
import { database } from '@/server/db';
import { fromThisSite } from '@/server/same-origin';
import { openStartDraft } from '@/server/start';
import { tripCookie, tripSecret } from '@/server/google';

/**
 * Leaves for Google (lát D4c). A plain form post from this site's own pages -- the sign-in page, the builder's save step,
 * Hồ sơ -- so it works without script and Google's page opens as a whole-page navigation. What the trip is for is
 * checked here, before leaving, and again when it comes back.
 */
const back = (origin: string, path: string, code: string) => NextResponse.redirect(`${origin}${path}${path.includes('?') ? '&' : '?'}google=${code}`, 303);

export async function POST(request: Request) {
  const settings = googleSettings(), origin = process.env.APP_ORIGIN;
  if (!ownerEnabled() || !settings || !origin) return new Response(null, { status: 404 });
  if (!fromThisSite(request, origin)) return new Response(null, { status: 403 });
  let form: FormData;
  try { if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw Error(); form = await request.formData(); }
  catch { return new Response(null, { status: 400 }); }
  const field = (name: string) => { const value = form.get(name); return typeof value === 'string' && value.length <= 1500 ? value : null; };
  let intent: GoogleIntent;
  const kind = field('intent');
  if (kind === 'login') intent = { kind, next: safeDestination(field('next')) };
  else if (kind === 'link') {
    const next = safeDestination(field('next')); if (!next) return new Response(null, { status: 400 });
    // Read now, while this site's own page sends the session cookie; the way back from Google will not (SameSite=Strict).
    let userId: string;
    try { userId = await new GoogleAccounts(database()).signedIn(await ownerToken()); }
    catch { return back(origin, `${next}?view=profile`, 'LOGIN_REQUIRED'); }
    intent = { kind, next, userId };
  } else if (kind === 'signup') {
    // The builder's own checks, repeated: a trip for a draft that will not save is not worth sending to Google.
    const draft = field('token') ?? '', name = username((field('username') ?? '').replace(/^@/, '')), zalo = zaloNumber(field('zalo') ?? '');
    try { openStartDraft(draft); } catch { return back(origin, '/bat-dau', 'DRAFT_EXPIRED'); }
    if (!name) return back(origin, '/bat-dau', 'INVALID_USERNAME');
    if (zalo === undefined) return back(origin, '/bat-dau', 'INVALID_ZALO');
    intent = { kind, draft, username: name, zalo };
  } else return new Response(null, { status: 400 });
  const trip = newTrip(intent);
  const response = NextResponse.redirect(authorizationUrl(settings, origin, trip), 303);
  response.headers.set('Cache-Control', 'private, no-store');
  tripCookie(response, request, sealTrip(trip, tripSecret()));
  return response;
}
