import type { MetadataRoute } from 'next';
import { APP_ENV, SITE_URL } from '@/lib/config';

const PRIVATE = ['/dashboard', '/admin', '/checkout', '/login', '/claim/', '/api/'];
// Plot share images are served by the API; let crawlers (and image search) fetch them.
const PUBLIC_API = ['/api/v1/plots/*/cover.jpg'];

export default function robots(): MetadataRoute.Robots {
  // Keep staging and dev out of search engines entirely.
  if (APP_ENV !== 'production') return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: ['/', ...PUBLIC_API], disallow: PRIVATE },
    // The app's sitemap index (pages + every public plot), plus the insights sitemap published as /sitemap.xml.
    sitemap: [`${SITE_URL}/sitemap-index.xml`, `${SITE_URL}/sitemap.xml`],
    host: SITE_URL,
  };
}
