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
  /** The article's date (from its file name, YYYY-MM-DD-…; else its modification time). */
  date: string;
}

/**
 * S5: the rules every article must follow (docs/positioning.md, "Rules for every insights article"). Returns what an
 * article breaks, in plain words; empty when it follows them all. The admin Insights page lists these.
 */
export const INSIGHT_RULES = {
  titleMax: 60,
  descriptionMin: 50,
  descriptionMax: 160,
  lang: 'en',
  minInternalLinks: 2,
  offTopic: /\b(metaverse|virtual reality|vr|headsets?|nfts?|blockchain|crypto(currency)?|digital twin)\b/i,
};
export function articleProblems(a: Pick<InsightArticle, 'title' | 'description' | 'lang' | 'ogImage' | 'internalLinks'>): string[] {
  const r = INSIGHT_RULES;
  const out: string[] = [];
  if (!a.title) out.push('no <title>');
  else if (a.title.length > r.titleMax) out.push(`title is ${a.title.length} characters (at most ${r.titleMax})`);
  if (!a.description) out.push('no meta description');
  else if (a.description.length < r.descriptionMin || a.description.length > r.descriptionMax) out.push(`description is ${a.description.length} characters (${r.descriptionMin}–${r.descriptionMax})`);
  if (a.lang !== r.lang) out.push(`<html lang> is ${a.lang ? `"${a.lang}"` : 'missing'} (must be "${r.lang}")`);
  if (!a.ogImage) out.push('no og:image');
  else if (!/^https:\/\//.test(a.ogImage)) out.push('og:image is not an absolute https URL');
  if (a.internalLinks < r.minInternalLinks) out.push(`${a.internalLinks} link${a.internalLinks === 1 ? '' : 's'} to FlatMeta pages (at least ${r.minInternalLinks})`);
  const topic = `${a.title ?? ''} ${a.description ?? ''}`.match(r.offTopic);
  if (topic) out.push(`off-topic for FlatMeta ("${topic[0]}")`);
  return out;
}

/** S5: the articles for the /insights hub: every article (not the automation's own index page), newest first. */
export async function insightList(dir?: string) {
  return (await insightArticles(dir)).filter((a) => a.path !== '/insights/').sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : x.path < y.path ? 1 : -1));
}
export const INSIGHTS_PER_PAGE = 20;

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
      const date = /^(\d{4}-\d{2}-\d{2})-/.exec(name)?.[1] ?? st.mtime.toISOString().slice(0, 10);
      list.push({ path: name === 'index.html' ? '/insights/' : `/insights/${name}`, lastmod: st.mtime.toISOString(), date, ...parseArticle(html) });
    } catch {
      /* unreadable file: skip it */
    }
  }
  cache = { at: Date.now(), dir, list };
  return list;
}
