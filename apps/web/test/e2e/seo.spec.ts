import { expect, test } from '@playwright/test';

/** G4: sitemap index with every public plot, and per-plot canonical, share images and JSON-LD. */
test.skip(({ isMobile }) => !!isMobile, 'same on mobile');

test('the sitemap index lists the plot sitemap, which lists public plot pages with their images', async ({ request }) => {
  const index = await request.get('/sitemap.xml');
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

test('S3: plot pages have a 140–160 character description, a short title, og/twitter tags and entity JSON-LD', async ({ request }) => {
  const plots = await (await request.get('/sitemap-plots.xml')).text();
  const companies = await (await request.get('/sitemap-companies.xml')).text();
  const pick = (xml: string) => [...xml.matchAll(/<loc>([^<]+\/p\/[^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname)[0];
  const pages = [pick(plots), pick(companies)].filter(Boolean) as string[];
  expect(pages.length).toBeGreaterThan(0);
  const descriptions = new Set<string>();
  for (const path of pages) {
    const html = await (await request.get(path)).text();
    const meta = (name: string) => new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`).exec(html)?.[1]?.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
    const description = meta('description')!;
    expect(description.length, `${path} description`).toBeGreaterThanOrEqual(140);
    expect(description.length, `${path} description`).toBeLessThanOrEqual(160);
    expect(description).toMatch(/ on FlatMeta/);
    descriptions.add(description);
    const title = /<title>([^<]*)<\/title>/.exec(html)![1]!;
    expect(title.match(/FlatMeta/g)?.length, `${path} title "${title}"`).toBe(1); // never "· FlatMeta · FlatMeta"
    expect(meta('twitter:title')).toBeTruthy();
    expect(meta('twitter:description')).toBe(meta('og:description'));
    expect(meta('og:locale')).toBe('en');
    expect(meta('og:updated_time')).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(meta('og:type')).toMatch(/^(place|article)$/);
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => JSON.parse(m[1]!)).flat() as { '@type': string; '@context'?: string }[];
    const types = ld.map((x) => x['@type']);
    expect(types).toContain('BreadcrumbList');
    expect(types.includes('Place') || types.includes('LocalBusiness') || types.includes('Organization')).toBe(true);
    for (const x of ld) expect(x['@context']).toBe('https://schema.org');
  }
  expect(descriptions.size).toBe(pages.length); // unique
});
