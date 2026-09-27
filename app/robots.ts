import type { MetadataRoute } from 'next';

/**
 * What a search engine may read (lát D4): the front page, the builder and the public guides. Every private surface
 * also says noindex on its own; this keeps crawlers out of them in the first place. Guest pages are not listed
 * here -- they answer at the root -- and carry noindex themselves.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = process.env.APP_ORIGIN;
  return { rules: { userAgent: '*', allow: '/', disallow: ['/ZZZ/', '/gov', '/owner/', '/api/', '/thu/', '/preview', '/t/'] },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}) };
}
