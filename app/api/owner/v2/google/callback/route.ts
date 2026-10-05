import { cookies } from 'next/headers';
import { GoogleAccounts, googleAccount, googleSettings, openTrip, TRIP_COOKIE, type GoogleTrip } from '@/lib/owner/google';
import { OwnerError } from '@/lib/owner/auth';
import { AccountSignup } from '@/lib/account/signup';
import { database } from '@/server/db';
import { clientAddress } from '@/server/guest-limits';
import { ownerEnabled, ownerToken } from '@/server/owner-v2';
import { hop, tripSecret } from '@/server/google';

/**
 * Back from Google (lát D4c). The trip must be this browser's own (the signed cookie), unexpired, and carry the state
 * Google returns; then the code is traded for who the Google account is, and the trip does the one thing it was for.
 * Every answer is a short page of our own that moves on (server/google.ts `hop`), with `?google=<what happened>`.
 */
const where = (trip: GoogleTrip | null, code: string) => {
  const to = (path: string) => `${path}${path.includes('?') ? '&' : '?'}google=${code}`;
  if (!trip) return to('/owner/login');
  if (trip.intent.kind === 'signup') return to('/bat-dau');
  if (trip.intent.kind === 'link') return to(`${trip.intent.next}?view=profile`);
  return to(trip.intent.next ? `/owner/login?next=${encodeURIComponent(trip.intent.next)}` : '/owner/login');
};

export async function GET(request: Request) {
  const settings = googleSettings(), origin = process.env.APP_ORIGIN;
  if (!ownerEnabled() || !settings || !origin) return new Response(null, { status: 404 });
  const url = new URL(request.url), trip = openTrip((await cookies()).get(TRIP_COOKIE)?.value, tripSecret());
  // Cancelled on Google's page, or a trip this browser did not start: nothing happens, and the person is told.
  if (url.searchParams.get('error')) return hop(request, where(trip, 'CANCELLED'));
  const code = url.searchParams.get('code'), state = url.searchParams.get('state');
  if (!trip || !code || code.length > 2048 || state !== trip.state) return hop(request, where(trip, 'TRIP_INVALID'));
  try {
    const account = await googleAccount(settings, origin, code, trip);
    const pool = database(), google = new GoogleAccounts(pool), previous = await ownerToken();
    const intent = trip.intent;
    if (intent.kind === 'login') {
      const session = await google.signIn(account.sub, previous);
      const home = intent.next ?? '/app';
      return hop(request, home, session);
    }
    if (intent.kind === 'link') { await google.link(intent.userId, account.sub); return hop(request, `${intent.next}?view=profile&google=LINKED`); }
    // Onboarding step 1 with Google: the account and its shop at once, then the progress screen.
    const made = await new AccountSignup(pool).create({ username: intent.username, displayName: intent.displayName, kind: intent.business, google: account }, clientAddress(request), previous);
    return hop(request, '/bat-dau/tien-trinh', made.session);
  } catch (error) {
    if (error instanceof OwnerError) return hop(request, where(trip, error.code));
    console.error('GOOGLE_CALLBACK', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    return hop(request, where(trip, 'SERVICE_UNAVAILABLE'));
  }
}
