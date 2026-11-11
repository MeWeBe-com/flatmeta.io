import { and, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { CITIES } from '../data/cities.js';
import { db, schema } from '../db/client.js';
import { allCountries, flagEmoji } from '../lib/geo.js';
import { geocode, parseIntent } from '../ai/search.js';
import { ownersFor, plotView, publicOrg, publicUser } from './views.js';
import { visiblePlot } from './plots.js';

/** Unified search (shared by GET /v1/search and Ask FlatMeta). */
export async function runSearch(qIn: string, ai: boolean, limit: number) {
    const q = qIn.trim();
    const useAi = ai && q.split(/\s+/).length > 1;
    const { intent, provider } = await parseIntent(q, useAi);
    const term = (useAi ? intent.keywords : q).trim();
    const lower = q.toLowerCase();

    const places = intent.place ? await geocode(intent.place, 3) : await geocode(q, 5);
    const anchor = intent.place ? places[0] : undefined;

    const P = schema.plots;
    const where: SQL[] = [visiblePlot(), sql`(${P.publishedAt} is not null or ${P.status} = 'showcase')`];
    if (term) {
      where.push(
        sql`(${P.search} @@ plainto_tsquery('simple', ${term}) or ${P.title} % ${term} or ${P.title} ilike ${'%' + term + '%'} or ${P.slug} ilike ${'%' + term.replace(/\s+/g, '-') + '%'} or ${P.showcase}->>'brand' ilike ${'%' + term + '%'} or ${term} = any(${P.tags}))`,
      );
    }
    if (useAi && intent.category) where.push(sql`(${P.category} = ${intent.category} or ${P.showcase}->>'sector' = ${intent.category.split(' ')[0]})`);
    if (useAi && intent.country) where.push(eq(P.countryCode, intent.country));
    if (useAi && intent.kind === 'business') where.push(isNotNull(P.business));
    if (useAi && intent.kind === 'showcase') where.push(eq(P.status, 'showcase'));
    const order =
      anchor
        ? sql`(${P.centerLat} - ${anchor.lat})^2 + ((${P.centerLng} - ${anchor.lng}) * cos(radians(${anchor.lat})))^2`
        : intent.sort === 'new'
          ? desc(P.createdAt)
          : intent.sort === 'loved'
            ? desc(P.likesCount)
            : term
              ? desc(sql`ts_rank(${P.search}, plainto_tsquery('simple', ${term})) + similarity(${P.title}, ${term}) + ${P.likesCount} * 0.001`)
              : desc(P.likesCount);
    let plots = await db.select().from(P).where(and(...where)).orderBy(order).limit(limit);
    // Natural-language queries with a place but no keyword match: show what's near the place instead.
    if (!plots.length && anchor) {
      plots = await db
        .select()
        .from(P)
        .where(and(visiblePlot(), sql`(${P.publishedAt} is not null or ${P.status} = 'showcase')`))
        .orderBy(sql`(${P.centerLat} - ${anchor.lat})^2 + ((${P.centerLng} - ${anchor.lng}) * cos(radians(${anchor.lat})))^2`)
        .limit(limit);
    }
    const owners = await ownersFor(plots);

    const users = intent.kind === 'any' || intent.kind === 'people'
      ? await db
          .select()
          .from(schema.users)
          .where(and(isNull(schema.users.bannedAt), or(ilike(schema.users.username, `%${term}%`), ilike(schema.users.displayName, `%${term}%`))))
          .orderBy(desc(schema.users.xp))
          .limit(5)
      : [];
    const orgs = await db
      .select()
      .from(schema.organizations)
      .where(or(ilike(schema.organizations.name, `%${term}%`), ilike(schema.organizations.slug, `%${term}%`)))
      .limit(5);
    const countries = allCountries()
      .filter((c) => c.name.toLowerCase().includes(lower) || c.code.toLowerCase() === lower)
      .slice(0, 5)
      .map((c) => ({ code: c.code, name: c.name, flag: flagEmoji(c.code), lat: c.lat, lng: c.lng }));
    const regions = CITIES.filter((c) => c.name.toLowerCase().includes(lower)).slice(0, 5);

    return {
      query: q,
      intent: useAi ? { ...intent, provider } : null,
      plots: plots.map((p) => plotView(p, owners.get(p.id) ?? null)),
      users: users.map(publicUser),
      orgs: orgs.map(publicOrg),
      countries,
      regions,
      places,
    };
}

export default async function searchRoutes(app: App) {
  app.get(
    '/v1/search',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['search'],
        summary: 'Unified search: plots, people, organisations, countries, cities and places. ai=1 parses natural language.',
        querystring: z.object({ q: z.string().min(1).max(200), ai: z.coerce.boolean().default(false), limit: z.coerce.number().int().min(1).max(30).default(8) }),
      },
    },
    async (req) => runSearch(req.query.q, req.query.ai, req.query.limit),
  );

  app.get(
    '/v1/geocode',
    { schema: { tags: ['search'], summary: 'Geocode a place name', querystring: z.object({ q: z.string().min(2).max(120) }) } },
    async (req) => ({ places: await geocode(req.query.q, 6) }),
  );


}
