import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { config } from '../src/config.js';
import { setPaypalFetchForTests } from '../src/services/paypal.js';
import type { App } from '../src/app.js';
import { getApp, login } from './helpers.js';

/**
 * GL4: PayPal Checkout for one-time orders. The network is replaced; the server creates the PayPal order from our
 * own order row (amount, currency, our id) and fulfils only after a COMPLETED capture that matches it.
 */
let app: App;
const saved = { id: config.PAYPAL_CLIENT_ID, secret: config.PAYPAL_CLIENT_SECRET };
beforeAll(async () => {
  app = await getApp();
  config.PAYPAL_CLIENT_ID = 'test-client';
  config.PAYPAL_CLIENT_SECRET = 'test-secret';
});
afterAll(async () => {
  config.PAYPAL_CLIENT_ID = saved.id;
  config.PAYPAL_CLIENT_SECRET = saved.secret;
  setPaypalFetchForTests(null);
  await app.close();
  await pool.end();
  await closeRedis();
});
const json = (res: { body: string }) => JSON.parse(res.body);

/** A fake PayPal: records requests; capture answers with what `captureAs` says. */
function fakePaypal(captureAs: (orderId: string, amount: string) => object) {
  const calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
  let created: { custom_id: string; value: string } | null = null;
  setPaypalFetchForTests((async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body && init.body !== 'grant_type=client_credentials' ? JSON.parse(String(init.body)) : init?.body;
    calls.push({ url, body, headers: (init?.headers ?? {}) as Record<string, string> });
    const reply = (status: number, b: object) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/v1/oauth2/token')) return reply(200, { access_token: 'A21-test', expires_in: 3600 });
    if (url.endsWith('/v2/checkout/orders')) {
      const pu = (body as { purchase_units: { custom_id: string; amount: { value: string } }[] }).purchase_units[0]!;
      created = { custom_id: pu.custom_id, value: pu.amount.value };
      return reply(201, { id: 'PAYPAL-ORDER-1', status: 'PAYER_ACTION_REQUIRED', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1' }] });
    }
    if (url.includes('/capture')) return reply(201, captureAs(created!.custom_id, created!.value));
    return reply(404, {});
  }) as typeof fetch);
  return calls;
}
const completed = (orderId: string, value: string) => ({
  id: 'PAYPAL-ORDER-1',
  status: 'COMPLETED',
  purchase_units: [{ reference_id: orderId, payments: { captures: [{ id: 'CAPTURE-1', status: 'COMPLETED', custom_id: orderId, amount: { value, currency_code: 'USD' } }] } }],
});

async function creditsOrder() {
  const u = await login();
  const res = json(await app.inject({ method: 'POST', url: '/v1/billing/credits', headers: u.headers }));
  return { u, orderId: res.orderId as string };
}

describe('PayPal checkout (GL4)', () => {
  it('pays a one-time order: server-side amount, approval link, capture, fulfilled once', async () => {
    const calls = fakePaypal(completed);
    const { u, orderId } = await creditsOrder();
    const view = json(await app.inject({ url: `/v1/orders/${orderId}`, headers: u.headers }));
    expect(view.providers.paypal).toBe(true);
    // Someone else can't see or pay it.
    const stranger = await login();
    expect((await app.inject({ url: `/v1/orders/${orderId}`, headers: stranger.headers })).statusCode).toBe(404);
    const pay = await app.inject({ method: 'POST', url: `/v1/orders/${orderId}/pay`, headers: u.headers, payload: { provider: 'paypal' } });
    expect(pay.statusCode).toBe(200);
    expect(json(pay).url).toMatch(/^https:\/\/www\.sandbox\.paypal\.com\/checkoutnow\?token=PAYPAL-ORDER-1$/);
    const create = calls.find((c) => c.url.endsWith('/v2/checkout/orders'))!;
    expect(create.url).toMatch(/^https:\/\/api-m\.sandbox\.paypal\.com\//);
    const unit = (create.body as { purchase_units: { custom_id: string; amount: { value: string; currency_code: string } }[] }).purchase_units[0]!;
    expect(unit).toMatchObject({ custom_id: orderId, amount: { value: '5.00', currency_code: 'USD' } }); // the AI pack, from our price list
    expect(create.headers['paypal-request-id']).toBe(`fm-${orderId}`);
    // Back from PayPal: captured and fulfilled, then to the order's success page.
    const back = await app.inject({ url: `/v1/paypal/return?order=${orderId}&token=PAYPAL-ORDER-1` });
    expect(back.statusCode).toBe(303);
    expect(back.headers.location).toBe(`${config.APP_URL}/dashboard/billing?credits=1&checkout=success&order=${orderId}`);
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(o).toMatchObject({ status: 'paid', provider: 'paypal', paypalOrderId: 'PAYPAL-ORDER-1', paypalCaptureId: 'CAPTURE-1' });
    // A reload of the return page doesn't capture or fulfil again.
    const captures = calls.filter((c) => c.url.includes('/capture')).length;
    expect((await app.inject({ url: `/v1/paypal/return?order=${orderId}&token=PAYPAL-ORDER-1` })).headers.location).toMatch(/checkout=success/);
    expect(calls.filter((c) => c.url.includes('/capture')).length).toBe(captures);
  });

  it('fulfils nothing when the capture does not match (wrong amount, not completed, wrong token)', async () => {
    for (const bad of [
      (id: string) => completed(id, '0.01'),
      (id: string, v: string) => ({ ...completed(id, v), status: 'PAYER_ACTION_REQUIRED' }),
      (_id: string, v: string) => completed('someone-else', v),
    ]) {
      fakePaypal(bad);
      const { u, orderId } = await creditsOrder();
      await app.inject({ method: 'POST', url: `/v1/orders/${orderId}/pay`, headers: u.headers, payload: { provider: 'paypal' } });
      const back = await app.inject({ url: `/v1/paypal/return?order=${orderId}&token=PAYPAL-ORDER-1` });
      expect(back.headers.location).toMatch(/checkout=failed/);
      const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
      expect(o!.status).toBe('pending');
    }
    // A token that isn't this order's PayPal order is refused before any capture.
    const calls = fakePaypal(completed);
    const { u, orderId } = await creditsOrder();
    await app.inject({ method: 'POST', url: `/v1/orders/${orderId}/pay`, headers: u.headers, payload: { provider: 'paypal' } });
    const back = await app.inject({ url: `/v1/paypal/return?order=${orderId}&token=SOMEONE-ELSES` });
    expect(back.headers.location).toMatch(/checkout=failed/);
    expect(calls.some((c) => c.url.includes('/capture'))).toBe(false);
  });

  it('cancel goes back to where the buyer came from; PayPal off means no PayPal', async () => {
    const { u, orderId } = await creditsOrder();
    const back = await app.inject({ url: `/v1/paypal/cancel?order=${orderId}` });
    expect(back.headers.location).toBe(`${config.APP_URL}/dashboard/billing?checkout=cancelled&order=${orderId}`);
    config.PAYPAL_CLIENT_ID = undefined;
    try {
      expect(json(await app.inject({ url: `/v1/orders/${orderId}`, headers: u.headers })).providers.paypal).toBe(false);
      expect((await app.inject({ method: 'POST', url: `/v1/orders/${orderId}/pay`, headers: u.headers, payload: { provider: 'paypal' } })).statusCode).toBe(400);
    } finally {
      config.PAYPAL_CLIENT_ID = 'test-client';
    }
  });
});
