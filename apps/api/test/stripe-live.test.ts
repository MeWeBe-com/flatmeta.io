// A Stripe test key and webhook secret, set before the config module loads (never real values).
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_live_readiness';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live_readiness_secret';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { and, eq } from 'drizzle-orm';
import type { App } from '../src/app.js';

/**
 * Stripe live-readiness: checkout, webhook signatures, subscription create/update/cancel (including plan
 * changes made in the customer portal), the portal, failed payments, webhook retries, and the test-key guard
 * on production. Stripe itself is replaced by a small fake client; webhooks are signed for real.
 */
let app: App;
let h: typeof import('./helpers.js');
let dbm: typeof import('../src/db/client.js');
let billing: typeof import('../src/services/billing.js');
let cfg: typeof import('../src/config.js');

const signer = new Stripe('sk_test_dummy_for_live_readiness');
const calls: { method: string; args: unknown }[] = [];
let failNextRetrieve = false;
const subs = new Map<string, unknown>();

const fake = {
  // Signature checks use Stripe's real verifier: only API calls are faked.
  webhooks: signer.webhooks,
  customers: { create: async (args: unknown) => (calls.push({ method: 'customers.create', args }), { id: `cus_${calls.length}` }) },
  prices: {
    list: async (args: { lookup_keys: string[] }) => {
      calls.push({ method: 'prices.list', args });
      return { data: args.lookup_keys.map((k) => ({ id: `price_${k}`, lookup_key: k, active: true })) };
    },
  },
  checkout: { sessions: { create: async (args: unknown) => (calls.push({ method: 'checkout.sessions.create', args }), { id: 'cs_test_fake', url: 'https://checkout.stripe.test/c/pay/cs_test_fake' }) } },
  billingPortal: { sessions: { create: async (args: unknown) => (calls.push({ method: 'billingPortal.sessions.create', args }), { url: 'https://billing.stripe.test/p/session/test' }) } },
  subscriptions: {
    retrieve: async (id: string) => {
      if (failNextRetrieve) {
        failNextRetrieve = false;
        throw new Error('Stripe is having a moment');
      }
      return subs.get(id);
    },
  },
  refunds: { create: async (args: unknown) => (calls.push({ method: 'refunds.create', args }), { id: 're_test' }) },
};

beforeAll(async () => {
  h = await import('./helpers.js');
  dbm = await import('../src/db/client.js');
  billing = await import('../src/services/billing.js');
  cfg = await import('../src/config.js');
  app = await h.getApp();
  billing.setStripeClientForTests(fake as unknown as Partial<Stripe>);
});
afterAll(async () => {
  billing.setStripeClientForTests(null);
  await app.close();
  await dbm.pool.end();
  await (await import('../src/lib/redis.js')).closeRedis();
});
beforeEach(() => {
  calls.length = 0;
});

const json = (res: { body: string }) => JSON.parse(res.body);
let n = 0;
function webhook(type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({ id: `evt_live_${Date.now()}_${n++}`, object: 'event', type, data: { object } });
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: 'whsec_live_readiness_secret' });
  return () => app.inject({ method: 'POST', url: '/v1/stripe/webhook', headers: { 'content-type': 'application/json', 'stripe-signature': header }, payload });
}
const subscription = (id: string, opts: { userId: string; orgId?: string; metaPlan: string; lookupKey: string; status?: string; cancelAtPeriodEnd?: boolean }) => ({
  id,
  object: 'subscription',
  status: opts.status ?? 'active',
  cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
  metadata: { plan: opts.metaPlan, interval: 'month', userId: opts.userId, orgId: opts.orgId ?? '' },
  items: { data: [{ id: 'si_1', current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400, price: { id: `price_${opts.lookupKey}`, lookup_key: opts.lookupKey } }] },
});

