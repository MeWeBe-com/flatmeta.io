import { serverApi } from '@/lib/server-api';
import { SITE_URL } from '@/lib/config';

export interface SitemapFeed {
  /** company: a company (showcase) plot, listed in sitemap-companies.xml instead of sitemap-plots.xml. */
  plots: { slug: string; title: string; hasCover: boolean; updatedAt: string; company?: boolean }[];
  countries: string[];
  regions: string[];
  users: { username: string; updatedAt: string }[];
  orgs: { slug: string; updatedAt: string }[];
  /** G12: countries with reserved company land (/brands/<cc>). */
  brandCountries?: string[];
  /** S2: the newest content change among each hub page's plots. */
  lastmod?: { countries: Record<string, string | null>; regions: Record<string, string | null>; brands: Record<string, string | null> };
}

/** S2: lastmod for pages that don't come from data = the build time. */
export const BUILD_TIME = process.env.BUILD_TIME || new Date(0).toISOString();

/** Sitemaps hold at most 50,000 URLs and 50 MB: split at 40,000 (plot entries are well under 1 KB each). */
export const PLOTS_PER_SITEMAP = 40_000;
export const STATIC_PAGES = ['', '/explore', '/leaderboards', '/marketplace', '/clans', '/pricing', '/business', '/brands', '/about', '/about/facts', '/legal/terms', '/legal/privacy', '/legal/refunds'];

/** The API's list of public URLs (plots visible on the map, countries, cities, owners, organisations). */
export async function sitemapFeed(): Promise<SitemapFeed | null> {
  // S2: no copy kept here; the API caches the feed for 10 minutes and drops it on every publish / edit / hide / remove.
  return serverApi<SitemapFeed>('/sitemap', { auth: false, revalidate: 0 }).catch(() => null);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
export const xmlEscape = esc;

export function xmlResponse(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' },
  });
}

export const abs = (path: string) => `${SITE_URL}${path}`;

/** Plot pages split into people's land and company land (S1); each list is paged by PLOTS_PER_SITEMAP. */
export const plotsOf = (feed: SitemapFeed | null, company: boolean) => (feed?.plots ?? []).filter((p) => !!p.company === company);
export const pageCount = (n: number) => Math.max(1, Math.ceil(n / PLOTS_PER_SITEMAP));

/**
 * The sitemap index at /sitemap.xml (S1): the site's pages, its plots, its companies and the insights articles.
 * It never lists itself. /sitemap-index.xml redirects here.
 */
export async function sitemapIndex() {
  const feed = await sitemapFeed();
  const paged = (file: string, n: number) => Array.from({ length: pageCount(n) }, (_, i) => abs(i === 0 ? file : `${file}?page=${i + 1}`));
  const maps = [abs('/sitemap-pages.xml'), ...paged('/sitemap-plots.xml', plotsOf(feed, false).length), ...paged('/sitemap-companies.xml', plotsOf(feed, true).length), abs('/sitemap-insights.xml')];
  return xmlResponse(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps.map((m) => `  <sitemap><loc>${xmlEscape(m)}</loc></sitemap>`).join('\n')}\n</sitemapindex>`);
}

/** One urlset of plot pages with their share images (plots and companies alike). */
export function plotUrlset(plots: SitemapFeed['plots'], page: number) {
  const body = plots
    .slice((page - 1) * PLOTS_PER_SITEMAP, page * PLOTS_PER_SITEMAP)
    .map((p) => {
      const image = p.hasCover ? `<image:image><image:loc>${xmlEscape(abs(`/api/v1/plots/${p.slug}/cover.jpg?w=1200`))}</image:loc><image:title>${xmlEscape(p.title)}</image:title></image:image>` : '';
      return `  <url><loc>${xmlEscape(abs(`/p/${p.slug}`))}</loc><lastmod>${new Date(p.updatedAt).toISOString()}</lastmod>${image}</url>`;
    })
    .join('\n');
  return xmlResponse(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>`);
}

export const pageParam = (req: Request) => Math.max(1, Math.floor(Number(new URL(req.url).searchParams.get('page') ?? 1)) || 1);
