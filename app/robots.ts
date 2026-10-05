import type { MetadataRoute } from 'next';

// Read when asked, not when built: a Docker image is built without APP_ORIGIN and gets it only at run time (29/09).
export const dynamic = 'force-dynamic';

/**
 * What a search engine may read: the front page, the template gallery, pricing and the public guides. Every private surface
 * also says noindex on its own; this keeps crawlers out of them in the first place. Guest pages are not listed
 * here -- they answer at the root -- and carry noindex themselves.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = process.env.APP_ORIGIN;
  return { rules: { userAgent: '*', allow: '/', disallow: ['/ZZZ/', '/app', '/gov', '/owner/', '/api/', '/preview', '/t/'] },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}) };
}
