import { audit } from '../lib/audit.js';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { db, schema } from '../db/client.js';
import { requireUser } from '../lib/auth.js';
import { dailyCap } from '../lib/caps.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { stripText } from '../lib/markdown.js';
import { heuristicModeration } from '../ai/moderation.js';
import { OPEN_HOUSE_RULES, liveOpenHouses, peopleHereNow, rsvpState, upcomingFor } from '../services/open-houses.js';
import { loadPlot } from './plots.js';
import { assertCanEditPlot } from './views.js';

const tags = ['social'];

/** Open houses and "people here now" (G10). */
export default async function openHouseRoutes(app: App) {
  const publicPlot = async (id: string) => {
    const plot = await loadPlot(id);
    if (!plot || plot.status !== 'active' || plot.moderationStatus === 'rejected') throw notFound('Plot');
    return plot;
  };

  app.get(
    '/v1/plots/:id/open-houses',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } }, schema: { tags, summary: 'Upcoming open houses on a plot, and how many people are there now', params: z.object({ id: z.string().max(80) }) } },
    async (req) => {
      const plot = await publicPlot(req.params.id);
      const list = await upcomingFor(plot.id);
      const { counts, mine } = await rsvpState(list.map((o) => o.id), req.user?.id ?? null);
      const now = Date.now();
      return {
        hereNow: await peopleHereNow(plot),
        openHouses: list.map((o) => ({
          id: o.id,
          title: o.title,
          startsAt: o.startsAt,
          endsAt: o.endsAt,
          live: o.startsAt.getTime() <= now && o.endsAt.getTime() > now,
          going: counts.get(o.id) ?? 0,
          notifyMe: mine.has(o.id),
        })),
      };
    },
  );

  app.get(
    '/v1/plots/:id/here-now',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } }, schema: { tags, summary: 'How many people are at a plot right now', params: z.object({ id: z.string().max(80) }) } },
    async (req) => ({ hereNow: await peopleHereNow(await publicPlot(req.params.id)) }),
  );

  app.get('/v1/open-houses/now', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { tags, summary: 'Open houses happening now, with people there' } }, async () => ({
    openHouses: await liveOpenHouses(),
  }));

  app.post(
    '/v1/plots/:id/open-houses',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags,
        summary: 'Schedule an open house on my plot',
        params: z.object({ id: z.uuid() }),
        body: z.object({ title: z.string().min(3).max(80), startsAt: z.iso.datetime({ offset: true }), minutes: z.number().int().min(OPEN_HOUSE_RULES.minMinutes).max(OPEN_HOUSE_RULES.maxMinutes) }),
      },
    },
    async (req, reply) => {
      const user = requireUser(req);
      const plot = await loadPlot(req.params.id);
      if (!plot) throw notFound('Plot');
      await assertCanEditPlot(user, plot);
      if (plot.status !== 'active' || !plot.publishedAt) throw badRequest('Publish your plot before scheduling an open house.');
      await dailyCap(user.id, 'open-house', 10, 'open houses');
      const startsAt = new Date(req.body.startsAt);
      const now = Date.now();
      if (startsAt.getTime() < now - 5 * 60_000) throw badRequest('Pick a time in the future.');
      if (startsAt.getTime() > now + OPEN_HOUSE_RULES.maxDaysAhead * 86400_000) throw badRequest(`Open houses can be up to ${OPEN_HOUSE_RULES.maxDaysAhead} days ahead.`);
      const title = stripText(req.body.title, 80);
      if (heuristicModeration(title).score >= 0.9) throw badRequest('Please choose a friendlier title.');
      const endsAt = new Date(startsAt.getTime() + req.body.minutes * 60_000);
      const upcoming = await upcomingFor(plot.id);
      if (upcoming.length >= OPEN_HOUSE_RULES.maxUpcomingPerPlot) throw conflict(`A plot can have ${OPEN_HOUSE_RULES.maxUpcomingPerPlot} upcoming open houses at most.`);
      if (upcoming.some((o) => o.startsAt < endsAt && o.endsAt > startsAt)) throw conflict('That overlaps another open house on this plot.');
      const [row] = await db.insert(schema.openHouses).values({ plotId: plot.id, title, startsAt, endsAt, createdBy: user.id }).returning();
      await audit(user.id, 'plot.open_house', 'plot', plot.id, { openHouseId: row!.id });
      return reply.code(201).send({ openHouse: row });
    },
  );

  app.delete(
    '/v1/open-houses/:id',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags, summary: 'Cancel an open house', params: z.object({ id: z.uuid() }) } },
    async (req) => {
      const user = requireUser(req);
      const [oh] = await db.select().from(schema.openHouses).where(eq(schema.openHouses.id, req.params.id));
      if (!oh || oh.canceledAt) throw notFound('Open house');
      const plot = await loadPlot(oh.plotId);
      if (!plot) throw forbidden();
      await assertCanEditPlot(user, plot);
      await db.update(schema.openHouses).set({ canceledAt: new Date() }).where(eq(schema.openHouses.id, oh.id));
      await audit(user.id, 'plot.open_house_cancel', 'plot', plot.id, { openHouseId: oh.id });
      return { ok: true };
    },
  );

  const rsvpTarget = async (id: string) => {
    const [oh] = await db
      .select()
      .from(schema.openHouses)
      .where(and(eq(schema.openHouses.id, id), isNull(schema.openHouses.canceledAt), gt(schema.openHouses.endsAt, new Date())));
    if (!oh) throw notFound('Open house');
    return oh;
  };

  app.post(
    '/v1/open-houses/:id/rsvp',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags, summary: 'Notify me when this open house starts', params: z.object({ id: z.uuid() }) } },
    async (req) => {
      const user = requireUser(req);
      const oh = await rsvpTarget(req.params.id);
      await db.insert(schema.openHouseRsvps).values({ openHouseId: oh.id, userId: user.id }).onConflictDoNothing();
      const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.openHouseRsvps).where(eq(schema.openHouseRsvps.openHouseId, oh.id));
      return { notifyMe: true, going: n?.n ?? 1 };
    },
  );

  app.delete(
    '/v1/open-houses/:id/rsvp',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags, summary: 'Stop notifying me', params: z.object({ id: z.uuid() }) } },
    async (req) => {
      const user = requireUser(req);
      await db.delete(schema.openHouseRsvps).where(and(eq(schema.openHouseRsvps.openHouseId, req.params.id), eq(schema.openHouseRsvps.userId, user.id)));
      return { notifyMe: false };
    },
  );
}
