import type { MetadataRoute } from 'next';

// Read when asked, not when built: a Docker image is built without APP_ORIGIN and gets it only at run time (29/09).
export const dynamic = 'force-dynamic';

/** The platform's own public pages, for Search Console (lát D4). No shop page is ever listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.APP_ORIGIN;
  if (!origin) return [];
  return ['/', '/bat-dau', '/huong-dan-google', '/quyen-rieng-tu', '/dieu-khoan'].map(path => ({ url: `${origin}${path}` }));
}
