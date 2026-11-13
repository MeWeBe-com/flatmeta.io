import { pageParam, plotUrlset, plotsOf, sitemapFeed } from '@/lib/sitemaps/feed';

/** People's public plot pages with their share images (G4). Paged (?page=2, …), listed in /sitemap.xml. */
export async function GET(req: Request) {
  return plotUrlset(plotsOf(await sitemapFeed(), false), pageParam(req));
}
