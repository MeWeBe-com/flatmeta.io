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

test('first visit: no tour on top, and the location prompt waits until the first claim attempt', async ({ page }) => {
  // C2 (conversion walk, 24 Nov): the tour used to open by itself and swallow the first click on "Claim free land".
  await page.goto('/');
  await page.waitForTimeout(3000); // the tour used to open after 1.6 s
  await expect(page.getByRole('dialog', { name: 'Guided tour' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Start where you are?' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Claim land', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Claim land' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Start where you are?' })).toBeVisible({ timeout: 15_000 });
});

test('a bare /?claim link opens the claim panel', async ({ page }) => {
  await page.goto('/?claim');
  await expect(page.getByRole('dialog', { name: 'Claim land' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('dialog', { name: 'Guided tour' })).toHaveCount(0);
});

test('a plot drawn before signing in reopens after a reload', async ({ page }) => {
  // C1: the claim panel saves the guest's plot before the sign-in box; the map reopens it on the next load.
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('fm-claim-draft', JSON.stringify({ rect: { minGx: 80000, minGy: 94000, maxGx: 80001, maxGy: 94001 }, title: 'Saved draft', at: Date.now() })));
  await page.reload();
  const panel = page.getByRole('dialog', { name: 'Claim land' });
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByRole('textbox', { name: 'Plot name' })).toHaveValue('Saved draft', { timeout: 30_000 });
  await panel.getByRole('button', { name: 'Cancel' }).click();
  expect(await page.evaluate(() => localStorage.getItem('fm-claim-draft'))).toBeNull();
});

test('/explore: a claim button, and no plot card shows an empty "0" counter', async ({ page }) => {
  // 0008 + 26 Nov: every new card read "0 0" (likes, visits); a counter shows from 1.
  await page.goto('/explore');
  await expect(page.getByTestId('explore-cta').getByRole('link', { name: 'Claim your free plot' })).toHaveAttribute('href', '/?claim');
  await expect(page.locator('[aria-label$=" likes"], [aria-label$=" visits"]').filter({ hasText: /^\s*0\s*$/ })).toHaveCount(0);
  await expect(page.locator('[aria-label="0 likes"], [aria-label="0 visits"]')).toHaveCount(0);
});
