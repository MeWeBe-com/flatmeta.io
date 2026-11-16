import { expect, test } from '@playwright/test';

/**
 * GL3c: /pricing and /business carry the trust block (real counts, how it works, FAQ with FAQPage JSON-LD, payments
 * and support). GL3d: a first visit gets one thing at a time: the location prompt waits until the tour is done.
 */
test('pricing and business: real counts, how it works, FAQ (with FAQPage JSON-LD), payments and support', async ({ page, request }) => {
  const stats = (await (await request.get('/api/v1/world/stats')).json()) as { showcase: number; countries: number };
  for (const path of ['/pricing', '/business']) {
    await page.goto(path);
    const block = page.getByTestId('trust-stats');
    await expect(block).toBeVisible();
    // Numbers come from the API, never invented.
    if (stats.showcase > 0) await expect(block).toContainText(stats.showcase.toLocaleString('en'));
    if (stats.countries > 0) await expect(block).toContainText(String(stats.countries));
    await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
    const faq = page.getByTestId('faq');
    await expect(faq.locator('details')).toHaveCount(6);
    await faq.getByText('Can I cancel?').click();
    await expect(faq.getByText(/any time from Dashboard → Billing/)).toBeVisible();
    await expect(page.getByTestId('payment-trust')).toContainText(/Cancel any time/);
    await expect(page.getByTestId('payment-trust').getByRole('link', { name: /@/ })).toHaveAttribute('href', /^mailto:/);
    const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t));
    const faqLd = ld.find((x) => x['@type'] === 'FAQPage');
    expect(faqLd?.mainEntity).toHaveLength(6);
  }
  // Business shows its price on the page, with the yearly saving.
  await page.goto('/business');
  await expect(page.getByRole('heading', { name: 'FlatMeta Business' })).toBeVisible();
  await expect(page.getByText(/\/month, or \$[\d,]+\/year/)).toBeVisible();
});

test('first visit: the location prompt waits until the tour is done', async ({ page }) => {
  await page.goto('/');
  const tour = page.getByRole('dialog', { name: 'Guided tour' });
  await expect(tour).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('dialog', { name: 'Start where you are?' })).toHaveCount(0);
  await tour.getByRole('button', { name: /skip tour/i }).click();
  await expect(tour).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Start where you are?' })).toBeVisible({ timeout: 15_000 });
});
