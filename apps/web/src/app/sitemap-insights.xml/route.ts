import { insightArticles } from '@/lib/insights';
import { abs, xmlEscape, xmlResponse } from '@/lib/sitemaps/feed';

/** The insights articles (S1), read from INSIGHTS_DIR (the folder the insights automation writes to). */
export async function GET() {
  const list = await insightArticles();
  const body = list.map((a) => `  <url><loc>${xmlEscape(abs(a.path))}</loc><lastmod>${a.lastmod}</lastmod></url>`).join('\n');
  return xmlResponse(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
}
