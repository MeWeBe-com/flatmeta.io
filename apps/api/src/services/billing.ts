import { and, eq, inArray, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { config, paidCheckout, paymentsMock, stripeTestKeyOnProduction } from '../config.js';
import { db, schema } from '../db/client.js';
import type { Order, OrderItem, User } from '../db/schema.js';
import { HttpError, badRequest, comingSoon } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { emailUser, quietly, templates } from '../email/index.js';
import { SUBSCRIPTION_PRICES, UPGRADES, type UpgradeKind } from '../lib/pricing.js';
import { notify, publishActivity } from '../game/activity.js';
import { recordAction, unlock } from '../game/engine.js';
import { activatePlot, afterClaim, createPlot, ensureCover, releasePlot } from './plots.js';

let stripeClient: Stripe | null = null;
/** Tests only: replace the Stripe client with a fake (pass null to go back to the real one). */
export function setStripeClientForTests(c: Partial<Stripe> | null) {
  if (config.NODE_ENV !== 'test') throw new Error('setStripeClientForTests is for tests only');
  stripeClient = c as Stripe | null;
}
export async function stripe(): Promise<Stripe> {
  if (!config.STRIPE_SECRET_KEY) throw new HttpError(503, 'payments_unavailable', 'Payments are not configured yet');
  if (!stripeClient) {
    const { default: StripeCtor } = await import('stripe');
    stripeClient = new StripeCtor(config.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

const web = (p: string) => `${config.APP_URL.replace(/\/$/, '')}${p}`;
const withParams = (p: string, params: Record<string, string>) => `${p}${p.includes('?') ? '&' : '?'}${new URLSearchParams(params).toString()}`;

async function customerFor(user: User, orgId: string | null): Promise<string | undefined> {
  if (!config.STRIPE_SECRET_KEY) return undefined;
  const s = await stripe();
  if (orgId) {
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId));
    if (org?.stripeCustomerId) return org.stripeCustomerId;
    const c = await s.customers.create({ email: user.email, name: org?.name, metadata: { orgId } });
    await db.update(schema.organizations).set({ stripeCustomerId: c.id }).where(eq(schema.organizations.id, orgId));
    return c.id;
  }
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const c = await s.customers.create({ email: user.email, name: user.displayName, metadata: { userId: user.id } });
  await db.update(schema.users).set({ stripeCustomerId: c.id }).where(eq(schema.users.id, user.id));
  return c.id;
}

export interface CheckoutInput {
  user: User;
  orgId: string | null;
  kind: 'land' | 'upgrade' | 'landmark' | 'credits' | 'listing';
  plotId?: string | null;
  listingId?: string | null;
  listingVersion?: number | null;
  items: OrderItem[];
  successPath: string;
  cancelPath: string;
}

/** One gate for every way of paying. */
export function requirePaidCheckout() {
  if (!paidCheckout()) throw comingSoon();
  requireLiveKeyOnProduction();
}

/** A test key on production would take "payments" that never charge anyone: refuse instead. */
export function requireLiveKeyOnProduction() {
  if (stripeTestKeyOnProduction()) {
    logger.error('Checkout refused: a Stripe test key is configured on production');
    throw new HttpError(503, 'stripe_test_key', 'Payments are temporarily unavailable. Please try again later.');
  }
}

/** Creates an order and a one-time Stripe Checkout Session (or the dev mock). */
export async function createCheckout(input: CheckoutInput): Promise<{ url: string; orderId: string }> {
  requirePaidCheckout();
  const amountCents = input.items.reduce((s, i) => s + i.amountCents * (i.quantity ?? 1), 0);
  if (amountCents < 50) throw badRequest('Amount too small for a card payment');
  const [order] = await db
    .insert(schema.orders)
    .values({ userId: input.user.id, orgId: input.orgId, kind: input.kind, amountCents, currency: config.CURRENCY, items: input.items, plotId: input.plotId ?? null, listingId: input.listingId ?? null, listingVersion: input.listingVersion ?? null })
    .returning();
  const orderId = order!.id;

  if (paymentsMock()) {
    const sessionId = `mock_${orderId}`;
    await db.update(schema.orders).set({ stripeSessionId: sessionId }).where(eq(schema.orders.id, orderId));
    return { url: web(`/checkout/mock?session=${sessionId}&next=${encodeURIComponent(input.successPath)}&cancel=${encodeURIComponent(input.cancelPath)}`), orderId };
  }

  const s = await stripe();
  const session = await s.checkout.sessions.create({
    mode: 'payment',
    customer: await customerFor(input.user, input.orgId),
    client_reference_id: orderId,
    metadata: { orderId, kind: input.kind },
    payment_intent_data: { metadata: { orderId, kind: input.kind } },
    line_items: input.items.map((i) => ({
      quantity: i.quantity ?? 1,
      price_data: { currency: config.CURRENCY, unit_amount: i.amountCents, product_data: { name: i.description.slice(0, 120) } },
    })),
    automatic_tax: { enabled: config.STRIPE_AUTOMATIC_TAX },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60 + 60,
    success_url: web(withParams(input.successPath, { checkout: 'success', order: orderId })),
    cancel_url: web(withParams(input.cancelPath, { checkout: 'cancelled', order: orderId })),
  });
  await db.update(schema.orders).set({ stripeSessionId: session.id }).where(eq(schema.orders.id, orderId));
  return { url: session.url!, orderId };
}

export type PlanName = 'plus' | 'business' | 'brand';
const PLANS: PlanName[] = ['plus', 'business', 'brand'];
const INTERVALS: Interval[] = ['month', 'year'];

/** The lookup key scripts/stripe-sync.ts gives each subscription price, e.g. flatmeta_plus_month. */
export const lookupKeyFor = (plan: PlanName, interval: Interval) => `${config.STRIPE_LOOKUP_PREFIX}_${plan}_${interval}`;
export type Interval = 'month' | 'year';

/** Price ID from env (STRIPE_PRICE_<PLAN>_<INTERVAL>), if set. */
export function priceIdFor(plan: PlanName, interval: Interval): string | undefined {
  const map: Record<string, string | undefined> = {
    'plus:month': config.STRIPE_PRICE_PLUS_MONTH,
    'plus:year': config.STRIPE_PRICE_PLUS_YEAR,
    'business:month': config.STRIPE_PRICE_BUSINESS_MONTH,
    'business:year': config.STRIPE_PRICE_BUSINESS_YEAR,
    'brand:month': config.STRIPE_PRICE_BRAND_MONTH,
    'brand:year': config.STRIPE_PRICE_BRAND_YEAR,
  };
  return map[`${plan}:${interval}`];
}

const lookupCache = new Map<string, { id: string | null; at: number }>();
/** The price to sell: env first, else the active price with our lookup key (cached 10 minutes). */
export async function resolvePrice(plan: PlanName, interval: Interval): Promise<string | undefined> {
  const fromEnv = priceIdFor(plan, interval);
  if (fromEnv) return fromEnv;
  const key = lookupKeyFor(plan, interval);
  const hit = lookupCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.id ?? undefined;
  const res = await (await stripe()).prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const id = res.data[0]?.id ?? null;
  lookupCache.set(key, { id, at: Date.now() });
  return id ?? undefined;
}

/**
 * Which plan a Stripe price stands for: our env price IDs, else its lookup key. Plan changes made in the
 * customer portal switch the price but keep the subscription's metadata, so the price is the truth.
 */
export function planFromPrice(price: { id?: string; lookup_key?: string | null } | null | undefined): { plan: PlanName; interval: Interval } | null {
  if (!price) return null;
  for (const plan of PLANS) for (const interval of INTERVALS) if (price.id && priceIdFor(plan, interval) === price.id) return { plan, interval };
  const m = price.lookup_key?.match(new RegExp(`^${config.STRIPE_LOOKUP_PREFIX}_(plus|business|brand)_(month|year)$`));
  return m ? { plan: m[1] as PlanName, interval: m[2] as Interval } : null;
}

export async function createSubscriptionCheckout(user: User, plan: PlanName, interval: Interval, orgId: string | null, opts: { returnPath?: string; source?: string } = {}): Promise<{ url: string }> {
  requirePaidCheckout();
  if (plan !== 'plus' && !orgId) throw badRequest('Business and Brand plans belong to an organisation. Create one first.');
  if (plan === 'plus' && orgId) throw badRequest('Plus is a personal plan');
  // G13: an upgrade started from a paywall returns to where the person was, with the feature unlocked.
  const back = opts.returnPath && isSafeReturnPath(opts.returnPath) ? opts.returnPath : null;
  const successPath = back ? `${back}${back.includes('?') ? '&' : '?'}upgraded=${plan}` : orgId ? `/dashboard/orgs?checkout=success` : `/dashboard/billing?checkout=success`;
  const cancelPath = back ?? '/pricing?checkout=cancelled';
  if (paymentsMock()) {
    const id = `mocksub_${plan}_${interval}_${orgId ?? user.id}`;
    return { url: web(`/checkout/mock?subscription=${encodeURIComponent(id)}&next=${encodeURIComponent(successPath)}&cancel=${encodeURIComponent(cancelPath)}`) };
  }
  const price = await resolvePrice(plan, interval);
  if (!price) throw new HttpError(503, 'plan_unavailable', `The ${plan} plan is not configured yet (missing Stripe price).`);
  const meta = { plan, interval, userId: user.id, orgId: orgId ?? '', source: opts.source ?? 'pricing' };
  const s = await stripe();
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer: await customerFor(user, orgId),
    line_items: [{ price, quantity: 1 }],
    metadata: meta,
    subscription_data: { metadata: meta },
    allow_promotion_codes: true,
    automatic_tax: { enabled: config.STRIPE_AUTOMATIC_TAX },
    success_url: web(successPath),
    cancel_url: web(cancelPath),
  });
  return { url: session.url! };
}

