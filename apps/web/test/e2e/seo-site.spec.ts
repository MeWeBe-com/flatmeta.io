import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * S4: titles and site-wide markup on every public page type: one "FlatMeta" per title (no doubled "· FlatMeta"),
 * titles of 60 characters or less, the Organization JSON-LD everywhere, a BreadcrumbList on every hub page, and
 * /explore paginated with crawlable ?page= links and a canonical per page.
 */
test.skip(({ isMobile }) => !!isMobile, 'same HTML on mobile');

const HUBS = ['/explore', '/brands', '/brands/fr', '/c/fr', '/leaderboards', '/marketplace', '/clans', '/pricing', '/business', '/about', '/about/facts'];

async function page(request: APIRequestContext, path: string) {
  const res = await request.get(path);
  expect(res.status(), path).toBe(200);
  const html = await res.text();
  const title = (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'");
  const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([^<]+)<\/script>/g)].flatMap((m) => [JSON.parse(m[1]!)].flat()) as Record<string, unknown>[];
  const graph = ld.flatMap((x) => (Array.isArray(x['@graph']) ? (x['@graph'] as Record<string, unknown>[]) : [x]));
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? null;
  return { html, title, graph, canonical };
}

test('every public page: one FlatMeta per title, 60 characters at most, Organization JSON-LD', async ({ request }) => {
  const plots = await (await request.get('/sitemap-plots.xml')).text();
  const plot = new URL([...plots.matchAll(/<loc>([^<]+\/p\/[^<]+)<\/loc>/g)][0]![1]!).pathname;
  for (const path of ['/', ...HUBS, plot, '/legal/terms']) {
    const { title, graph } = await page(request, path);
    expect(title.length, `${path}: "${title}"`).toBeLessThanOrEqual(60);
    expect(title.length, path).toBeGreaterThan(10);
    expect((title.match(/FlatMeta/g) ?? []).length, `${path}: "${title}"`).toBeLessThanOrEqual(1);
    const org = graph.find((x) => x['@type'] === 'Organization' && x.name === 'FlatMeta' && String(x['@id'] ?? '').endsWith('/#organization'));
    expect(org, `${path}: Organization JSON-LD`).toBeTruthy();
    expect(org!.url).toMatch(/^https?:\/\//);
    expect(org!.logo).toBeTruthy();
  }
});

test('hub pages have a BreadcrumbList that ends at the page itself', async ({ request }) => {
  for (const path of HUBS) {
    const { graph, canonical } = await page(request, path);
    const crumbs = graph.find((x) => x['@type'] === 'BreadcrumbList') as { itemListElement: { position: number; name: string; item?: string }[] } | undefined;
    expect(crumbs, `${path}: BreadcrumbList`).toBeTruthy();
    const items = crumbs!.itemListElement;
    expect(items.length, path).toBeGreaterThanOrEqual(2);
    expect(items[0]!.name).toBe('FlatMeta');
    expect(items.map((i) => i.position)).toEqual(items.map((_, i) => i + 1));
    expect(items.at(-1)!.item, path).toBe(canonical);
  }
});

test('/explore is paginated with crawlable ?page= links and a canonical per page', async ({ request }) => {
  const one = await page(request, '/explore');
  expect(one.canonical).toMatch(/\/explore$/);
  const next = one.html.match(/<a[^>]+href="(\/explore\?page=2)"[^>]*>/);
  expect(next, 'a plain link to page 2 in the HTML').toBeTruthy();
  const two = await page(request, '/explore?page=2');
  expect(two.canonical).toMatch(/\/explore\?page=2$/);
  expect(two.title).toMatch(/page 2/i);
  expect(two.html).toMatch(/<a[^>]+href="\/explore"[^>]*>/); // back to page 1
  // Page 2 lists other plots than page 1.
  const slugs = (h: string) => new Set([...h.matchAll(/href="\/p\/([a-z0-9-]+)"/g)].map((m) => m[1]));
  const a = slugs(one.html);
  const b = slugs(two.html);
  expect(b.size).toBeGreaterThan(0);
  expect([...b].some((s) => !a.has(s))).toBe(true);
  // Filters and sorting are not separate pages for search engines.
  expect((await page(request, '/explore?tab=new&category=culture')).canonical).toMatch(/\/explore$/);
  // Past the end: a real 404, not an empty page.
  expect((await request.get('/explore?page=999')).status()).toBe(404);
});
