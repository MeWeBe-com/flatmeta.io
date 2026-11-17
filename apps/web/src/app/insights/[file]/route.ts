import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { offTopicWord, parseArticle } from '@/lib/insights';

/**
 * QA3: the insights articles are served by the app (nginx sends /insights/<file>.html here) instead of straight from
 * public_html, so the positioning rules hold whatever the external article pipeline writes:
 * - an off-topic article (docs/positioning.md, "Don't say") answers 410 Gone with noindex: search engines drop it,
 *   and it is never in the hub or the sitemap;
 * - every other article is sent as written, with a strict CSP (no scripts run; the articles need none) and a cache.
 * Only plain file names inside INSIGHTS_DIR are read: no other path can be reached.
 */
const NAME = /^[\w.-]{1,120}\.html$/;
const CSP = "default-src 'none'; style-src 'unsafe-inline' https:; img-src https: data:; font-src https: data:; script-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const gone = (word: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Article removed · FlatMeta</title></head><body style="font:16px system-ui;background:#0b1020;color:#e8ecf8;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center"><main><h1>This article was removed</h1><p>It was not about what FlatMeta does.</p><p><a style="color:#2de2c4" href="/insights">All insights</a> · <a style="color:#2de2c4" href="/">The map</a></p></main></body></html>`,
    { status: 410, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex', 'cache-control': 'public, max-age=300', 'x-fm-insight': `off-topic: ${word}`, 'content-security-policy': CSP } },
  );

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const dir = process.env.INSIGHTS_DIR ?? '';
  if (!dir || !NAME.test(file) || file === 'index.html') return new Response('Not found', { status: 404, headers: { 'x-robots-tag': 'noindex' } });
  let html: string;
  try {
    const root = await realpath(dir);
    const full = await realpath(path.join(root, file));
    if (path.dirname(full) !== root) return new Response('Not found', { status: 404 });
    html = await readFile(full, 'utf8');
  } catch {
    return new Response('Not found', { status: 404, headers: { 'x-robots-tag': 'noindex' } });
  }
  const word = offTopicWord({ path: `/insights/${file}`, ...parseArticle(html) });
  if (word) return gone(word);
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600', 'content-security-policy': CSP, 'x-content-type-options': 'nosniff' } });
}