/** A path on our own site (no scheme, no host, no protocol-relative //, no backslashes). */
export const isSafeReturnPath = (p: string) => /^\/(?![/\\])[A-Za-z0-9\-._~/?=&%+@]*$/.test(p) && p.length <= 200;

export async function portalUrl(user: User, orgId: string | null): Promise<string> {
  if (paymentsMock()) return web(orgId ? '/dashboard/orgs?portal=mock' : '/dashboard/billing?portal=mock');
  requireLiveKeyOnProduction();
  const customer = await customerFor(user, orgId);
  const s = await stripe();
  const session = await s.billingPortal.sessions.create({ customer: customer!, return_url: web(orgId ? '/dashboard/orgs' : '/dashboard/billing') });
  return session.url;
}

// ─── Fulfilment (shared by the webhook and the dev mock) ─────────────────────

async function fulfilLand(order: Order) {
  if (!order.plotId) return;
  let plot = await activatePlot(order.plotId);
  if (!plot) {
    const [existing] = await db.select().from(schema.plots).where(eq(schema.plots.id, order.plotId));
    if (existing?.status === 'active') return; // already done
    if (existing?.status === 'released') {
      // The hold expired before payment arrived: try to re-create the same plot.
      try {
        plot = await createPlot({
          rect: { minGx: existing.minGx, minGy: existing.minGy, maxGx: existing.maxGx, maxGy: existing.maxGy },
          title: existing.title,
          kind: 'standard',
          status: 'active',
          ownerUserId: existing.ownerUserId,
          ownerOrgId: existing.ownerOrgId,
          tier: existing.tier as 'S',
          countryCode: existing.countryCode,
          regionSlug: existing.regionSlug,
        });
        await db.update(schema.orders).set({ plotId: plot.id }).where(eq(schema.orders.id, order.id));
      } catch {
        await refundOrder(order, 'Land was taken before payment completed');
        if (order.userId) await notify(order.userId, 'refund', { reason: 'The land was claimed by someone else before your payment completed. You have been refunded in full.' });
        return;
      }
    } else return;
  }
  plot = await ensureCover(plot, order.userId);
  await afterClaim(plot, order.userId);
}

