import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { config } from '../src/config.js';
import { parseCompanies } from '../src/companies/wikidata.js';
import { artFor, processCountry, runCompanyLand } from '../src/companies/land.js';
import { setTxtResolver } from '../src/services/dns-verify.js';
import { takedownSla } from '../src/jobs/maintenance.js';
import { slugify } from '../src/lib/slug.js';
import type { App } from '../src/app.js';
import { getApp, login } from './helpers.js';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/wikidata-ca.json', import.meta.url), 'utf8'));
const fakeFetch = (async () => new Response(JSON.stringify(FIXTURE), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
const facts = parseCompanies(FIXTURE);

let app: App;
beforeAll(async () => {
  app = await getApp();
  // The test database is kept between runs: start from a clean slate for the fixture's companies.
  await db.delete(schema.companySources).where(inArray(schema.companySources.sourceId, facts.map((f) => f.sourceId)));
  await db.delete(schema.plots).where(inArray(schema.plots.slug, facts.map((f) => slugify(f.name))));
});
afterAll(async () => {
  setTxtResolver(null);
  await app.close();
  await pool.end();
  await closeRedis();
});
const json = (res: { body: string }) => JSON.parse(res.body);

describe('company land from Wikidata (G12)', () => {
  it('parses one fact per company, preferring address-level headquarters coordinates', () => {
    const ids = facts.map((f) => f.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
    const fedex = facts.find((f) => f.name === 'FedEx')!;
    expect(fedex.precision).toBe('address');
    expect(facts.find((f) => f.name === 'Air Canada')!).toMatchObject({ precision: 'city', website: expect.stringMatching(/^https:/) });
    expect(facts[0]!.popularity).toBeGreaterThanOrEqual(facts.at(-1)!.popularity);
    expect(artFor('financial services').sector).toBe('Finance');
    expect(artFor('air transport').motif).toBe('wing');
    expect(artFor(null).sector).toBe('Business');
  });

  it('creates labelled, generic, sourced plots near the HQ; skips HQs abroad (handed to that country); hidden until checked', async () => {
    const run = await processCountry('CA', 5, { fetcher: fakeFetch });
    expect(run.created, JSON.stringify(run.skipped)).toHaveLength(5);
    expect(run.created).not.toContain('FedEx'); // Memphis
    expect(run.skipped.find((s) => s.name === 'FedEx')?.reason).toBe('headquarters in US');
    const [fedex] = await db.select().from(schema.companySources).where(eq(schema.companySources.sourceId, facts.find((f) => f.name === 'FedEx')!.sourceId));
    expect(fedex).toMatchObject({ queriedCountry: 'US', status: 'new', license: 'CC0-1.0' });

    const plots = await db.select().from(schema.plots).where(inArray(schema.plots.slug, run.created.map((n) => slugify(n))));
    expect(plots, JSON.stringify(run)).toHaveLength(5);
    for (const p of plots) {
      expect(p.kind).toBe('showcase');
      expect(p.countryCode).toBe('CA');
      expect(p.tagline).toBe(`Reserved for ${p.title}, not affiliated with FlatMeta`);
      expect(p.descriptionMd).toContain('Welcome hall');
      expect(p.descriptionMd).toContain('Showroom');
      expect(p.descriptionMd).toMatch(/wikidata\.org\/wiki\/Q\d+/);
      expect(p.cta).toMatchObject({ label: 'Claim this land', url: expect.stringContaining(`/claim/${p.slug}`) });
      expect(p.showcase).toMatchObject({ source: 'wikidata', license: 'CC0-1.0', approved: true, sourceUrl: expect.stringMatching(/^https:\/\/www\.wikidata\.org\/wiki\/Q/) });
      expect(p.coverImageUrl).toBeTruthy(); // procedural, generic artwork: never a fetched logo
      expect(p.coverImageUrl).not.toMatch(/wikimedia|wikidata|logo/i);
    }
    // Auto-verified only because they sit on their Wikidata HQ point.
    expect(run.verified).toBe(5);
    const rows = await db.select().from(schema.companySources).where(and(eq(schema.companySources.queriedCountry, 'CA'), eq(schema.companySources.status, 'created')));
    expect(rows.length).toBeGreaterThanOrEqual(5);

    // A second run does not create duplicates.
    const again = await processCountry('CA', 2, { fetcher: fakeFetch });
    expect(again.created.filter((n) => run.created.includes(n))).toHaveLength(0);
  });

  it('only shows them once the location check passes, and lists them in the brands directory', async () => {
    const prev = config.SHOWCASE_REQUIRE_LOCATION_CHECK;
    config.SHOWCASE_REQUIRE_LOCATION_CHECK = 'true';
    try {
      const prevAuto = config.COMPANY_LAND_AUTO_VERIFY;
      config.COMPANY_LAND_AUTO_VERIFY = false;
      const run = await processCountry('CA', 1, { fetcher: fakeFetch });
      config.COMPANY_LAND_AUTO_VERIFY = prevAuto;
      const name = run.created[0]!;
      const listed = async () => (json(await app.inject({ url: `/v1/brands?country=CA&q=${encodeURIComponent(name)}` })).brands as { title: string }[]).some((b) => b.title === name);
      expect(await listed()).toBe(false); // hidden: not checked yet
      await db.update(schema.plots).set({ showcase: { ...(await db.select().from(schema.plots).where(eq(schema.plots.slug, slugify(name))))[0]!.showcase!, locationVerified: true } }).where(eq(schema.plots.slug, slugify(name)));
      expect(await listed()).toBe(true);
      const dir = json(await app.inject({ url: '/v1/brands' }));
      expect(dir.countries.find((c: { code: string }) => c.code === 'CA')?.count).toBeGreaterThan(0);
      expect(json(await app.inject({ url: '/v1/sitemap' })).brandCountries).toContain('CA');
    } finally {
      config.SHOWCASE_REQUIRE_LOCATION_CHECK = prev;
    }
  });

  it('the daily job is off in tests unless forced, and the admin trigger is admins-only and dry by default', async () => {
    expect(await runCompanyLand()).toMatchObject({ skipped: expect.stringMatching(/disabled/) });
    const user = await login();
    expect((await app.inject({ method: 'POST', url: '/v1/admin/company-land/run', headers: user.headers, payload: { country: 'CA' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/v1/admin/company-land/run', payload: { country: 'CA' } })).statusCode).toBe(401);
  });

  it('claim by DNS TXT record, then the Brand checkout', async () => {
    const [plot] = await db.select().from(schema.plots).where(and(eq(schema.plots.kind, 'showcase'), eq(schema.plots.status, 'showcase'))).limit(1);
    await db.update(schema.plots).set({ showcase: { ...plot!.showcase!, approved: true } }).where(eq(schema.plots.id, plot!.id));
    const u = await login();
    expect((await app.inject({ method: 'POST', url: `/v1/showcase/${plot!.slug}/claim/dns`, payload: { orgName: 'Xy' } })).statusCode).toBe(401);
    const start = json(await app.inject({ method: 'POST', url: `/v1/showcase/${plot!.slug}/claim/dns`, headers: u.headers, payload: { orgName: plot!.title } }));
    expect(start.record).toMatchObject({ type: 'TXT', host: expect.stringMatching(/^_flatmeta\./), value: expect.stringMatching(/^flatmeta-verify=[A-Za-z0-9]{24}$/) });
    let records: string[][] = [];
    setTxtResolver(async (host) => (host === start.record.host ? records : []));
    expect((await app.inject({ method: 'POST', url: `/v1/showcase/claim/${start.requestId}/verify-dns`, headers: u.headers })).statusCode).toBe(400);
    const stranger = await login();
    expect((await app.inject({ method: 'POST', url: `/v1/showcase/claim/${start.requestId}/verify-dns`, headers: stranger.headers })).statusCode).toBe(404);
    records = [['flatmeta-verify=wrong']];
    expect((await app.inject({ method: 'POST', url: `/v1/showcase/claim/${start.requestId}/verify-dns`, headers: u.headers })).statusCode).toBe(400);
    records = [[start.record.value.slice(0, 20), start.record.value.slice(20)]]; // long TXT values come in chunks
    const ok = json(await app.inject({ method: 'POST', url: `/v1/showcase/claim/${start.requestId}/verify-dns`, headers: u.headers }));
    expect(ok.status).toBe('verified');
    expect(ok.checkoutUrl ?? ok.comingSoon).toBeTruthy();
  });

  it('a takedown not handled within 48 hours hides the plot automatically', async () => {
    const [plot] = await db.select().from(schema.plots).where(and(eq(schema.plots.kind, 'showcase'), eq(schema.plots.status, 'showcase'))).limit(1);
    const res = await app.inject({ method: 'POST', url: `/v1/showcase/${plot!.slug}/takedown`, payload: { name: 'Legal Team', email: 'legal@example.com', message: 'Please remove this plot.' } });
    expect(json(res).message).toMatch(/48 hours/);
    expect((await takedownSla()).hidden).toBe(0); // fresh
    await db.update(schema.takedownRequests).set({ createdAt: new Date(Date.now() - 49 * 3600_000) }).where(and(eq(schema.takedownRequests.plotId, plot!.id), eq(schema.takedownRequests.status, 'open')));
    expect((await takedownSla()).hidden).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(schema.plots).where(eq(schema.plots.id, plot!.id)))[0]!.status).toBe('hidden');
  });
});
