import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { config } from '../src/config.js';
import type { App } from '../src/app.js';
import { freeRect, getApp, login } from './helpers.js';

/** Go-live without payments (PAID_CHECKOUT_ENABLED off): free land up to the allowance, every checkout says "coming soon". */
let app: App;
const before = config.PAID_CHECKOUT_ENABLED;
const beforeCheck = config.SHOWCASE_REQUIRE_LOCATION_CHECK;
beforeAll(async () => {
  app = await getApp();
  config.PAID_CHECKOUT_ENABLED = 'false';
});
afterAll(async () => {
  config.PAID_CHECKOUT_ENABLED = before;
  config.SHOWCASE_REQUIRE_LOCATION_CHECK = beforeCheck;
  await app.close();
  await pool.end();
  await closeRedis();
});
const json = (res: { body: string }) => JSON.parse(res.body);

describe('launch without payments', () => {
  it('says so on /v1/features', async () => {
    expect(json(await app.inject({ url: '/v1/features' }))).toMatchObject({ paidCheckout: false, freeLandCells: config.FREE_LAND_CELLS });
  });

  it('gives the first squares free, up to the allowance, then asks to wait for payments', async () => {
    const u = await login();
    const big = freeRect(10, 10); // 100 squares
    const q = json(await app.inject({ method: 'POST', url: '/v1/plots/quote', headers: u.headers, payload: big })).quote;
    expect(q).toMatchObject({ free: true, totalCents: 0, available: true, paidCheckout: false, comingSoon: false, freeAllowance: { limit: 100, used: 0 } });

    const claim = await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: u.headers, payload: { rect: big, title: 'Launch day' } });
    expect(claim.statusCode, claim.body).toBe(200);
    const plot = json(claim).plot;
    expect(plot.status).toBe('active');
    expect(plot.cellCount ?? 100).toBe(100);

    const more = json(await app.inject({ method: 'POST', url: '/v1/plots/quote', headers: u.headers, payload: freeRect() })).quote;
    expect(more).toMatchObject({ free: false, available: false, comingSoon: true, freeAllowance: { limit: 100, used: 100 } });
    expect(more.reasons.join(' ')).toMatch(/used your 100 free squares.*coming soon/);
    const refused = await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: u.headers, payload: { rect: freeRect() } });
    expect(refused.statusCode).toBe(400);

    // Paid extras on that plot answer "coming soon", not a checkout link.
    const upgrade = await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/upgrade`, headers: u.headers, payload: { kind: 'spotlight' } });
    expect(upgrade.statusCode).toBe(403);
    expect(json(upgrade).error?.code ?? json(upgrade).code).toBe('coming_soon');
    const listing = await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/list`, headers: u.headers, payload: { priceCents: 5000 } });
    expect(listing.statusCode).toBe(403);
  });

  it('keeps the small free Homestead working', async () => {
    const u = await login();
    const res = await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: u.headers, payload: { rect: freeRect() } });
    expect(res.statusCode, res.body).toBe(200);
    expect(json(res).plot.kind).toBe('homestead');
  });

  it('refuses plans and AI packs with a friendly message', async () => {
    const u = await login();
    for (const [url, payload] of [['/v1/billing/checkout', { plan: 'plus' }], ['/v1/billing/credits', undefined]] as const) {
      const res = await app.inject({ method: 'POST', url, headers: u.headers, ...(payload ? { payload } : {}) });
      expect(res.statusCode, url).toBe(403);
      expect(res.body).toMatch(/coming soon/i);
    }
  });
});

