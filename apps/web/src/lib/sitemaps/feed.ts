import { serverApi } from '@/lib/server-api';
import { SITE_URL } from '@/lib/config';
import { LANDING_PATHS } from '@/lib/landing';
import { insightArticles } from '@/lib/insights';

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
export const STATIC_PAGES = ['', '/explore', '/leaderboards', '/marketplace', '/clans', '/pricing', '/business', '/brands', '/about', '/about/facts', '/legal/terms', '/legal/privacy', '/legal/refunds', '/demo', ...LANDING_PATHS];

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
  const articles = await insightArticles().catch(() => []);
  const people = plotsOf(feed, false);
  const companies = plotsOf(feed, true);
  const pagesLastmod = newest([BUILD_TIME, ...(feed?.users ?? []).map((u) => u.updatedAt), ...(feed?.orgs ?? []).map((o) => o.updatedAt), ...Object.values(feed?.lastmod?.countries ?? {}), ...Object.values(feed?.lastmod?.brands ?? {})]);
  // GL7: each child sitemap carries a real lastmod: the newest entry inside it.
  const maps: { loc: string; lastmod: string | null }[] = [
    { loc: abs('/sitemap-pages.xml'), lastmod: pagesLastmod },
    ...paged('/sitemap-plots.xml', people.length).map((loc, i) => ({ loc, lastmod: newest(pageOf(people, i + 1).map((p) => p.updatedAt)) })),
    ...paged('/sitemap-companies.xml', companies.length).map((loc, i) => ({ loc, lastmod: newest(pageOf(companies, i + 1).map((p) => p.updatedAt)) })),
    { loc: abs('/sitemap-insights.xml'), lastmod: newest(articles.map((a) => a.lastmod)) },
  ];
  const row = (m: (typeof maps)[number]) => `  <sitemap><loc>${xmlEscape(m.loc)}</loc>${m.lastmod ? `<lastmod>${m.lastmod}</lastmod>` : ''}</sitemap>`;
  return xmlResponse(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps.map(row).join('\n')}\n</sitemapindex>`);
}

/** The newest of some dates as an ISO string, or null when there are none (the epoch counts as none). */
export function newest(dates: (string | null | undefined)[]): string | null {
  const t = Math.max(...dates.map((d) => (d ? Date.parse(d) : NaN)).filter((n) => Number.isFinite(n) && n > 0));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
const pageOf = <T,>(rows: T[], page: number) => rows.slice((page - 1) * PLOTS_PER_SITEMAP, page * PLOTS_PER_SITEMAP);

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
