import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Two signed-in players on the same spot of the map: live nearby chat, private messages with an unread badge,
 * follow and connection-request notifications (toast, bell count, list), accept, and clan chat.
 * Needs on-screen sign-in codes (development or staging without an email provider).
 */
test.describe.configure({ mode: 'serial' });
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile, 'runs once, on desktop chromium');

const SPOT = { lat: 41.3874, lng: 2.1686 }; // Barcelona, City level
const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

interface Player {
  ctx: BrowserContext;
  page: Page;
  req: APIRequestContext;
  username: string;
  name: string;
  /** Page errors and console errors seen so far; every test fails if any appear. */
  errors: string[];
}

async function signIn(browser: Browser, name: string): Promise<Player> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
  const req = ctx.request;
  const email = `live-${stamp()}@test.dev`;
  const { devCode } = (await (await req.post('/api/v1/auth/request-code', { data: { email } })).json()) as { devCode?: string };
  expect(devCode, 'on-screen sign-in codes must be enabled (no email provider, APP_ENV != production)').toBeTruthy();
  const res = await req.post('/api/v1/auth/verify-code', { data: { email, code: devCode, displayName: name } });
  expect(res.ok()).toBeTruthy();
  const username = `${name.toLowerCase()}_${stamp()}`.slice(0, 20);
  expect((await req.patch('/api/v1/me', { data: { username } })).ok()).toBeTruthy();
  const page = await ctx.newPage();
  const errors = watchErrors(page, name);
  return { ctx, page, req, username, name, errors };
}

/** Collects uncaught page errors and console errors (crashes, React errors, failed hooks). */
function watchErrors(page: Page, name: string): string[] {
  const errors: string[] = [];
  page.on('crash', () => errors.push(`[${name}] page crashed`));
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}\n${(e.stack ?? '').split('\n').slice(0, 4).join('\n')}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // Map tiles come from a public tile server: a blocked or slow tile is not an app error.
    if (/Failed to load resource/.test(text) && /tiles|openfreemap|photon/i.test(m.location().url ?? '')) return;
    errors.push(`[${name}] console.error: ${text.slice(0, 500)} @ ${m.location().url ?? ''}`);
  });
  return errors;
}

async function openMap(p: Player) {
  await p.page.goto(`/?at=${SPOT.lat},${SPOT.lng},11.5`);
  await expect(p.page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 30_000 });
}

const chatButton = (p: Player) => p.page.getByRole('button', { name: /^Chat/ });
const bell = (p: Player) => p.page.getByRole('button', { name: /^Notifications/ });
/** The bell's unread count, read from its accessible name ("Notifications, 3 unread"). */
const unreadOf = async (p: Player) => Number((await bell(p).getAttribute('aria-label'))?.match(/(\d+) unread/)?.[1] ?? 0);


/** Opens the chat panel on the private thread with `other` (from the friends list, or already open). */
async function openThread(p: Player, other: Player) {
  if (await chatButton(p).isVisible()) await chatButton(p).click();
  const chat = p.page.getByRole('region', { name: 'Chat' });
  await chat.getByRole('button', { name: /Friends/ }).click();
  const back = chat.getByRole('button', { name: /All friends/ });
  if (await back.isVisible()) {
    if ((await back.textContent())?.includes(`@${other.username}`)) return chat;
    await back.click();
  }
  await chat.getByRole('button', { name: new RegExp(`${other.name}.*@${other.username}`) }).click();
  return chat;
}

let a: Player;
let b: Player;

test.beforeAll(async ({ browser }) => {
  a = await signIn(browser, 'Ana');
  b = await signIn(browser, 'Ben');
  await Promise.all([openMap(a), openMap(b)]);
});
test.afterEach(() => {
  const all = [...(a?.errors ?? []), ...(b?.errors ?? [])];
  a?.errors.splice(0);
  b?.errors.splice(0);
  expect(all, 'no page errors or console errors').toEqual([]);
});
test.afterAll(async () => {
  await a?.ctx.close();
  await b?.ctx.close();
});

test('both players see each other on the map', async () => {
  // Each map shows its own avatar plus the other player's.
  await expect(a.page.locator('.fm-avatar')).toHaveCount(2, { timeout: 20_000 });
  await expect(b.page.locator('.fm-avatar')).toHaveCount(2, { timeout: 20_000 });
  await expect(b.page.locator('.fm-avatar', { hasText: 'Ana' })).toBeVisible();
});

