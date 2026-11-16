import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis, redis } from '../src/lib/redis.js';
import { boardKeyFor } from '../src/game/leaderboards.js';
import type { App } from '../src/app.js';
import { freeRect, getApp, login } from './helpers.js';

/** GL3a: bugs found by the GL2 audit of the live site (F4). */
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

describe('GL3a regressions', () => {
  it('an empty weekly leaderboard answers 200 with no rows (the empty marker never reaches a uuid query)', async () => {
    const rk = boardKeyFor('xp-week');
    const saved = await redis.zrange(rk, '0', '-1', 'WITHSCORES');
    await redis.del(rk);
    await redis.zadd(rk, '-1', '__empty__');
    try {
      const res = await app.inject({ url: '/v1/leaderboards/xp-week?limit=100' });
      expect(res.statusCode).toBe(200);
      expect(json(res).rows).toEqual([]);
    } finally {
      await redis.del(rk);
      for (let i = 0; i < saved.length; i += 2) await redis.zadd(rk, saved[i + 1]!, saved[i]!);
    }
  });

  it('a reserved company (showcase) plot answers open houses with an empty list, not 404', async () => {
    const owner = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
    await db.update(schema.plots).set({ status: 'showcase', kind: 'showcase', ownerUserId: null }).where(eq(schema.plots.id, plot.id));
    const res = await app.inject({ url: `/v1/plots/${plot.id}/open-houses` });
    expect(res.statusCode).toBe(200);
    expect(json(res).openHouses).toEqual([]);
    // Still 404 for plots nobody may see.
    await db.update(schema.plots).set({ status: 'hidden' }).where(eq(schema.plots.id, plot.id));
    expect((await app.inject({ url: `/v1/plots/${plot.id}/open-houses` })).statusCode).toBe(404);
  });
});

/** GL3b: claiming a reserved company plot. Free by default: verified staff get the page at once. */
describe('company claim (GL3b)', () => {
  async function reserved(slug: string, website: string) {
    const { upsertShowcase } = await import('../src/showcase/generator.js');
    const stats = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] as string[], plots: [] as string[] };
    await upsertShowcase(
      {
        brand: slug, slug, kind: 'company', sector: 'tech', city: 'Leeds', lat: 53.8 + Math.random() / 10, lng: -1.55 + Math.random() / 10, website, title: slug, tagline: 't', description: 'd',
        useCase: 'demo', cta: null, highlights: ['a'], imagePrompt: 'x', palette: ['#112233', '#445566', '#778899'], motif: 'city', size: { w: 2, h: 2 }, tags: ['x'],
      },
      'GB',
      { countries: ['GB'], source: 'curated', approve: true },
      stats,
    );
  }
  async function verifyAs(slug: string, email: string) {
    const { headers } = await login();
    const on = json(await app.inject({ method: 'POST', url: `/v1/showcase/${slug}/claim`, headers, payload: { email, orgName: slug } }));
    expect(on.status).toBe('pending_email');
    return { headers, res: await app.inject({ method: 'POST', url: '/v1/showcase/claim/verify', headers, payload: { requestId: on.requestId, code: on.devCode } }) };
  }

  it('free (the default): verifying makes the plot the organisation’s verified page and opens the editor', async () => {
    const { config } = await import('../src/config.js');
    expect(config.COMPANY_CLAIM_PRICE_CENTS).toBe(0);
    const slug = `gl3b-free-${Date.now().toString(36)}`;
    await reserved(slug, 'https://gl3b-free.example');
    const { res } = await verifyAs(slug, 'cto@gl3b-free.example');
    expect(res.statusCode).toBe(200);
    const body = json(res);
    expect(body.status).toBe('completed');
    expect(body.redirect).toMatch(/^\/dashboard\/plots\/[0-9a-f-]+\?welcome=claimed$/);
    const [p] = await db.select().from(schema.plots).where(eq(schema.plots.slug, slug));
    expect(p).toMatchObject({ kind: 'landmark', status: 'active', showcase: null });
    expect(p!.ownerOrgId).toBeTruthy();
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, p!.ownerOrgId!));
    expect(org!.verifiedAt).toBeTruthy();
    expect(org!.plan).not.toBe('brand'); // no plan is given away with a free claim
    // The plans endpoint says the claim is free.
    expect(json(await app.inject({ url: '/v1/billing/plans' })).landmarkPriceCents).toBe(0);
  });

  it('paid (COMPANY_CLAIM_PRICE_CENTS set): verifying leads to the Landmark checkout instead', async () => {
    const { config } = await import('../src/config.js');
    const before = config.COMPANY_CLAIM_PRICE_CENTS;
    config.COMPANY_CLAIM_PRICE_CENTS = 99000;
    try {
      const slug = `gl3b-paid-${Date.now().toString(36)}`;
      await reserved(slug, 'https://gl3b-paid.example');
      const { res } = await verifyAs(slug, 'cmo@gl3b-paid.example');
      expect(res.statusCode).toBe(200);
      const body = json(res);
      expect(body.status).not.toBe('completed');
      const [p] = await db.select().from(schema.plots).where(eq(schema.plots.slug, slug));
      expect(p!.kind).toBe('showcase'); // nothing moves until it is paid
      expect(json(await app.inject({ url: '/v1/billing/plans' })).landmarkPriceCents).toBe(99000);
    } finally {
      config.COMPANY_CLAIM_PRICE_CENTS = before;
    }
  });
});
