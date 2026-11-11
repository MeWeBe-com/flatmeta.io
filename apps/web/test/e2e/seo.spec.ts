import { expect, test } from '@playwright/test';

/** G4: sitemap index with every public plot, and per-plot canonical, share images and JSON-LD. */
test.skip(({ isMobile }) => !!isMobile, 'same on mobile');

test('the sitemap index lists the plot sitemap, which lists public plot pages with their images', async ({ request }) => {
  const index = await request.get('/sitemap-index.xml');
  expect(index.status()).toBe(200);
  expect(index.headers()['content-type']).toMatch(/xml/);
  const ix = await index.text();
  expect(ix).toMatch(/<sitemapindex/);
  expect(ix).toMatch(/\/sitemap-plots\.xml<\/loc>/);
  expect(ix).toMatch(/\/sitemap-pages\.xml<\/loc>/);


  const plots = await (await request.get('/sitemap-plots.xml')).text();
  const urls = [...plots.matchAll(/<loc>([^<]+\/p\/[^<]+)<\/loc>/g)].map((m) => m[1]!);
  expect(urls.length).toBeGreaterThan(0);
  expect(plots).toMatch(/<image:loc>[^<]+\/cover\.jpg\?w=1200<\/image:loc>/);
  const pages = await (await request.get('/sitemap-pages.xml')).text();
  expect(pages).toMatch(/<loc>[^<]+\/pricing<\/loc>/);
});

test('a plot page has its canonical URL, share images and JSON-LD', async ({ request }) => {
  const plots = await (await request.get('/sitemap-plots.xml')).text();
  const url = [...plots.matchAll(/<loc>([^<]+\/p\/[^<]+)<\/loc>/g)][0]![1]!;
  const path = new URL(url).pathname;
  const html = await (await request.get(path)).text();
  expect(html).toMatch(new RegExp(`<link rel="canonical" href="[^"]+${path.replace(/\//g, '\\/')}"`));
  expect(html).toMatch(/<meta property="og:image" content="[^"]+opengraph-image/);
  expect(html).toMatch(/<meta name="twitter:image" content="[^"]+twitter-image/);
  expect(html).toMatch(/<meta name="twitter:card" content="summary_large_image"/);
  const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([^<]+)<\/script>/g)].map((m) => JSON.parse(m[1]!));
  const types = ld.flat().map((x: { '@type': string }) => x['@type']);
  expect(types).toEqual(expect.arrayContaining(['BreadcrumbList']));
  expect(types.some((t: string) => ['Place', 'Organization', 'LocalBusiness'].includes(t))).toBe(true);
});
