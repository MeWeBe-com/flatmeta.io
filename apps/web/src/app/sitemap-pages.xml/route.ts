import { STATIC_PAGES, abs, sitemapFeed, xmlEscape, xmlResponse } from '@/lib/sitemaps/feed';

/** Site pages, countries, cities, owner profiles and organisations (G4). Plots are in sitemap-plots.xml. */
export async function GET() {
  const feed = await sitemapFeed();
  const urls: { loc: string; lastmod?: string; freq: string; prio: number }[] = STATIC_PAGES.map((p) => ({ loc: abs(p), freq: p === '' ? 'hourly' : 'weekly', prio: p === '' ? 1 : 0.6 }));
  for (const c of feed?.countries ?? []) urls.push({ loc: abs(`/c/${c.toLowerCase()}`), freq: 'daily', prio: 0.7 });
  for (const r of feed?.regions ?? []) urls.push({ loc: abs(`/r/${r}`), freq: 'daily', prio: 0.7 });
  for (const u of feed?.users ?? []) urls.push({ loc: abs(`/u/${u.username}`), lastmod: u.updatedAt, freq: 'weekly', prio: 0.4 });
  for (const c of feed?.brandCountries ?? []) urls.push({ loc: abs(`/brands/${c.toLowerCase()}`), freq: 'daily', prio: 0.6 });
  for (const o of feed?.orgs ?? []) urls.push({ loc: abs(`/o/${o.slug}`), lastmod: o.updatedAt, freq: 'weekly', prio: 0.5 });
  const body = urls
    .map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : ''}<changefreq>${u.freq}</changefreq><priority>${u.prio}</priority></url>`)
    .join('\n');
  return xmlResponse(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
}
