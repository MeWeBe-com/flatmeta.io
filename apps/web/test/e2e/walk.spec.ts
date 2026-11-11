import { expect, test } from '@playwright/test';

/** G9 on phones: the on-screen joystick walks the avatar smoothly. */
test('the joystick walks my avatar on a phone', async ({ page }, info) => {
  test.skip(!info.project.use.isMobile, 'the joystick is shown on touch devices');
  await page.addInitScript(() => {
    localStorage.setItem('fm-tour-done', '1');
    localStorage.setItem('fm-geo', 'declined');
  });
  await page.goto('/?at=41.3874,2.1686,15');
  const me = page.locator('.fm-avatar-me');
  await expect(me).toHaveAttribute('data-lat', /./, { timeout: 30_000 });
  const dialog = page.getByRole('dialog', { name: 'Start where you are?' });
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: 'Not now' }).click();
  const stick = page.getByRole('application', { name: 'Walk joystick' });
  await expect(stick).toBeVisible();
  const box = (await stick.boundingBox())!;
  const before = { lat: Number(await me.getAttribute('data-lat')), lng: Number(await me.getAttribute('data-lng')) };
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // Push up (north) for a moment, with a real pointer drag.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 40, { steps: 4 });
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect.poll(async () => Number(await me.getAttribute('data-lat'))).toBeGreaterThan(before.lat);
  // Released: it stops.
  const stopped = Number(await me.getAttribute('data-lat'));
  await page.waitForTimeout(500);
  expect(Math.abs(Number(await me.getAttribute('data-lat')) - stopped)).toBeLessThan(1e-4);
  await expect(page.getByRole('button', { name: 'Emotes', exact: true })).toBeVisible();
});
