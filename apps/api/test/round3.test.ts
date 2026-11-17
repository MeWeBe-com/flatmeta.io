import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis, key, redis } from '../src/lib/redis.js';
import type { App } from '../src/app.js';
import { getApp, login, freeRect } from './helpers.js';
import { outbox } from '../src/lib/mail.js';
import { eq } from 'drizzle-orm';
import { sendActivationNudges } from '../src/services/onboarding.js';

/** Round 3: founding places (R3d), onboarding and activation emails (R3e). */
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

const settle = () => new Promise((r) => setTimeout(r, 150));

describe('R3e onboarding emails', () => {
  it('a new account gets one welcome email with the claim link; signing in again sends none', async () => {
    const email = `r3e-${Date.now()}@test.dev`;
    const signIn = async () => {
      const code = JSON.parse((await app.inject({ method: 'POST', url: '/v1/auth/request-code', payload: { email } })).body).devCode;
      return app.inject({ method: 'POST', url: '/v1/auth/verify-code', payload: { email, code } });
    };
    expect((await signIn()).statusCode).toBe(200);
    await settle();
    const welcome = outbox.filter((m) => m.to === email && m.type === 'welcome');
    expect(welcome).toHaveLength(1);
    expect(welcome[0]!.text).toContain('/?claim');
    expect(welcome[0]!.subject).toMatch(/your first land is free/);
    await signIn();
    await settle();
    expect(outbox.filter((m) => m.to === email && m.type === 'welcome')).toHaveLength(1);
  });

  it('one activation nudge, 1-7 days after sign-up, only without land and only if product emails are on', async () => {
    const now = new Date();
    const ago = (h: number) => new Date(now.getTime() - h * 3600_000);
    const due = await login();
    const tooNew = await login();
    const tooOld = await login();
    const optedOut = await login();
    const hasLand = await login();
    await db.update(schema.users).set({ createdAt: ago(30) }).where(eq(schema.users.id, due.user.id));
    await db.update(schema.users).set({ createdAt: ago(2) }).where(eq(schema.users.id, tooNew.user.id));
    await db.update(schema.users).set({ createdAt: ago(24 * 9) }).where(eq(schema.users.id, tooOld.user.id));
    await db.update(schema.users).set({ createdAt: ago(30), weeklyEmail: false }).where(eq(schema.users.id, optedOut.user.id));
    await db.update(schema.users).set({ createdAt: ago(30) }).where(eq(schema.users.id, hasLand.user.id));
    expect((await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: hasLand.headers, payload: { rect: freeRect() } })).statusCode).toBe(200);

    await sendActivationNudges({ now, batch: 10_000 });
    const got = (u: { user: { email: string } }) => outbox.filter((m) => m.to === u.user.email && m.type === 'activation').length;
    expect(got(due)).toBe(1);
    for (const u of [tooNew, tooOld, optedOut, hasLand]) expect(got(u)).toBe(0);
    const mail = outbox.find((m) => m.to === due.user.email && m.type === 'activation')!;
    expect(mail.text).toMatch(/\/v1\/email\/unsubscribe\?u=/);
    // Never twice.
    await sendActivationNudges({ now, batch: 10_000 });
    expect(got(due)).toBe(1);
  });
});

describe('R3f funnel', () => {
  it('counts events per unique person per day, skips bots, Do Not Track and GPC, and shows the four steps to staff', async () => {
    const before = JSON.parse((await app.inject({ url: '/v1/admin/funnel?days=1', headers: (await login(undefined, 'admin')).headers })).body);
    const visits0 = before.steps[0].n;
    const ua = { 'user-agent': `Mozilla/5.0 r3f-${Date.now()}` };
    const post = (headers: Record<string, string>, name = 'visit') => app.inject({ method: 'POST', url: '/v1/events', headers, payload: { name } });
    expect((await post(ua)).statusCode).toBe(204);
    expect((await post(ua)).statusCode).toBe(204); // same person, same day: counted once
    await post({ 'user-agent': 'Googlebot/2.1' });
    await post({ ...ua, 'user-agent': `${ua['user-agent']}-dnt`, dnt: '1' });
    await post({ ...ua, 'user-agent': `${ua['user-agent']}-gpc`, 'sec-gpc': '1' });
    expect((await post(ua, 'not_an_event')).statusCode).toBe(400);
    await post(ua, 'demo_view');

    const anon = await app.inject({ url: '/v1/admin/funnel' });
    expect(anon.statusCode).toBe(401);
    const user = await login();
    expect((await app.inject({ url: '/v1/admin/funnel', headers: user.headers })).statusCode).toBe(403);
    const admin = await login(undefined, 'admin');
    const f = JSON.parse((await app.inject({ url: '/v1/admin/funnel?days=1', headers: admin.headers })).body);
    expect(f.steps.map((s: { key: string }) => s.key)).toEqual(['visit', 'signup', 'first_value', 'paid']);
    expect(f.steps[0].n).toBe(visits0 + 1);
    expect(f.side.demoViews).toBeGreaterThanOrEqual(1);
    expect(f.steps[1].n).toBeGreaterThan(0); // the accounts this test file made today
    expect(f.steps[1].rate === null || typeof f.steps[1].rate === 'number').toBe(true);
  });
});
