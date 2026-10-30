import { desc, eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { z } from 'zod';
import type { App } from '../app.js';
import { config, paymentsMock } from '../config.js';
import { db, schema } from '../db/client.js';
import { requireUser } from '../lib/auth.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { DEFAULT_TIERS, LANDMARK_PRICE_CENTS, PLANS, SUBSCRIPTION_PRICES, UPGRADES } from '../lib/pricing.js';
import { createCheckout, createSubscriptionCheckout, fulfilOrder, handleStripeEvent, mockSubscribe, portalUrl, stripe } from '../services/billing.js';
import { getPrices } from '../services/plots.js';
import { canEditPlot, orgRole } from './views.js';
import { loadPlot } from './plots.js';

const PLAN_FEATURES = {
  free: ['Free Homestead plot', 'Mini-page with links', `${PLANS.free.aiCredits} AI designs / month`, 'Quests, badges & leaderboards'],
  plus: [`${PLANS.plus.aiCredits} AI designs / month`, 'Custom slug & animated frames', 'Visit analytics', `Up to ${PLANS.plus.maxPlots} plots`, '10% off land', 'Plus badge'],
  business: ['Verified business badge', 'Hours, offers, contact & booking', '"Open now" marker on the map', '1 Spotlight every month', `${PLANS.business.aiCredits} AI designs / month`, 'Plots up to 20×20, 3 seats', 'LocalBusiness rich results'],
  brand: ['Everything in Business', `Portfolio of up to ${PLANS.brand.maxPlots} plots`, 'Claim your showcase Landmark', 'API & MCP access', '10 seats, priority support', 'Campaign tools (coming soon)'],
};

export default async function billingRoutes(app: App) {
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
      landmarkPriceCents: LANDMARK_PRICE_CENTS,
    };
  });

  app.post(
    '/v1/billing/checkout',
    { schema: { tags: ['billing'], summary: 'Start a subscription checkout', body: z.object({ plan: z.enum(['plus', 'business', 'brand']), interval: z.enum(['month', 'year']).default('month'), orgId: z.uuid().optional() }) } },
    async (req) => {
      const user = requireUser(req);
      if (req.body.orgId) {
        const role = await orgRole(user.id, req.body.orgId);
        if (role !== 'owner' && role !== 'admin') throw forbidden('Only organisation owners and admins can manage billing');
      }
      return createSubscriptionCheckout(user, req.body.plan, req.body.interval, req.body.orgId ?? null);
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
      if (!(await canEditPlot(user, plot))) throw forbidden();
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
      const res = await handleStripeEvent(event);
      return { received: true, ...res };
    });
  });
}
