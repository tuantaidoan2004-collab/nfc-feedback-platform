import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { authorizationUrl, googleAccount, googleSettings, newTrip, openTrip, sealTrip, redirectUri } from '../../lib/owner/google';

/** Lát D4c: the pieces of Google sign-in that decide who someone is. Test values only; nothing here reaches Google. */
const secret = 'k'.repeat(32), origin = 'https://quitesensational-review-bio.com';
const settings = { clientId: 'client-1.apps.googleusercontent.com', clientSecret: 'shh', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token' };
const trip = newTrip({ kind: 'login', next: null });
const idToken = (claims: Record<string, unknown>) => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;
const good = { iss: 'https://accounts.google.com', aud: settings.clientId, sub: '1234567890', email: 'Chu@Example.com', email_verified: true, exp: Math.floor(Date.now() / 1000) + 300, nonce: trip.nonce };
const answer = (body: unknown, ok = true) => (async () => new Response(JSON.stringify(body), { status: ok ? 200 : 400 })) as typeof fetch;
const code = async (run: Promise<unknown>) => run.then(() => 'ok', (error: { code?: string }) => error.code);

test('the client comes from the environment; Google\'s addresses move only for a local deployment', () => {
  expect(googleSettings({})).toBeNull();
  expect(googleSettings({ NFC_GOOGLE_CLIENT_ID: 'a', NFC_GOOGLE_CLIENT_SECRET: 'b', NFC_GOOGLE_TOKEN_URL: 'http://evil.test/token' })?.tokenUrl).toBe('https://oauth2.googleapis.com/token');
  expect(googleSettings({ NFC_GOOGLE_CLIENT_ID: 'a', NFC_GOOGLE_CLIENT_SECRET: 'b', NFC_ENV: 'local', NFC_GOOGLE_TOKEN_URL: 'http://127.0.0.1:1/token' })?.tokenUrl).toBe('http://127.0.0.1:1/token');
  expect(redirectUri(origin)).toBe('https://quitesensational-review-bio.com/api/owner/v2/google/callback');
});

test('the trip is this browser\'s own: signed, short-lived, and nothing else opens', () => {
  const sealed = sealTrip(trip, secret);
  expect(openTrip(sealed, secret)).toEqual(trip);
  expect(openTrip(sealed, 'j'.repeat(32))).toBeNull();
  expect(openTrip(sealed.replace(/.$/, c => c === 'A' ? 'B' : 'A'), secret)).toBeNull();
  expect(openTrip(sealed, secret, (trip.expires + 1) * 1000)).toBeNull();
  expect(openTrip(undefined, secret)).toBeNull();
});

test('Google is asked with PKCE, a state, a nonce, and only for name and email', () => {
  const url = new URL(authorizationUrl(settings, origin, trip));
  expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: settings.clientId, redirect_uri: redirectUri(origin), response_type: 'code',
    scope: 'openid email profile', state: trip.state, nonce: trip.nonce, code_challenge: createHash('sha256').update(trip.verifier).digest('base64url'),
    code_challenge_method: 'S256', prompt: 'select_account' });
});

test('the ID token decides only when every claim is right', async () => {
  expect(await googleAccount(settings, origin, 'c', trip, answer({ id_token: idToken(good) }))).toEqual({ sub: '1234567890', email: 'chu@example.com' });
  for (const [change, expected] of [[{ iss: 'https://evil.test' }, 'GOOGLE_REFUSED'], [{ aud: 'other-client' }, 'GOOGLE_REFUSED'], [{ exp: 1 }, 'GOOGLE_REFUSED'],
    [{ nonce: 'someone-elses' }, 'GOOGLE_REFUSED'], [{ sub: 'not-digits' }, 'GOOGLE_REFUSED'], [{ email_verified: false }, 'GOOGLE_EMAIL_UNVERIFIED']] as const)
    expect(await code(googleAccount(settings, origin, 'c', trip, answer({ id_token: idToken({ ...good, ...change }) }))), JSON.stringify(change)).toBe(expected);
  expect(await code(googleAccount(settings, origin, 'c', trip, answer({ error: 'invalid_grant' }, false)))).toBe('GOOGLE_REFUSED');
  expect(await code(googleAccount(settings, origin, 'c', trip, answer({ id_token: 'not-a-token' })))).toBe('GOOGLE_REFUSED');
  // What the server sends Google: the code, its own secret, the verifier of this trip.
  let sent = new URLSearchParams();
  await googleAccount(settings, origin, 'the-code', trip, (async (_url: string, init: RequestInit) => { sent = new URLSearchParams(String(init.body)); return new Response(JSON.stringify({ id_token: idToken(good) })); }) as unknown as typeof fetch);
  expect(Object.fromEntries(sent)).toEqual({ code: 'the-code', client_id: settings.clientId, client_secret: 'shh', redirect_uri: redirectUri(origin), grant_type: 'authorization_code', code_verifier: trip.verifier });
});
