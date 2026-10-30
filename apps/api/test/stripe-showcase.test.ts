// Stripe keys must be set before the config module loads.
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_signature_checks';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import type { App } from '../src/app.js';

let app: App;
let h: typeof import('./helpers.js');
let dbm: typeof import('../src/db/client.js');

beforeAll(async () => {
  h = await import('./helpers.js');
  dbm = await import('../src/db/client.js');
  app = await h.getApp();
});
afterAll(async () => {
  await app.close();
  await dbm.pool.end();
  await (await import('../src/lib/redis.js')).closeRedis();
});

const stripe = new Stripe('sk_test_dummy_for_signature_checks');
function signed(event: object) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
  return { payload, header };
}

describe('Stripe webhook', () => {
  it('rejects bad signatures', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/stripe/webhook', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' }, payload: '{}' });
    expect(res.statusCode).toBe(400);
  });

  it('fulfils a paid land order exactly once', async () => {
    const { db, schema } = dbm;
    const { user } = await h.login();
    const { createPlot } = await import('../src/services/plots.js');
    const plot = await createPlot({ rect: h.freeRect(), title: 'Webhook plot', kind: 'standard', status: 'pending_payment', ownerUserId: user.id, tier: 'C', countryCode: 'GB', regionSlug: null, holdMinutes: 30 });
    const [order] = await db.insert(schema.orders).values({ userId: user.id, kind: 'land', amountCents: 800, items: [], plotId: plot.id, stripeSessionId: 'cs_test_1' }).returning();
    const event = {
      id: 'evt_test_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_1', object: 'checkout.session', mode: 'payment', payment_status: 'paid', metadata: { orderId: order!.id, kind: 'land' }, client_reference_id: order!.id, payment_intent: 'pi_test_1' } },
    };
    const { payload, header } = signed(event);
    const send = () => app.inject({ method: 'POST', url: '/v1/stripe/webhook', headers: { 'content-type': 'application/json', 'stripe-signature': header }, payload });
    const first = JSON.parse((await send()).body);
    expect(first.duplicate).toBe(false);
    const [p] = await db.select().from(schema.plots).where(eq(schema.plots.id, plot.id));
    expect(p!.status).toBe('active');
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, order!.id));
    expect(o!.status).toBe('paid');
    expect(o!.stripePaymentIntent).toBe('pi_test_1');
    const again = JSON.parse((await send()).body);
    expect(again.duplicate).toBe(true);
  });
});

describe('showcase', () => {
  it('places curated entries without overlap and upserts idempotently', async () => {
    const { upsertShowcase } = await import('../src/showcase/generator.js');
    const base = {
      kind: 'company', sector: 'tech', city: 'London', lat: 51.5, lng: -0.12, website: 'https://example.org', title: 't', tagline: 'tag', description: 'desc',
      useCase: 'demo', cta: null, highlights: ['a'], imagePrompt: 'an island', palette: ['#112233', '#445566', '#778899'], motif: 'city', size: { w: 3, h: 2 }, tags: ['x'],
    };
    const stats = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] as string[], plots: [] as string[] };
    const a = await upsertShowcase({ ...base, brand: 'Example One', slug: 'example-one' }, 'GB', { countries: ['GB'], source: 'curated', approve: true }, stats);
    const b = await upsertShowcase({ ...base, brand: 'Example Two', slug: 'example-two' }, 'GB', { countries: ['GB'], source: 'curated', approve: true }, stats);
    expect(stats.created).toBe(2);
    const overlap = a!.minGx <= b!.maxGx && b!.minGx <= a!.maxGx && a!.minGy <= b!.maxGy && b!.minGy <= a!.maxGy;
    expect(overlap).toBe(false);
    await upsertShowcase({ ...base, brand: 'Example One', slug: 'example-one' }, 'GB', { countries: ['GB'], source: 'curated' }, stats);
    expect(stats.skipped).toBe(1);
    const page = JSON.parse((await app.inject('/v1/plots/example-one')).body);
    expect(page.plot.showcase.brand).toBe('Example One');
    expect(page.plot.owner).toBeNull();
  });

  it('routes claims by work-email domain', async () => {
    const { headers } = await h.login();
    const off = JSON.parse((await app.inject({ method: 'POST', url: '/v1/showcase/example-two/claim', headers, payload: { email: 'me@gmail.com', orgName: 'Example Two' } })).body);
    expect(off.status).toBe('manual_review');
    const on = JSON.parse((await app.inject({ method: 'POST', url: '/v1/showcase/example-two/claim', headers, payload: { email: 'boss@example.org', orgName: 'Example Two' } })).body);
    expect(on.status).toBe('pending_email');
    expect(on.devCode).toMatch(/^\d{6}$/); // echoed only in dev when SMTP is not configured
    const wrong = await app.inject({ method: 'POST', url: '/v1/showcase/claim/verify', headers, payload: { requestId: on.requestId, code: on.devCode === '000000' ? '111111' : '000000' } });
    expect(wrong.statusCode).toBe(400);
  });
});
