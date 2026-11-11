import { APP_ENV } from '@/lib/config';
import { sitemapIndex } from '@/lib/sitemaps/feed';

/**
 * Sitemap index (G4). Lists the app's own sitemaps, and in production the insights sitemap that is published as a
 * static /sitemap.xml next to the app (elsewhere /sitemap.xml is this index itself). robots.txt points here.
 */
export async function GET() {
  return sitemapIndex(APP_ENV === 'production');
}
