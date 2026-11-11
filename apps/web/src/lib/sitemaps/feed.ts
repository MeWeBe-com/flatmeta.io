import { serverApi } from '@/lib/server-api';
import { SITE_URL } from '@/lib/config';

export interface SitemapFeed {
  plots: { slug: string; title: string; hasCover: boolean; updatedAt: string }[];
  countries: string[];
  regions: string[];
  users: { username: string; updatedAt: string }[];
  orgs: { slug: string; updatedAt: string }[];
  /** G12: countries with reserved company land (/brands/<cc>). */
  brandCountries?: string[];
}

export const PLOTS_PER_SITEMAP = 40_000;
export const STATIC_PAGES = ['', '/explore', '/leaderboards', '/marketplace', '/clans', '/pricing', '/business', '/brands', '/about', '/about/facts', '/legal/terms', '/legal/privacy', '/legal/refunds'];

/** The API's list of public URLs (plots visible on the map, countries, cities, owners, organisations). */
export async function sitemapFeed(): Promise<SitemapFeed | null> {
  return serverApi<SitemapFeed>('/sitemap', { auth: false, revalidate: 3600 }).catch(() => null);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
export const xmlEscape = esc;

export function xmlResponse(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=900, s-maxage=3600' },
  });
}

export const abs = (path: string) => `${SITE_URL}${path}`;

/** The sitemap index: the app's pages and plots sitemaps, plus the insights sitemap when asked (production). */
export async function sitemapIndex(withInsights: boolean) {
  const feed = await sitemapFeed();
  const pages = Math.max(1, Math.ceil((feed?.plots.length ?? 0) / PLOTS_PER_SITEMAP));
  const maps = [...(withInsights ? [abs('/sitemap.xml')] : []), abs('/sitemap-pages.xml'), ...Array.from({ length: pages }, (_, i) => abs(i === 0 ? '/sitemap-plots.xml' : `/sitemap-plots.xml?page=${i + 1}`))];
  const now = new Date().toISOString();
  return xmlResponse(
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps.map((m) => `  <sitemap><loc>${xmlEscape(m)}</loc><lastmod>${now}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>`,
  );
}
