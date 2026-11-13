import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

/**
 * Where my avatar starts (lib/spawn.ts): never a random point.
 * Cloudflare's visitor-location headers are mocked with extra HTTP headers (they pass through the proxy to the
 * API), browser geolocation with Playwright's geolocation + permissions. Runs on desktop and mobile.
 */
const PARIS = { 'cf-iplatitude': '48.8566', 'cf-iplongitude': '2.3522', 'cf-ipcity': 'Paris', 'cf-ipcountry': 'FR' };
const BARCELONA = { latitude: 41.3874, longitude: 2.1686 };
const HOME = { lat: 51.5029, lng: -0.1206 };

async function open(browser: Browser, info: TestInfo, opts: { headers?: Record<string, string>; geo?: boolean; storage?: Awaited<ReturnType<BrowserContext['storageState']>> } = {}) {
  const ctx = await browser.newContext({
    ...info.project.use,
    ...(opts.geo ? { geolocation: BARCELONA, permissions: ['geolocation'] } : {}),
    ...(opts.storage ? { storageState: opts.storage } : {}),
  });
  await ctx.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
  if (opts.headers) await ctx.setExtraHTTPHeaders(opts.headers);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, errors };
}

/** My avatar's position, once it is on the map. */
async function myPos(page: Page) {
  const me = page.locator('.fm-avatar-me');
  await expect(me).toHaveAttribute('data-lat', /./, { timeout: 30_000 });
  return { lat: Number(await me.getAttribute('data-lat')), lng: Number(await me.getAttribute('data-lng')) };
}
const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, deg = 0.01) => Math.abs(a.lat - b.lat) < deg && Math.abs(a.lng - b.lng) < deg;