async function fulfilUpgrade(order: Order) {
  for (const item of order.items) {
    const kind = item.meta?.upgrade as UpgradeKind | undefined;
    const plotId = (item.meta?.plotId as string | undefined) ?? order.plotId;
    if (kind === 'credits') {
      if (order.userId) await db.update(schema.users).set({ aiCreditsBonus: sql`${schema.users.aiCreditsBonus} + ${UPGRADES.credits.credits}` }).where(eq(schema.users.id, order.userId));
      continue;
    }
    if (!kind || !plotId) continue;
    const days = UPGRADES[kind].days;
    const col = kind === 'spotlight' ? schema.plots.spotlightUntil : schema.plots.beaconUntil;
    const [p] = await db
      .update(schema.plots)
      .set({ [kind === 'spotlight' ? 'spotlightUntil' : 'beaconUntil']: sql`greatest(coalesce(${col}, now()), now()) + make_interval(days => ${days})` })
      .where(eq(schema.plots.id, plotId))
      .returning();
    if (order.userId) {
      await recordAction(order.userId, 'upgrade', { ref: order.id });
      if (kind === 'spotlight') await unlock(order.userId, 'spotlight');
    }
    if (p) await publishActivity({ kind: kind === 'spotlight' ? 'spotlight' : 'beacon', actorUserId: order.userId, plotId: p.id, countryCode: p.countryCode, lat: p.centerLat, lng: p.centerLng, payload: { title: p.title, slug: p.slug } });
  }
}

