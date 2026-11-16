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
