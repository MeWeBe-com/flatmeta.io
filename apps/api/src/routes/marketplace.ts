import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import { requireAdmin, requireUser } from '../lib/auth.js';
import { badRequest, notFound } from '../lib/errors.js';
import { listingBlocker, balanceFor, cancelListing, createListing, feeFor, recordPayout, startPurchase, updateListingPrice } from '../services/marketplace.js';
import { getPaymentProvider } from '../services/payments/provider.js';
import { ownersFor, plotView, publicUser } from './views.js';
import { visiblePlot } from './plots.js';

const price = z.number().int().min(50).max(100_000_00);

export async function listingViews(rows: (typeof schema.listings.$inferSelect)[]) {
  const plots = rows.length ? await db.select().from(schema.plots).where(inArray(schema.plots.id, rows.map((r) => r.plotId))) : [];
  const owners = await ownersFor(plots);
  const byId = new Map(plots.map((p) => [p.id, p]));
  return rows.flatMap((l) => {
    const p = byId.get(l.plotId);
    if (!p) return [];
    return [
      {
        id: l.id,
        status: l.status,
        priceCents: l.priceCents,
        currency: l.currency,
        feeCents: feeFor(l.priceCents),
        version: l.version,
        createdAt: l.createdAt,
        soldAt: l.soldAt,
        plot: plotView(p, owners.get(p.id) ?? null),
      },
    ];
  });
}