describe('showcase locations', () => {
  it('hides unchecked showcase plots publicly until an admin verifies or nudges them', async () => {
    const { upsertShowcase } = await import('../src/showcase/generator.js');
    const slug = `loc-${Date.now().toString(36)}`;
    const entry = {
      kind: 'company', sector: 'tech', city: 'Lisbon', lat: 38.7223 + Math.random() / 50, lng: -9.1393 + Math.random() / 50, website: 'https://example.org', title: 't', tagline: 'tag', description: 'desc',
      useCase: 'demo', cta: null, highlights: ['a'], imagePrompt: 'a harbour', palette: ['#112233', '#445566', '#778899'], motif: 'city', size: { w: 2, h: 2 }, tags: ['x'], brand: `Loc ${slug}`, slug,
    };
    const stats = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] as string[], plots: [] as string[] };
    const plot = (await upsertShowcase(entry, 'PT', { countries: ['PT'], source: 'curated', approve: true }, stats))!;
    expect(plot).toBeTruthy();

    config.SHOWCASE_REQUIRE_LOCATION_CHECK = 'true'; // production behaviour
    expect((await app.inject(`/v1/plots/${slug}`)).statusCode).toBe(404);

    const admin = await login(undefined, 'admin');
    const list = json(await app.inject({ url: '/v1/admin/showcase/locations?country=PT&status=unverified', headers: admin.headers }));
    expect(list.publicRequiresCheck).toBe(true);
    expect(list.plots.map((p: { id: string }) => p.id)).toContain(plot.id);

    expect((await app.inject({ method: 'POST', url: '/v1/admin/showcase/locations', headers: admin.headers, payload: { ids: [plot.id], verified: true } })).statusCode).toBe(200);
    expect((await app.inject(`/v1/plots/${slug}`)).statusCode).toBe(200);

    // A nudge moves the plot (keeping its size) and keeps it checked.
    const moved = json(await app.inject({ method: 'POST', url: `/v1/admin/showcase/${plot.id}/move`, headers: admin.headers, payload: { lat: 38.7139, lng: -9.1334 } }));
    expect(Math.abs(moved.plot.lat - 38.7139)).toBeLessThan(0.01);
    expect(moved.plot.locationVerified).toBe(true);
    const page = json(await app.inject(`/v1/plots/${slug}`)).plot;
    expect(page.width ?? 2).toBe(2);

    // Guests can't use the admin endpoints.
    expect((await app.inject({ url: '/v1/admin/showcase/locations' })).statusCode).toBe(401);
  });
});

describe('empty map fixes (G3)', () => {
  const entry = (brand: string, slug: string, lat: number, lng: number, city = 'Reykjavik') => ({
    kind: 'company', sector: 'tech', city, lat, lng, website: 'https://example.org', title: 't', tagline: 'tag', description: 'desc',
    useCase: 'demo', cta: null, highlights: ['a'], imagePrompt: 'a fjord', palette: ['#112233', '#445566', '#778899'], motif: 'city', size: { w: 2, h: 2 }, tags: ['x'], brand, slug,
  });

  it('bulk-verifies only locations that passed the automatic check, admins only, dry run by default', async () => {
    const { upsertShowcase } = await import('../src/showcase/generator.js');
    const { db, schema } = await import('../src/db/client.js');
    const { eq } = await import('drizzle-orm');
    const stats = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] as string[], plots: [] as string[] };
    const tag = Date.now().toString(36);
    const good = (await upsertShowcase(entry(`Good ${tag}`, `good-${tag}`, 51.507, -0.128, 'London'), 'GB', { countries: ['GB'], source: 'curated', approve: true }, stats))!;
    // Far from the city it claims to be in: must be left for a person.
    const bad = (await upsertShowcase(entry(`Bad ${tag}`, `bad-${tag}`, 55.95, -3.19, 'London'), 'GB', { countries: ['GB'], source: 'curated', approve: true }, stats))!;

    const admin = await login(undefined, 'admin');
    const user = await login();
    expect((await app.inject({ method: 'POST', url: '/v1/admin/showcase/locations/verify-passed', headers: user.headers, payload: {} })).statusCode).toBe(403);
    const dry = json(await app.inject({ method: 'POST', url: '/v1/admin/showcase/locations/verify-passed', headers: admin.headers, payload: { country: 'GB' } }));
    expect(dry.applied).toBe(false);
    expect(dry.leftForReview.map((x: { id: string }) => x.id)).toContain(bad.id);
    const verified = async (id: string) => (await db.select().from(schema.plots).where(eq(schema.plots.id, id)))[0]!.showcase!.locationVerified ?? false;
    expect(await verified(good.id)).toBe(false); // dry run changed nothing

    const done = json(await app.inject({ method: 'POST', url: '/v1/admin/showcase/locations/verify-passed', headers: admin.headers, payload: { apply: true, country: 'GB' } }));
    expect(done.applied).toBe(true);
    expect(await verified(good.id)).toBe(true);
    expect(await verified(bad.id)).toBe(false);
  });

  it('lists the nearest public plots to a point, closest first', async () => {
    config.SHOWCASE_REQUIRE_LOCATION_CHECK = 'false'; // an earlier test turns the production gate on
    const { upsertShowcase } = await import('../src/showcase/generator.js');
    const stats = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] as string[], plots: [] as string[] };
    const tag = Date.now().toString(36);
    await upsertShowcase(entry(`Near ${tag}`, `near-${tag}`, -54.81, -68.30, 'Ushuaia'), 'AR', { countries: ['AR'], source: 'curated', approve: true }, stats);
    await upsertShowcase(entry(`Far ${tag}`, `far-${tag}`, -51.62, -69.21, 'Rio Gallegos'), 'AR', { countries: ['AR'], source: 'curated', approve: true }, stats);
    const r = json(await app.inject({ url: '/v1/plots/nearest?lat=-54.80&lng=-68.31&limit=2' }));
    expect(r.plots).toHaveLength(2);
    expect(r.plots[0].slug).toBe(`near-${tag}`);
    expect(r.plots[0].distanceKm).toBeLessThan(r.plots[1].distanceKm);
    expect((await app.inject({ url: '/v1/plots/nearest?lat=200&lng=0' })).statusCode).toBe(400);
  });
});