test('guest: starts at the approximate (Cloudflare) location, then glides to the precise one after "Use my location"', async ({ browser }, info) => {
  const { ctx, page, errors } = await open(browser, info, { headers: PARIS });
  await page.goto('/');
  // Instant start at the approximate location, City level, with a note and the in-app prompt.
  expect(near(await myPos(page), { lat: 48.8566, lng: 2.3522 })).toBe(true);
  await expect(page.getByRole('button', { name: /Approximate location · Paris/ })).toHaveCount(0); // hidden while asking
  const ask = page.getByRole('dialog', { name: 'Start where you are?' });
  await expect(ask).toBeVisible();
  // The visitor agrees; the browser then allows location.
  await ctx.grantPermissions(['geolocation']);
  await ctx.setGeolocation(BARCELONA);
  await ask.getByRole('button', { name: 'Use my location' }).click();
  await expect.poll(async () => near(await myPos(page), { lat: BARCELONA.latitude, lng: BARCELONA.longitude }, 0.001), { timeout: 15_000 }).toBe(true);
  await expect(page.getByRole('button', { name: /Approximate location/ })).toHaveCount(0);

  // Next visit on this device: straight to where I was, no prompt.
  await page.reload();
  expect(near(await myPos(page), { lat: BARCELONA.latitude, lng: BARCELONA.longitude }, 0.001)).toBe(true);
  await expect(ask).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('guest without location permission: the approximate start stays, with the note; "Not now" is remembered', async ({ browser }, info) => {
  const { ctx, page, errors } = await open(browser, info, { headers: PARIS });
  await page.goto('/');
  expect(near(await myPos(page), { lat: 48.8566, lng: 2.3522 })).toBe(true);
  const ask = page.getByRole('dialog', { name: 'Start where you are?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('button', { name: /Approximate location · Paris/ })).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('fm-pos-v2')); // forget the position, keep the "Not now"
  await page.reload();
  expect(near(await myPos(page), { lat: 48.8566, lng: 2.3522 })).toBe(true);
  await expect(ask).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('no Cloudflare headers: country centre, else FlatMeta Home, never a random point', async ({ browser }, info) => {
  const country = await open(browser, info, { headers: { 'cf-ipcountry': 'GB' } });
  const expected = (await (await country.ctx.request.get('/api/v1/me/approx-location', { headers: { 'cf-ipcountry': 'GB' } })).json()) as { source: string; lat: number; lng: number };
  await country.page.goto('/');
  expect(near(await myPos(country.page), expected)).toBe(true);
  await country.ctx.close();

  const none = await open(browser, info);
  await none.page.goto('/');
  // M2: without any location the camera shows the whole World (avatars appear from City zoom), and my avatar
  // waits at the Home plaza.
  await expect.poll(() => none.page.evaluate(() => (window as unknown as { __fmMap?: { getZoom(): number } }).__fmMap?.getZoom() ?? 99), { timeout: 20_000 }).toBeLessThan(6.5);
  await none.page.evaluate(([lng, lat]) => (window as unknown as { __fmMap: { jumpTo(o: object): void } }).__fmMap.jumpTo({ center: [lng, lat], zoom: 12 }), [HOME.lng, HOME.lat]);
  expect(near(await myPos(none.page), HOME)).toBe(true);
  await none.page.getByRole('dialog', { name: 'Start where you are?' }).getByRole('button', { name: 'Not now' }).click();
  await expect(none.page.getByRole('button', { name: /Starting at FlatMeta Home/ })).toBeVisible();
  expect(none.errors).toEqual([]);
  await none.ctx.close();
});

test('signed-in player: starts at their last saved position on any device', async ({ browser }, info) => {
  const first = await open(browser, info, { headers: PARIS, geo: true });
  const email = `spawn-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}@test.dev`;
  const { devCode } = (await (await first.ctx.request.post('/api/v1/auth/request-code', { data: { email } })).json()) as { devCode?: string };
  test.skip(!devCode, 'needs on-screen sign-in codes');
  expect((await first.ctx.request.post('/api/v1/auth/verify-code', { data: { email, code: devCode } })).ok()).toBeTruthy();
  await first.page.goto('/');
  const ask = first.page.getByRole('dialog', { name: 'Start where you are?' });
  if (await ask.isVisible().catch(() => false)) await ask.getByRole('button', { name: 'Use my location' }).click();
  await expect.poll(async () => near(await myPos(first.page), { lat: BARCELONA.latitude, lng: BARCELONA.longitude }, 0.001), { timeout: 15_000 }).toBe(true);
  const { cookies } = await first.ctx.storageState();
  await first.ctx.close(); // closing the socket saves the last position

  // Another device: same account, nothing on the device, Cloudflare says Paris. The saved spot wins.
  const second = await open(browser, info, { headers: PARIS, storage: { cookies, origins: [] } });
  // The first spawn (Paris) is saved at once; Barcelona is saved when the first socket closes. Wait for that.
  await expect
    .poll(async () => {
      const r = (await (await second.ctx.request.get('/api/v1/me/approx-location')).json()) as { source: string; lat: number; lng: number };
      return r.source === 'saved' && near(r, { lat: BARCELONA.latitude, lng: BARCELONA.longitude }, 0.001);
    }, { timeout: 15_000 })
    .toBe(true);
  await second.page.goto('/');
  await expect.poll(async () => myPos(second.page), { timeout: 15_000 }).toMatchObject({ lat: expect.closeTo(BARCELONA.latitude, 3), lng: expect.closeTo(BARCELONA.longitude, 3) });
  await expect(second.page.getByRole('button', { name: /Approximate location/ })).toHaveCount(0);
  expect(second.errors).toEqual([]);
  await second.ctx.close();
});

test('Locate me: precise when allowed, a friendly message when not', async ({ browser }, info) => {
  const allowed = await open(browser, info, { headers: PARIS, geo: true });
  await allowed.page.goto('/');
  await myPos(allowed.page);
  await allowed.page.evaluate(() => localStorage.setItem('fm-geo', 'declined')); // no auto-locate on this page
  await allowed.page.getByRole('button', { name: 'Locate me', exact: true }).click();
  await expect.poll(async () => near(await myPos(allowed.page), { lat: BARCELONA.latitude, lng: BARCELONA.longitude }, 0.001), { timeout: 15_000 }).toBe(true);
  await allowed.ctx.close();

  const blocked = await open(browser, info, { headers: PARIS });
  await blocked.ctx.grantPermissions([]); // no geolocation
  await blocked.page.goto('/');
  await myPos(blocked.page);
  await blocked.page.addInitScript(() => undefined);
  // Make the browser refuse location quickly.
  await blocked.page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
  });
  const dialog = blocked.page.getByRole('dialog', { name: 'Start where you are?' });
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: 'Not now' }).click();
  await blocked.page.getByRole('button', { name: 'Locate me', exact: true }).click();
  await expect(blocked.page.getByRole('status').filter({ hasText: /Location is blocked/ })).toBeVisible();
  expect(near(await myPos(blocked.page), { lat: 48.8566, lng: 2.3522 })).toBe(true);
  await blocked.ctx.close();
});

test('a new visitor sees the nearest places straight away, and can open one', async ({ browser }, info) => {
  test.skip(!!info.project.use.isMobile, 'the nearby card is desktop-only (the phone layout keeps the map clear)');
  const { ctx, page, errors } = await open(browser, info, { headers: PARIS });
  await page.goto('/');
  const nearby = page.getByRole('region', { name: 'Nearby on FlatMeta' });
  await expect(nearby).toBeVisible({ timeout: 30_000 });
  const first = nearby.getByRole('button').nth(1); // after the close button
  await expect(first).toBeVisible();
  await first.click();
  await expect(page.getByRole('complementary', { name: 'Plot details' })).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
  await ctx.close();
});