describe('configuration checks', () => {
  it('tells live and test keys apart, and lists setup problems', () => {
    expect(cfg.stripeModeFor('sk_live_abc')).toBe('live');
    expect(cfg.stripeModeFor('rk_live_abc')).toBe('live');
    expect(cfg.stripeModeFor('sk_test_abc')).toBe('test');
    expect(cfg.stripeModeFor(undefined)).toBe('none');
    expect(cfg.stripeProblems({ APP_ENV: 'production', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }).join(' ')).toMatch(/TEST key is set on production/);
    expect(cfg.stripeProblems({ APP_ENV: 'staging', STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }).join(' ')).toMatch(/LIVE key is set on staging/);
    expect(cfg.stripeProblems({ APP_ENV: 'production', STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_WEBHOOK_SECRET: undefined }).join(' ')).toMatch(/WEBHOOK_SECRET is missing/);
    expect(cfg.stripeProblems({ APP_ENV: 'production', STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' })).toEqual([]);
  });

  it('stripe-sync plans exactly the missing or changed prices', async () => {
    const { planSync } = await import('../scripts/stripe-sync.js');
    const existing = [
      { id: 'price_a', lookupKey: 'flatmeta_plus_month', unitAmount: 500, currency: 'usd', interval: 'month', active: true },
      { id: 'price_b', lookupKey: 'flatmeta_plus_year', unitAmount: 4000, currency: 'usd', interval: 'year', active: true },
    ];
    const actions = planSync(existing, { prefix: 'flatmeta', currency: 'usd' });
    expect(actions).toHaveLength(6);
    expect(actions.find((a) => a.lookupKey === 'flatmeta_plus_month')!.kind).toBe('ok');
    expect(actions.find((a) => a.lookupKey === 'flatmeta_plus_year')).toMatchObject({ kind: 'changed', have: 4000, want: 4800 });
    expect(actions.filter((a) => a.kind === 'create').map((a) => a.lookupKey)).toEqual(['flatmeta_business_month', 'flatmeta_business_year', 'flatmeta_brand_month', 'flatmeta_brand_year']);
  });
});

describe('checkout and portal', () => {
  it('starts a subscription checkout with the price found by lookup key, for a new Stripe customer', async () => {
    const u = await h.login();
    const res = await app.inject({ method: 'POST', url: '/v1/billing/checkout', headers: u.headers, payload: { plan: 'plus', interval: 'year' } });
    expect(res.statusCode, res.body).toBe(200);
    expect(json(res).url).toBe('https://checkout.stripe.test/c/pay/cs_test_fake');
    const session = calls.find((c) => c.method === 'checkout.sessions.create')!.args as { mode: string; line_items: { price: string }[]; subscription_data: { metadata: Record<string, string> }; customer: string };
    expect(session.mode).toBe('subscription');
    expect(session.line_items[0]!.price).toBe('price_flatmeta_plus_year');
    expect(session.subscription_data.metadata).toMatchObject({ plan: 'plus', interval: 'year', userId: u.user.id });
    expect(session.customer).toMatch(/^cus_/);
  });

  it('opens the customer portal for the same customer', async () => {
    const u = await h.login();
    const res = await app.inject({ method: 'POST', url: '/v1/billing/portal', headers: u.headers, payload: {} });
    expect(res.statusCode, res.body).toBe(200);
    expect(json(res).url).toBe('https://billing.stripe.test/p/session/test');
    expect((calls.find((c) => c.method === 'billingPortal.sessions.create')!.args as { return_url: string }).return_url).toMatch(/\/dashboard\/billing$/);
  });

  it('one-time checkout binds the order to the session', async () => {
    const u = await h.login();
    const r = await billing.createCheckout({ user: u.user, orgId: null, kind: 'credits', items: [{ type: 'credits', description: 'Design pack', amountCents: 500 }], successPath: '/ok', cancelPath: '/no' });
    const args = calls.find((c) => c.method === 'checkout.sessions.create')!.args as { mode: string; client_reference_id: string; metadata: { orderId: string } };
    expect(args).toMatchObject({ mode: 'payment', client_reference_id: r.orderId, metadata: { orderId: r.orderId } });
  });
});

describe('webhooks', () => {
  it('rejects unsigned and tampered events', async () => {
    expect((await app.inject({ method: 'POST', url: '/v1/stripe/webhook', headers: { 'content-type': 'application/json' }, payload: '{}' })).statusCode).toBe(400);
    const payload = JSON.stringify({ id: 'evt_x', object: 'event', type: 'charge.refunded', data: { object: {} } });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: 'whsec_wrong' });
    expect((await app.inject({ method: 'POST', url: '/v1/stripe/webhook', headers: { 'content-type': 'application/json', 'stripe-signature': header }, payload })).statusCode).toBe(400);
  });

  it('subscription created → updated in the portal (plan from the price) → cancelled', async () => {
    const { db, schema } = dbm;
    const u = await h.login();
    const plan = async () => (await db.select({ plan: schema.users.plan }).from(schema.users).where(eq(schema.users.id, u.user.id)))[0]!.plan;
    const id = `sub_live_${Date.now()}`;
    expect((await webhook('customer.subscription.created', subscription(id, { userId: u.user.id, metaPlan: 'plus', lookupKey: 'flatmeta_plus_month' }))()).statusCode).toBe(200);
    expect(await plan()).toBe('plus');
    // In the portal they switch to yearly: the price changes, the metadata still says month.
    await webhook('customer.subscription.updated', subscription(id, { userId: u.user.id, metaPlan: 'plus', lookupKey: 'flatmeta_plus_year', cancelAtPeriodEnd: true }))();
    const [row] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.stripeSubscriptionId, id));
    expect(row).toMatchObject({ plan: 'plus', interval: 'year', cancelAtPeriodEnd: true, status: 'active' });
    await webhook('customer.subscription.deleted', subscription(id, { userId: u.user.id, metaPlan: 'plus', lookupKey: 'flatmeta_plus_year', status: 'canceled' }))();
    expect(await plan()).toBe('free');
  });

  it('an organisation upgraded from Business to Brand in the portal gets Brand', async () => {
    const { db, schema } = dbm;
    const u = await h.login();
    const [org] = await db.insert(schema.organizations).values({ slug: `org-${Date.now()}`, name: 'Portal Org', kind: 'business' }).returning();
    const id = `sub_org_${Date.now()}`;
    await webhook('customer.subscription.created', subscription(id, { userId: u.user.id, orgId: org!.id, metaPlan: 'business', lookupKey: 'flatmeta_business_month' }))();
    expect((await db.select().from(schema.organizations).where(eq(schema.organizations.id, org!.id)))[0]!.plan).toBe('business');
    await webhook('customer.subscription.updated', subscription(id, { userId: u.user.id, orgId: org!.id, metaPlan: 'business', lookupKey: 'flatmeta_brand_month' }))();
    expect((await db.select().from(schema.organizations).where(eq(schema.organizations.id, org!.id)))[0]!.plan).toBe('brand');
  });

  it('a failed renewal notifies the subscriber (subscription under invoice.parent, current API)', async () => {
    const { db, schema } = dbm;
    const u = await h.login();
    const id = `sub_fail_${Date.now()}`;
    await webhook('customer.subscription.created', subscription(id, { userId: u.user.id, metaPlan: 'plus', lookupKey: 'flatmeta_plus_month' }))();
    const res = await webhook('invoice.payment_failed', { id: `in_${Date.now()}`, object: 'invoice', attempt_count: 1, parent: { type: 'subscription_details', subscription_details: { subscription: id } } })();
    expect(res.statusCode).toBe(200);
    const notes = await db.select().from(schema.notifications).where(and(eq(schema.notifications.userId, u.user.id), eq(schema.notifications.kind, 'payment_failed')));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.payload).toMatchObject({ plan: 'plus' });
    // Older payloads (invoice.subscription) still work.
    await webhook('invoice.payment_failed', { id: `in_old_${Date.now()}`, object: 'invoice', subscription: id })();
    expect(await db.select().from(schema.notifications).where(and(eq(schema.notifications.userId, u.user.id), eq(schema.notifications.kind, 'payment_failed')))).toHaveLength(2);
  });

  it('a failure while handling an event returns 500 and the retry is processed, not skipped', async () => {
    const { db, schema } = dbm;
    const u = await h.login();
    const id = `sub_retry_${Date.now()}`;
    subs.set(id, subscription(id, { userId: u.user.id, metaPlan: 'plus', lookupKey: 'flatmeta_plus_month' }));
    const send = webhook('checkout.session.completed', { id: 'cs_sub', object: 'checkout.session', mode: 'subscription', subscription: id, metadata: {} });
    failNextRetrieve = true;
    expect((await send()).statusCode).toBe(500);
    const retry = await send(); // Stripe retries the same event
    expect(retry.statusCode).toBe(200);
    expect(json(retry).duplicate).toBe(false);
    expect((await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.stripeSubscriptionId, id)))[0]?.status).toBe('active');
  });
});

