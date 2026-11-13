import { BUILD_TIME, STATIC_PAGES, abs, sitemapFeed, xmlEscape, xmlResponse } from '@/lib/sitemaps/feed';

/**
 * Site pages, countries, cities, owner profiles, organisations and /brands/<cc> (G4). Every URL has a real lastmod
 * (S2): hub pages the newest change among their plots, profiles and organisations their own update time, static
 * pages the build time. Plots are in sitemap-plots.xml and sitemap-companies.xml.
 */
export async function GET() {
  const feed = await sitemapFeed();
  const lm = feed?.lastmod;
  const urls: { loc: string; lastmod: string }[] = STATIC_PAGES.map((p) => ({ loc: abs(p), lastmod: BUILD_TIME }));
  for (const c of feed?.countries ?? []) urls.push({ loc: abs(`/c/${c.toLowerCase()}`), lastmod: lm?.countries[c] ?? BUILD_TIME });
  for (const r of feed?.regions ?? []) urls.push({ loc: abs(`/r/${r}`), lastmod: lm?.regions[r] ?? BUILD_TIME });
  for (const u of feed?.users ?? []) urls.push({ loc: abs(`/u/${u.username}`), lastmod: u.updatedAt });
  for (const c of feed?.brandCountries ?? []) urls.push({ loc: abs(`/brands/${c.toLowerCase()}`), lastmod: lm?.brands[c] ?? BUILD_TIME });
  for (const o of feed?.orgs ?? []) urls.push({ loc: abs(`/o/${o.slug}`), lastmod: o.updatedAt });
  const body = urls.map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc><lastmod>${new Date(u.lastmod).toISOString()}</lastmod></url>`).join('\n');
  return xmlResponse(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
}