test('nearby chat reaches the other player live', async () => {
  const text = `Hola from Ana ${stamp()}`;
  await chatButton(a).click();
  await a.page.getByLabel('Message').fill(text);
  await a.page.getByLabel('Message').press('Enter');
  // B sees it as a speech bubble over Ana, and in the nearby tab.
  await expect(b.page.locator('.fm-bubble', { hasText: text })).toBeAttached({ timeout: 10_000 });
  await chatButton(b).click();
  await expect(b.page.getByRole('region', { name: 'Chat' }).getByText(text)).toBeVisible();
  await b.page.getByRole('button', { name: 'Close chat' }).click();
  await a.page.getByRole('button', { name: 'Close chat' }).click();
});

test('follow and connection request notify the recipient live; accepting notifies the sender', async () => {
  // A follows B (B may already have unread notifications from earlier steps, e.g. an achievement)
  const before = await unreadOf(b);
  expect((await a.req.post(`/api/v1/users/${b.username}/follow`)).ok()).toBeTruthy();
  await expect(b.page.getByRole('status').filter({ hasText: /Ana.*follow/i })).toBeVisible({ timeout: 10_000 });
  await expect(bell(b)).toHaveAccessibleName(`Notifications, ${before + 1} unread`);

  // A sends a connection request from the Friends tab
  await chatButton(a).click();
  await a.page.getByRole('button', { name: /Friends/ }).click();
  await a.page.getByLabel('Username to connect with').fill(b.username);
  await a.page.getByRole('button', { name: 'Send request' }).click();
  await expect(b.page.getByRole('status').filter({ hasText: /Ana.*connect/i })).toBeVisible({ timeout: 10_000 });
  await expect(bell(b)).toHaveAccessibleName(`Notifications, ${before + 2} unread`);

  // B opens the bell: both notifications are listed, and the request can be accepted there.
  await bell(b).click();
  const list = b.page.getByRole('dialog', { name: 'Notifications' });
  await expect(list.getByText(/started following you/i)).toBeVisible();
  await expect(list.getByText(/wants to connect/i)).toBeVisible();
  await list.getByRole('button', { name: 'Accept' }).click();
  await expect(bell(b)).toHaveAccessibleName(/^Notifications$/); // opened = read

  // A is told
  await expect(a.page.getByRole('status').filter({ hasText: /Ben.*accepted/i })).toBeVisible({ timeout: 10_000 });
  await a.page.getByRole('button', { name: 'Close chat' }).click();
  await b.page.keyboard.press('Escape');
});

test('private messages arrive live with an unread badge', async () => {
  const text = `Private hello ${stamp()}`;
  await openThread(a, b);
  await a.page.getByLabel('Message').fill(text);
  await a.page.getByLabel('Message').press('Enter');
  await expect(a.page.getByRole('region', { name: 'Chat' }).getByText(text)).toBeVisible();

  await expect(chatButton(b)).toHaveAccessibleName(/1 unread/, { timeout: 10_000 });
  await expect(b.page.getByRole('status').filter({ hasText: /message from Ana/i })).toBeVisible();
  await openThread(b, a);
  await expect(b.page.getByRole('region', { name: 'Chat' }).getByText(text)).toBeVisible();
  await b.page.getByRole('button', { name: 'Close chat' }).click();
  await a.page.getByRole('button', { name: 'Close chat' }).click();
});

test('a private chat opened from a profile page reaches the other player live', async () => {
  // B opens A's profile and presses Message: the map opens with the private chat to A.
  await b.page.goto(`/u/${a.username}`);
  await b.page.getByRole('link', { name: 'Message' }).click();
  await expect(b.page).toHaveURL(new RegExp(`dm=${a.username}`));
  const chatB = b.page.getByRole('region', { name: 'Chat' });
  await expect(chatB.getByText(`@${a.username}`)).toBeVisible({ timeout: 30_000 });
  const text = `From your profile ${stamp()}`;
  await chatB.getByLabel('Message').fill(text);
  await chatB.getByLabel('Message').press('Enter');
  await expect(chatB.getByText(text)).toBeVisible();

  // A (chat closed) gets it live: unread badge on the chat button, a toast and the thread.
  await expect(chatButton(a)).toHaveAccessibleName(/1 unread/, { timeout: 10_000 });
  await expect(a.page.getByRole('status').filter({ hasText: /message from Ben/i })).toBeVisible();
  await openThread(a, b);
  await expect(a.page.getByRole('region', { name: 'Chat' }).getByText(text)).toBeVisible();
  await a.page.getByRole('button', { name: 'Close chat' }).click();
  // Ben walks back to the shared spot (the profile link opened the map at the world view).
  await openMap(b);
});

