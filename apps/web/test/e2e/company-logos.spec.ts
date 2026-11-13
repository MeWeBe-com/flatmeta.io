import { expect, test } from '@playwright/test';

/** H1: a company plot's logo is a small badge with its note; the generic artwork stays the main visual. */
test.skip(({ isMobile }) => !!isMobile, 'desktop run');

test('company logo badge, note and label on the plot page and /brands', async ({ page, request }) => {
  const dir = (await (await request.get('/api/v1/brands')).json()) as { brands: { slug: string; title: string; logoUrl: string | null; logoFill: number | null }[] };
  // M7: a mark too thin for the badge (fill under 0.3) shows initials on /brands; pick one that shows its logo.
  const b = dir.brands.find((x) => x.logoUrl && (x.logoFill == null || x.logoFill >= 0.3));
  test.skip(!b, 'no company plot with a logo in this database (run npm run company-land:logos -- --apply)');
  await page.goto(`/p/${b!.slug}`);
  const logo = page.getByTestId('company-logo');
  await expect(logo).toBeVisible();
  const box = (await logo.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(64); // badge size, never the main artwork
  await expect(page.getByTestId('reserved-label')).toContainText('not affiliated with FlatMeta');
  await expect(page.getByTestId('logo-note')).toContainText('Logo shown to identify the company for claiming; trademarks belong to their owners.');
  await page.goto('/brands');
  await expect(page.getByRole('img', { name: `${b!.title} logo` }).first()).toBeVisible();
});
