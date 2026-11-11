import { and, asc, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { publicShowcase } from '../lib/visibility.js';
import { z } from 'zod';
import type { App } from '../app.js';
import { db, schema } from '../db/client.js';
import type { Plot } from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { flagEmoji } from '../lib/geo.js';
import { lngLatToCell } from '../lib/grid.js';
import { recordAction } from '../game/engine.js';
import { top } from '../game/leaderboards.js';
import { ownersFor, plotView } from './views.js';
import { visiblePlot } from './plots.js';

async function views(rows: Plot[]) {
  const owners = await ownersFor(rows);
  return rows.map((p) => plotView(p, owners.get(p.id) ?? null));
}

export default async function regionRoutes(app: App) {
  app.get('/v1/countries', { schema: { tags: ['regions'], summary: 'All countries with land stats' } }, async () => {
    const rows = await db.select().from(schema.countries).orderBy(desc(sql`${schema.countries.plotCount} + ${schema.countries.showcaseCount}`), asc(schema.countries.name));
    return { countries: rows.map((c) => ({ ...c, flag: flagEmoji(c.code) })) };
  });

  app.get('/v1/countries/:code', { schema: { tags: ['regions'], summary: 'A country page', params: z.object({ code: z.string().length(2) }) } }, async (req) => {
    const code = req.params.code.toUpperCase();
    const [country] = await db.select().from(schema.countries).where(eq(schema.countries.code, code));
    if (!country) throw notFound('Country');
    const P = schema.plots;
    const base = and(eq(P.countryCode, code), visiblePlot());
    const [trending, showcase, newest, cities, leaders, explorers] = await Promise.all([
      db.select().from(P).where(and(base, eq(P.status, 'active'), isNotNull(P.publishedAt))).orderBy(desc(sql`${P.likesCount} * 3 + ${P.visitsCount}`)).limit(12),
      db.select().from(P).where(and(base, eq(P.status, 'showcase'))).orderBy(desc(P.cellCount)).limit(24),
      db.select().from(P).where(and(base, eq(P.status, 'active'))).orderBy(desc(P.createdAt)).limit(12),
      db.select().from(schema.regions).where(eq(schema.regions.countryCode, code)).orderBy(desc(schema.regions.population)),
      top('cells-country', { country: code, limit: 10 }),
      db.select({ n: sql<number>`count(*)::int` }).from(schema.userCountryVisits).where(eq(schema.userCountryVisits.countryCode, code)),
    ]);
    return {
      country: { ...country, flag: flagEmoji(code), explorers: explorers[0]?.n ?? 0 },
      cities,
      trending: await views(trending),
      showcase: await views(showcase),
      newest: await views(newest),
      leaderboard: leaders.rows,
    };
  });

  app.post('/v1/countries/:code/visit', { schema: { tags: ['regions'], summary: 'Record a country visit', params: z.object({ code: z.string().length(2) }) } }, async (req) => {
    if (!req.user) return { game: null };
    const code = req.params.code.toUpperCase();
    const inserted = await db.insert(schema.userCountryVisits).values({ userId: req.user.id, countryCode: code }).onConflictDoNothing().returning();
    return { game: inserted.length ? await recordAction(req.user.id, 'visit_country', { ref: code }) : null };
  });

  app.get('/v1/regions', { schema: { tags: ['regions'], summary: 'Featured cities', querystring: z.object({ country: z.string().length(2).optional() }) } }, async (req) => {
    const R = schema.regions;
    const rows = await db
      .select()
      .from(R)
      .where(req.query.country ? eq(R.countryCode, req.query.country.toUpperCase()) : undefined)
      .orderBy(desc(R.population));
    return { regions: rows };
  });

  app.get('/v1/regions/:slug', { schema: { tags: ['regions'], summary: 'A city page', params: z.object({ slug: z.string().max(60) }) } }, async (req) => {
    const [region] = await db.select().from(schema.regions).where(eq(schema.regions.slug, req.params.slug));
    if (!region) throw notFound('Region');
    const c = lngLatToCell(region.lng, region.lat);
    const R = 160; // ≈ 20–30 km
    const P = schema.plots;
    const area = and(lte(P.minGx, c.gx + R), gte(P.maxGx, c.gx - R), lte(P.minGy, c.gy + R), gte(P.maxGy, c.gy - R), visiblePlot());
    const [trending, showcase, newest, stats] = await Promise.all([
      db.select().from(P).where(and(area, eq(P.status, 'active'), isNotNull(P.publishedAt))).orderBy(desc(sql`${P.likesCount} * 3 + ${P.visitsCount}`)).limit(12),
      db.select().from(P).where(and(area, eq(P.status, 'showcase'))).orderBy(desc(P.cellCount)).limit(24),
      db.select().from(P).where(and(area, eq(P.status, 'active'))).orderBy(desc(P.createdAt)).limit(12),
      db
        .select({ plots: sql<number>`count(*) filter (where ${P.status} = 'active')::int`, cells: sql<number>`coalesce(sum(${P.cellCount}) filter (where ${P.status} = 'active'), 0)::int`, showcase: sql<number>`count(*) filter (where ${publicShowcase()})::int` })
        .from(P)
        .where(area),
    ]);
    const nearby = await db
      .select()
      .from(schema.regions)
      .where(and(eq(schema.regions.countryCode, region.countryCode), sql`${schema.regions.slug} <> ${region.slug}`))
      .orderBy(desc(schema.regions.population))
      .limit(8);
    return {
      region: { ...region, flag: flagEmoji(region.countryCode), ...(stats[0] ?? { plots: 0, cells: 0, showcase: 0 }) },
      trending: await views(trending),
      showcase: await views(showcase),
      newest: await views(newest),
      nearby,
    };
  });

  app.post('/v1/regions/:slug/visit', { schema: { tags: ['regions'], summary: 'Record a city visit', params: z.object({ slug: z.string().max(60) }) } }, async (req) => {
    const user = req.user;
    if (!user) return { game: null };
    return { game: await recordAction(user.id, 'visit_region', { ref: req.params.slug }) };
  });

}

/** Everything public worth indexing, for the web app's sitemap.xml (cached by the web app). */
export async function sitemapRoutes(app: App) {
  app.get('/v1/sitemap', { schema: { tags: ['regions'], summary: 'Public URLs for the sitemap' } }, async () => {
    const [plots, countries, regions, users, orgs] = await Promise.all([
      db.select({ slug: schema.plots.slug, title: schema.plots.title, hasCover: sql<boolean>`${schema.plots.coverImageUrl} is not null`, updatedAt: schema.plots.updatedAt }).from(schema.plots).where(visiblePlot()).orderBy(desc(schema.plots.updatedAt)).limit(45000),
      db.select({ code: schema.countries.code }).from(schema.countries).where(sql`${schema.countries.plotCount} > 0`),
      db.select({ slug: schema.regions.slug }).from(schema.regions),
      db
        .select({ username: schema.users.username, updatedAt: schema.users.updatedAt })
        .from(schema.users)
        .where(sql`${schema.users.bannedAt} is null and exists (select 1 from plots p where p.owner_user_id = ${schema.users.id} and p.status = 'active')`)
        .limit(20000),
      db.select({ slug: schema.organizations.slug, updatedAt: schema.organizations.updatedAt }).from(schema.organizations).limit(10000),
    ]);
    return {
      plots,
      countries: countries.map((c) => c.code),
      regions: regions.map((r) => r.slug),
      users,
      orgs,
    };
  });
}
