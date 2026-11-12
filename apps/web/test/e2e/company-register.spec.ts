import { expect, test } from '@playwright/test';

/** H2: the admin company land register: table, search, outreach edit and CSV export; admins only. */
test.skip(({ isMobile }) => !!isMobile, 'desktop run');

test('company land register for admins, with CSV export', async ({ page }) => {
  const { devCode } = (await (await page.request.post('/api/v1/auth/request-code', { data: { email: 'admin@flatmeta.io' } })).json()) as { devCode?: string };
  test.skip(!devCode, 'needs on-screen sign-in codes');
  await page.request.post('/api/v1/auth/verify-code', { data: { email: 'admin@flatmeta.io', code: devCode } });
  const me = (await (await page.request.get('/api/v1/me')).json()) as { user: { role: string } | null };
  test.skip(me.user?.role !== 'admin', 'the seeded admin is not admin@flatmeta.io here');
  const data = (await (await page.request.get('/api/v1/admin/company-land')).json()) as { total: number; rows: { company: string }[] };
  test.skip(!data.total, 'no company plots in this database');

  await page.goto('/admin/company-land');
  const table = page.getByRole('table', { name: 'Company land register' });
  await expect(table).toBeVisible();
  const name = data.rows[0]!.company;
  await page.getByLabel('Search company').fill(name);
  await expect(table.getByRole('row').filter({ hasText: name }).first()).toBeVisible();
  await table.getByLabel(`Outreach status for ${name}`).first().selectOption('contacted');
  await expect(page.getByText(`${name}: saved`)).toBeVisible();

  const csv = await page.request.get(`/api/v1/admin/company-land?q=${encodeURIComponent(name)}&format=csv`);
  expect(csv.headers()['content-type']).toContain('text/csv');
  const text = await csv.text();
  expect(text.split('\r\n')[0]).toContain('Company,Country,HQ city,Status,Plot,Map');
  expect(text).toContain(',contacted,');

  // Not for anyone else.
  const guest = await page.context().browser()!.newContext();
  expect((await guest.request.get('/api/v1/admin/company-land')).status()).toBe(401);
  await guest.close();
});
