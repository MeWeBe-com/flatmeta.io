import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Only the avatar icon opens a player's card. A click on the same row, away from the icon, is a normal map click
 * (walk there). Regression: the marker element used to span the whole map width.
 * Two guests are enough: guests show up on the map too. Runs on desktop and mobile.
 */
const SPOT = { lat: 46.0207, lng: 7.7491 }; // quiet Alpine valley: no plots, so a map click walks
const ZOOM = 15;

async function openAt(page: Page, lat: number, lng: number) {
  await page.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
  await page.goto(`/?at=${lat},${lng},${ZOOM}`);
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 30_000 });
}

const centerOf = async (l: Locator) => {
  const box = (await l.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
};

test('only the avatar icon opens the peer card; the rest of its row is ordinary map', async ({ browser, isMobile, hasTouch }, info) => {
  const viewport = isMobile ? undefined : { width: 1280, height: 860 };
  const device = info.project.use;
  const ctxA = await browser.newContext({ ...device, ...(viewport ? { viewport } : {}) });
  const ctxB = await browser.newContext({ ...device, ...(viewport ? { viewport } : {}) });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  // Desktop and mobile run in parallel: give each its own spot (~11 km apart) so they don't see each other.
  const lat = SPOT.lat + (isMobile ? 0.1 : 0);
  const errors: string[] = [];
  a.on('pageerror', (e) => errors.push(e.message));

  // Ben stands ~120 m east of the spot; Ana looks at the spot, so Ben's avatar is right of hers on screen.
  await openAt(b, lat, SPOT.lng + 0.0016);
  await openAt(a, lat, SPOT.lng);
  const peer = a.locator('.fm-avatar:not(.fm-avatar-me)');
  await expect(peer).toHaveCount(1, { timeout: 20_000 });
  const face = peer.locator('.fm-face');
  await expect(face).toBeVisible();

  // The marker is shrink-wrapped around the icon, not a full-width row.
  const marker = (await peer.boundingBox())!;
  expect(marker.width).toBeLessThan(160);

  const me = a.locator('.fm-avatar-me .fm-face');
  const card = a.getByRole('dialog', { name: /^Guest \d{4}$/ });
  const click = async (x: number, y: number) => (hasTouch ? a.touchscreen.tap(x, y) : a.mouse.click(x, y));

  for (const dx of [-150, 150]) {
    const f = await centerOf(face);
    const before = await centerOf(me);
    await click(f.x + dx, f.y);
    // No card …
    await a.waitForTimeout(400);
    await expect(card).toHaveCount(0);
    // … and the click did what a map click does: my avatar walks toward it.
    await expect.poll(async () => {
      const now = await centerOf(me);
      return Math.hypot(now.x - before.x, now.y - before.y);
    }, { timeout: 5_000 }).toBeGreaterThan(5);
  }

  // A tap on the icon itself opens the card (the face, plus a few pixels of touch padding).
  const f = await centerOf(face);
  await click(f.x, f.y);
  await expect(card).toBeVisible();
  await a.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(card).toHaveCount(0);
  // Just outside the icon but inside the 44 px target still counts.
  const g = await centerOf(face);
  await click(g.x, g.box.y + g.box.height + 3);
  await expect(card).toBeVisible();

  expect(errors).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});
