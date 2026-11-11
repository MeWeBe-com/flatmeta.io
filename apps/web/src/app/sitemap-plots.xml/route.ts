import { PLOTS_PER_SITEMAP, abs, sitemapFeed, xmlEscape, xmlResponse } from '@/lib/sitemaps/feed';

/** Every public plot page with its share image (G4). Pages of 40,000 (?page=2, …) listed in /sitemap-index.xml. */
export async function GET(req: Request) {
  const page = Math.max(1, Number(new URL(req.url).searchParams.get('page') ?? 1) || 1);
  const feed = await sitemapFeed();
  const plots = (feed?.plots ?? []).slice((page - 1) * PLOTS_PER_SITEMAP, page * PLOTS_PER_SITEMAP);
  const body = plots
    .map((p) => {
      const loc = abs(`/p/${p.slug}`);
      const image = p.hasCover ? `<image:image><image:loc>${xmlEscape(abs(`/api/v1/plots/${p.slug}/cover.jpg?w=1200`))}</image:loc><image:title>${xmlEscape(p.title)}</image:title></image:image>` : '';
      return `  <url><loc>${xmlEscape(loc)}</loc><lastmod>${new Date(p.updatedAt).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority>${image}</url>`;
    })
    .join('\n');
  return xmlResponse(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>`);
}
