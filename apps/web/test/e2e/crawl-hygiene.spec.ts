import { expect, test } from '@playwright/test';

/**
 * S6: crawl hygiene. Private routes (sign-in, account, admin, checkout, claim, the auth API) are noindex; unknown
 * pages are a real 404 with a helpful page; one language (lang="en", no hreflang anywhere: a single-language site
 * has nothing to declare, so "consistent" means none); canonicals are absolute, on the site's own host and without
 * query strings (only ?page= on later list pages); and the bare domain sends every path to www with a 301.
 */
test.skip(({ isMobile }) => !!isMobile, 'same responses on mobile');

test('sign-in, account, admin, checkout and claim pages, and the auth API, are noindex', async ({ request }) => {
  for (const path of ['/login', '/dashboard', '/dashboard/plots', '/admin', '/checkout/mock', '/claim/tesla']) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.headers()['x-robots-tag'], path).toMatch(/noindex/);
  }
  const auth = await request.post('/api/v1/auth/logout');
  expect(auth.headers()['x-robots-tag']).toMatch(/noindex/);
  // Public pages are not.
  expect((await request.get('/pricing')).headers()['x-robots-tag'] ?? '').not.toMatch(/noindex/);
});

test('an unknown page is a real 404 with its own title, noindex, and ways back', async ({ request }) => {
  for (const path of ['/no-such-page', '/p/no-such-plot-anywhere', '/brands/zz/extra']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
    const html = await res.text();
    expect(html).toMatch(/<title>Page not found · FlatMeta<\/title>/);
    expect(html).toMatch(/<meta name="robots" content="noindex(, ?follow)?"/);
    for (const href of ['/', '/explore', '/brands', '/insights']) expect(html, href).toContain(`href="${href}"`);
  }
});

test('one language, no hreflang; canonicals absolute, on the site host, without query strings', async ({ request, baseURL }) => {
  const plots = await (await request.get('/sitemap-plots.xml')).text();
  const plot = new URL([...plots.matchAll(/<loc>([^<]+\/p\/[^<]+)<\/loc>/g)][0]![1]!).pathname;
  // The site's canonical origin, as the sitemap index states it (APP_URL; may differ from the test's base URL).
  const index = await (await request.get('/sitemap.xml')).text();
  const site = new URL(index.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? `${baseURL}/sitemap.xml`).origin;
  const cases: [string, string][] = [
    ['/', '/'],
    ['/?at=51.5,-0.12,12&utm_source=x', '/'],
    ['/explore?tab=new&utm_campaign=y', '/explore'],
    ['/explore?page=2', '/explore?page=2'],
    ['/brands?q=bank', '/brands'],
    ['/brands/fr', '/brands/fr'],
    ['/pricing?ref=abc', '/pricing'],
    [`${plot}?utm_medium=z`, plot],
    ['/insights', '/insights'],
  ];
  for (const [path, want] of cases) {
    const html = await (await request.get(path)).text();
    expect(html, path).toMatch(/<html lang="en"/);
    expect(html, path).not.toMatch(/hreflang=/);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    expect(canonical, path).toBe(want === '/' ? site : `${site}${want}`); // the home page's canonical is the bare origin
  }
});

test('the bare domain sends every path to www with a 301, path and query kept', async ({ request }) => {
  for (const path of ['/', '/pricing?ref=abc', '/p/flatmeta-hq', '/sitemap.xml', '/robots.txt', '/insights', '/insights/2026-11-12-local-shops-on-a-world-map.html']) {
    const res = await request.get(path, { headers: { host: 'flatmeta.io' }, maxRedirects: 0 });
    expect(res.status(), path).toBe(301);
    expect(res.headers().location, path).toBe(path === '/' ? 'https://www.flatmeta.io' : `https://www.flatmeta.io${path}`);
  }
  // www itself (and any other host) is served, not redirected.
  expect((await request.get('/pricing', { maxRedirects: 0 })).status()).toBe(200);
});
