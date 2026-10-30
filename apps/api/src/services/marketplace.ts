import { and, desc, eq, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import type { Listing, Order, Plot, User } from '../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { PLANS, type PlanKey } from '../lib/pricing.js';
import { notify, publishActivity } from '../game/activity.js';
import { recordAction, unlock } from '../game/engine.js';
import { effectivePlan } from '../lib/users.js';
import { canEditPlot } from '../routes/views.js';
import { createCheckout, refundOrder } from './billing.js';
import { getPaymentProvider } from './payments/provider.js';

const DAY = 86400_000;

/** Platform fee for a sale, rounded down to whole cents (the seller gets the remainder). */
export const feeFor = (priceCents: number) => Math.floor((priceCents * config.MARKETPLACE_FEE_BPS) / 10_000);

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function tierPriceCents(tier: string): Promise<number> {
  const [row] = await db.select({ p: schema.pricingTiers.priceCents }).from(schema.pricingTiers).where(eq(schema.pricingTiers.tier, tier));
  return row?.p ?? 100;
}

/** Why a plot can't be listed right now (null = it can). */
export async function listingBlocker(plot: Plot, priceCents?: number): Promise<string | null> {
  if (plot.status !== 'active') return 'Only active plots can be sold.';
  if (plot.kind === 'homestead') return 'Free Homestead land can’t be resold. It is yours to use, not to trade.';
  if (plot.kind === 'showcase') return 'Showcase plots can only be claimed by the organisation they show.';
  const ageMs = Date.now() - plot.createdAt.getTime();
  const holdMs = config.MARKETPLACE_MIN_HOLD_DAYS * DAY;
  if (ageMs < holdMs) {
    const days = Math.ceil((holdMs - ageMs) / DAY);
    return `Land must be held for ${config.MARKETPLACE_MIN_HOLD_DAYS} days before it can be sold. Try again in ${days} day${days === 1 ? '' : 's'}.`;
  }
  if (priceCents !== undefined) {
    if (priceCents < config.MARKETPLACE_MIN_PRICE_CENTS) return `The minimum price is $${(config.MARKETPLACE_MIN_PRICE_CENTS / 100).toFixed(2)}.`;
    if (ageMs < config.MARKETPLACE_PRICE_CAP_DAYS * DAY) {
      const cap = (await tierPriceCents(plot.tier)) * plot.cellCount * config.MARKETPLACE_PRICE_CAP_MULT;
      if (priceCents > cap) return `For the first ${config.MARKETPLACE_PRICE_CAP_DAYS} days after a claim the price is capped at $${(cap / 100).toFixed(2)}.`;
    }
  }
  return null;
}

export async function createListing(actor: User, plotId: string, priceCents: number): Promise<Listing> {
  const [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, plotId));
  if (!plot) throw notFound('Plot not found');
  if (!(await canEditPlot(actor, plot)) || actor.role === 'admin' && plot.ownerUserId !== actor.id && !plot.ownerOrgId) throw forbidden('Only the owner can sell this plot.');
  const blocker = await listingBlocker(plot, priceCents);
  if (blocker) throw badRequest(blocker);
  const [existing] = await db.select().from(schema.listings).where(and(eq(schema.listings.plotId, plotId), eq(schema.listings.status, 'active')));
  if (existing) throw conflict('This plot is already listed. Change its price instead.');
  const [listing] = await db
    .insert(schema.listings)
    .values({ plotId, sellerUserId: actor.id, sellerOrgId: plot.ownerOrgId, priceCents, currency: config.CURRENCY })
    .returning();
  await publishActivity({ kind: 'listing', actorUserId: actor.id, plotId, countryCode: plot.countryCode, lat: plot.centerLat, lng: plot.centerLng, payload: { title: plot.title, slug: plot.slug, priceCents } });
  return listing!;
}

async function ownListing(actor: User, listingId: string): Promise<{ listing: Listing; plot: Plot }> {
  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, listingId));
  if (!listing) throw notFound('Listing not found');
  const [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, listing.plotId));
  if (!plot) throw notFound('Plot not found');
  if (actor.role !== 'admin' && !(await canEditPlot(actor, plot))) throw forbidden('Only the seller can change this listing.');
  return { listing, plot };
}

export async function updateListingPrice(actor: User, listingId: string, priceCents: number): Promise<Listing> {
  const { listing, plot } = await ownListing(actor, listingId);
  if (listing.status !== 'active') throw conflict('This listing is no longer active.');
  const blocker = await listingBlocker(plot, priceCents);
  if (blocker) throw badRequest(blocker);
  // Bumping the version voids any checkout that started at the old price.
  const [updated] = await db
    .update(schema.listings)
    .set({ priceCents, version: sql`${schema.listings.version} + 1`, updatedAt: new Date() })
    .where(and(eq(schema.listings.id, listingId), eq(schema.listings.status, 'active')))
    .returning();
  if (!updated) throw conflict('This listing is no longer active.');
  return updated;
}

