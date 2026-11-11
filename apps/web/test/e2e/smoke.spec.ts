import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Skip the first-visit tour so it doesn't cover the map.
  await page.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
});

test('home renders the world map', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /search/i }).first()).toBeVisible();
});

test('plot pages carry structured data and a share card', async ({ page, request }) => {
  const res = await request.get('/api/v1/plots?limit=1&sort=new');
  expect(res.ok()).toBeTruthy();
  const { plots } = await res.json();
  test.skip(!plots.length, 'no published plots to visit');
  await page.goto(`/p/${plots[0].slug}`);
  await expect(page.locator('h1')).toContainText(plots[0].title);
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const graph = [JSON.parse(ld ?? '[]')].flat();
  expect(graph[0]['@context']).toBe('https://schema.org');
  expect(graph.map((n) => n['@type'])).toContain('BreadcrumbList');
  expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toContain('/opengraph-image');
});

test('pricing shows the plans', async ({ page }) => {
  await page.goto('/pricing');
  for (const plan of ['Free', 'Plus', 'Business', 'Brand']) await expect(page.getByRole('heading', { name: plan, exact: true })).toBeVisible();
});

test('robots and sitemap are served', async ({ request }) => {
  expect((await request.get('/robots.txt')).ok()).toBeTruthy();
  const sm = await request.get('/sitemap.xml');
  expect(sm.ok()).toBeTruthy();
  expect(await sm.text()).toMatch(/<urlset|<sitemapindex/); // the app's index (production serves the insights sitemap here)
});
