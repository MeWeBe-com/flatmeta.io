import { expect, test } from '@playwright/test';

/** Round 3: the 30-second demo, the first action on the home page, and the founding-customer offer. */
test('R3c: /demo shows a clearly labelled sample business page and what AI reads, with a claim CTA', async ({ page }) => {
  const res = await page.goto('/demo');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('This is what a business gets on FlatMeta');
  const sample = page.getByTestId('demo-sample');
  await expect(sample.getByText('Sample page')).toBeVisible();
  await expect(sample.getByRole('heading', { level: 2, name: /Corner Café \(sample\)/ })).toBeVisible();
  await expect(page.getByTestId('demo-jsonld')).toContainText('"@type": "CafeOrCoffeeShop"');
  // The fictional business is never real structured data on the page.
  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join('\n');
  expect(ld).not.toContain('Corner Café');
  await expect(page.getByRole('link', { name: 'Claim your free plot' })).toHaveAttribute('href', '/?claim');
});

test('R3c: the home page leads with one first action, then the demo', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const claim = html.indexOf('Claim your free plot');
  const demo = html.indexOf('See a 30-second demo');
  expect(claim).toBeGreaterThan(0);
  expect(demo).toBeGreaterThan(claim);
});

test('R3d: the founding block shows real places left; no invented stories or logos', async ({ page, request }) => {
  const plans = (await (await request.get('/api/v1/billing/plans')).json()) as { founding: { total: number; taken: number; left: number } | null };
  for (const path of ['/business', '/pricing']) {
    await page.goto(path);
    if (plans.founding && plans.founding.left > 0) {
      // 0008: before the first place is taken the chip states the limit, not "50 of 50 left".
      await expect(page.getByTestId('founding-left')).toHaveText(
        plans.founding.taken > 0 ? `${plans.founding.left} of ${plans.founding.total} places left` : `Limited to the first ${plans.founding.total}`,
      );
    } else {
      await expect(page.getByTestId('founding-offer')).toHaveCount(0);
    }
    await expect(page.getByTestId('customer-stories')).toHaveCount(0); // none have permission yet
  }
});

test('QA1: common legal paths answer 301 to the legal pages', async ({ request }) => {
  const cases: [string, string][] = [['/privacy', '/legal/privacy'], ['/terms', '/legal/terms'], ['/refunds', '/legal/refunds'], ['/cookies', '/legal/privacy#cookies-and-analytics'], ['/privacy-policy', '/legal/privacy']];
  for (const [from, to] of cases) {
    const r = await request.get(from, { maxRedirects: 0 });
    expect(r.status(), from).toBe(301);
    expect(new URL(r.headers().location!, 'http://x').pathname + (new URL(r.headers().location!, 'http://x').hash)).toBe(to);
  }
  expect((await request.get('/privacy')).status()).toBe(200);
});

test('QA2: the pricing page never says "coming soon"', async ({ request }) => {
  const html = await (await request.get('/pricing')).text();
  expect(html).not.toMatch(/coming soon/i);
  expect(html).not.toMatch(/Campaign tools/);
});

test('QA3: an off-topic article answers 410 with noindex; an on-topic one is served with a strict CSP', async ({ request }) => {
  const ok = await request.get('/insights/2026-11-12-local-shops-on-a-world-map.html');
  test.skip(ok.status() === 404, 'no INSIGHTS_DIR on this server');
  expect(ok.status()).toBe(200);
  expect(ok.headers()['content-security-policy']).toContain("script-src 'none'");
  expect(await ok.text()).toContain('Local shops on a shared world map');
  const off = await request.get('/insights/2026-11-13-newest-virtual-reality-headset-for-libraries-and-schools.html');
  expect(off.status()).toBe(410);
  expect(off.headers()['x-robots-tag']).toBe('noindex');
  expect((await request.get('/insights/..%2F..%2Fpackage.json')).status()).toBe(404);
});

test('AD1: /readyz says ready, with the web build and the API on the same commit', async ({ request }) => {
  const r = await request.get('/readyz');
  expect(r.status()).toBe(200);
  expect(r.headers()['cache-control']).toContain('no-store');
  const body = (await r.json()) as { ok: boolean; release: string; api: { ok: boolean; release: string }; sameRelease: boolean };
  expect(body.ok).toBe(true);
  expect(body.release).toMatch(/^[0-9a-f]{12}$/);
  expect(body.api.ok).toBe(true);
  expect(body.sameRelease).toBe(true);
});
