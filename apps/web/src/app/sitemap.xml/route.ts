import { sitemapIndex } from '@/lib/sitemaps/feed';

/**
 * In production a static insights sitemap is published at /sitemap.xml and served before the app; everywhere
 * else (staging, development, CI) this route answers with the sitemap index, so /sitemap.xml always works.
 */
export async function GET() {
  return sitemapIndex(false);
}
