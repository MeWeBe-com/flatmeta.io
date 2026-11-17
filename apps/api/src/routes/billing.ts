import { key, redis } from '../lib/redis.js';
import { isSafeReturnPath } from '../services/billing.js';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type Stripe from 'stripe';
import { z } from 'zod';
import type { App } from '../app.js';
import { config, paidCheckout, paymentsMock } from '../config.js';
import { db, schema } from '../db/client.js';
import { requireUser } from '../lib/auth.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { DEFAULT_TIERS, PLANS, SUBSCRIPTION_PRICES, UPGRADES, claimPriceCents } from '../lib/pricing.js';
import { capturePaypalReturn, createCheckout, createSubscriptionCheckout, fulfilOrder, handleStripeEvent, mockSubscribe, paypalApprovalForOrder, portalUrl, requirePaidCheckout, stripe, stripeSessionForOrder } from '../services/billing.js';
import { paypalEnabled } from '../services/paypal.js';
import { getPrices } from '../services/plots.js';
import { assertCanEditPlot, orgRole } from './views.js';
import { loadPlot } from './plots.js';

const PLAN_FEATURES = {
  // M11: the plan is called Free and costs $0; its features don't say "Free" a third time.
  free: ['Your first plot of land', 'Mini-page with links', `${PLANS.free.aiCredits} AI designs / month`, 'Quests, badges & leaderboards'],
  plus: [`${PLANS.plus.aiCredits} AI designs / month`, 'Custom slug & animated frames', 'Visit analytics', `Up to ${PLANS.plus.maxPlots} plots`, '10% off land', 'Plus badge'],
  business: ['Verified business badge', 'Hours, offers, contact & booking', '"Open now" marker on the map', '1 Spotlight every month', `${PLANS.business.aiCredits} AI designs / month`, 'Plots up to 20×20, 3 seats', 'LocalBusiness rich results'],
  brand: ['Everything in Business', `Portfolio of up to ${PLANS.brand.maxPlots} plots`, 'Claim your showcase Landmark', 'API & MCP access', '10 seats, priority support'],
};

