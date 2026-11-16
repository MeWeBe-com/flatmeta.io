import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS script (scripts/seo-check.mjs), tested for its pure checks
import { checkPage, parseSitemap, sample } from '../../../../scripts/seo-check.mjs';

const page = (o: { title?: string; desc?: string; robots?: string; canonical?: string; h1?: number; ld?: string } = {}) => `<html><head>
<title>${o.title ?? 'Pricing · FlatMeta'}</title>
<meta name="description" content="${o.desc ?? 'Claim free land on a shared world map and turn it into your own page. Plans for business and brands.'}"/>
${o.robots ? `<meta name="robots" content="${o.robots}"/>` : ''}
<meta property="og:image" content="https://x.test/og.png"/>
<link rel="canonical" href="${o.canonical ?? 'https://x.test/pricing'}"/>
<script type="application/ld+json">${o.ld ?? '{"@context":"https://schema.org","@type":"Organization"}'}</script>
</head><body>${'<h1>Pricing</h1>'.repeat(o.h1 ?? 1)}</body></html>`;

describe('GL8 SEO check', () => {
  it('passes a good page', () => {
    expect(checkPage(page(), 'https://x.test/pricing')).toEqual([]);
    expect(checkPage(page({ ld: '[{"@context":"https://schema.org","@type":"Place"},{"@context":"https://schema.org","@type":"BreadcrumbList"}]' }), 'https://x.test/pricing')).toEqual([]);
  });
  it('flags the problems that cost rankings', () => {
    const p = checkPage(page({ title: 'About FlatMeta · FlatMeta', desc: 'Short.', robots: 'noindex, nofollow', canonical: 'https://x.test/other', h1: 2, ld: '{bad' }), 'https://x.test/pricing');
    expect(p.join('\n')).toMatch(/names FlatMeta 2 times/);
    expect(p.join('\n')).toMatch(/meta description is 6 characters/);
    expect(p.join('\n')).toMatch(/robots meta says "noindex/);
    expect(p.join('\n')).toMatch(/canonical points elsewhere/);
    expect(p.join('\n')).toMatch(/2 <h1> elements/);
    expect(p.join('\n')).toMatch(/JSON-LD does not parse/);
    expect(checkPage(page({ title: 'x'.repeat(70) + ' FlatMeta' }), 'https://x.test/pricing').join()).toMatch(/max 60/);
  });
  it('reads sitemaps and samples evenly', () => {
    expect(parseSitemap('<urlset><url><loc>https://x.test/a?b=1&amp;c=2</loc><lastmod>2026-11-16T00:00:00Z</lastmod></url><url><loc>https://x.test/b</loc></url></urlset>')).toEqual([
      { loc: 'https://x.test/a?b=1&c=2', lastmod: '2026-11-16T00:00:00Z' },
      { loc: 'https://x.test/b', lastmod: null },
    ]);
    expect(sample([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3)).toEqual([1, 6, 10]);
    expect(sample([1, 2], 5)).toEqual([1, 2]);
  });
});
