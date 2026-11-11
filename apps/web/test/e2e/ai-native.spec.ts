import { expect, test } from '@playwright/test';

/** G14: Ask FlatMeta on the map (works without AI: a search summary), and llms.txt for assistants. */
test.skip(({ isMobile }) => !!isMobile, 'desktop run');

test('Ask FlatMeta answers a question in the map search, with places to open', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
  const email = `ask-${Date.now().toString(36)}@test.dev`;
  const { devCode } = (await (await page.request.post('/api/v1/auth/request-code', { data: { email } })).json()) as { devCode?: string };
  test.skip(!devCode, 'needs on-screen sign-in codes');
  await page.request.post('/api/v1/auth/verify-code', { data: { email, code: devCode } });
  const tag = `Quokka${Math.random().toString(36).slice(2, 7)}`;
  const gx = 76000 + Math.floor(Math.random() * 8000);
  const gy = 90000 + Math.floor(Math.random() * 8000);
  const { plot } = (await (await page.request.post('/api/v1/plots/claim', { data: { rect: { minGx: gx, minGy: gy, maxGx: gx, maxGy: gy }, title: `${tag} Surf Club` } })).json()) as { plot: { id: string } };
  await page.request.post(`/api/v1/plots/${plot.id}/publish`);

  await page.goto('/');
  await page.getByRole('button', { name: /^Search places/ }).click();
  await page.getByRole('dialog', { name: 'Search' }).getByRole('textbox', { name: 'Search' }).fill(`where is ${tag}?`);
  const answer = page.getByRole('region', { name: 'Ask FlatMeta answer' });
  await expect(answer).toContainText(`${tag} Surf Club`, { timeout: 15_000 });
  await answer.getByRole('button', { name: new RegExp(tag) }).click();
  await expect(page.getByRole('complementary', { name: 'Plot details' })).toBeVisible({ timeout: 15_000 });
});

test('llms.txt and llms-full.txt describe FlatMeta accurately and point at the API and MCP', async ({ request }) => {
  const res = await request.get('/llms.txt');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/plain');
  const body = await res.text();
  expect(body).toMatch(/^# FlatMeta/);
  expect(body).toContain('shared world map');
  expect(body).toContain('/api/mcp');
  expect(body).toContain('/api/openapi.json');
  expect(body).toContain('not affiliated with FlatMeta');
  expect(body).not.toMatch(/digital twin|VR headset|NFT marketplace/i);
  const full = await request.get('/llms-full.txt');
  expect(full.status()).toBe(200);
  expect(await full.text()).toContain('## Popular places');
});
