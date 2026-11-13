import { pageParam, plotUrlset, plotsOf, sitemapFeed } from '@/lib/sitemaps/feed';

/** Company land (showcase plots) with their share images (S1). Paged like sitemap-plots.xml. */
export async function GET(req: Request) {
  return plotUrlset(plotsOf(await sitemapFeed(), true), pageParam(req));
}
