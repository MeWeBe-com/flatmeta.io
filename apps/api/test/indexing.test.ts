import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { config } from '../src/config.js';
import { flushIndexNow, plotIndexChanged } from '../src/lib/indexing.js';
import { isGone, isIndexable } from '../src/lib/visibility.js';
import type { App } from '../src/app.js';
import { freeRect, getApp, login } from './helpers.js';

/**
 * S2: new and edited content reaches the sitemap at once and correctly; drafts, hidden, moderated, takedown-pending,
 * empty and removed plots never do; removed plots are 410; IndexNow is told without ever blocking a save.
 */
let app: App;
beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await closeRedis();
});
const json = (res: { body: string }) => JSON.parse(res.body);
type Feed = { plots: { slug: string; title: string; hasCover: boolean; updatedAt: string; company: boolean }[]; lastmod: { countries: Record<string, string | null> } };
const feed = async () => json(await app.inject('/v1/sitemap')) as Feed;
const inFeed = async (slug: string) => (await feed()).plots.find((p) => p.slug === slug);

async function claimed() {
  const owner = await login();
  await db.update(schema.users).set({ plan: 'plus' }).where(eq(schema.users.id, owner.user.id));
  const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot as { id: string; slug: string };
  return { owner, plot };
}

describe('the indexing rule (one function for the sitemap, the page and llms)', () => {
  const base = { status: 'active', kind: 'standard', moderationStatus: 'ok', descriptionMd: 'A bakery by the sea.', showcase: null };
  it('needs a public, moderated, described plot; companies and landmarks need no description', () => {
    expect(isIndexable(base)).toBe(true);
    expect(isIndexable({ ...base, descriptionMd: '  ' })).toBe(false); // empty mini-page: noindex,follow
    expect(isIndexable({ ...base, status: 'pending_payment' })).toBe(false); // draft
    expect(isIndexable({ ...base, status: 'hidden' })).toBe(false);
    expect(isIndexable({ ...base, moderationStatus: 'pending' })).toBe(false);
    expect(isIndexable(base, { takedownOpen: true })).toBe(false);
    expect(isIndexable({ ...base, kind: 'landmark', descriptionMd: null })).toBe(true);
    expect(isIndexable({ ...base, kind: 'showcase', status: 'showcase', descriptionMd: null, showcase: { approved: true, locationVerified: true } })).toBe(true);
    expect(isIndexable({ ...base, kind: 'showcase', status: 'showcase', descriptionMd: null, showcase: { approved: false } })).toBe(false);
    expect(isGone({ status: 'released', moderationStatus: 'ok' })).toBe(true);
    expect(isGone({ status: 'hidden', moderationStatus: 'rejected' })).toBe(true);
    expect(isGone({ status: 'hidden', moderationStatus: 'ok' })).toBe(false);
  });
});

