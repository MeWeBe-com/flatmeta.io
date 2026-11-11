import { expect, test } from '@playwright/test';

/** G13: a paid feature opens the upgrade dialog; one click to checkout; back on the same page with Plus. Admin metrics. */
test.skip(({ isMobile }) => !!isMobile, 'desktop run');

test('paywall → Plus checkout → back on the same page, upgraded', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
  const email = `upsell-${Date.now().toString(36)}@test.dev`;
  const { devCode } = (await (await page.request.post('/api/v1/auth/request-code', { data: { email } })).json()) as { devCode?: string };
  test.skip(!devCode, 'needs on-screen sign-in codes');
  await page.request.post('/api/v1/auth/verify-code', { data: { email, code: devCode } });
  const gx = 76000 + Math.floor(Math.random() * 8000);
  const gy = 90000 + Math.floor(Math.random() * 8000);
  const { plot } = (await (await page.request.post('/api/v1/plots/claim', { data: { rect: { minGx: gx, minGy: gy, maxGx: gx, maxGy: gy } } })).json()) as { plot: { id: string } };

  await page.goto(`/dashboard/plots/${plot.id}?tab=content`);
  await page.getByText('Custom HTML').first().click();
  await page.getByLabel('Custom HTML', { exact: true }).fill('<h1>Hello</h1>');
  await page.getByRole('button', { name: /^save/i }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Unlock this with Plus' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Custom HTML is part of FlatMeta Plus');
  if (await dialog.getByText(/coming soon/i).isVisible()) return; // a build with payments off: nothing to buy yet
  await expect(dialog.getByRole('radio', { name: /\$48 a year/ })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('button', { name: 'Upgrade to Plus' }).click();
  // Test-mode checkout page, then back to the editor.
  await page.getByRole('button', { name: /pay \(test\)|subscribe|confirm/i }).first().click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/plots/${plot.id}\\?tab=content&upgraded=plus`), { timeout: 20_000 });
  await expect(page.getByText('Welcome to Plus!')).toBeVisible();
  await expect.poll(async () => ((await (await page.request.get('/api/v1/me')).json()) as { user: { plan: string } }).user.plan).toBe('plus');
});

test('admin metrics page shows the daily numbers', async ({ page }) => {
  const { devCode } = (await (await page.request.post('/api/v1/auth/request-code', { data: { email: 'admin@flatmeta.io' } })).json()) as { devCode?: string };
  test.skip(!devCode, 'needs on-screen sign-in codes');
  await page.request.post('/api/v1/auth/verify-code', { data: { email: 'admin@flatmeta.io', code: devCode } });
  const me = (await (await page.request.get('/api/v1/me')).json()) as { user: { role: string } | null };
  test.skip(me.user?.role !== 'admin', 'the seeded admin is not admin@flatmeta.io here');
  await page.goto('/admin/metrics');
  await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible();
  for (const t of ['Signups', 'Land claims', 'Paid conversions', 'Revenue']) await expect(page.getByRole('img', { name: new RegExp(`^${t} per day`) })).toBeVisible();
  await page.getByRole('button', { name: 'Table' }).click();
  await expect(page.getByRole('table')).toContainText(new Date().toISOString().slice(0, 10));
});
