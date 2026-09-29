import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy, framedBySelf, newNonce } from './lib/security/headers';
import { storageSettings } from './lib/media/storage-settings';
import { googleSettings } from './lib/owner/google';

/**
 * Every page gets its Content-Security-Policy here, with a nonce of its own (lát H1; Next reads the nonce from the request's
 * policy and puts it on its own scripts). A request's own Content-Security-Policy or x-nonce header is overwritten, so a
 * visitor cannot choose the nonce. API routes, static files and public media are left to next.config.ts.
 */
export function proxy(request: NextRequest) {
  const nonce = newNonce();
  const storage = storageSettings();
  const policy = contentSecurityPolicy(request.nextUrl.pathname, {
    nonce, appOrigin: process.env.APP_ORIGIN, storageEndpoint: storage?.endpoint ?? null, mediaOrigin: storage?.publicOrigin ?? null,
    googleAuthOrigin: googleSettings()?.authUrl ?? null, development: process.env.NODE_ENV === 'development',
  });
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  if (framedBySelf(request.nextUrl.pathname)) response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return response;
}

export const config = {
  matcher: [{
    // Pages only: not the API (JSON, next.config.ts gives it a deny-all policy), nor Next's static files, nor public media.
    source: '/((?!api/|gov/api/|_next/static/|_next/image|favicon.ico|media/|robots.txt|sitemap.xml).*)',
    missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }],
  }],
};