describe('test key on production', () => {
  it('refuses checkout, portal and payouts, and warns admins', async () => {
    const before = { env: cfg.config.APP_ENV, paid: cfg.config.PAID_CHECKOUT_ENABLED };
    cfg.config.APP_ENV = 'production';
    cfg.config.PAID_CHECKOUT_ENABLED = 'true';
    try {
      const u = await h.login();
      const co = await app.inject({ method: 'POST', url: '/v1/billing/checkout', headers: u.headers, payload: { plan: 'plus' } });
      expect(co.statusCode).toBe(503);
      expect(json(co).error.code).toBe('stripe_test_key');
      expect(calls.some((c) => c.method === 'checkout.sessions.create')).toBe(false);
      expect((await app.inject({ method: 'POST', url: '/v1/billing/portal', headers: u.headers, payload: {} })).statusCode).toBe(503);
      await expect(import('../src/services/payments/provider.js').then((m) => m.getPaymentProvider())).rejects.toThrow(/unavailable/);

      const admin = await h.login(undefined, 'admin');
      const status = json(await app.inject({ url: '/v1/admin/payments-status', headers: admin.headers }));
      expect(status).toMatchObject({ mode: 'test', checkoutBlocked: true, webhookSecret: true });
      expect(status.problems.join(' ')).toMatch(/TEST key is set on production/);
      expect(JSON.stringify(status)).not.toMatch(/sk_test_dummy|whsec_live_readiness/); // never leaks secrets
    } finally {
      cfg.config.APP_ENV = before.env;
      cfg.config.PAID_CHECKOUT_ENABLED = before.paid;
    }
  });
});
