import { expect, test } from '@playwright/test';

/** M11: the Free plan says "Free" once (its name); the price reads "$0 forever". */
test('the Free plan card names the plan once and shows $0 forever', async ({ page }) => {
  await page.goto('/pricing');
  const card = page.locator('div.surface').filter({ has: page.getByRole('heading', { name: 'Free', exact: true }) });
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('plan-price')).toHaveText('$0');
  await expect(card).toContainText('forever');
  const text = (await card.innerText()).replace(/\s+/g, ' ');
  expect(text.match(/\bfree\b/gi) ?? [], text).toHaveLength(1);
  // The paid plans keep their monthly price.
  const plus = page.locator('div.surface').filter({ has: page.getByRole('heading', { name: 'Plus', exact: true }) });
  await expect(plus).toContainText('/mo');
});