export default async function billingRoutes(app: App) {
  /** R3d: founding places taken = verified company claims + active Business/Brand subscriptions (cached 5 min). */
  async function foundingSeats(): Promise<{ total: number; taken: number; left: number } | null> {
    if (!config.FOUNDING_SEATS) return null;
    const cacheKey = key('founding-seats');
    const cached = await redis.get(cacheKey).catch(() => null);
    let taken = cached === null ? NaN : Number(cached);
    if (!Number.isFinite(taken)) {
      const [[claims], [subs]] = await Promise.all([
        db.select({ n: count() }).from(schema.claimRequests).where(eq(schema.claimRequests.status, 'completed')),
        db.select({ n: count() }).from(schema.subscriptions).where(and(inArray(schema.subscriptions.plan, ['business', 'brand']), inArray(schema.subscriptions.status, ['active', 'trialing']))),
      ]);
      taken = Number(claims?.n ?? 0) + Number(subs?.n ?? 0);
      await redis.set(cacheKey, String(taken), 'EX', 300).catch(() => undefined);
    }
    return { total: config.FOUNDING_SEATS, taken: Math.min(taken, config.FOUNDING_SEATS), left: Math.max(0, config.FOUNDING_SEATS - taken) };
  }

  app.get('/v1/billing/plans', { schema: { tags: ['billing'], summary: 'Plans, land tiers and upgrade prices' } }, async () => {
    const prices = await getPrices();
    return {
      currency: config.CURRENCY,
      mock: paymentsMock(),
      plans: [
        { key: 'free', name: 'Free', month: 0, year: 0, features: PLAN_FEATURES.free, for: 'Everyone' },
        { key: 'plus', name: 'Plus', ...SUBSCRIPTION_PRICES.plus, features: PLAN_FEATURES.plus, for: 'Explorers & creators' },
        { key: 'business', name: 'Business', ...SUBSCRIPTION_PRICES.business, features: PLAN_FEATURES.business, for: 'Local businesses', org: true },
        { key: 'brand', name: 'Brand', ...SUBSCRIPTION_PRICES.brand, features: PLAN_FEATURES.brand, for: 'Brands & organisations', org: true },
      ],
      tiers: DEFAULT_TIERS.map((t) => ({ ...t, priceCents: prices[t.tier] })),
      upgrades: Object.entries(UPGRADES).map(([key, u]) => ({ key, label: u.label, priceCents: u.priceCents })),
      landmarkPriceCents: claimPriceCents(),
      launchOffer: config.LAUNCH_OFFER || null,
      founding: await foundingSeats(),
    };
  });

  app.get('/v1/features', { schema: { tags: ['billing'], summary: 'Public feature switches (paid checkout, free land allowance)' } }, async () => ({
    paidCheckout: paidCheckout(),
    freeLandCells: config.FREE_LAND_CELLS,
    appEnv: config.APP_ENV,
  }));

  app.post(
    '/v1/billing/checkout',
    { schema: { tags: ['billing'], summary: 'Start a subscription checkout', body: z.object({ plan: z.enum(['plus', 'business', 'brand']), interval: z.enum(['month', 'year']).default('month'), orgId: z.uuid().optional(), returnPath: z.string().max(200).optional(), source: z.enum(['pricing', 'paywall', 'billing']).optional() }) } },
    async (req) => {
      const user = requireUser(req);
      if (req.body.orgId) {
        const role = await orgRole(user.id, req.body.orgId);
        if (role !== 'owner' && role !== 'admin') throw forbidden('Only organisation owners and admins can manage billing');
      }
      if (req.body.returnPath && !isSafeReturnPath(req.body.returnPath)) throw badRequest('Invalid return path');
      if (req.body.source === 'paywall') void redis.hincrby(key('metrics', 'paywall', new Date().toISOString().slice(0, 10)), 'checkouts', 1).catch(() => undefined);
      return createSubscriptionCheckout(user, req.body.plan, req.body.interval, req.body.orgId ?? null, { returnPath: req.body.returnPath, source: req.body.source });
    },
  );

  // G13 funnel: how often people meet a paywall (counted per day, no personal data).
  app.post(
    '/v1/billing/paywall-seen',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags: ['billing'], summary: 'Count a paywall view (anonymous, per day)', body: z.object({ upsell: z.enum(['plus', 'business', 'credits']) }) } },
    async (req) => {
      await redis.hincrby(key('metrics', 'paywall', new Date().toISOString().slice(0, 10)), req.body.upsell, 1).catch(() => undefined);
      return { ok: true };
    },
  );

  app.post('/v1/billing/portal', { schema: { tags: ['billing'], summary: 'Open the Stripe customer portal', body: z.object({ orgId: z.uuid().optional() }) } }, async (req) => {
    const user = requireUser(req);
    if (req.body.orgId) {
      const role = await orgRole(user.id, req.body.orgId);
      if (role !== 'owner' && role !== 'admin') throw forbidden();
    }
    return { url: await portalUrl(user, req.body.orgId ?? null) };
  });

  app.post(
    '/v1/plots/:id/upgrade',
    { schema: { tags: ['billing'], summary: 'Buy a Spotlight or Beacon for a plot', params: z.object({ id: z.uuid() }), body: z.object({ kind: z.enum(['spotlight', 'beacon']) }) } },
    async (req) => {
      const user = requireUser(req);
      const plot = await loadPlot(req.params.id);
      if (!plot) throw notFound('Plot');
      await assertCanEditPlot(user, plot);
      if (plot.status !== 'active') throw badRequest('Only active plots can be upgraded');
      const u = UPGRADES[req.body.kind];
      const checkout = await createCheckout({
        user,
        orgId: plot.ownerOrgId,
        kind: 'upgrade',
        plotId: plot.id,
        items: [{ type: 'upgrade', description: `${u.label} · ${plot.title}`, amountCents: u.priceCents, meta: { upgrade: req.body.kind, plotId: plot.id } }],
        successPath: `/dashboard/plots/${plot.id}?upgraded=${req.body.kind}`,
        cancelPath: `/dashboard/plots/${plot.id}`,
      });
      return { checkoutUrl: checkout.url, orderId: checkout.orderId };
    },
  );

  app.post('/v1/billing/credits', { schema: { tags: ['billing'], summary: 'Buy an AI Design Pack (+25 designs)' } }, async (req) => {
    const user = requireUser(req);
    const checkout = await createCheckout({
      user,
      orgId: null,
      kind: 'credits',
      items: [{ type: 'credits', description: UPGRADES.credits.label, amountCents: UPGRADES.credits.priceCents, meta: { upgrade: 'credits' } }],
      successPath: '/dashboard/billing?credits=1',
      cancelPath: '/dashboard/billing',
    });
    return { checkoutUrl: checkout.url, orderId: checkout.orderId };
  });

  app.get('/v1/billing/orders', { schema: { tags: ['billing'], summary: 'My orders and subscriptions' } }, async (req) => {
    const user = requireUser(req);
    const orders = await db.select().from(schema.orders).where(eq(schema.orders.userId, user.id)).orderBy(desc(schema.orders.createdAt)).limit(100);
    const subs = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, user.id)).orderBy(desc(schema.subscriptions.createdAt));
    return {
      orders: orders.map((o) => ({ id: o.id, kind: o.kind, status: o.status, amountCents: o.amountCents, currency: o.currency, items: o.items, plotId: o.plotId, createdAt: o.createdAt, paidAt: o.paidAt })),
      subscriptions: subs,
    };
  });

  // ── GL4: the /pay chooser (card through Stripe, or PayPal) for one-time orders ──
  const myPendingOrder = async (userId: string, id: string) => {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
    if (!o || o.userId !== userId) throw notFound('Order');
    return o;
  };
  app.get('/v1/orders/:id', { schema: { tags: ['billing'], summary: 'One of my orders, and how it can be paid', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const user = requireUser(req);
    const o = await myPendingOrder(user.id, req.params.id);
    return {
      order: { id: o.id, kind: o.kind, status: o.status, amountCents: o.amountCents, currency: o.currency, items: o.items.map((i) => ({ description: i.description, amountCents: i.amountCents, quantity: i.quantity ?? 1 })), cancelPath: o.cancelPath, createdAt: o.createdAt },
      providers: { stripe: !!config.STRIPE_SECRET_KEY, paypal: paypalEnabled() },
    };
  });
  app.post(
    '/v1/orders/:id/pay',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { tags: ['billing'], summary: 'Start paying a pending order with Stripe (card) or PayPal', params: z.object({ id: z.uuid() }), body: z.object({ provider: z.enum(['stripe', 'paypal']) }) } },
    async (req) => {
      const user = requireUser(req);
      requirePaidCheckout();
      const o = await myPendingOrder(user.id, req.params.id);
      if (o.status !== 'pending') throw badRequest(o.status === 'paid' ? 'This order is already paid' : 'This order can no longer be paid');
      if (req.body.provider === 'paypal') {
        if (!paypalEnabled()) throw badRequest('PayPal is not available');
        return { url: await paypalApprovalForOrder(o) };
      }
      return { url: await stripeSessionForOrder(o, user) };
    },
  );
  // PayPal sends the buyer back here (return_url / cancel_url point at the API).
  app.get(
    '/v1/paypal/return',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { hide: true, querystring: z.object({ order: z.uuid(), token: z.string().max(64) }) } },
    async (req, reply) => {
      const { ok, order } = await capturePaypalReturn(req.query.order, req.query.token);
      const web = (p: string, q: Record<string, string>) => `${config.APP_URL}${p}${p.includes('?') ? '&' : '?'}${new URLSearchParams(q)}`;
      if (ok && order) return reply.redirect(web(order.successPath ?? '/dashboard/billing', { checkout: 'success', order: order.id }), 303);
      return reply.redirect(web(order?.cancelPath ?? '/dashboard/billing', { checkout: 'failed', order: req.query.order }), 303);
    },
  );
  app.get('/v1/paypal/cancel', { schema: { hide: true, querystring: z.object({ order: z.uuid() }) } }, async (req, reply) => {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, req.query.order));
    const path = o?.cancelPath ?? '/dashboard/billing';
    return reply.redirect(`${config.APP_URL}${path}${path.includes('?') ? '&' : '?'}${new URLSearchParams({ checkout: 'cancelled', order: req.query.order })}`, 303);
  });

  // ── Dev mock checkout (never in production) ──
  app.post(
    '/v1/billing/mock/complete',
    { schema: { hide: true, body: z.object({ session: z.string().optional(), subscription: z.string().optional(), cancel: z.boolean().optional() }) } },
    async (req) => {
      if (!paymentsMock()) throw notFound();
      if (req.body.session) {
        const [order] = await db.select().from(schema.orders).where(eq(schema.orders.stripeSessionId, req.body.session));
        if (!order) throw notFound('Order');
        if (req.body.cancel) {
          const { expireOrder } = await import('../services/billing.js');
          await expireOrder(order.id);
          return { ok: true, status: 'expired' };
        }
        await fulfilOrder(order.id, `mock_pi_${order.id}`);
        return { ok: true, status: 'paid', orderId: order.id };
      }
      if (req.body.subscription) {
        await mockSubscribe(req.body.subscription, requireUser(req));
        return { ok: true, status: 'active' };
      }
      throw badRequest('Nothing to complete');
    },
  );

  // ── Stripe webhook (raw body for signature verification) ──
  await app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    scope.post('/v1/stripe/webhook', { config: { rateLimit: false }, schema: { hide: true } }, async (req, reply) => {
      if (!config.STRIPE_WEBHOOK_SECRET) return reply.status(503).send({ error: { code: 'not_configured', message: 'Webhook secret not set' } });
      const sig = req.headers['stripe-signature'];
      let event: Stripe.Event;
      try {
        event = (await stripe()).webhooks.constructEvent(req.body as Buffer, String(sig ?? ''), config.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        req.log.warn({ err: (err as Error).message }, 'Invalid Stripe signature');
        return reply.status(400).send({ error: { code: 'bad_signature', message: 'Invalid signature' } });
      }
      try {
        const res = await handleStripeEvent(event);
        return { received: true, ...res };
      } catch (err) {
        // Forget the event so Stripe's retry is processed instead of being skipped as a duplicate.
        await db.delete(schema.stripeEvents).where(eq(schema.stripeEvents.id, event.id)).catch(() => undefined);
        req.log.error({ err: (err as Error).message, type: event.type, id: event.id }, 'Stripe webhook handling failed; Stripe will retry');
        return reply.status(500).send({ error: { code: 'webhook_failed', message: 'Processing failed, please retry' } });
      }
    });
  });
}