export async function cancelListing(actor: User, listingId: string, status: 'cancelled' | 'void' = 'cancelled'): Promise<Listing> {
  const { listing } = await ownListing(actor, listingId);
  if (listing.status !== 'active') throw conflict('This listing is no longer active.');
  const [updated] = await db
    .update(schema.listings)
    .set({ status, version: sql`${schema.listings.version} + 1`, updatedAt: new Date() })
    .where(and(eq(schema.listings.id, listingId), eq(schema.listings.status, 'active')))
    .returning();
  return updated!;
}

/** Starts a checkout for a listing. The order is bound to the listing's price and version. */
export async function startPurchase(buyer: User, listingId: string): Promise<{ url: string; orderId: string }> {
  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, listingId));
  if (!listing || listing.status !== 'active') throw conflict('This plot is no longer for sale.');
  if (listing.sellerUserId === buyer.id) throw badRequest('You can’t buy your own plot.');
  const [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, listing.plotId));
  if (!plot || plot.status !== 'active') throw conflict('This plot is no longer available.');
  const plan = (await effectivePlan(buyer)) as PlanKey;
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.plots)
    .where(and(eq(schema.plots.ownerUserId, buyer.id), sql`${schema.plots.ownerOrgId} is null`, eq(schema.plots.status, 'active')));
  if (n >= PLANS[plan].maxPlots) throw badRequest(`Your plan allows ${PLANS[plan].maxPlots} personal plots. Upgrade, or sell one first.`);
  return createCheckout({
    user: buyer,
    orgId: null,
    kind: 'listing',
    plotId: plot.id,
    listingId: listing.id,
    listingVersion: listing.version,
    items: [{ type: 'listing', description: `Plot: ${plot.title}`.slice(0, 120), amountCents: listing.priceCents, meta: { listingId: listing.id, plotId: plot.id } }],
    successPath: `/p/${plot.slug}`,
    cancelPath: `/marketplace`,
  });
}

/**
 * Delivers a paid listing order. The transfer happens only if the listing is still active, unchanged
 * (same version, same price) and the seller still owns the plot; otherwise the buyer is refunded in full.
 * The whole move, including the ledger, is one transaction, so retries (webhook re-delivery) are safe.
 */
export async function fulfilListing(order: Order): Promise<'sold' | 'refunded'> {
  if (!order.listingId || !order.userId || !order.plotId) {
    await refundOrder(order, 'Order had no listing');
    return 'refunded';
  }
  const buyerId = order.userId;
  type Outcome = { ok: true; plot: Plot; sellerId: string | null; fee: number } | { ok: false; reason: string };
  const outcome: Outcome = await db.transaction(async (tx) => {
    const [listing] = await tx.select().from(schema.listings).where(eq(schema.listings.id, order.listingId!)).for('update');
    if (!listing) return { ok: false, reason: 'The listing no longer exists.' };
    if (listing.status !== 'active') return { ok: false, reason: 'The plot was sold or taken off the market before your payment completed.' };
    if (listing.version !== order.listingVersion || listing.priceCents !== order.amountCents) return { ok: false, reason: 'The seller changed the price before your payment completed.' };
    const [plot] = await tx.select().from(schema.plots).where(eq(schema.plots.id, listing.plotId)).for('update');
    if (!plot || plot.status !== 'active') return { ok: false, reason: 'The plot is no longer available.' };
    const stillOwned = listing.sellerOrgId ? plot.ownerOrgId === listing.sellerOrgId : plot.ownerUserId === listing.sellerUserId && !plot.ownerOrgId;
    if (!stillOwned) return { ok: false, reason: 'The seller no longer owns this plot.' };

    const fee = feeFor(listing.priceCents);
    const sellerAccount = listing.sellerOrgId ? `org:${listing.sellerOrgId}` : `user:${listing.sellerUserId}`;
    const [moved] = await tx
      .update(schema.plots)
      .set({ ownerUserId: buyerId, ownerOrgId: null, kind: plot.kind === 'landmark' ? 'standard' : plot.kind, updatedAt: new Date(), lastEditedAt: new Date() })
      .where(eq(schema.plots.id, plot.id))
      .returning();
    await tx.update(schema.listings).set({ status: 'sold', buyerUserId: buyerId, soldAt: new Date(), updatedAt: new Date() }).where(eq(schema.listings.id, listing.id));
    await tx.insert(schema.ledgerEntries).values([
      { orderId: order.id, listingId: listing.id, account: `buyer:${buyerId}`, kind: 'sale', amountCents: -listing.priceCents, currency: listing.currency },
      { orderId: order.id, listingId: listing.id, account: 'platform', kind: 'platform_fee', amountCents: fee, currency: listing.currency, meta: { bps: config.MARKETPLACE_FEE_BPS } },
      { orderId: order.id, listingId: listing.id, account: sellerAccount, kind: 'seller_credit', amountCents: listing.priceCents - fee, currency: listing.currency },
    ]);
    return { ok: true, plot: moved!, sellerId: listing.sellerUserId, fee };
  });

  if (!outcome.ok) {
    await refundOrder(order, outcome.reason);
    await notify(buyerId, 'refund', { reason: `${outcome.reason} You have been refunded in full.` });
    return 'refunded';
  }
  const { plot, sellerId } = outcome;
  try {
    await publishActivity({ kind: 'sale', actorUserId: buyerId, plotId: plot.id, countryCode: plot.countryCode, lat: plot.centerLat, lng: plot.centerLng, payload: { title: plot.title, slug: plot.slug, priceCents: order.amountCents } });
    if (sellerId) await unlock(sellerId, 'first-sale').catch(() => undefined);
    if (sellerId) await notify(sellerId, 'sold', { plotId: plot.id, title: plot.title, slug: plot.slug, priceCents: order.amountCents, feeCents: outcome.fee });
    await notify(buyerId, 'purchased', { plotId: plot.id, title: plot.title, slug: plot.slug });
    await recordAction(buyerId, 'claim_plot', { ref: order.id, noXp: true });
  } catch (err) {
    logger.warn({ err }, 'post-sale notifications failed');
  }
  return 'sold';
}

