import { config } from '../config.js';
import { HttpError, badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * GL4: PayPal Checkout (Orders v2 REST API), a second way to pay for one-time orders (land, boosts, AI packs, company
 * claims). Subscriptions stay on Stripe. Sandbox until PAYPAL_ENV=live. Keys come from .env only (PAYPAL_CLIENT_ID,
 * PAYPAL_CLIENT_SECRET) and are never logged. The order is created on the server with the amount from our own order
 * row, the buyer approves on paypal.com, and the server captures it on return: the amount can't be changed by the
 * browser, and a capture that does not complete fulfils nothing.
 */
export const paypalEnabled = () => !!(config.PAYPAL_CLIENT_ID && config.PAYPAL_CLIENT_SECRET);
const apiBase = () => (config.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');

type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
/** Tests replace the network. */
export function setPaypalFetchForTests(f: Fetch | null) {
  fetcher = f ?? ((...a) => fetch(...a));
  token = null;
}

let token: { value: string; until: number } | null = null;
async function accessToken(): Promise<string> {
  if (!paypalEnabled()) throw new HttpError(503, 'paypal_unavailable', 'PayPal is not configured');
  if (token && token.until > Date.now() + 60_000) return token.value;
  const res = await fetcher(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${config.PAYPAL_CLIENT_ID}:${config.PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    logger.error({ status: res.status }, 'PayPal token request failed');
    throw new HttpError(502, 'paypal_error', 'PayPal is not available right now. Please try again or pay by card.');
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, until: Date.now() + body.expires_in * 1000 };
  return token.value;
}

async function call<T>(path: string, init: RequestInit & { idempotencyKey?: string }): Promise<{ status: number; body: T }> {
  const res = await fetcher(`${apiBase()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      'content-type': 'application/json',
      ...(init.idempotencyKey ? { 'paypal-request-id': init.idempotencyKey } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

/** Amount in PayPal's format: a decimal string in major units ("12.50"). */
export const paypalAmount = (cents: number) => (cents / 100).toFixed(2);

/** Creates a PayPal order for one of our orders; returns PayPal's order id and the approval link. */
export async function createPaypalOrder(o: { orderId: string; amountCents: number; currency: string; description: string; returnUrl: string; cancelUrl: string }) {
  if (o.amountCents < 100) throw badRequest('Amount too small for PayPal');
  const { status, body } = await call<{ id?: string; links?: { rel: string; href: string }[]; message?: string }>('/v2/checkout/orders', {
    method: 'POST',
    idempotencyKey: `fm-${o.orderId}`,
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ reference_id: o.orderId, custom_id: o.orderId, description: o.description.slice(0, 120), amount: { currency_code: o.currency.toUpperCase(), value: paypalAmount(o.amountCents) } }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: config.APP_NAME.slice(0, 127),
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
            return_url: o.returnUrl,
            cancel_url: o.cancelUrl,
          },
        },
      },
    }),
  });
  const approve = body.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  if (status >= 300 || !body.id || !approve) {
    logger.error({ status, orderId: o.orderId }, 'PayPal order create failed');
    throw new HttpError(502, 'paypal_error', 'PayPal is not available right now. Please try again or pay by card.');
  }
  return { paypalOrderId: body.id, approveUrl: approve };
}

/**
 * Captures an approved PayPal order. Returns the capture id when the money was taken (status COMPLETED) and the amount
 * and our order id match what PayPal holds; otherwise null (nothing is fulfilled).
 */
export async function capturePaypalOrder(paypalOrderId: string, expect: { orderId: string; amountCents: number; currency: string }): Promise<string | null> {
  const { status, body } = await call<{
    status?: string;
    purchase_units?: { custom_id?: string; reference_id?: string; payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string }; custom_id?: string }[] } }[];
  }>(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, { method: 'POST', idempotencyKey: `fm-capture-${expect.orderId}`, body: '{}' });
  if (status >= 300 && status !== 422) {
    logger.warn({ status, orderId: expect.orderId }, 'PayPal capture failed');
    return null;
  }
  const unit = body.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const ours = (capture?.custom_id ?? unit?.custom_id ?? unit?.reference_id) === expect.orderId;
  const paid =
    body.status === 'COMPLETED' &&
    capture?.status === 'COMPLETED' &&
    capture.amount.value === paypalAmount(expect.amountCents) &&
    capture.amount.currency_code === expect.currency.toUpperCase();
  if (!ours || !paid) {
    logger.warn({ orderId: expect.orderId, paypalStatus: body.status, captureStatus: capture?.status }, 'PayPal capture not complete or does not match the order');
    return null;
  }
  return capture!.id;
}
