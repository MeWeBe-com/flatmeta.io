import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { isSafeReturnPath } from '../src/services/billing.js';
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

describe('upsell at the paywall (G13)', () => {
  it('402s say which plan unlocks the feature', async () => {
    const u = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: u.headers, payload: { rect: freeRect() } })).plot;
    const res = await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: u.headers, payload: { customHtml: '<h1>x</h1>' } });
    expect(res.statusCode).toBe(402);
    expect(json(res).error.details).toEqual({ upsell: 'plus' });
    const biz = await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: u.headers, payload: { business: { address: 'x' } } });
    expect(json(biz).error.details).toEqual({ upsell: 'business' });
  });

  it('checkout returns to the page the person was on, and only to our own pages', async () => {
    expect(isSafeReturnPath('/dashboard/plots/abc?tab=content')).toBe(true);
    for (const bad of ['//evil.example/x', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '/a b', '/' + 'x'.repeat(300)]) expect(isSafeReturnPath(bad), bad).toBe(false);
    const u = await login();
    expect((await app.inject({ method: 'POST', url: '/v1/billing/checkout', payload: { plan: 'plus' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/v1/billing/checkout', headers: u.headers, payload: { plan: 'plus', returnPath: '//evil.example' } })).statusCode).toBe(400);
    const ok = json(await app.inject({ method: 'POST', url: '/v1/billing/checkout', headers: u.headers, payload: { plan: 'plus', interval: 'year', returnPath: '/dashboard/plots/abc?tab=content', source: 'paywall' } }));
    const next = new URL(ok.url).searchParams.get('next');
    expect(next).toBe('/dashboard/plots/abc?tab=content&upgraded=plus');
    expect(new URL(ok.url).searchParams.get('cancel')).toBe('/dashboard/plots/abc?tab=content');
  });
});

describe('admin metrics (G13)', () => {
  it('daily signups, claims, conversions, revenue and paywall views, for staff only', async () => {
    const user = await login();
    const admin = await login(undefined, 'admin');
    expect((await app.inject({ url: '/v1/admin/metrics', headers: user.headers })).statusCode).toBe(403);
    expect((await app.inject({ url: '/v1/admin/metrics' })).statusCode).toBe(401);
    await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: user.headers, payload: { rect: freeRect() } });
    await app.inject({ method: 'POST', url: '/v1/billing/paywall-seen', payload: { upsell: 'plus' } });
    await db.insert(schema.orders).values({ userId: user.user.id, kind: 'credits', status: 'paid', amountCents: 500, paidAt: new Date() });
    const m = json(await app.inject({ url: '/v1/admin/metrics?days=7', headers: admin.headers }));
    expect(m.series).toHaveLength(7);
    const today = m.series.at(-1);
    expect(today.date).toBe(new Date().toISOString().slice(0, 10));
    expect(today.signups).toBeGreaterThanOrEqual(2);
    expect(today.claims).toBeGreaterThanOrEqual(1);
    expect(today.conversions).toBeGreaterThanOrEqual(1);
    expect(today.revenueCents).toBeGreaterThanOrEqual(500);
    expect(today.paywallViews).toBeGreaterThanOrEqual(1);
    expect(typeof m.mrrCents).toBe('number');
    expect((await app.inject({ url: '/v1/admin/metrics?days=500', headers: admin.headers })).statusCode).toBe(400);
  });
});