export default async function marketplaceRoutes(app: App) {
  app.get(
    '/v1/listings',
    {
      schema: {
        tags: ['marketplace'],
        summary: 'Land for sale',
        querystring: z.object({
          country: z.string().length(2).optional(),
          tier: z.enum(['S', 'A', 'B', 'C', 'O']).optional(),
          minPrice: z.coerce.number().int().min(0).optional(),
          maxPrice: z.coerce.number().int().min(0).optional(),
          sort: z.enum(['new', 'price_asc', 'price_desc']).default('new'),
          limit: z.coerce.number().int().min(1).max(60).default(24),
          cursor: z.coerce.number().int().min(0).default(0),
        }),
      },
    },
    async (req) => {
      const q = req.query;
      const conds = [eq(schema.listings.status, 'active'), visiblePlot()];
      if (q.country) conds.push(eq(schema.plots.countryCode, q.country.toUpperCase()));
      if (q.tier) conds.push(eq(schema.plots.tier, q.tier));
      if (q.minPrice !== undefined) conds.push(gte(schema.listings.priceCents, q.minPrice));
      if (q.maxPrice !== undefined) conds.push(lte(schema.listings.priceCents, q.maxPrice));
      const order = q.sort === 'price_asc' ? asc(schema.listings.priceCents) : q.sort === 'price_desc' ? desc(schema.listings.priceCents) : desc(schema.listings.createdAt);
      const rows = await db
        .select({ l: schema.listings })
        .from(schema.listings)
        .innerJoin(schema.plots, eq(schema.plots.id, schema.listings.plotId))
        .where(and(...conds))
        .orderBy(order)
        .limit(q.limit + 1)
        .offset(q.cursor);
      const page = rows.slice(0, q.limit).map((r) => r.l);
      return { listings: await listingViews(page), nextCursor: rows.length > q.limit ? q.cursor + q.limit : null, feeBps: config.MARKETPLACE_FEE_BPS };
    },
  );

  app.get('/v1/listings/:id', { schema: { tags: ['marketplace'], summary: 'One listing', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const [l] = await db.select().from(schema.listings).where(eq(schema.listings.id, req.params.id));
    if (!l) throw notFound('Listing not found');
    return { listing: (await listingViews([l]))[0] };
  });

  app.get('/v1/plots/:id/listing-check', { schema: { tags: ['marketplace'], summary: 'Can I sell this plot, and what are the limits?', params: z.object({ id: z.uuid() }) } }, async (req) => {
    requireUser(req);
    const [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, req.params.id));
    if (!plot) throw notFound('Plot not found');
    const blocker = await listingBlocker(plot);
    const [tier] = await db.select().from(schema.pricingTiers).where(eq(schema.pricingTiers.tier, plot.tier));
    const cap = (tier?.priceCents ?? 100) * plot.cellCount * config.MARKETPLACE_PRICE_CAP_MULT;
    const capped = Date.now() - plot.createdAt.getTime() < config.MARKETPLACE_PRICE_CAP_DAYS * 86400_000;
    return { canList: !blocker, reason: blocker, minPriceCents: config.MARKETPLACE_MIN_PRICE_CENTS, maxPriceCents: capped ? cap : null, feeBps: config.MARKETPLACE_FEE_BPS };
  });

  app.post(
    '/v1/plots/:id/list',
    { schema: { tags: ['marketplace'], summary: 'List a plot for sale', params: z.object({ id: z.uuid() }), body: z.object({ priceCents: price }) } },
    async (req) => {
      const user = requireUser(req);
      const [full] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
      const listing = await createListing(full!, req.params.id, req.body.priceCents);
      return { listing: (await listingViews([listing]))[0] };
    },
  );

  app.patch(
    '/v1/listings/:id',
    { schema: { tags: ['marketplace'], summary: 'Change the price of my listing', params: z.object({ id: z.uuid() }), body: z.object({ priceCents: price }) } },
    async (req) => {
      const user = requireUser(req);
      const [full] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
      return { listing: (await listingViews([await updateListingPrice(full!, req.params.id, req.body.priceCents)]))[0] };
    },
  );

  app.delete('/v1/listings/:id', { schema: { tags: ['marketplace'], summary: 'Take my listing off the market', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const user = requireUser(req);
    const [full] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    await cancelListing(full!, req.params.id);
    return { ok: true };
  });

  app.post(
    '/v1/listings/:id/buy',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { tags: ['marketplace'], summary: 'Buy a listed plot (returns a checkout URL)', params: z.object({ id: z.uuid() }) } },
    async (req) => {
      const user = requireUser(req);
      const [full] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
      return startPurchase(full!, req.params.id);
    },
  );

  app.get('/v1/me/sales', { schema: { tags: ['marketplace'], summary: 'My listings and sales' } }, async (req) => {
    const user = requireUser(req);
    const rows = await db.select().from(schema.listings).where(eq(schema.listings.sellerUserId, user.id)).orderBy(desc(schema.listings.createdAt)).limit(100);
    return { listings: await listingViews(rows) };
  });

  app.get('/v1/me/purchases', { schema: { tags: ['marketplace'], summary: 'Plots I bought' } }, async (req) => {
    const user = requireUser(req);
    const rows = await db.select().from(schema.listings).where(eq(schema.listings.buyerUserId, user.id)).orderBy(desc(schema.listings.soldAt)).limit(100);
    return { listings: await listingViews(rows) };
  });

  app.get('/v1/me/balance', { schema: { tags: ['marketplace'], summary: 'My seller balance, payout status and recent ledger' } }, async (req) => {
    const user = requireUser(req);
    const account = `user:${user.id}`;
    const [acct] = await db.select().from(schema.payoutAccounts).where(eq(schema.payoutAccounts.userId, user.id));
    const entries = await db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.account, account)).orderBy(desc(schema.ledgerEntries.id)).limit(50);
    return {
      balanceCents: await balanceFor(account),
      currency: config.CURRENCY,
      minPayoutCents: config.PAYOUT_MIN_CENTS,
      payoutsEnabled: !!acct?.payoutsEnabled,
      connected: !!acct?.stripeAccountId,
      entries: entries.map((e) => ({ id: e.id, kind: e.kind, amountCents: e.amountCents, createdAt: e.createdAt, orderId: e.orderId })),
    };
  });

  app.post('/v1/payouts/connect', { schema: { tags: ['marketplace'], summary: 'Start (or resume) payout onboarding; returns a URL' } }, async (req) => {
    const user = requireUser(req);
    const [full] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    const [acct] = await db.select().from(schema.payoutAccounts).where(eq(schema.payoutAccounts.userId, user.id));
    const res = await getPaymentProvider().onboardingUrl({ userId: user.id, email: full!.email, accountId: acct?.stripeAccountId ?? null, returnPath: '/dashboard/billing' });
    await db
      .insert(schema.payoutAccounts)
      .values({ userId: user.id, stripeAccountId: res.accountId })
      .onConflictDoUpdate({ target: schema.payoutAccounts.userId, set: { stripeAccountId: res.accountId, updatedAt: new Date() } });
    return { url: res.url };
  });

  app.post('/v1/payouts/refresh', { schema: { tags: ['marketplace'], summary: 'Re-check my payout account after onboarding' } }, async (req) => {
    const user = requireUser(req);
    const [acct] = await db.select().from(schema.payoutAccounts).where(eq(schema.payoutAccounts.userId, user.id));
    if (!acct?.stripeAccountId) throw badRequest('Connect a payout account first.');
    const s = await getPaymentProvider().accountStatus(acct.stripeAccountId);
    await db.update(schema.payoutAccounts).set({ chargesEnabled: s.chargesEnabled, payoutsEnabled: s.payoutsEnabled, updatedAt: new Date() }).where(eq(schema.payoutAccounts.userId, user.id));
    return s;
  });

  // ── Admin ──
  app.get('/v1/admin/marketplace', { schema: { tags: ['admin'], summary: 'Marketplace overview: listings, volume, fees, unpaid seller balances' } }, async (req) => {
    requireAdmin(req);
    const [vol] = await db
      .select({
        sales: sql<number>`count(*) filter (where ${schema.listings.status} = 'sold')::int`,
        active: sql<number>`count(*) filter (where ${schema.listings.status} = 'active')::int`,
        volume: sql<number>`coalesce(sum(${schema.listings.priceCents}) filter (where ${schema.listings.status} = 'sold'), 0)::int`,
      })
      .from(schema.listings);
    const fees = await balanceFor('platform');
    const sellers = await db
      .select({ account: schema.ledgerEntries.account, balance: sql<number>`sum(${schema.ledgerEntries.amountCents})::int` })
      .from(schema.ledgerEntries)
      .where(sql`${schema.ledgerEntries.account} like 'user:%'`)
      .groupBy(schema.ledgerEntries.account)
      .having(sql`sum(${schema.ledgerEntries.amountCents}) <> 0`)
      .orderBy(desc(sql`sum(${schema.ledgerEntries.amountCents})`))
      .limit(50);
    const ids = sellers.map((s) => s.account.slice(5));
    const users = ids.length ? await db.select().from(schema.users).where(inArray(schema.users.id, ids)) : [];
    const um = new Map(users.map((u) => [u.id, u]));
    const recent = await db.select().from(schema.listings).orderBy(desc(schema.listings.updatedAt)).limit(30);
    return {
      ...vol,
      platformFeesCents: fees,
      feeBps: config.MARKETPLACE_FEE_BPS,
      sellers: sellers.map((s) => ({ user: um.get(s.account.slice(5)) ? publicUser(um.get(s.account.slice(5))!) : null, userId: s.account.slice(5), balanceCents: s.balance })),
      recent: await listingViews(recent),
    };
  });

  app.post('/v1/admin/listings/:id/void', { schema: { tags: ['admin'], summary: 'Void a listing', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const admin = requireAdmin(req);
    const [full] = await db.select().from(schema.users).where(eq(schema.users.id, admin.id));
    await cancelListing(full!, req.params.id, 'void');
    await db.insert(schema.auditLog).values({ actorId: admin.id, action: 'listing.void', targetType: 'listing', targetId: req.params.id });
    return { ok: true };
  });

  app.post(
    '/v1/admin/payouts/manual',
    { schema: { tags: ['admin'], summary: 'Record a manual payout (sent outside the platform)', body: z.object({ userId: z.uuid(), amountCents: z.number().int().min(1), note: z.string().max(200).optional() }) } },
    async (req) => {
      const admin = requireAdmin(req);
      const balance = await balanceFor(`user:${req.body.userId}`);
      if (req.body.amountCents > balance) throw badRequest(`Balance is only $${(balance / 100).toFixed(2)}.`);
      await recordPayout(req.body.userId, req.body.amountCents, null, { manual: true, by: admin.id, note: req.body.note });
      await db.insert(schema.auditLog).values({ actorId: admin.id, action: 'payout.manual', targetType: 'user', targetId: req.body.userId, meta: { amountCents: req.body.amountCents } });
      return { ok: true, balanceCents: balance - req.body.amountCents };
    },
  );
}
