import 'server-only';
import { NextResponse } from 'next/server';
import { keyring } from './publishing-runtime';
import { ownerCookie, privateHeaders } from './owner-v2';
import { TRIP_COOKIE, TRIP_SECONDS } from '@/lib/owner/google';

/** The render key's secret, from which the Google trip's own key is derived (lib/owner/google.ts). */
export const tripSecret = () => { const ring = keyring(); return ring.keys[ring.active]; };
const secure = (request: Request) => new URL(request.url).protocol === 'https:';
/**
 * The trip cookie rides the top-level navigation back from Google, a cross-site request, so it is Lax, not Strict; it
 * lives ten minutes, on the callback's path only, and the callback clears it whatever happens.
 */
export function tripCookie(response: NextResponse, request: Request, value: string | null) {
  response.cookies.set(TRIP_COOKIE, value ?? '', { httpOnly: true, sameSite: 'lax', secure: secure(request), path: '/api/owner/v2/google',
    ...(value ? { maxAge: TRIP_SECONDS } : { maxAge: 0 }) });
}
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
/**
 * The last step back from Google: a tiny page of our own that moves on to `destination`. Not a redirect -- the owner's
 * session cookie is SameSite=Strict, and a browser does not send it on a redirect chain that began on Google's site, so
 * the dashboard would ask to sign in again. A navigation this page starts is same-site, and the cookie goes with it.
 * `destination` is always a path this app built, never one read from the request.
 */
export function hop(request: Request, destination: string, session?: { token: string; expiresAt: Date }) {
  const safe = escape(destination);
  const response = new NextResponse(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${safe}">`
    + `<meta name="robots" content="noindex"><title>Đang chuyển…</title></head><body><p><a href="${safe}">Tiếp tục</a></p></body></html>`,
    { status: 200, headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
  tripCookie(response, request, null);
  if (session) response.cookies.set(ownerCookie, session.token, { httpOnly: true, sameSite: 'strict', secure: secure(request), path: '/', expires: session.expiresAt });
  return response;
}