describe('handles and share links (G5)', () => {
  it('resolves @handle to the owner and their public plots, primary first', async () => {
    const u = await login();
    const handle = `h${Date.now().toString(36)}`.slice(0, 20);
    expect((await app.inject({ method: 'PATCH', url: '/v1/me', headers: u.headers, payload: { username: handle } })).statusCode).toBe(200);
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: u.headers, payload: { rect: freeRect() } })).plot;
    await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: u.headers, payload: { publish: true } });
    const r = json(await app.inject({ url: `/v1/handles/${handle}` }));
    expect(r).toMatchObject({ type: 'user', handle });
    expect(r.plots[0].slug).toBe(plot.slug);
    expect((await app.inject({ url: '/v1/handles/nobody_here_zz9' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/v1/handles/bad%20name' })).statusCode).toBe(400);
  });

  it('reserves system names and the names of companies with reserved land', async () => {
    const { upsertShowcase } = await import('../src/showcase/generator.js');
    const tag = Date.now().toString(36).slice(-5);
    const brand = `Zeta Widgets ${tag}`;
    const stats = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] as string[], plots: [] as string[] };
    await upsertShowcase(
      { kind: 'company', sector: 'tech', city: 'Oslo', lat: 59.91, lng: 10.75, website: 'https://example.org', title: 't', tagline: 'tag', description: 'd', useCase: 'demo', cta: null, highlights: ['a'], imagePrompt: 'x', palette: ['#112233', '#445566', '#778899'], motif: 'city', size: { w: 2, h: 2 }, tags: ['x'], brand, slug: `zeta-${tag}` },
      'NO',
      { countries: ['NO'], source: 'curated', approve: true },
      stats,
    );
    const u = await login();
    const tryName = async (username: string) => app.inject({ method: 'PATCH', url: '/v1/me', headers: u.headers, payload: { username } });
    const company = await tryName(`zeta_widgets_${tag}`); // look-alike of the company name
    expect(company.statusCode).toBe(409);
    expect(company.body).toMatch(/reserved for a company/);
    expect((await tryName('admin')).statusCode).toBe(409);
    expect((await tryName('flatmeta_io')).statusCode).toBe(409);
    const avail = json(await app.inject({ url: `/v1/handles/zetawidgets${tag}/available`, headers: u.headers }));
    expect(avail).toMatchObject({ available: false });
    expect(json(await app.inject({ url: `/v1/handles/free_${tag}/available`, headers: u.headers }))).toMatchObject({ available: true });
    expect((await app.inject({ url: `/v1/handles/free_${tag}/available` })).statusCode).toBe(401);
  });
});

describe('unique visitors (G6)', () => {
  it('counts each visitor once a day, not owners or bots, and never stores an IP', async () => {
    const owner = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
    const visit = (ip: string, ua: string, headers: Record<string, string> = {}) =>
      app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/visit`, remoteAddress: ip, headers: { 'user-agent': ua, ...headers } });
    const UA = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140 Safari/537.36';
    await visit('203.0.113.7', UA);
    await visit('203.0.113.7', UA); // same visitor again
    await visit('198.51.100.9', UA); // someone else
    await visit('192.0.2.1', 'Googlebot/2.1 (+http://www.google.com/bot.html)'); // a bot
    await visit('192.0.2.2', UA, owner.headers); // the owner
    const v = json(await app.inject({ url: `/v1/plots/${plot.id}/visitors` }));
    expect(v.today).toBe(2);
    expect(v.week).toBe(2);
    expect(v.total).toBe(2);

    const { redis } = await import('../src/lib/redis.js');
    const keys = await redis.keys('*');
    expect(keys.join(' ')).not.toMatch(/203\.0\.113\.7|198\.51\.100\.9/);
    for (const k of keys.filter((x) => x.includes(':uv:') || x.includes(':visit:'))) {
      const type = await redis.type(k);
      if (type === 'string') expect(String(await redis.get(k))).not.toMatch(/203\.0\.113\.7|198\.51\.100\.9/);
    }
    expect((await app.inject({ url: '/v1/plots/not-a-uuid/visitors' })).statusCode).toBe(400);
  });
});
