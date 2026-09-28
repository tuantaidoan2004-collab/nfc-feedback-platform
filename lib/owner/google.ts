import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import { openSession, OwnerError, sessionHash, transaction, type OwnerCredential } from './auth';

/**
 * Đăng nhập bằng Google cho chủ quán (lát D4c, migration 032). The OAuth 2.0 authorization-code flow with PKCE, a
 * state and a nonce, done by the server with no library: the browser goes to Google, Google sends it back to
 * /api/owner/v2/google/callback with a code, and the server trades the code for an ID token straight from Google.
 *
 * Three things a Google account can do here, never more:
 *   - `login`  : open the dashboard of the account already linked to it;
 *   - `link`   : link it to the account signed in right now ("Kết nối Google" in Hồ sơ);
 *   - `signup` : save a page built at /bat-dau, making the account (lib/start/signup.ts).
 * It is never matched to an account by email: an account's email was typed by someone and never proven, so matching on it
 * would let a stranger prepare an account in someone else's name and share it with them.
 */
export type GoogleSettings = { clientId: string; clientSecret: string; authUrl: string; tokenUrl: string };
export type GoogleIntent =
  | { kind: 'login'; next: string | null }
  | { kind: 'link'; next: string }
  | { kind: 'signup'; draft: string; username: string; zalo: string | null };
/** What travels in the short-lived cookie between leaving for Google and coming back. */
export type GoogleTrip = { state: string; verifier: string; nonce: string; intent: GoogleIntent; expires: number };

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth', TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
export const TRIP_COOKIE = 'nfc_google_trip', TRIP_SECONDS = 600;

/**
 * The client this deployment signs in with, or null when it has none (the buttons then do not show). Google's two
 * addresses can be pointed elsewhere only where the deployment says it is local: the tests' stand-in for Google.
 */
export function googleSettings(env: Record<string, string | undefined> = process.env): GoogleSettings | null {
  const clientId = env.NFC_GOOGLE_CLIENT_ID?.trim(), clientSecret = env.NFC_GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const local = env.NFC_ENV === 'local';
  return { clientId, clientSecret, authUrl: (local && env.NFC_GOOGLE_AUTH_URL) || AUTH_URL, tokenUrl: (local && env.NFC_GOOGLE_TOKEN_URL) || TOKEN_URL };
}
export const redirectUri = (origin: string) => `${origin}/api/owner/v2/google/callback`;

// The trip is signed with a key of its own, derived from the render key like draft links are (lib/start/draft-sign.ts).
const tripKey = (secret: string) => createHmac('sha256', secret).update('nfc-google-trip-v1').digest();
const b64 = (value: Buffer | string) => Buffer.from(value).toString('base64url');

export function newTrip(intent: GoogleIntent, now = Date.now()): GoogleTrip {
  return { state: b64(randomBytes(24)), verifier: b64(randomBytes(48)), nonce: b64(randomBytes(24)), intent, expires: Math.floor(now / 1000) + TRIP_SECONDS };
}
export function sealTrip(trip: GoogleTrip, secret: string) {
  const payload = b64(JSON.stringify(trip));
  return `${payload}.${b64(createHmac('sha256', tripKey(secret)).update(payload).digest())}`;
}
export function openTrip(cookie: string | undefined, secret: string, now = Date.now()): GoogleTrip | null {
  if (typeof cookie !== 'string' || cookie.length > 3000) return null;
  const [payload, mac, extra] = cookie.split('.');
  if (!payload || !mac || extra !== undefined) return null;
  const expected = createHmac('sha256', tripKey(secret)).update(payload).digest(), actual = Buffer.from(mac, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const trip = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GoogleTrip;
    return Number.isInteger(trip.expires) && trip.expires * 1000 > now ? trip : null;
  } catch { return null; }
}

