import { expect, test } from '@playwright/test';

/** G11: invite link → friend signs up and claims → both get bonus squares; the share prompt after the claim. */
test.skip(({ isMobile }) => !!isMobile, 'desktop run');

const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
function spot() {
  const gx = 76000 + Math.floor(Math.random() * 8000);
  const gy = 90000 + Math.floor(Math.random() * 8000);
  return `${gx},${gy},${gx},${gy}`;
}

test('invite link, share prompt after the free claim, and bonus squares for both', async ({ browser }) => {
  // The referrer and their invite link.
  const ref = await browser.newContext();
  const email = `inviter-${stamp()}@test.dev`;
  const { devCode } = (await (await ref.request.post('/api/v1/auth/request-code', { data: { email } })).json()) as { devCode?: string };
  test.skip(!devCode, 'needs on-screen sign-in codes');
  await ref.request.post('/api/v1/auth/verify-code', { data: { email, code: devCode } });
  const { code, link } = (await (await ref.request.get('/api/v1/me/referral')).json()) as { code: string; link: string };
  expect(link).toContain(`?ref=${code}`);

  // A friend opens it, then claims land, signing up on the way.
  const friend = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await friend.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
  const page = await friend.newPage();
  await page.goto(`/?ref=${code}`);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('fm-ref'))).toContain(code);
  await page.goto(`/?claim=${spot()}&title=${encodeURIComponent('Friend plot')}`);
  const claim = page.getByRole('button', { name: /claim .*(free|homestead)/i });
  await expect(claim).toBeEnabled({ timeout: 30_000 });
  await claim.click();
  await page.locator('#si-email').fill(`friend-${stamp()}@test.dev`);
  await page.getByRole('button', { name: /send|continue|email me/i }).first().click();
  await page.getByRole('button', { name: /dev|code/i }).filter({ hasText: /\d{6}/ }).click();

  // After the claim: the editor greets them with the share prompt.
  const share = page.getByRole('region', { name: 'Share your new land' });
  await expect(share).toBeVisible({ timeout: 30_000 });
  await expect(share.getByRole('button', { name: /copy/i }).first()).toBeVisible();

  // Both got their bonus squares.
  await expect.poll(async () => ((await (await ref.request.get('/api/v1/me/referral')).json()) as { bonusCells: number; claimed: number }).bonusCells, { timeout: 15_000 }).toBe(10);
  const mine = (await (await page.request.get('/api/v1/me/referral')).json()) as { bonusCells: number };
  expect(mine.bonusCells).toBe(10);

  // The dashboard shows the friend's own invite card; Settings has the weekly email switch.
  await page.goto('/dashboard');
  await expect(page.getByRole('region', { name: 'Invite friends' })).toBeVisible();
  await page.goto('/dashboard/settings');
  const weekly = page.getByRole('checkbox', { name: /Weekly summary/ });
  await expect(weekly).toBeChecked();
  await weekly.click();
  await expect(weekly).not.toBeChecked();
  await ref.close();
  await friend.close();
});
