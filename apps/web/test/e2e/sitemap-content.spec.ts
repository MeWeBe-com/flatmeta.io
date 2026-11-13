import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * S2: new and edited content reaches the sitemap at once and correctly.
 * publish → listed with lastmod = its content change and its cover image; edit the title → lastmod moves and the
 * page's <title> and description change; hide → gone from the sitemap and noindex; remove → 410; drafts never listed.
 */
test.skip(({ isMobile }) => !!isMobile, 'same on mobile');

const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
function spot(cells = 2) {
  const gx = 76000 + Math.floor(Math.random() * 8000);
  const gy = 90000 + Math.floor(Math.random() * 8000);
  return { minGx: gx, minGy: gy, maxGx: gx + cells - 1, maxGy: gy + cells - 1 };
}
async function signIn(req: APIRequestContext, email: string) {
  const { devCode } = (await (await req.post('/api/v1/auth/request-code', { data: { email } })).json()) as { devCode?: string };
  test.skip(!devCode, 'needs on-screen sign-in codes');
  expect((await req.post('/api/v1/auth/verify-code', { data: { email, code: devCode } })).ok()).toBeTruthy();
}
type Entry = { loc: string; lastmod: string; image: string | null };
async function plotEntries(req: APIRequestContext): Promise<Entry[]> {
  const xml = await (await req.get('/sitemap-plots.xml')).text();
  return [...xml.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>(?:<image:image><image:loc>([^<]+)<\/image:loc>)?/g)].map((m) => ({ loc: m[1]!, lastmod: m[2]!, image: m[3] ?? null }));
}
const entry = async (req: APIRequestContext, slug: string) => (await plotEntries(req)).find((e) => e.loc.endsWith(`/p/${slug}`));
/** The page's robots meta ('' when there is none, i.e. indexable). */
const robotsMeta = (page: Page) => page.evaluate(() => document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '');

test('publish, edit, hide and remove a plot: the sitemap and the page follow at once', async ({ page }) => {
  const req = page.request;
  await signIn(req, `e2e-seo-${stamp()}@test.dev`);
  const claim = await req.post('/api/v1/plots/claim', { data: { rect: spot(2), title: `Seo Lookout ${stamp()}` } });
  expect(claim.ok()).toBeTruthy();
  const plot = ((await claim.json()) as { plot: { id: string; slug: string } }).plot;

  // Empty mini-page: not listed, page noindex (follow).
  expect(await entry(req, plot.slug)).toBeUndefined();
  await page.goto(`/p/${plot.slug}`);
  expect(await robotsMeta(page)).toMatch(/noindex/);

  // Publish with a description → listed, lastmod = the content change, image present.
  expect((await req.patch(`/api/v1/plots/${plot.id}`, { data: { descriptionMd: 'A lookout over the open Atlantic, with a bench and a view.' } })).ok()).toBeTruthy();
  expect((await req.post(`/api/v1/plots/${plot.id}/publish`)).ok()).toBeTruthy();
  const view = ((await (await req.get(`/api/v1/plots/${plot.slug}`)).json()) as { plot: { contentModifiedAt: string; coverImageUrl: string | null } }).plot;
  const listed = await entry(req, plot.slug);
  expect(listed, 'listed right after publishing').toBeDefined();
  expect(new Date(listed!.lastmod).toISOString()).toBe(view.contentModifiedAt);
  if (view.coverImageUrl) expect(listed!.image).toMatch(new RegExp(`/api/v1/plots/${plot.slug}/cover\\.jpg`));
  await page.goto(`/p/${plot.slug}`);
  expect(await robotsMeta(page)).not.toMatch(/noindex/);

  // Edit the title → lastmod moves, the page's title and description change.
  await page.waitForTimeout(1100);
  const newTitle = `Atlantic Bench ${stamp()}`;
  expect((await req.patch(`/api/v1/plots/${plot.id}`, { data: { title: newTitle } })).ok()).toBeTruthy();
  const edited = await entry(req, plot.slug);
  expect(new Date(edited!.lastmod).getTime()).toBeGreaterThan(new Date(listed!.lastmod).getTime());
  await page.goto(`/p/${plot.slug}`);
  await expect(page).toHaveTitle(new RegExp(newTitle));
  expect(await page.locator('meta[name="description"]').getAttribute('content')).toContain(newTitle);
});

test('hidden, removed and draft plots never reach the sitemap; removed answers 410', async ({ browser }) => {
  const ctx = await browser.newContext();
  const req = ctx.request;
  const { devCode } = (await (await req.post('/api/v1/auth/request-code', { data: { email: 'admin@flatmeta.io' } })).json()) as { devCode?: string };
  test.skip(!devCode, 'needs on-screen sign-in codes');
  await req.post('/api/v1/auth/verify-code', { data: { email: 'admin@flatmeta.io', code: devCode } });
  const me = (await (await req.get('/api/v1/me')).json()) as { user?: { role: string } };
  test.skip(me.user?.role !== 'admin', 'the seeded admin is not admin@flatmeta.io here');

  // Someone publishes a plot (a fresh account: free land), then an admin hides it: it leaves the sitemap at once.
  const owner = await browser.newContext();
  await signIn(owner.request, `e2e-seo-${stamp()}@test.dev`);
  const plot = ((await (await owner.request.post('/api/v1/plots/claim', { data: { rect: spot(2), title: `Hidden Cove ${stamp()}` } })).json()) as { plot: { id: string; slug: string } }).plot;
  await owner.request.patch(`/api/v1/plots/${plot.id}`, { data: { descriptionMd: 'A quiet cove that will be hidden by an admin.' } });
  await owner.request.post(`/api/v1/plots/${plot.id}/publish`);
  expect(await entry(req, plot.slug)).toBeDefined();
  expect((await req.patch(`/api/v1/admin/plots/${plot.id}`, { data: { status: 'hidden' } })).ok()).toBeTruthy();
  expect(await entry(req, plot.slug)).toBeUndefined();
  const page = await ctx.newPage();
  await page.goto(`/p/${plot.slug}`); // the admin can still open it: noindex
  expect(await robotsMeta(page)).toMatch(/noindex/);

  // Released (removed for good): 410 Gone, for everyone.
  expect((await req.post(`/api/v1/admin/plots/${plot.id}/release`)).ok()).toBeTruthy();
  await expect.poll(async () => (await req.get(`/p/${plot.slug}`, { maxRedirects: 0 })).status(), { timeout: 40_000 }).toBe(410);
  expect(await entry(req, plot.slug)).toBeUndefined();

  // A draft waiting for payment is never listed.
  const draft = (await (await owner.request.post('/api/v1/plots/claim', { data: { rect: spot(3), title: `Unpaid ${stamp()}` } })).json()) as { plotId?: string };
  if (draft.plotId) {
    const slug = ((await (await owner.request.get(`/api/v1/plots/${draft.plotId}`)).json()) as { plot?: { slug: string } }).plot?.slug;
    if (slug) expect(await entry(req, slug)).toBeUndefined();
  }
  await owner.close();
  await ctx.close();
});
