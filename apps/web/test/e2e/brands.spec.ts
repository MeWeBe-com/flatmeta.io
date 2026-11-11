import { expect, test } from '@playwright/test';

/** G12: the companies directory, the reserved label, and claiming by DNS TXT record. */
test.skip(({ isMobile }) => !!isMobile, 'desktop run');

test('brands directory, reserved label and DNS claim', async ({ page, request }) => {
  const dir = (await (await request.get('/api/v1/brands')).json()) as { brands: { slug: string; title: string }[] };
  test.skip(!dir.brands.length, 'no public company plots in this database');
  await page.goto('/brands');
  await expect(page.getByRole('heading', { level: 1, name: 'Companies on FlatMeta' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Countries' })).toBeVisible();
  const first = dir.brands[0]!;
  await page.getByRole('link', { name: new RegExp(first.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/p/${first.slug}$`));
  await expect(page.getByTestId('reserved-label')).toHaveText(`Reserved for ${first.title}, not affiliated with FlatMeta.`);

  // The sitemap lists the directory.
  expect(await (await request.get('/sitemap-pages.xml')).text()).toContain('/brands</loc>');

  // Claim by DNS: signed in, the page shows the exact TXT record, and checking without it explains what's missing.
  const email = `dns-${Date.now().toString(36)}@test.dev`;
  const { devCode } = (await (await page.request.post('/api/v1/auth/request-code', { data: { email } })).json()) as { devCode?: string };
  test.skip(!devCode, 'needs on-screen sign-in codes');
  await page.request.post('/api/v1/auth/verify-code', { data: { email, code: devCode } });
  await page.goto(`/claim/${first.slug}`);
  await page.getByRole('button', { name: 'Verify with a DNS record' }).click();
  const dns = page.getByRole('region', { name: 'DNS verification' });
  await expect(dns).toContainText('TXT');
  await expect(dns).toContainText('_flatmeta.');
  await expect(dns).toContainText('flatmeta-verify=');
  await dns.getByRole('button', { name: 'Check the record' }).click();
  await expect(dns.getByRole('alert')).toContainText(/couldn.t find the TXT record/i);
});
