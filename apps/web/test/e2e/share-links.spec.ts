import { expect, test } from '@playwright/test';

/** G5: flatmeta.io/@handle and /@handle/plot, the share panel, and the "Visit" deep link that spawns you next to a plot. */
test.skip(({ isMobile }) => !!isMobile, 'desktop run (clipboard permissions)');

test('@handle links, share panel and Visit', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
  const req = ctx.request;
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`;
  const email = `share-${tag}@test.dev`;
  const { devCode } = (await (await req.post('/api/v1/auth/request-code', { data: { email } })).json()) as { devCode?: string };
  test.skip(!devCode, 'needs on-screen sign-in codes');
  expect((await req.post('/api/v1/auth/verify-code', { data: { email, code: devCode, displayName: 'Sharer' } })).ok()).toBeTruthy();
  const handle = `sh_${tag}`.slice(0, 20);
  expect((await req.patch('/api/v1/me', { data: { username: handle } })).ok()).toBeTruthy();
  const gx = 76000 + Math.floor(Math.random() * 8000);
  const gy = 90000 + Math.floor(Math.random() * 8000);
  const claim = await req.post('/api/v1/plots/claim', { data: { rect: { minGx: gx, minGy: gy, maxGx: gx + 1, maxGy: gy + 1 }, title: 'Share test plot' } });
  expect(claim.ok(), await claim.text()).toBeTruthy();
  const { plot } = (await claim.json()) as { plot: { id: string; slug: string; center: { lat: number; lng: number } } };

  const page = await ctx.newPage();
  // flatmeta.io/@handle → the owner's main plot; /@handle/slug → that plot; someone else's slug → 404.
  await page.goto(`/@${handle}`);
  await expect(page).toHaveURL(new RegExp(`/p/${plot.slug}$`));
  await page.goto(`/@${handle}/${plot.slug}`);
  await expect(page).toHaveURL(new RegExp(`/p/${plot.slug}$`));
  expect((await req.get(`/@${handle}/not-my-plot-${tag}`)).status()).toBe(404);

  // Visitor counter (G6): the owner's own visits don't count.
  await expect(page.getByLabel('Visitors')).toContainText('0 visitors today · 0 this week');
  // A guest's visit is counted once, however often they reload.
  const guest = await browser.newContext();
  const gp = await guest.newPage();
  await gp.goto(`/p/${plot.slug}`);
  await expect(gp.getByLabel('Visitors')).toContainText('1 visitor today · 1 this week');
  await gp.reload();
  await expect(gp.getByLabel('Visitors')).toContainText('1 visitor today');
  await guest.close();
  await page.reload();
  await expect(page.getByLabel('Visitors')).toContainText('1 visitor today · 1 this week');

  // Share panel: the friendly link, copy, and the networks.
  const link = page.getByLabel('Link to share');
  await expect(link).toHaveValue(new RegExp(`/@${handle}/${plot.slug}$`));
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Link copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/@${handle}/${plot.slug}$`));
  const wa = await page.getByRole('link', { name: 'WhatsApp' }).getAttribute('href');
  expect(wa).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(decodeURIComponent(wa!)).toContain(`/@${handle}/${plot.slug}`);
  for (const name of ['X', 'Facebook', 'LinkedIn']) await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('rel', /noopener/);

  // Visit: the map flies to the plot and my avatar starts right next to it.
  await page.getByRole('link', { name: 'Visit on the map' }).click();
  await expect(page).toHaveURL(new RegExp(`visit=${plot.slug}`));
  const me = page.locator('.fm-avatar-me');
  await expect(me).toHaveAttribute('data-lat', /./, { timeout: 30_000 });
  const lat = Number(await me.getAttribute('data-lat'));
  const lng = Number(await me.getAttribute('data-lng'));
  expect(Math.abs(lat - plot.center.lat)).toBeLessThan(0.01);
  expect(Math.abs(lng - plot.center.lng)).toBeLessThan(0.01);
  expect(lat).toBeLessThan(plot.center.lat); // just south of it, not on top of it
  await ctx.close();
});
