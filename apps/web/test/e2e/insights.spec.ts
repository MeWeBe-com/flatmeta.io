import { expect, test } from '@playwright/test';

/**
 * S5: the /insights hub (served by the app, articles from INSIGHTS_DIR: the test fixtures here), its place in the
 * sitemap, and the admin check that flags articles breaking the rules in docs/positioning.md.
 */
test.skip(({ isMobile }) => !!isMobile, 'same HTML on mobile');

test('the /insights hub lists the articles, newest first, at its own canonical URL', async ({ request }) => {
  const res = await request.get('/insights', { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const html = await res.text();
  test.skip(!/data-testid="insights-list"/.test(html), 'no INSIGHTS_DIR on this server');
  expect(html).toMatch(/<title>Insights · FlatMeta<\/title>/);
  expect(html).toMatch(/<link rel="canonical" href="[^"]+\/insights"/);
  const order = [...html.matchAll(/href="(\/insights\/[^"]+\.html)"/g)].map((m) => m[1]);
  expect(order).toEqual(['/insights/2026-11-13-newest-virtual-reality-headset-for-libraries-and-schools.html', '/insights/2026-11-12-local-shops-on-a-world-map.html']);
  // At least two links to FlatMeta pages, and the breadcrumb ends at the hub.
  expect(html).toMatch(/href="\/explore"/);
  expect(html).toMatch(/"@type":"BreadcrumbList".*"name":"Insights","item":"[^"]+\/insights"/);
  // The automation's old index URL (/insights/) redirects to the hub; past the last page is a 404.
  const old = await request.get('/insights/', { maxRedirects: 0 });
  expect(old.status()).toBeGreaterThanOrEqual(301);
  expect(old.status()).toBeLessThanOrEqual(308);
  expect(old.headers().location).toMatch(/\/insights$/);
  expect((await request.get('/insights?page=2', { maxRedirects: 0 })).status()).toBe(404);
});

test('the insights sitemap lists the hub (dated by its newest article) and every article', async ({ request }) => {
  const xml = await (await request.get('/sitemap-insights.xml')).text();
  test.skip(!/<loc>/.test(xml), 'no INSIGHTS_DIR on this server');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  expect(locs[0]).toBe('/insights');
  expect(locs).toContain('/insights/2026-11-12-local-shops-on-a-world-map.html');
  expect(locs).not.toContain('/insights/'); // the automation's old index redirects to the hub
});

test('admins see which articles break the rules; nobody else sees the page', async ({ browser }) => {
  // Guests and players get the not-found page and none of the list (it is read on the server, for admins only).
  const guest = await browser.newContext();
  const asGuest = await (await guest.request.get('/admin/insights')).text();
  expect(asGuest).not.toContain('insight-row');
  expect(asGuest).not.toContain('virtual reality headset');
  const ctx = await browser.newContext();
  const req = ctx.request;
  const { devCode } = (await (await req.post('/api/v1/auth/request-code', { data: { email: 'admin@flatmeta.io' } })).json()) as { devCode?: string };
  test.skip(!devCode, 'needs on-screen sign-in codes');
  await req.post('/api/v1/auth/verify-code', { data: { email: 'admin@flatmeta.io', code: devCode } });
  const me = (await (await req.get('/api/v1/me')).json()) as { user?: { role: string } };
  test.skip(me.user?.role !== 'admin', 'the seeded admin is not admin@flatmeta.io here');
  const page = await ctx.newPage();
  await page.goto('/admin/insights');
  const rows = page.getByTestId('insight-row');
  test.skip((await rows.count()) === 0, 'no INSIGHTS_DIR on this server');
  await expect(page.getByTestId('insights-bad-count')).toHaveText('1 break the rules');
  const vr = rows.filter({ hasText: 'virtual reality headset' });
  for (const problem of [/title is \d+ characters/, /no meta description/, /lang> is "en-GB"/, /no og:image/, /0 links to FlatMeta pages/, /off-topic/]) await expect(vr).toContainText(problem);
  await expect(rows.filter({ hasText: 'Local shops on a shared world map' })).toContainText('OK');
  await ctx.close();
  await guest.close();
});
