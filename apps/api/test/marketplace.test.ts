import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { feeFor, runPayouts } from '../src/services/marketplace.js';
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
const post = (url: string, headers: Record<string, string>, payload?: unknown) => app.inject({ method: 'POST', url, headers, payload: payload as object });

/** Gives a user a paid (non-homestead) plot to sell, bypassing checkout. */
async function ownedPlot(userId: string) {
  const res = await db.transaction(async (tx) => {
    const { createPlot } = await import('../src/services/plots.js');
    return createPlot({ rect: freeRect(2, 2), title: 'For sale', kind: 'standard', status: 'active', ownerUserId: userId, ownerOrgId: null, tier: 'O', countryCode: null, regionSlug: null }, tx);
  });
  return res;
}

async function ledgerSum(orderId: string) {
  const [r] = await db.select({ s: sql<number>`coalesce(sum(${schema.ledgerEntries.amountCents}),0)::int` }).from(schema.ledgerEntries).where(eq(schema.ledgerEntries.orderId, orderId));
  return r!.s;
}

describe('marketplace', () => {
  it('computes a 10% fee rounded down', () => {
    expect(feeFor(10_000)).toBe(1000);
    expect(feeFor(999)).toBe(99);
  });

  it('lists, sells through (mock) checkout, moves the plot and balances the ledger', async () => {
    const seller = await login();
    const buyer = await login();
    const plot = await ownedPlot(seller.user.id);
    const listed = await post(`/v1/plots/${plot.id}/list`, seller.headers, { priceCents: 2_000 });
    expect(listed.statusCode).toBe(200);
    const listing = json(listed).listing;
    expect(listing.feeCents).toBe(200);

    expect((await post(`/v1/listings/${listing.id}/buy`, seller.headers)).statusCode).toBe(400); // not your own
    const checkout = json(await post(`/v1/listings/${listing.id}/buy`, buyer.headers));
    expect(checkout.url).toContain('/checkout/mock');
    const sessionId = (await db.select().from(schema.orders).where(eq(schema.orders.id, checkout.orderId)))[0]!.stripeSessionId!;
    const done = await post('/v1/billing/mock/complete', buyer.headers, { session: sessionId });
    expect(json(done).status).toBe('paid');

    const [moved] = await db.select().from(schema.plots).where(eq(schema.plots.id, plot.id));
    expect(moved!.ownerUserId).toBe(buyer.user.id);
    const [sold] = await db.select().from(schema.listings).where(eq(schema.listings.id, listing.id));
    expect(sold!.status).toBe('sold');
    // price = seller credit + platform fee, and the order's entries sum to zero
    const entries = await db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.orderId, checkout.orderId));
    expect(entries.find((e) => e.kind === 'seller_credit')!.amountCents).toBe(1800);
    expect(entries.find((e) => e.kind === 'platform_fee')!.amountCents).toBe(200);
    expect(await ledgerSum(checkout.orderId)).toBe(0);

    const balance = json(await app.inject({ url: '/v1/me/balance', headers: seller.headers }));
    expect(balance.balanceCents).toBe(1800);
    // completing the same session again does nothing (idempotent)
    await post('/v1/billing/mock/complete', buyer.headers, { session: sessionId });
    const count = await db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.orderId, checkout.orderId));
    expect(count.length).toBe(3);
  });

  it('refunds the buyer when the seller changes the price mid-checkout', async () => {
    const seller = await login();
    const buyer = await login();
    const plot = await ownedPlot(seller.user.id);
    const listing = json(await post(`/v1/plots/${plot.id}/list`, seller.headers, { priceCents: 1_000 })).listing;
    const checkout = json(await post(`/v1/listings/${listing.id}/buy`, buyer.headers));
    await app.inject({ method: 'PATCH', url: `/v1/listings/${listing.id}`, headers: seller.headers, payload: { priceCents: 5_000 } });
    const sessionId = (await db.select().from(schema.orders).where(eq(schema.orders.id, checkout.orderId)))[0]!.stripeSessionId!;
    await post('/v1/billing/mock/complete', buyer.headers, { session: sessionId });
    const [still] = await db.select().from(schema.plots).where(eq(schema.plots.id, plot.id));
    expect(still!.ownerUserId).toBe(seller.user.id);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, checkout.orderId));
    expect(order!.status).toBe('refunded');
    const notes = await db.select().from(schema.notifications).where(and(eq(schema.notifications.userId, buyer.user.id), eq(schema.notifications.kind, 'refund')));
    expect(notes.length).toBe(1);
  });

  it('only one buyer wins when two pay for the same listing', async () => {
    const seller = await login();
    const a = await login();
    const b = await login();
    const plot = await ownedPlot(seller.user.id);
    const listing = json(await post(`/v1/plots/${plot.id}/list`, seller.headers, { priceCents: 1_000 })).listing;
    const ca = json(await post(`/v1/listings/${listing.id}/buy`, a.headers));
    const cb = json(await post(`/v1/listings/${listing.id}/buy`, b.headers));
    const sess = async (id: string) => (await db.select().from(schema.orders).where(eq(schema.orders.id, id)))[0]!.stripeSessionId!;
    await Promise.all([post('/v1/billing/mock/complete', a.headers, { session: await sess(ca.orderId) }), post('/v1/billing/mock/complete', b.headers, { session: await sess(cb.orderId) })]);
    const orders = await db.select().from(schema.orders).where(sql`${schema.orders.id} in (${ca.orderId}, ${cb.orderId})`);
    expect(orders.map((o) => o.status).sort()).toEqual(['paid', 'refunded']);
    const sales = await db.select().from(schema.ledgerEntries).where(and(eq(schema.ledgerEntries.listingId, listing.id), eq(schema.ledgerEntries.kind, 'seller_credit')));
    expect(sales.length).toBe(1);
  });

  it('blocks homesteads, enforces the first-30-days price cap and the minimum price', async () => {
    const owner = await login();
    const home = json(await post('/v1/plots/claim', owner.headers, { rect: freeRect(1, 1) })).plot;
    const blocked = await post(`/v1/plots/${home.id}/list`, owner.headers, { priceCents: 1_000 });
    expect(blocked.statusCode).toBe(400);
    expect(json(blocked).error.message).toMatch(/Homestead/);

    const plot = await ownedPlot(owner.user.id); // 4 cells of ocean ($1 each): cap = 4 × 100 × 50 = $200
    expect((await post(`/v1/plots/${plot.id}/list`, owner.headers, { priceCents: 100 })).statusCode).toBe(400); // under minimum
    const tooHigh = await post(`/v1/plots/${plot.id}/list`, owner.headers, { priceCents: 25_000 });
    expect(tooHigh.statusCode).toBe(400);
    expect(json(tooHigh).error.message).toMatch(/capped/);
    expect((await post(`/v1/plots/${plot.id}/list`, owner.headers, { priceCents: 20_000 })).statusCode).toBe(200);
    expect((await post(`/v1/plots/${plot.id}/list`, owner.headers, { priceCents: 20_000 })).statusCode).toBe(409); // one active listing

    const stranger = await login();
    const other = json(await app.inject({ url: '/v1/listings' })).listings.find((l: { plot: { id: string } }) => l.plot.id === plot.id);
    expect((await app.inject({ method: 'DELETE', url: `/v1/listings/${other.id}`, headers: stranger.headers })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/v1/listings/${other.id}`, headers: owner.headers })).statusCode).toBe(200);
  });

  it('pays sellers out once they pass the minimum and have a ready account', async () => {
    const seller = await login();
    const buyer = await login();
    const plot = await ownedPlot(seller.user.id);
    const listing = json(await post(`/v1/plots/${plot.id}/list`, seller.headers, { priceCents: 10_000 })).listing;
    const checkout = json(await post(`/v1/listings/${listing.id}/buy`, buyer.headers));
    const sessionId = (await db.select().from(schema.orders).where(eq(schema.orders.id, checkout.orderId)))[0]!.stripeSessionId!;
    await post('/v1/billing/mock/complete', buyer.headers, { session: sessionId });
    expect((await runPayouts()).paid).toBe(0); // no payout account yet
    const connect = json(await post('/v1/payouts/connect', seller.headers));
    expect(connect.url).toContain('connect=mock');
    await post('/v1/payouts/refresh', seller.headers);
    const res = await runPayouts();
    expect(res.paid).toBeGreaterThanOrEqual(1);
    const balance = json(await app.inject({ url: '/v1/me/balance', headers: seller.headers }));
    expect(balance.balanceCents).toBe(0);
    expect(balance.entries.some((e: { kind: string }) => e.kind === 'payout')).toBe(true);
  });
});