test('a private chat opened from the peer card on the map reaches the other player live', async () => {
  // A taps Ben's avatar on the map, then Message.
  // Exactly one Ben: his previous page's avatar must be gone (no ghosts after a reload).
  const ben = a.page.locator('.fm-avatar', { hasText: 'Ben' });
  await expect(ben).toHaveCount(1, { timeout: 15_000 });
  await ben.click();
  const card = a.page.getByRole('dialog', { name: /Ben/ });
  await card.getByRole('button', { name: 'Message' }).click();
  const chatA = a.page.getByRole('region', { name: 'Chat' });
  await expect(chatA.getByText(`@${b.username}`)).toBeVisible();
  const text = `From the map ${stamp()}`;
  await chatA.getByLabel('Message').fill(text);
  await chatA.getByLabel('Message').press('Enter');

  await expect(chatButton(b)).toHaveAccessibleName(/1 unread/, { timeout: 10_000 });
  await openThread(b, a);
  await expect(b.page.getByRole('region', { name: 'Chat' }).getByText(text)).toBeVisible();
  await b.page.getByRole('button', { name: 'Close chat' }).click();
  await a.page.getByRole('button', { name: 'Close chat' }).click();
});

test('clan members chat in their clan room', async () => {
  // A needs level 2 to found a clan: the free Homestead claim gives enough XP.
  const gx = 76000 + Math.floor(Math.random() * 8000);
  const gy = 90000 + Math.floor(Math.random() * 8000);
  await a.req.post('/api/v1/plots/claim', { data: { rect: { minGx: gx, minGy: gy, maxGx: gx, maxGy: gy } } });
  const tag = stamp().slice(-4).toUpperCase();
  const clanRes = await a.req.post('/api/v1/clans', { data: { name: `Live Crew ${tag}`, tag } });
  expect(clanRes.ok(), await clanRes.text()).toBeTruthy();
  const { clan } = (await clanRes.json()) as { clan: { slug: string } };
  expect((await a.req.post(`/api/v1/clans/${clan.slug}/invite`, { data: { username: b.username } })).ok()).toBeTruthy();
  await expect(b.page.getByRole('status').filter({ hasText: /invited you/i })).toBeVisible({ timeout: 10_000 });
  const { invites } = (await (await b.req.get('/api/v1/clans/mine')).json()) as { invites: { id: string }[] };
  expect((await b.req.post(`/api/v1/clan-requests/${invites[0]!.id}/accept`)).ok()).toBeTruthy();

  // No reload: the server tells both live sessions about the new clan membership.
  const text = `Clan HQ ${stamp()}`;
  await chatButton(a).click();
  await a.page.getByRole('button', { name: 'Clan' }).click();
  await a.page.getByLabel('Message').fill(text);
  await a.page.getByLabel('Message').press('Enter');
  await chatButton(b).click();
  await b.page.getByRole('button', { name: 'Clan' }).click();
  await expect(b.page.getByRole('region', { name: 'Chat' }).getByText(text)).toBeVisible({ timeout: 10_000 });
});

test('guests are asked to sign in before chatting, with a clear message', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
  const page = await ctx.newPage();
  const errors = watchErrors(page, 'Guest');
  await page.goto(`/?at=${SPOT.lat},${SPOT.lng},11.5`);
  await page.getByRole('button', { name: /^Chat/ }).click();
  const chat = page.getByRole('region', { name: 'Chat' });
  await expect(chat.getByText('Guests can read. Sign in to chat, follow and connect.')).toBeVisible();
  await chat.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('dialog').getByText(/Sign in to chat/)).toBeVisible();
  await ctx.close();
  expect(errors, 'no page errors or console errors').toEqual([]);
});
