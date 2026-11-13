import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
});

const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** A random free spot in the open Atlantic (tier O) so runs never collide. */
function spot(cells = 1) {
  const gx = 76000 + Math.floor(Math.random() * 8000);
  const gy = 90000 + Math.floor(Math.random() * 8000);
  return `${gx},${gy},${gx + cells - 1},${gy + cells - 1}`;
}

/** Signs in through the API (dev mode returns the code); the session cookie lands in the browser context. */
async function apiSignIn(page: Page, email: string) {
  const req = await page.request.post('/api/v1/auth/request-code', { data: { email } });
  const { devCode } = (await req.json()) as { devCode?: string };
  test.skip(!devCode, 'needs the dev-mode sign-in code (no SMTP)');
  const res = await page.request.post('/api/v1/auth/verify-code', { data: { email, code: devCode, displayName: 'E2E Tester' } });
  expect(res.ok()).toBeTruthy();
}

test('guest claims a free Homestead (signing in on the way), edits it and publishes', async ({ page }) => {
  const email = `e2e-${stamp()}@test.dev`;
  await page.goto(`/?claim=${spot(1)}&title=${encodeURIComponent('E2E Homestead')}`);
  const claim = page.getByRole('button', { name: /claim .*(free|homestead)/i });
  await expect(claim).toBeEnabled({ timeout: 30_000 });
  await claim.click();

  // The sign-in dialog appears for guests: email, then the dev-mode code shortcut.
  await page.locator('#si-email').fill(email);
  await page.getByRole('button', { name: /send|continue|email me/i }).first().click();
  await page.getByRole('button', { name: /dev|code/i }).filter({ hasText: /\d{6}/ }).click();

  // The claim goes through right after sign-in and the plot exists.
  await expect.poll(async () => ((await (await page.request.get('/api/v1/me/plots')).json()) as { plots?: unknown[] }).plots?.length ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
  const { plots } = (await (await page.request.get('/api/v1/me/plots')).json()) as { plots: { id: string; slug: string }[] };
  const plot = plots[0]!;

  // Edit the title in the dashboard editor, then publish.
  await page.goto(`/dashboard/plots/${plot.id}?tab=content`);
  const title = page.locator('label:has-text("Title") + input');
  await title.fill('E2E Lookout');
  await page.getByRole('button', { name: /^save/i }).first().click();
  await expect.poll(async () => ((await (await page.request.get(`/api/v1/plots/${plot.id}`)).json()) as { plot: { title: string } }).plot.title).toBe('E2E Lookout');
  const pub = await page.request.post(`/api/v1/plots/${plot.id}/publish`);
  expect(pub.ok()).toBeTruthy();
  await page.goto(`/p/${plot.slug}`);
  await expect(page.locator('h1')).toContainText('E2E Lookout');
});

test('paid land: claim, mock checkout, plot becomes active', async ({ page }) => {
  await apiSignIn(page, `e2e-pay-${stamp()}@test.dev`);
  const res = await page.request.post('/api/v1/plots/claim', { data: { rect: ((s) => ({ minGx: s[0]!, minGy: s[1]!, maxGx: s[2]!, maxGy: s[3]! }))(spot(3).split(',').map(Number)), title: 'E2E Paid Land' } });
  const body = (await res.json()) as { checkoutUrl?: string; plotId?: string };
  expect(body.checkoutUrl, 'nine cells is more than a Homestead, so checkout is required').toContain('/checkout/mock');
  await page.goto(body.checkoutUrl!);
  await page.getByRole('button', { name: /pay \(test\)/i }).click();
  // Polls until the (mock) payment has settled; an answer without the plot (still settling, busy server) is "not yet".
  await expect
    .poll(async () => {
      const r = await page.request.get(`/api/v1/plots/${body.plotId}`);
      return r.ok() ? ((await r.json()) as { plot?: { status: string } }).plot?.status : `http ${r.status()}`;
    }, { timeout: 30_000 })
    .toBe('active');
});

test('showcase plots are labelled as unclaimed samples and offer to be claimed or removed', async ({ page, request }) => {
  const res = await request.get('/api/v1/plots?kind=showcase&limit=1');
  const { plots } = (await res.json()) as { plots: { slug: string; showcase: { brand: string } }[] };
  test.skip(!plots.length, 'no showcase plots seeded');
  await page.goto(`/p/${plots[0]!.slug}`);
  await expect(page.getByText('Showcase · Unclaimed').first()).toBeVisible();
  await expect(page.getByText(/not created, endorsed or affiliated/i)).toBeVisible();
  const claim = page.getByRole('link', { name: 'Claim it', exact: true });
  await expect(claim).toBeVisible();
  await expect(page.getByRole('link', { name: /request removal/i })).toBeVisible();
  await claim.click();
  await expect(page).toHaveURL(/\/claim\//);
  await expect(page.locator('h1')).toBeVisible();
});

test('the marketplace, clans and explore pages render', async ({ page }) => {
  for (const path of ['/marketplace', '/clans', '/explore', '/leaderboards']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
  }
});
