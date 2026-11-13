import { sitemapIndex } from '@/lib/sitemaps/feed';

/** The sitemap index (S1): pages, plots, companies and insights. robots.txt lists only this URL. */
export async function GET() {
  return sitemapIndex();
}
