import { expect, test, type Page } from '@playwright/test';
import { MATRIX, openOn } from './devices';

/**
 * M8: claiming on small phones (320 and 375 wide, Chromium and WebKit): the selection is fitted into the map the
 * header and the claim sheet leave free (never under the sheet), a new selection near the sheet moves up into view,
 * and when the keyboard opens the sheet and its name field stay above it (visualViewport).
 */
const PHONES = MATRIX.filter((d) => ['se1-320x568', 'se3-375x667'].includes(d.id));

/** A random free 3×3 spot in the open Atlantic (tier O), so runs never collide. */
function spot() {
  const gx = 76000 + Math.floor(Math.random() * 8000);
  const gy = 90000 + Math.floor(Math.random() * 8000);
  return { gx, gy, q: `${gx},${gy},${gx + 2},${gy + 2}` };
}

type Box = { top: number; bottom: number; left: number; right: number };
/** The selection rectangle on screen (from the map's own selection layer), once the camera has stopped. */
async function selectionBox(page: Page): Promise<Box | null> {
  return page.evaluate(async () => {
    type M = { isMoving(): boolean; project(c: [number, number]): { x: number; y: number }; getSource(id: string): { getData(): Promise<{ features: { geometry: { coordinates: [number, number][][] } }[] }> } | undefined };
    const m = (window as unknown as { __fmMap?: M }).__fmMap;
    if (!m || m.isMoving()) return null;
    const data = await m.getSource('selection')?.getData();
    const ring = data?.features[0]?.geometry.coordinates[0];
    if (!ring) return null;
    const pts = ring.map((c) => m.project(c));
    return { top: Math.min(...pts.map((p) => p.y)), bottom: Math.max(...pts.map((p) => p.y)), left: Math.min(...pts.map((p) => p.x)), right: Math.max(...pts.map((p) => p.x)) };
  });
}

test.describe('claim flow on phones', () => {
  test.describe.configure({ mode: 'parallel' });
  for (const d of PHONES) {
    test(`${d.id}: selection above the sheet, sheet above the keyboard`, async ({ browser, baseURL }) => {
      test.setTimeout(150_000);
      const ctx = await openOn(browser, d, baseURL!);
      await ctx.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
      const page = await ctx.newPage();
      const W = d.viewport.width;
      await page.goto(`/?claim=${spot().q}`);
      const sheet = page.locator('[data-claim-panel]');
      await expect(sheet).toBeVisible({ timeout: 30_000 });
      const header = async () => (await page.locator('[data-map-header]').boundingBox())!.y + (await page.locator('[data-map-header]').boundingBox())!.height;
      const fits = async () => {
        const s = await selectionBox(page);
        const sh = await sheet.boundingBox();
        if (!s || !sh) return 'waiting';
        const top = await header();
        return s.top >= top - 1 && s.bottom <= sh.y + 1 && s.left >= -1 && s.right <= W + 1 ? 'fits' : `selection ${JSON.stringify(s)}, sheet top ${sh.y}, header ${top}`;
      };
      // 1. The deep link's selection is fitted above the sheet.
      await expect.poll(fits, { timeout: 30_000 }).toBe('fits');

      // 2. A new selection tapped just above the sheet is moved up into the free part of the map.
      const sh = (await sheet.boundingBox())!;
      await page.touchscreen.tap(W / 2, sh.y - 6);
      await expect.poll(async () => (await selectionBox(page))?.bottom ?? 0, { timeout: 10_000 }).toBeLessThan(sh.y - 6 + 40);
      await expect.poll(fits, { timeout: 15_000 }).toBe('fits');

      // 3. The keyboard opens (the visual viewport shrinks to 300 px): the sheet and its name field stay above it.
      const name = page.getByRole('textbox', { name: 'Plot name' });
      await expect(name).toBeVisible({ timeout: 20_000 });
      await page.evaluate(() => {
        const vv = window.visualViewport!;
        Object.defineProperty(vv, 'height', { configurable: true, get: () => 300 });
        vv.dispatchEvent(new Event('resize'));
      });
      await name.focus();
      await expect.poll(async () => Math.round((await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height), { timeout: 5000 }).toBeLessThanOrEqual(300);
      await expect.poll(async () => { const b = (await name.boundingBox())!; return b.y >= 0 && b.y + b.height <= 300; }, { timeout: 5000 }).toBe(true);
      // Closing the keyboard puts the sheet back at the bottom.
      await page.evaluate(() => {
        delete (window.visualViewport as unknown as Record<string, unknown>).height;
        window.visualViewport!.dispatchEvent(new Event('resize'));
      });
      await expect.poll(async () => Math.round((await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height), { timeout: 5000 }).toBeGreaterThan(d.viewport.height - 30);
      await ctx.close();
    });
  }
});
