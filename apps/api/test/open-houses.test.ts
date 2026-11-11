import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis, key, redis } from '../src/lib/redis.js';
import { announceOpenHouses } from '../src/services/open-houses.js';
import type { App } from '../src/app.js';
import { freeRect, getApp, login } from './helpers.js';

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
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

async function publishedPlot() {
  const owner = await login();
  const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
  await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/publish`, headers: owner.headers });
  return { owner, plot };
}

describe('open houses (G10)', () => {
  it('only the owner schedules, with sane times, no overlaps and at most five upcoming', async () => {
    const { owner, plot } = await publishedPlot();
    const stranger = await login();
    const body = { title: 'Coffee at my plot', startsAt: inMinutes(60), minutes: 60 };
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/open-houses`, payload: body })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/open-houses`, headers: stranger.headers, payload: body })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/open-houses`, headers: owner.headers, payload: { ...body, startsAt: inMinutes(-120) } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/open-houses`, headers: owner.headers, payload: { ...body, startsAt: inMinutes(61 * 24 * 60) } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/open-houses`, headers: owner.headers, payload: { ...body, minutes: 5 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/open-houses`, headers: owner.headers, payload: { ...body, startsAt: 'tomorrow' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/open-houses`, headers: owner.headers, payload: body })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/open-houses`, headers: owner.headers, payload: { ...body, startsAt: inMinutes(90) } })).statusCode).toBe(409); // overlap
    for (let i = 1; i <= 4; i++) {
      expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/open-houses`, headers: owner.headers, payload: { ...body, startsAt: inMinutes(60 + i * 24 * 60) } })).statusCode).toBe(201);
    }
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/open-houses`, headers: owner.headers, payload: { ...body, startsAt: inMinutes(60 + 10 * 24 * 60) } })).statusCode).toBe(409); // five upcoming
    const list = json(await app.inject({ url: `/v1/plots/${plot.id}/open-houses` }));
    expect(list.openHouses).toHaveLength(5);
    // the owner can cancel; others can't
    const first = list.openHouses[0].id;
    expect((await app.inject({ method: 'DELETE', url: `/v1/open-houses/${first}`, headers: stranger.headers })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/v1/open-houses/${first}`, headers: owner.headers })).statusCode).toBe(200);
    expect(json(await app.inject({ url: `/v1/plots/${plot.id}/open-houses` })).openHouses).toHaveLength(4);
  });

  it('an unpublished plot can’t have one', async () => {
    const owner = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
    const res = await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/open-houses`, headers: owner.headers, payload: { title: 'Hello', startsAt: inMinutes(30), minutes: 30 } });
    expect(res.statusCode).toBe(400);
  });

  it('notifies people who asked, and the owner’s followers, once, when it starts', async () => {
    const { owner, plot } = await publishedPlot();
    const visitor = await login();
    const follower = await login();
    const bystander = await login();
    await db.insert(schema.follows).values({ followerId: follower.user.id, followeeId: owner.user.id });
    const oh = json(await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/open-houses`, headers: owner.headers, payload: { title: 'Launch party', startsAt: inMinutes(5), minutes: 30 } })).openHouse;
    expect((await app.inject({ method: 'POST', url: `/v1/open-houses/${oh.id}/rsvp` })).statusCode).toBe(401);
    expect(json(await app.inject({ method: 'POST', url: `/v1/open-houses/${oh.id}/rsvp`, headers: visitor.headers }))).toMatchObject({ notifyMe: true, going: 1 });
    const seen = json(await app.inject({ url: `/v1/plots/${plot.id}/open-houses`, headers: visitor.headers })).openHouses[0];
    expect(seen).toMatchObject({ notifyMe: true, going: 1, live: false });

    await announceOpenHouses();
    const kinds = async (u: { user: { id: string } }) =>
      (await db.select().from(schema.notifications).where(eq(schema.notifications.userId, u.user.id))).filter((n) => n.kind === 'open_house');
    expect(await kinds(visitor)).toHaveLength(1);
    expect(await kinds(follower)).toHaveLength(1);
    expect(await kinds(bystander)).toHaveLength(0);
    expect(await kinds(owner)).toHaveLength(0);
    expect((await kinds(visitor))[0]!.payload).toMatchObject({ plotSlug: plot.slug, title: 'Launch party' });
    await announceOpenHouses(); // never twice
    expect(await kinds(visitor)).toHaveLength(1);
  });

  it('counts people here now from live presence (fresh only), and lists open houses happening now', async () => {
    const { owner, plot } = await publishedPlot();
    const geo = key('presence', 'geo');
    const ids = [`t-${plot.id}-a`, `t-${plot.id}-b`, `t-${plot.id}-stale`, `t-${plot.id}-far`];
    await redis.geoadd(geo, plot.center.lng, plot.center.lat, ids[0]!, plot.center.lng, plot.center.lat, ids[1]!, plot.center.lng, plot.center.lat, ids[2]!, plot.center.lng + 1, plot.center.lat, ids[3]!);
    await redis.zadd(key('presence'), Date.now(), ids[0]!, Date.now(), ids[1]!, Date.now() - 120_000, ids[2]!, Date.now(), ids[3]!);
    try {
      expect(json(await app.inject({ url: `/v1/plots/${plot.id}/here-now` })).hereNow).toBe(2);
      await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/open-houses`, headers: owner.headers, payload: { title: 'Open now', startsAt: inMinutes(-1), minutes: 30 } });
      const now = json(await app.inject({ url: '/v1/open-houses/now' })).openHouses;
      expect(now.find((o: { plot: { id: string } }) => o.plot.id === plot.id)).toMatchObject({ title: 'Open now', hereNow: 2 });
    } finally {
      await redis.zrem(geo, ...ids);
      await redis.zrem(key('presence'), ...ids);
    }
  });
});