export function authorizationUrl(settings: GoogleSettings, origin: string, trip: GoogleTrip) {
  const url = new URL(settings.authUrl);
  const challenge = createHash('sha256').update(trip.verifier).digest('base64url');
  for (const [key, value] of Object.entries({ client_id: settings.clientId, redirect_uri: redirectUri(origin), response_type: 'code', scope: 'openid email profile',
    state: trip.state, nonce: trip.nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' })) url.searchParams.set(key, value);
  return url.href;
}

/**
 * Trades the code for Google's ID token and reads who it names. The token comes straight from Google's token endpoint
 * over TLS, authenticated with the client secret, so its signature need not be checked again (Google's OpenID Connect
 * guide); every claim that decides something still is: issuer, audience, expiry, the nonce of this trip, a verified email.
 */
export async function googleAccount(settings: GoogleSettings, origin: string, code: string, trip: GoogleTrip, fetcher: typeof fetch = fetch, now = Date.now()) {
  const response = await fetcher(settings.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: settings.clientId, client_secret: settings.clientSecret, redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code', code_verifier: trip.verifier }) });
  if (!response.ok) throw new OwnerError(401, 'GOOGLE_REFUSED');
  const token = (await response.json().catch(() => null))?.id_token;
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) throw new OwnerError(401, 'GOOGLE_REFUSED');
  let claims: Record<string, unknown>;
  try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { throw new OwnerError(401, 'GOOGLE_REFUSED'); }
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ISSUERS.includes(String(claims.iss)) || !audience.includes(settings.clientId) || typeof claims.exp !== 'number' || claims.exp * 1000 <= now
    || claims.nonce !== trip.nonce || typeof claims.sub !== 'string' || !/^[0-9]{1,255}$/.test(claims.sub)) throw new OwnerError(401, 'GOOGLE_REFUSED');
  if (claims.email_verified !== true || typeof claims.email !== 'string') throw new OwnerError(401, 'GOOGLE_EMAIL_UNVERIFIED');
  return { sub: claims.sub, email: claims.email.toLowerCase() };
}

export class GoogleAccounts {
  constructor(private pool: Pool) {}

  /** The dashboard of the account linked to this Google account; nothing when none is. */
  async signIn(sub: string, previous?: string) {
    return transaction(this.pool, async db => {
      const user = (await db.query('SELECT id FROM owner_identities_v2 WHERE google_sub=$1 AND active FOR SHARE', [sub])).rows[0];
      if (!user) throw new OwnerError(404, 'GOOGLE_NOT_LINKED');
      return openSession(db, user.id, previous);
    });
  }

  /** Links this Google account to the one signed in now. A Google account already linked elsewhere stays where it is. */
  async link(credential: OwnerCredential, sub: string) {
    if (typeof credential !== 'string' || !/^[a-f0-9]{64}$/.test(credential)) throw new OwnerError(401, 'LOGIN_REQUIRED');
    return transaction(this.pool, async db => {
      const user = (await db.query(`SELECT u.id,u.google_sub FROM owner_auth_sessions_v2 a JOIN owner_identities_v2 u ON u.id=a.user_id
        WHERE a.token_hash=$1 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND u.active FOR UPDATE OF u`, [sessionHash(credential)])).rows[0];
      if (!user) throw new OwnerError(401, 'LOGIN_REQUIRED');
      if (user.google_sub === sub) return { linked: true };
      if (user.google_sub) throw new OwnerError(409, 'GOOGLE_OTHER_LINKED');
      if ((await db.query('SELECT 1 FROM owner_identities_v2 WHERE google_sub=$1', [sub])).rowCount) throw new OwnerError(409, 'GOOGLE_ALREADY_LINKED');
      try { await db.query('UPDATE owner_identities_v2 SET google_sub=$2 WHERE id=$1', [user.id, sub]); }
      catch (error) { if ((error as { code?: string }).code === '23505') throw new OwnerError(409, 'GOOGLE_ALREADY_LINKED'); throw error; }
      return { linked: true };
    });
  }
}
