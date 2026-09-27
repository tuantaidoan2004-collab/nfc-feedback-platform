import type { MetadataRoute } from 'next';

/** The platform's own public pages, for Search Console (lát D4). No shop page is ever listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.APP_ORIGIN;
  if (!origin) return [];
  return ['/', '/bat-dau', '/huong-dan-google', '/quyen-rieng-tu', '/dieu-khoan'].map(path => ({ url: `${origin}${path}` }));
}
