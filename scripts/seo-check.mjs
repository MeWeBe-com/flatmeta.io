// GL8: daily SEO check of a live site. No account, no secrets.
//   node scripts/seo-check.mjs https://www.flatmeta.io [--sample 25] [--md report.md]
// Checks robots.txt → the one sitemap index → every child sitemap (status, XML, lastmod) → a sample of URLs from each:
// 200, self canonical, one <h1>, a title of at most 60 characters naming FlatMeta once, a meta description of
// 50–170 characters, og:image, valid JSON-LD, and no noindex. Also llms.txt and llms-full.txt. Exit 1 on any failure.
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const attr = (tag, name) => new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)?.[1];
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** The problems on one HTML page (an empty list means it passes). */
export function checkPage(html, url) {
  const problems = [];
  const title = decode(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '');
  if (!title) problems.push('no <title>');
  else {
    if (title.length > 60) problems.push(`title is ${title.length} characters (max 60): "${title}"`);
    const brand = (title.match(/FlatMeta/g) ?? []).length;
    if (brand !== 1) problems.push(`title names FlatMeta ${brand} times: "${title}"`);
  }
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = (key, value) => metas.find((m) => attr(m, key)?.toLowerCase() === value);
  const desc = decode(attr(meta('name', 'description') ?? '', 'content') ?? '');
  if (!desc) problems.push('no meta description');
  else if (desc.length < 50 || desc.length > 170) problems.push(`meta description is ${desc.length} characters (50–170)`);
  const robots = attr(meta('name', 'robots') ?? '', 'content') ?? '';
  if (/noindex/i.test(robots)) problems.push(`robots meta says "${robots}"`);
  if (!meta('property', 'og:image')) problems.push('no og:image');
  const canonical = (html.match(/<link\b[^>]*>/gi) ?? []).find((l) => attr(l, 'rel') === 'canonical');
  const href = canonical ? decode(attr(canonical, 'href') ?? '') : '';
  if (!href) problems.push('no canonical');
  else if (href.replace(/\/$/, '') !== url.replace(/\/$/, '')) problems.push(`canonical points elsewhere: ${href}`);
  const h1 = (html.match(/<h1\b/gi) ?? []).length;
  if (h1 !== 1) problems.push(`${h1} <h1> elements`);
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const d = JSON.parse(m[1]);
      // One node, a list of nodes, or an @graph: every node needs a @type, and the context must be set.
      const nodes = Array.isArray(d) ? d : d['@graph'] ?? [d];
      const ctx = Array.isArray(d) ? nodes.every((n) => n['@context']) : !!d['@context'];
      if (!ctx || !nodes.every((n) => n['@type'])) problems.push('JSON-LD without @context or @type');
    } catch {
      problems.push('JSON-LD does not parse');
    }
  }
  return problems;
}

/** <loc> + <lastmod> pairs of a sitemap or sitemap index. */
export function parseSitemap(xml) {
  return [...xml.matchAll(/<(?:url|sitemap)>([\s\S]*?)<\/(?:url|sitemap)>/g)].map((m) => ({
    loc: decode(/<loc>([^<]+)<\/loc>/.exec(m[1])?.[1] ?? ''),
    lastmod: /<lastmod>([^<]+)<\/lastmod>/.exec(m[1])?.[1] ?? null,
  }));
}

/** An even spread of n items (first, last and between), so every kind of page gets checked. */
export function sample(items, n) {
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]);
}

async function main() {
  const base = (process.argv[2] ?? '').replace(/\/$/, '');
  if (!/^https?:\/\//.test(base)) {
    console.error('Usage: node scripts/seo-check.mjs <https://site> [--sample 25] [--md out.md]');
    process.exit(2);
  }
  const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
  const per = Number(arg('--sample', 25));
  const lines = [];
  let failures = 0;
  const report = (ok, what, detail = '') => {
    if (!ok) failures++;
    const line = `${ok ? '✓' : '✗'} ${what}${detail ? ` · ${detail}` : ''}`;
    lines.push(line);
    console.log(line);
  };
  const get = (path) => fetch(path.startsWith('http') ? path : base + path, { headers: { 'user-agent': 'FlatMeta-SEO-Check/1.0' }, redirect: 'manual' });

  const robots = await get('/robots.txt');
  const robotsTxt = await robots.text();
  report(robots.status === 200 && robotsTxt.includes(`Sitemap: ${base}/sitemap.xml`), 'robots.txt lists the sitemap index', `status ${robots.status}`);
  report(!/^Disallow:\s*\/\s*$/m.test(robotsTxt), 'robots.txt does not block the whole site');

  const index = await get('/sitemap.xml');
  const children = index.status === 200 ? parseSitemap(await index.text()) : [];
  report(children.length > 0, 'sitemap index has child sitemaps', `${children.length}`);
  report(children.every((c) => c.lastmod), 'every child sitemap has a lastmod');
  const urls = [];
  for (const c of children) {
    const r = await get(c.loc);
    const entries = r.status === 200 ? parseSitemap(await r.text()) : [];
    report(r.status === 200, `${new URL(c.loc).pathname}${new URL(c.loc).search}`, `${entries.length} URLs`);
    report(entries.every((e) => e.lastmod && !e.lastmod.startsWith('1970')), `  every URL has a real lastmod`);
    urls.push(...sample(entries.map((e) => e.loc), per));
  }
  const offHost = urls.filter((u) => !u.startsWith(base));
  report(offHost.length === 0, 'every sitemap URL is on the canonical host', offHost[0] ?? '');
  const bad = [];
  for (const u of urls.filter((x) => x.startsWith(base))) {
    const r = await get(u);
    if (r.status !== 200) {
      bad.push(`${u}: status ${r.status}`);
      continue;
    }
    if (!(r.headers.get('content-type') ?? '').includes('text/html')) continue;
    const p = checkPage(await r.text(), u);
    if (p.length) bad.push(`${u}: ${p.join('; ')}`);
  }
  report(bad.length === 0, `${urls.length} sampled pages pass the page checks`, bad.length ? `${bad.length} with problems` : '');
  for (const b of bad.slice(0, 40)) lines.push(`    - ${b}`), console.log(`    - ${b}`);

  for (const f of ['/llms.txt', '/llms-full.txt']) {
    const r = await get(f);
    const t = r.status === 200 ? await r.text() : '';
    report(r.status === 200 && t.startsWith('# FlatMeta') && !/digital twin/i.test(t), `${f} is the app's own`, t.split('\n')[0]);
  }
  const md = arg('--md', process.env.GITHUB_STEP_SUMMARY);
  const head = `## SEO check · ${base} · ${new Date().toISOString().slice(0, 16)}Z\n\n${failures ? `**${failures} failed**` : '**All passed**'}\n\n`;
  if (md) writeFileSync(md, head + lines.map((l) => (l.startsWith('    ') ? l : `- ${l}`)).join('\n') + '\n', { flag: 'a' });
  process.exitCode = failures ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