describe('the sitemap feed follows every change at once', () => {
  it('publish → listed with lastmod = the content change and the cover; edit → lastmod moves; hide → gone; release → 410', async () => {
    const { owner, plot } = await claimed();
    // A claimed plot with an empty mini-page is not listed, and its page is noindex.
    expect(await inFeed(plot.slug)).toBeUndefined();
    expect(json(await app.inject({ url: `/v1/plots/${plot.slug}`, headers: owner.headers })).plot.indexable).toBe(false);

    expect((await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: { title: 'Harbour Bakery', descriptionMd: 'Fresh bread every morning by the harbour.' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/publish`, headers: owner.headers })).statusCode).toBe(200);
    const [row] = await db.select().from(schema.plots).where(eq(schema.plots.id, plot.id));
    const first = await inFeed(plot.slug);
    expect(first).toMatchObject({ title: 'Harbour Bakery', company: false });
    expect(first!.updatedAt).toBe(row!.lastEditedAt!.toISOString());
    expect(first!.hasCover).toBe(!!row!.coverImageUrl);
    const view = json(await app.inject({ url: `/v1/plots/${plot.slug}` })).plot;
    expect(view.indexable).toBe(true);
    expect(view.contentModifiedAt).toBe(row!.lastEditedAt!.toISOString());

    await new Promise((r) => setTimeout(r, 20));
    await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: { title: 'Harbour Bakery & Café' } });
    const edited = await inFeed(plot.slug);
    expect(edited!.title).toBe('Harbour Bakery & Café');
    expect(new Date(edited!.updatedAt).getTime()).toBeGreaterThan(new Date(first!.updatedAt).getTime());

    const admin = await login(undefined, 'admin');
    expect((await app.inject({ method: 'PATCH', url: `/v1/admin/plots/${plot.id}`, headers: admin.headers, payload: { status: 'hidden' } })).statusCode).toBe(200);
    expect(await inFeed(plot.slug)).toBeUndefined();
    expect((await app.inject({ url: `/v1/plots/${plot.slug}` })).statusCode).toBe(404); // hidden: not public
    expect(json(await app.inject(`/v1/plots/${plot.slug}/state`)).state).toBe('present');

    expect((await app.inject({ method: 'POST', url: `/v1/admin/plots/${plot.id}/release`, headers: admin.headers })).statusCode).toBe(200);
    expect((await app.inject({ url: `/v1/plots/${plot.slug}` })).statusCode).toBe(410);
    expect(json(await app.inject(`/v1/plots/${plot.slug}/state`)).state).toBe('gone');
    expect(await inFeed(plot.slug)).toBeUndefined();
  });

  it('a draft waiting for payment is never listed', async () => {
    const owner = await login();
    const res = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect(3, 3), title: 'Unpaid draft' } }));
    const id = res.plotId ?? res.plot?.id;
    const [p] = await db.select().from(schema.plots).where(eq(schema.plots.id, id));
    expect(p!.status).toBe('pending_payment');
    await db.update(schema.plots).set({ descriptionMd: 'Even with text, a draft stays out.' }).where(eq(schema.plots.id, id));
    expect(await inFeed(p!.slug)).toBeUndefined();
  });

  it('lists hub pages with the newest change among their plots', async () => {
    const f = await feed();
    for (const code of Object.keys(f.lastmod.countries)) expect(Number.isNaN(new Date(f.lastmod.countries[code]!).getTime())).toBe(false);
  });
});

describe('IndexNow', () => {
  it('batches the changed URLs into one ping with the key file location, and a failure never throws', async () => {
    const was = { key: config.INDEXNOW_KEY, url: config.APP_URL };
    config.INDEXNOW_KEY = 'test-key-0123456789';
    config.APP_URL = 'https://www.flatmeta.io';
    const fetchMock = vi.fn(async () => new Response('', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      plotIndexChanged('harbour-bakery', 'publish');
      plotIndexChanged('old-mill', 'remove');
      const r = await flushIndexNow();
      expect(r).toMatchObject({ ok: true, status: 202 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(config.INDEXNOW_ENDPOINT);
      expect(JSON.parse(String(init.body))).toEqual({
        host: 'www.flatmeta.io',
        key: 'test-key-0123456789',
        keyLocation: 'https://www.flatmeta.io/indexnow-key.txt',
        urlList: ['https://www.flatmeta.io/p/harbour-bakery', 'https://www.flatmeta.io/p/old-mill'],
      });
      fetchMock.mockRejectedValueOnce(new Error('network down'));
      plotIndexChanged('another', 'edit');
      await expect(flushIndexNow()).resolves.toMatchObject({ ok: false });
    } finally {
      vi.unstubAllGlobals();
      config.INDEXNOW_KEY = was.key;
      config.APP_URL = was.url;
    }
  });
  it('does nothing without a key, or on an http site', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    plotIndexChanged('x', 'publish');
    expect(await flushIndexNow()).toMatchObject({ urls: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
