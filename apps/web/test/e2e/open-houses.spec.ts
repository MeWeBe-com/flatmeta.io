import { expect, test, type Browser } from '@playwright/test';

/** G10: an owner schedules open houses; a visitor asks for a reminder; a live one shows on the map with people here now. */
test.skip(({ isMobile }) => !!isMobile, 'desktop run (the map card is desktop-only)');

async function player(browser: Browser, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
  const email = `oh-${name}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}@test.dev`;
  const { devCode } = (await (await ctx.request.post('/api/v1/auth/request-code', { data: { email } })).json()) as { devCode?: string };
  test.skip(!devCode, 'needs on-screen sign-in codes');
  expect((await ctx.request.post('/api/v1/auth/verify-code', { data: { email, code: devCode, displayName: name } })).ok()).toBeTruthy();
  return ctx;
}

test('open houses: schedule, Notify me, and Happening now on the map', async ({ browser }) => {
  const owner = await player(browser, 'Olive');
  const gx = 84000 + Math.floor(Math.random() * 8000);
  const gy = 90000 + Math.floor(Math.random() * 8000);
  const claim = await owner.request.post('/api/v1/plots/claim', { data: { rect: { minGx: gx, minGy: gy, maxGx: gx + 1, maxGy: gy + 1 }, title: 'Open house plot' } });
  expect(claim.ok(), await claim.text()).toBeTruthy();
  const { plot } = (await claim.json()) as { plot: { id: string; slug: string } };
  expect((await owner.request.post(`/api/v1/plots/${plot.id}/publish`)).ok()).toBeTruthy();

  // The owner schedules one from the editor.
  const op = await owner.newPage();
  await op.goto(`/dashboard/plots/${plot.id}`);
  const form = op.getByRole('form', { name: 'Schedule an open house' });
  await form.getByLabel('Open house title').fill('Tea on the terrace');
  await form.getByRole('button', { name: 'Schedule' }).click();
  await expect(op.getByText('Tea on the terrace')).toBeVisible();
  // And one happening now (through the API, so it starts at once).
  expect((await owner.request.post(`/api/v1/plots/${plot.id}/open-houses`, { data: { title: 'Live tour', startsAt: new Date(Date.now() - 60_000).toISOString(), minutes: 30 } })).ok()).toBeTruthy();

  // A visitor asks to be notified.
  const visitor = await player(browser, 'Vic');
  const vp = await visitor.newPage();
  await vp.goto(`/p/${plot.slug}`);
  const box = vp.getByRole('region', { name: 'Open houses' });
  await expect(box.getByLabel('People here now')).toBeVisible();
  await expect(box.getByText('Live now')).toBeVisible();
  const row = box.getByRole('listitem').filter({ hasText: 'Tea on the terrace' });
  await row.getByRole('button', { name: 'Notify me' }).click();
  await expect(row.getByRole('button', { name: 'Notifying' })).toBeVisible();
  await expect(row).toContainText('1 wants a reminder');

  // The live one is listed on the map; opening it shows the plot.
  await vp.goto('/');
  const now = vp.getByRole('region', { name: 'Happening now' });
  await expect(now).toBeVisible({ timeout: 30_000 });
  await now.getByRole('button', { name: /Live tour/ }).first().click();
  await expect(vp.getByRole('complementary', { name: 'Plot details' })).toBeVisible({ timeout: 15_000 });
  await owner.close();
  await visitor.close();
});
