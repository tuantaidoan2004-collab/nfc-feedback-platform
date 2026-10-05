import type { NextConfig } from 'next';
import { BASELINE_HEADERS } from './lib/security/headers';
// Self-hosting is the default build target, so standalone output stays on unless a platform that ships its own
// server opts out by setting NFC_BUILD_TARGET. No host is named here; opting out is always an explicit choice.
const standalone = (process.env.NFC_BUILD_TARGET ?? 'standalone') === 'standalone';
/**
 * Headers (lát H1, 29/09). For the same key the last matching rule wins, so the general rule comes first. Pages get their
 * Content-Security-Policy with a nonce from proxy.ts; the API gets a deny-all one here, since it answers JSON and one
 * small redirect page (the way back from Google) that needs nothing.
 */
const PRIVATE = [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'Referrer-Policy', value: 'no-referrer' }];
const API_POLICY = [{ key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" }];
// The dev-tools badge sits bottom-left, exactly over the guest page's floating feedback button, and swallows its taps.
const config: NextConfig = { ...(standalone ? { output: 'standalone' as const } : {}), poweredByHeader: false, devIndicators: false,
  async headers() {
    return [
      { source: '/:path*', headers: BASELINE_HEADERS },
      // Signed-in surfaces: never cached, never a referrer.
      ...['/ZZZ/:path*', '/owner/:path*', '/api/owner/v2/:path*', '/gov', '/gov/:path*'].map(source => ({ source, headers: PRIVATE })),
      ...['/api/:path*', '/gov/api/:path*'].map(source => ({ source, headers: API_POLICY })),
      // The page list's pictures (lát P3) are this app's own pages framed by this app's own dashboard, and nothing else may
      // frame them (proxy.ts gives them frame-ancestors 'self').
      { source: '/ZZZ/:shop/thumb/:page', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
      // A template drawn as a guest page (đợt ②) is framed, small, by the Library and the public gallery, and by nothing else.
      { source: '/templates/:key', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
      // A draft waiting for a shop's first publish (kịch bản mục 4), drawn small in /gov's list.
      { source: '/gov/xem/:page', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
    ];
  } };
export default config;
