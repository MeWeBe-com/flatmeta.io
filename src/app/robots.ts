import type { MetadataRoute } from 'next';
import { APP_ENV, SITE_URL } from '@/lib/config';

export default function robots(): MetadataRoute.Robots {
  // Keep staging and dev out of search engines entirely.
  if (APP_ENV !== 'production') return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard', '/admin', '/checkout', '/login', '/claim/', '/api/'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
