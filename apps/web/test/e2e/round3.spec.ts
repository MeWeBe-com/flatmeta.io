import { expect, test } from '@playwright/test';

/** Round 3: the 30-second demo, the first action on the home page, and the founding-customer offer. */
test('R3c: /demo shows a clearly labelled sample business page and what AI reads, with a claim CTA', async ({ page }) => {
  const res = await page.goto('/demo');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('This is what a business gets on FlatMeta');
  const sample = page.getByTestId('demo-sample');
  await expect(sample.getByText('Sample page')).toBeVisible();
  await expect(sample.getByRole('heading', { level: 2, name: /Corner Café \(sample\)/ })).toBeVisible();
  await expect(page.getByTestId('demo-jsonld')).toContainText('"@type": "CafeOrCoffeeShop"');
  // The fictional business is never real structured data on the page.
  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join('\n');
  expect(ld).not.toContain('Corner Café');
  await expect(page.getByRole('link', { name: 'Claim your free plot' })).toHaveAttribute('href', '/?claim');
});

test('R3c: the home page leads with one first action, then the demo', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const claim = html.indexOf('Claim your free plot');
  const demo = html.indexOf('See a 30-second demo');
  expect(claim).toBeGreaterThan(0);
  expect(demo).toBeGreaterThan(claim);
});
