import type { NextConfig } from 'next';
// Self-hosting is the default build target, so standalone output stays on unless a platform that ships its own
// server opts out by setting NFC_BUILD_TARGET. No host is named here; opting out is always an explicit choice.
const standalone = (process.env.NFC_BUILD_TARGET ?? 'standalone') === 'standalone';
// The dev-tools badge sits bottom-left, exactly over the guest page's floating feedback button, and swallows its taps.
const config: NextConfig = { ...(standalone ? { output: 'standalone' as const } : {}), poweredByHeader: false, devIndicators: false, async headers() { return ['/ZZZ/:path*','/owner/:path*','/api/owner/v2/:path*','/gov','/gov/:path*'].map(source=>({source,headers:[{key:'Cache-Control',value:'private, no-store'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'},{key:'Content-Security-Policy',value:"frame-ancestors 'none'; object-src 'none'; base-uri 'self'"}]})).concat([
  // The page list's pictures (lát P3) are this app's own pages framed by this app's own dashboard, and nothing else may
  // frame them. Listed last: for the same header key the last match wins over the owner rule above.
  {source:'/ZZZ/:shop/thumb/:page',headers:[{key:'X-Frame-Options',value:'SAMEORIGIN'},{key:'Content-Security-Policy',value:"frame-ancestors 'self'; object-src 'none'; base-uri 'self'"}]},
  // A draft link (lát D4) carries its draft in the path: never cached, never sent on as a referrer when the Google button
  // is tapped, and framed only by this app's own builder.
  {source:'/thu/:token',headers:[{key:'Cache-Control',value:'private, no-store'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Frame-Options',value:'SAMEORIGIN'},{key:'Content-Security-Policy',value:"frame-ancestors 'self'; object-src 'none'; base-uri 'self'"}]}]); } };
export default config;