/** Marks an order paid and delivers it. Safe to call more than once. */
export async function fulfilOrder(orderId: string, paymentIntent?: string | null): Promise<Order | null> {
  const [order] = await db
    .update(schema.orders)
    .set({ status: 'paid', paidAt: new Date(), stripePaymentIntent: paymentIntent ?? null, updatedAt: new Date() })
    .where(and(eq(schema.orders.id, orderId), inArray(schema.orders.status, ['pending', 'expired'])))
    .returning();
  if (!order) return null;
  try {
    if (order.kind === 'land') await fulfilLand(order);
    else if (order.kind === 'upgrade' || order.kind === 'credits') await fulfilUpgrade(order);
    else if (order.kind === 'listing') {
      const { fulfilListing } = await import('./marketplace.js');
      await fulfilListing(order);
    } else if (order.kind === 'landmark') {
      const { completeLandmarkClaim } = await import('./showcase-claim.js');
      await completeLandmarkClaim(order);
    }
  } catch (err) {
    logger.error({ err, orderId }, 'Order fulfilment failed');
    await db.insert(schema.moderationFlags).values({ targetType: 'order', targetId: order.id, source: 'system', reason: `Fulfilment failed: ${(err as Error).message}`.slice(0, 500) });
  }
  return order;
}

export async function expireOrder(orderId: string) {
  const [order] = await db
    .update(schema.orders)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.status, 'pending')))
    .returning();
  if (order?.plotId && order.kind === 'land') {
    const [p] = await db.select().from(schema.plots).where(eq(schema.plots.id, order.plotId));
    if (p?.status === 'pending_payment') await releasePlot(p.id);
  }
}

export async function refundOrder(order: Order, reason: string) {
  if (order.stripePaymentIntent && config.STRIPE_SECRET_KEY) {
    await (await stripe()).refunds.create({ payment_intent: order.stripePaymentIntent, metadata: { orderId: order.id, reason } });
  }
  await db.update(schema.orders).set({ status: 'refunded', updatedAt: new Date() }).where(eq(schema.orders.id, order.id));
  if (order.kind === 'land' && order.plotId) {
    const [p] = await db.select().from(schema.plots).where(eq(schema.plots.id, order.plotId));
    if (p && (p.status === 'active' || p.status === 'pending_payment')) await releasePlot(p.id);
  }
}

// ─── Subscriptions ──────────────────────────────────────────────────────────

async function applyPlan(userId: string | null, orgId: string | null) {
  // The effective plan is the best active subscription; fall back to free.
  const subs = await db
    .select()
    .from(schema.subscriptions)
    .where(and(orgId ? eq(schema.subscriptions.orgId, orgId) : eq(schema.subscriptions.userId, userId ?? ''), inArray(schema.subscriptions.status, ['active', 'trialing', 'past_due'])));
  const rank = ['free', 'plus', 'business', 'brand'];
  const best = subs.map((s) => s.plan).sort((a, b) => rank.indexOf(b) - rank.indexOf(a))[0] ?? 'free';
  if (orgId) {
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId));
    // Keep a time-limited grant (e.g. 3 months of Brand with a Landmark) while it lasts.
    const grantActive = org?.planUntil && org.planUntil.getTime() > Date.now();
    if (!grantActive || rank.indexOf(best) >= rank.indexOf(org.plan)) {
      await db.update(schema.organizations).set({ plan: best, updatedAt: new Date() }).where(eq(schema.organizations.id, orgId));
    }
  } else if (userId) {
    await db.update(schema.users).set({ plan: best === 'plus' ? 'plus' : 'free', updatedAt: new Date() }).where(eq(schema.users.id, userId));
  }
}

