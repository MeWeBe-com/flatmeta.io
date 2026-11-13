import 'server-only';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * The insights articles (S1/S5). A separate automation writes static HTML articles into the production
 * `public_html/insights/` folder (nginx serves them); the app only reads that folder to list them in
 * /sitemap-insights.xml and to check them against the content rules (S5). INSIGHTS_DIR is that folder; unset = none.
 * The automation's own /sitemap.xml, if it still writes one, is ignored: the app's index owns /sitemap.xml.
 */
export interface InsightArticle {
  /** URL path, e.g. /insights/2026-11-13-some-article.html (the folder's index.html is /insights/). */
  path: string;
  lastmod: string;
  title: string | null;
  description: string | null;
  lang: string | null;
  ogImage: string | null;
  /** Links to FlatMeta's own pages (not other articles, not the home page alone). */
  internalLinks: number;
}

const TTL = 10 * 60_000;
let cache: { at: number; dir: string; list: InsightArticle[] } | null = null;

const pick = (html: string, re: RegExp) => {
  const m = re.exec(html);
  return m ? decode(m[1]!.trim()) : null;
};
const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/\s+/g, ' ');

export function parseArticle(html: string) {
  const links = [...html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["']/gi)].map((m) => m[1]!);
  const internal = new Set(
    links
      .map((h) => h.replace(/^https?:\/\/(www\.)?flatmeta\.io/i, ''))
      .filter((h) => h.startsWith('/') && !h.startsWith('//') && !h.startsWith('/insights') && h !== '/'),
  );
  return {
    title: pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description: pick(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) ?? pick(html, /<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i),
    lang: pick(html, /<html[^>]*\slang=["']([^"']+)["']/i),
    ogImage: pick(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i),
    internalLinks: internal.size,
  };
}

export async function insightArticles(dir = process.env.INSIGHTS_DIR ?? ''): Promise<InsightArticle[]> {
  if (!dir) return [];
  if (cache && cache.dir === dir && Date.now() - cache.at < TTL) return cache.list;
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => /^[\w.-]+\.html$/.test(n));
  } catch {
    return [];
  }
  const list: InsightArticle[] = [];
  for (const name of names.sort()) {
    const file = path.join(dir, name);
    try {
      const [st, html] = await Promise.all([stat(file), readFile(file, 'utf8')]);
      if (!st.isFile()) continue;
      list.push({ path: name === 'index.html' ? '/insights/' : `/insights/${name}`, lastmod: st.mtime.toISOString(), ...parseArticle(html) });
    } catch {
      /* unreadable file: skip it */
    }
  }
  cache = { at: Date.now(), dir, list };
  return list;
}
