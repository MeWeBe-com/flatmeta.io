import { expect, test } from '@playwright/test';

/** GL7: buyer-intent and comparison pages render, carry FAQPage + BreadcrumbList JSON-LD, and are in the sitemap. */
const ld = async (page: import('@playwright/test').Page) =>
  (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t) as Record<string, unknown>);

test('for/ and compare/ pages: one h1, canonical, FAQ and breadcrumbs JSON-LD', async ({ page }) => {
  for (const path of ['/for/local-businesses', '/for/brands', '/for/creators', '/compare/google-business-profile', '/compare/linktree', '/compare/earth2']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${path}$`));
    const types = (await ld(page)).map((x) => x['@type']);
    expect(types, path).toEqual(expect.arrayContaining(['FAQPage', 'BreadcrumbList', 'Organization']));
    const title = await page.title();
    expect(title.length, title).toBeLessThanOrEqual(60);
    expect((title.match(/FlatMeta/g) ?? []).length, title).toBe(1);
  }
  await page.goto('/compare/linktree');
  await expect(page.getByTestId('compare-table').locator('tbody tr')).toHaveCount(5);
  await expect(page.getByText(/not affiliated with it/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Claim free land' })).toBeVisible();
  // An unknown slug is a real 404.
  expect((await page.goto('/compare/nope'))?.status()).toBe(404);
});

test('pricing has SoftwareApplication with real offers; sitemap index has lastmod; new pages listed', async ({ page, request }) => {
  await page.goto('/pricing');
  const app = (await ld(page)).find((x) => x['@type'] === 'SoftwareApplication') as { offers?: { price: string }[] } | undefined;
  expect(app?.offers?.length).toBeGreaterThan(0);
  const index = await (await request.get('/sitemap.xml')).text();
  expect(index).toMatch(/<sitemap><loc>[^<]+sitemap-pages\.xml<\/loc><lastmod>\d{4}-\d\d-\d\dT/);
  const pages = await (await request.get('/sitemap-pages.xml')).text();
  for (const p of ['/for/local-businesses', '/compare/earth2']) expect(pages).toContain(p);
  const llms = await (await request.get('/llms.txt')).text();
  expect(llms).toContain('## Comparisons');
});

test('GL3z: email addresses in the HTML sit inside email_off markers (Cloudflare obfuscation breaks hydration)', async ({ request }) => {
  for (const path of ['/pricing', '/business', '/for/local-businesses', '/legal/privacy']) {
    const html = await (await request.get(path)).text();
    // Text outside <script> and outside the markers must not hold an address.
    const outside = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--email_off-->[\s\S]*?<!--\/email_off-->/g, '');
    expect(outside.match(/[A-Z0-9._%+-]+@[A-Z0-9-]+\.[A-Z.]{2,}/gi) ?? [], path).toEqual([]);
    expect(html, path).toContain('<!--email_off-->');
  }
});
