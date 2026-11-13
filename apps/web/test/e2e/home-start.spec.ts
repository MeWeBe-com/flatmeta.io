import { expect, test, type Page } from '@playwright/test';

/**
 * M2: phones (and desktops) must not land on an empty screen.
 * - The server sends a real first screen (headline, numbers, links) before any JavaScript runs.
 * - New visitors start at City zoom where we know roughly where they are, at World zoom where we don't, and never at
 *   Land zoom; with no plots in view, the camera goes to the nearest group of plots.
 * - The idle map stops redrawing (the beacon pulse used to redraw it on every frame forever).
 */
type MapLike = { getZoom(): number; getCenter(): { lat: number; lng: number }; on(e: string, f: () => void): void; loaded(): boolean; isMoving(): boolean };
const camera = (page: Page) =>
  page.evaluate(() => {
    const m = (window as unknown as { __fmMap?: MapLike }).__fmMap;
    return m ? { zoom: m.getZoom(), ...m.getCenter(), moving: m.isMoving() } : null;
  });
async function settled(page: Page) {
  await expect.poll(async () => (await camera(page))?.moving === false, { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(2500); // a possible second flight (to the nearest plots) starts after the first one
  await expect.poll(async () => (await camera(page))?.moving === false, { timeout: 30_000 }).toBe(true);
  return (await camera(page))!;
}
const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

test('the home page HTML is a real first screen, readable without JavaScript', async ({ browser, request }, info) => {
  const html = await (await request.get('/')).text();
  expect(html).toContain('data-testid="home-first-paint"');
  expect(html).toContain('The world map you can own a piece of');
  const ctx = await browser.newContext({ ...info.project.use, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'The world map you can own a piece of' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore places' })).toBeVisible();
  await ctx.close();
});

test('a new visitor somewhere empty starts at City zoom, then sees the nearest plots', async ({ browser }, info) => {
  // Rural Balochistan: an approximate (Cloudflare) location with no plots for hundreds of km.
  const at = { lat: 28.6, lng: 65.3 };
  const ctx = await browser.newContext({ ...info.project.use });
  await ctx.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
  await ctx.setExtraHTTPHeaders({ 'cf-iplatitude': String(at.lat), 'cf-iplongitude': String(at.lng), 'cf-ipcity': 'Kalat', 'cf-ipcountry': 'PK' });
  const page = await ctx.newPage();
  const nearestCalls: string[] = [];
  page.on('request', (r) => r.url().includes('/plots/nearest') && nearestCalls.push(r.url()));
  await page.goto('/');
  const cam = await settled(page);
  // One request for the nearest plots, however many parts of the page use them (it was 8+).
  expect(nearestCalls.length).toBeLessThanOrEqual(1);
  expect(cam.zoom, 'never Land zoom for a new visitor').toBeLessThan(13.5);
  expect(cam.zoom, 'City zoom, not the whole world').toBeGreaterThanOrEqual(6.5);
  const { plots } = (await (await ctx.request.get(`/api/v1/plots/nearest?lat=${at.lat}&lng=${at.lng}&limit=6`)).json()) as { plots: { center: { lat: number; lng: number }; distanceKm: number }[] };
  test.skip(!plots.length, 'no plots in this database');
  if (plots[0]!.distanceKm > 60) {
    // The camera left the empty start for the nearest group of plots, and says where it went.
    expect(kmBetween(cam, plots[0]!.center)).toBeLessThan(80);
    // The "Start where you are?" prompt comes first in that spot; once answered, the chip shows.
    const ask = page.getByRole('dialog', { name: 'Start where you are?' });
    if (await ask.isVisible().catch(() => false)) await ask.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByTestId('nearest-land')).toContainText(/Nearest land: .+, [\d,.]+ km/);
  }
  await ctx.close();
});

test('a visitor we can’t locate sees the whole world, not an empty corner', async ({ browser }, info) => {
  const ctx = await browser.newContext({ ...info.project.use });
  await ctx.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
  const page = await ctx.newPage();
  await page.goto('/');
  const cam = await settled(page);
  expect(cam.zoom).toBeLessThan(6.5);
  await ctx.close();
});

test('the idle map stops redrawing', async ({ browser }, info) => {
  const ctx = await browser.newContext({ ...info.project.use, reducedMotion: 'no-preference' });
  await ctx.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
  const page = await ctx.newPage();
  await page.goto('/');
  await settled(page);
  const renders = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const m = (window as unknown as { __fmMap: MapLike }).__fmMap;
        let n = 0;
        m.on('render', () => n++);
        setTimeout(() => resolve(n), 3000);
      }),
  );
  // A few frames for late tiles or labels are fine; a redraw on every frame (~180 in 3 s) is not.
  expect(renders).toBeLessThan(40);
  await ctx.close();
});

test('without WebGL the page says so, keeps its first screen, and never downloads the map library', async ({ browser }, info) => {
  const ctx = await browser.newContext({ ...info.project.use });
  await ctx.addInitScript(() => {
    localStorage.setItem('fm-tour-done', '1');
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return /webgl/.test(type) ? null : (real as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof real;
  });
  const page = await ctx.newPage();
  const worker: string[] = [];
  page.on('request', (r) => r.url().includes('maplibre-gl-worker') && worker.push(r.url()));
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'can’t draw the live map' })).toBeVisible();
  await expect(page.getByText('The world map you can own a piece of').first()).toBeVisible();
  await page.waitForTimeout(1500);
  expect(worker).toEqual([]);
  expect(await page.evaluate(() => 'maplibregl' in window || !!document.querySelector('.maplibregl-map'))).toBe(false);
  await ctx.close();
});
