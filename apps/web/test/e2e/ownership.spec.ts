import { expect, test, type Browser } from '@playwright/test';

/** H3: only owners see edit controls and can open the editor; visitors can't change someone else's land. */
test.skip(({ isMobile }) => !!isMobile, 'desktop run');

async function player(browser: Browser, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
  const email = `own-${name}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}@test.dev`;
  const { devCode } = (await (await ctx.request.post('/api/v1/auth/request-code', { data: { email } })).json()) as { devCode?: string };
  test.skip(!devCode, 'needs on-screen sign-in codes');
  await ctx.request.post('/api/v1/auth/verify-code', { data: { email, code: devCode, displayName: name } });
  return ctx;
}

test('non-owners get no edit controls, no editor and a clear 403; a closed guestbook says so', async ({ browser }) => {
  const owner = await player(browser, 'Owen');
  const gx = 76000 + Math.floor(Math.random() * 8000);
  const gy = 90000 + Math.floor(Math.random() * 8000);
  const { plot } = (await (await owner.request.post('/api/v1/plots/claim', { data: { rect: { minGx: gx, minGy: gy, maxGx: gx, maxGy: gy }, title: 'Owen’s garden' } })).json()) as { plot: { id: string; slug: string } };
  await owner.request.post(`/api/v1/plots/${plot.id}/publish`);
  const op = await owner.newPage();
  await op.goto(`/p/${plot.slug}`);
  await expect(op.getByRole('link', { name: /edit/i }).first()).toBeVisible({ timeout: 15_000 });

  const visitor = await player(browser, 'Vera');
  const vp = await visitor.newPage();
  await vp.goto(`/p/${plot.slug}`);
  await expect(vp.getByRole('heading', { level: 1 })).toContainText('Owen’s garden');
  await vp.waitForTimeout(1500); // the client refreshes canEdit after load
  await expect(vp.getByRole('link', { name: /^edit/i })).toHaveCount(0);
  await vp.goto(`/dashboard/plots/${plot.id}`);
  await expect(vp.getByText(/You can’t edit this plot/)).toBeVisible();
  const res = await visitor.request.patch(`/api/v1/plots/${plot.id}`, { data: { title: 'Vera was here' } });
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { error: { message: string } }).error.message).toBe('Only the owner of this land can change it.');

  // The owner closes the guestbook: visitors see it closed.
  await owner.request.patch(`/api/v1/plots/${plot.id}`, { data: { guestbookOpen: false } });
  await vp.goto(`/p/${plot.slug}`);
  await expect(vp.getByTestId('guestbook-closed')).toBeVisible();
  await owner.close();
  await visitor.close();
});
