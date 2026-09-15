import type { NextConfig } from 'next';
// Self-hosting is the default build target, so standalone output stays on unless a platform that ships its own
// server opts out by setting NFC_BUILD_TARGET. No host is named here; opting out is always an explicit choice.
const standalone = (process.env.NFC_BUILD_TARGET ?? 'standalone') === 'standalone';
const config: NextConfig = { ...(standalone ? { output: 'standalone' as const } : {}), poweredByHeader: false, async headers() { return ['/ZZZ/:path*','/owner/:path*','/api/owner/v2/:path*'].map(source=>({source,headers:[{key:'Cache-Control',value:'private, no-store'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'},{key:'Content-Security-Policy',value:"frame-ancestors 'none'; object-src 'none'; base-uri 'self'"}]})); } };
export default config;
