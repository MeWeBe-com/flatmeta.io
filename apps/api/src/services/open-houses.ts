import { and, asc, eq, gt, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { haversineKm } from '../lib/geo.js';
import { rectBounds } from '../lib/grid.js';
import { key, redis } from '../lib/redis.js';
import { notify } from '../game/activity.js';

type Plot = typeof schema.plots.$inferSelect;

/**
 * Open houses (G10): an owner sets a time when they will be at their plot. Visitors press "Notify me", and they and
 * the owner's followers get a notification (in-app and live) when it starts. The map shows "people here now".
 */
export const OPEN_HOUSE_RULES = { minMinutes: 15, maxMinutes: 240, maxDaysAhead: 60, maxUpcomingPerPlot: 5, leadMinutes: 10 };

export async function upcomingFor(plotId: string) {
  return db
    .select()
    .from(schema.openHouses)
    .where(and(eq(schema.openHouses.plotId, plotId), isNull(schema.openHouses.canceledAt), gt(schema.openHouses.endsAt, new Date())))
    .orderBy(asc(schema.openHouses.startsAt))
    .limit(OPEN_HOUSE_RULES.maxUpcomingPerPlot);
}

export async function rsvpState(openHouseIds: string[], userId: string | null) {
  if (!openHouseIds.length) return { counts: new Map<string, number>(), mine: new Set<string>() };
  const rows = await db
    .select({ id: schema.openHouseRsvps.openHouseId, n: sql<number>`count(*)::int`, me: sql<boolean>`bool_or(${schema.openHouseRsvps.userId} = ${userId ?? '00000000-0000-0000-0000-000000000000'})` })
    .from(schema.openHouseRsvps)
    .where(inArray(schema.openHouseRsvps.openHouseId, openHouseIds))
    .groupBy(schema.openHouseRsvps.openHouseId);
  return { counts: new Map(rows.map((r) => [r.id, r.n])), mine: new Set(rows.filter((r) => r.me).map((r) => r.id)) };
}

/**
 * People on the map standing on (or right next to) this plot now: live sockets in the presence index, seen in the
 * last 45 s. Counts only; who they are stays private.
 */
export async function peopleHereNow(plot: Pick<Plot, 'minGx' | 'minGy' | 'maxGx' | 'maxGy'>): Promise<number> {
  const b = rectBounds({ minGx: plot.minGx, minGy: plot.minGy, maxGx: plot.maxGx, maxGy: plot.maxGy });
  const lat = (b.south + b.north) / 2;
  const lng = (b.west + b.east) / 2;
  const wKm = haversineKm(lat, b.west, lat, b.east) + 0.06; // a little margin around the edges
  const hKm = haversineKm(b.south, lng, b.north, lng) + 0.06;
  try {
    const ids = (await redis.geosearch(key('presence', 'geo'), 'FROMLONLAT', lng, lat, 'BYBOX', wKm, hKm, 'km', 'COUNT', 500)) as string[];
    if (!ids.length) return 0;
    const scores = await redis.zmscore(key('presence'), ...ids);
    const fresh = Date.now() - 45_000;
    return scores.filter((s) => s !== null && Number(s) >= fresh).length;
  } catch {
    return 0;
  }
}

/** Sends the "starting now" notifications (worker job, every minute). Each open house is announced once. */
export async function announceOpenHouses(now = new Date()) {
  const soon = new Date(now.getTime() + OPEN_HOUSE_RULES.leadMinutes * 60_000);
  const due = await db
    .select({ oh: schema.openHouses, plot: schema.plots })
    .from(schema.openHouses)
    .innerJoin(schema.plots, eq(schema.plots.id, schema.openHouses.plotId))
    .where(and(isNull(schema.openHouses.notifiedAt), isNull(schema.openHouses.canceledAt), lte(schema.openHouses.startsAt, soon), gte(schema.openHouses.endsAt, now)))
    .limit(200);
  let sent = 0;
  for (const { oh, plot } of due) {
    // Claim it first, so two workers never announce twice.
    const [claimed] = await db
      .update(schema.openHouses)
      .set({ notifiedAt: now })
      .where(and(eq(schema.openHouses.id, oh.id), isNull(schema.openHouses.notifiedAt)))
      .returning({ id: schema.openHouses.id });
    if (!claimed || plot.status !== 'active') continue;
    const rsvps = await db.select({ userId: schema.openHouseRsvps.userId }).from(schema.openHouseRsvps).where(eq(schema.openHouseRsvps.openHouseId, oh.id));
    const followers = plot.ownerUserId
      ? await db.select({ userId: schema.follows.followerId }).from(schema.follows).where(eq(schema.follows.followeeId, plot.ownerUserId))
      : [];
    const to = new Set([...rsvps, ...followers].map((r) => r.userId));
    if (plot.ownerUserId) to.delete(plot.ownerUserId);
    for (const userId of to) {
      await notify(userId, 'open_house', { openHouseId: oh.id, title: oh.title, plotId: plot.id, plotSlug: plot.slug, plotTitle: plot.title, startsAt: oh.startsAt.toISOString() });
      sent++;
    }
  }
  return { due: due.length, sent };
}

/** Open houses happening right now, for the map ("Happening now"). */
export async function liveOpenHouses(limit = 20) {
  const now = new Date();
  const rows = await db
    .select({ oh: schema.openHouses, plot: schema.plots })
    .from(schema.openHouses)
    .innerJoin(schema.plots, eq(schema.plots.id, schema.openHouses.plotId))
    .where(and(isNull(schema.openHouses.canceledAt), lte(schema.openHouses.startsAt, now), gt(schema.openHouses.endsAt, now), eq(schema.plots.status, 'active')))
    .orderBy(asc(schema.openHouses.endsAt))
    .limit(limit);
  return Promise.all(
    rows.map(async ({ oh, plot }) => ({
      id: oh.id,
      title: oh.title,
      startsAt: oh.startsAt,
      endsAt: oh.endsAt,
      hereNow: await peopleHereNow(plot),
      plot: { id: plot.id, slug: plot.slug, title: plot.title, center: { lat: plot.centerLat, lng: plot.centerLng }, thumbUrl: plot.thumbUrl },
    })),
  );
}