export async function upsertSubscription(input: {
  stripeSubscriptionId: string;
  plan: PlanName;
  interval: Interval;
  status: string;
  userId: string | null;
  orgId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}) {
  await db
    .insert(schema.subscriptions)
    .values(input)
    .onConflictDoUpdate({
      target: schema.subscriptions.stripeSubscriptionId,
      set: { status: input.status, plan: input.plan, interval: input.interval, currentPeriodEnd: input.currentPeriodEnd, cancelAtPeriodEnd: input.cancelAtPeriodEnd, updatedAt: new Date() },
    });
  await applyPlan(input.userId, input.orgId);
  if (input.orgId && (input.plan === 'business' || input.plan === 'brand') && input.status === 'active' && input.userId) {
    await unlock(input.userId, 'business-verified').catch(() => undefined);
  }
}

/** Dev mock: activates a subscription without Stripe. */
export async function mockSubscribe(id: string, user: User) {
  const [, plan, interval, ownerId] = id.split('_') as [string, PlanName, Interval, string];
  if (!SUBSCRIPTION_PRICES[plan]) throw badRequest('Unknown plan');
  const orgId = plan === 'plus' ? null : ownerId;
  await upsertSubscription({
    stripeSubscriptionId: `${id}_${Date.now()}`,
    plan,
    interval,
    status: 'active',
    userId: user.id,
    orgId,
    currentPeriodEnd: new Date(Date.now() + (interval === 'year' ? 365 : 30) * 86400_000),
    cancelAtPeriodEnd: false,
  });
}

export function subscriptionFromStripe(sub: Stripe.Subscription) {
  const m = sub.metadata ?? {};
  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined;
  const periodEnd = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  // The price is the truth (portal upgrades/downgrades change it, not the metadata); metadata is the fallback.
  const fromPrice = planFromPrice(item?.price);
  return {
    stripeSubscriptionId: sub.id,
    plan: fromPrice?.plan ?? (m.plan as PlanName) ?? 'plus',
    interval: fromPrice?.interval ?? (m.interval as Interval) ?? 'month',
    status: sub.status,
    userId: m.userId || null,
    orgId: m.orgId || null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}

/** Handles one verified Stripe event (idempotent by event id). */
export async function handleStripeEvent(event: Stripe.Event) {
  const inserted = await db.insert(schema.stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning();
  if (!inserted.length) return { duplicate: true };
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode === 'payment' && s.payment_status === 'paid') {
        const orderId = s.metadata?.orderId ?? s.client_reference_id;
        if (orderId) await fulfilOrder(orderId, typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id);
      }
      if (s.mode === 'subscription' && s.subscription) {
        const sub = await (await stripe()).subscriptions.retrieve(typeof s.subscription === 'string' ? s.subscription : s.subscription.id);
        await upsertSubscription(subscriptionFromStripe(sub));
      }
      break;
    }
    case 'checkout.session.expired': {
      const s = event.data.object as Stripe.Checkout.Session;
      const orderId = s.metadata?.orderId ?? s.client_reference_id;
      if (orderId) await expireOrder(orderId);
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await upsertSubscription(subscriptionFromStripe(event.data.object as Stripe.Subscription));
      break;
    case 'invoice.payment_failed': {
      // Since API version 2025-03-31 the subscription sits under invoice.parent.subscription_details.
      const inv = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } | null };
      const parentSub = (inv as { parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null }).parent?.subscription_details?.subscription;
      const ref = parentSub ?? inv.subscription ?? null;
      const subId = typeof ref === 'string' ? ref : (ref?.id ?? null);
      if (subId) {
        const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.stripeSubscriptionId, subId));
        if (sub?.userId) {
          await notify(sub.userId, 'payment_failed', { plan: sub.plan, attempt: inv.attempt_count ?? 1 });
          // One email per invoice, however often Stripe retries.
          await quietly(emailUser(sub.userId, templates.paymentFailed(sub.plan, sub.orgId ? '/dashboard/orgs' : '/dashboard/billing'), { idempotencyKey: `payment-failed-${inv.id}` }));
        } else logger.warn({ subscription: subId }, 'invoice.payment_failed for an unknown subscription');
      }
      break;
    }
    case 'charge.refunded': {
      const ch = event.data.object as Stripe.Charge;
      const pi = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent?.id;
      if (pi) {
        const [order] = await db.select().from(schema.orders).where(eq(schema.orders.stripePaymentIntent, pi));
        if (order && order.status === 'paid' && ch.refunded) await refundOrder({ ...order, stripePaymentIntent: null }, 'Refunded in Stripe');
      }
      break;
    }
  }
  return { duplicate: false };
}
