import { expect, test } from '@playwright/test';

/** G15: the citable facts page, and the home page's WebSite + SearchAction JSON-LD. */
test('facts page and site search JSON-LD', async ({ page, request }) => {
  await page.goto('/about/facts');
  await expect(page.getByRole('heading', { level: 1, name: 'FlatMeta facts' })).toBeVisible();
  await expect(page.getByText('shared world map where people, businesses and brands own land').first()).toBeVisible();
  await expect(page.getByText(/Not a VR world, not an NFT/)).toBeVisible();
  const html = await (await request.get('/')).text();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]!.replace(/\\u003c/g, '<')));
  const site = blocks.find((b) => b['@type'] === 'WebSite');
  expect(site?.potentialAction?.['@type']).toBe('SearchAction');
  expect(site.potentialAction.target.urlTemplate).toMatch(/\/explore\?q=\{search_term_string\}$/);
});
