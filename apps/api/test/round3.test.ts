import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis, key, redis } from '../src/lib/redis.js';
import type { App } from '../src/app.js';
import { getApp, login } from './helpers.js';

/** Round 3: founding places (R3d). */
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

describe('R3d founding places are counted, never invented', () => {
  it('taken = completed company claims + active Business/Brand subscriptions; 0 seats hides it', async () => {
    await redis.del(key('founding-seats'));
    const before = json(await app.inject({ url: '/v1/billing/plans' })).founding;
    expect(before).toMatchObject({ total: 50 });
    expect(before.left).toBe(50 - before.taken);

    const u = await login();
    await db.insert(schema.subscriptions).values({ userId: u.user.id, plan: 'business', interval: 'month', status: 'active', stripeSubscriptionId: `sub_r3d_${Date.now()}` });
    await db.insert(schema.subscriptions).values({ userId: u.user.id, plan: 'plus', interval: 'month', status: 'active', stripeSubscriptionId: `sub_r3d_plus_${Date.now()}` });
    await redis.del(key('founding-seats'));
    const after = json(await app.inject({ url: '/v1/billing/plans' })).founding;
    expect(after.taken).toBe(before.taken + 1); // Plus does not count

    const { config } = await import('../src/config.js');
    const seats = config.FOUNDING_SEATS;
    config.FOUNDING_SEATS = 0;
    try {
      expect(json(await app.inject({ url: '/v1/billing/plans' })).founding).toBeNull();
    } finally {
      config.FOUNDING_SEATS = seats;
    }
  });
});
