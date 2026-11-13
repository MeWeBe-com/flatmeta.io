import { insightArticles } from '@/lib/insights';
import { abs, xmlEscape, xmlResponse } from '@/lib/sitemaps/feed';

/**
 * The insights articles (S1), read from INSIGHTS_DIR (the folder the insights automation writes to), and the
 * /insights hub the app serves (S5), dated by its newest article. The automation's own index (/insights/) is not
 * listed: it redirects to the hub.
 */
export async function GET() {
  const all = await insightArticles();
  const articles = all.filter((a) => a.path !== '/insights/');
  const newest = articles.reduce((m, a) => (a.lastmod > m ? a.lastmod : m), '');
  const rows = [...(articles.length ? [{ path: '/insights', lastmod: newest }] : []), ...articles];
  const body = rows.map((a) => `  <url><loc>${xmlEscape(abs(a.path))}</loc><lastmod>${a.lastmod}</lastmod></url>`).join('\n');
  return xmlResponse(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
}