export async function balanceFor(account: string): Promise<number> {
  const [row] = await db
    .select({ s: sql<number>`coalesce(sum(${schema.ledgerEntries.amountCents}), 0)::int` })
    .from(schema.ledgerEntries)
    .where(eq(schema.ledgerEntries.account, account));
  return row?.s ?? 0;
}

/** Pays out every seller whose balance passed the minimum and who has a payout-ready account. Run by the worker. */
export async function runPayouts(): Promise<{ paid: number; failed: number; skipped: number }> {
  const provider = getPaymentProvider();
  const rows = await db
    .select({ account: schema.ledgerEntries.account, balance: sql<number>`sum(${schema.ledgerEntries.amountCents})::int` })
    .from(schema.ledgerEntries)
    .where(sql`${schema.ledgerEntries.account} like 'user:%'`)
    .groupBy(schema.ledgerEntries.account)
    .having(sql`sum(${schema.ledgerEntries.amountCents}) >= ${config.PAYOUT_MIN_CENTS}`);
  let paid = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of rows) {
    const userId = r.account.slice(5);
    const [acct] = await db.select().from(schema.payoutAccounts).where(eq(schema.payoutAccounts.userId, userId));
    if (!acct?.stripeAccountId || !acct.payoutsEnabled) {
      skipped++;
      continue;
    }
    // One payout per balance snapshot: the idempotency key changes only when the balance does.
    const key = `payout:${userId}:${r.balance}:${await lastEntryId(r.account)}`;
    const res = await provider.transfer({ destinationAccountId: acct.stripeAccountId, amountCents: r.balance, currency: config.CURRENCY, idempotencyKey: key, meta: { userId } });
    if (!res.ok) {
      failed++;
      logger.error({ userId, error: res.error }, 'payout failed');
      await notify(userId, 'payout_failed', { amountCents: r.balance });
      continue;
    }
    await recordPayout(userId, r.balance, res.reference);
    paid++;
  }
  return { paid, failed, skipped };
}

const lastEntryId = async (account: string) => {
  const [row] = await db.select({ id: schema.ledgerEntries.id }).from(schema.ledgerEntries).where(eq(schema.ledgerEntries.account, account)).orderBy(desc(schema.ledgerEntries.id)).limit(1);
  return row?.id ?? 0;
};

/** Debits a seller's balance for money sent to them (zero-sum against the `external` account). */
export async function recordPayout(userId: string, amountCents: number, reference: string | null, meta: Record<string, unknown> = {}) {
  await db.insert(schema.ledgerEntries).values([
    { account: `user:${userId}`, kind: 'payout', amountCents: -amountCents, currency: config.CURRENCY, meta: { reference, ...meta } },
    { account: 'external', kind: 'payout', amountCents, currency: config.CURRENCY, meta: { reference, userId, ...meta } },
  ]);
  await notify(userId, 'payout', { amountCents });
}
