import type { Order } from '../../db/schema.js';
import { config, paymentsMock, stripeTestKeyOnProduction } from '../../config.js';
import { HttpError } from '../../lib/errors.js';

/**
 * Payment providers sit behind one interface so the marketplace and billing code never talks to
 * Stripe directly. Stripe is the primary provider; Mock is used in development without keys.
 * A PayPal adapter (Orders for checkout, Payouts for sellers) can implement the same interface:
 * v1 already proved the money rules (see docs/00-audit.md §8). It is deliberately not built in Phase 1.
 */
export interface TransferResult {
  ok: boolean;
  reference: string | null;
  error?: string;
}

export interface PaymentProvider {
  readonly name: 'stripe' | 'mock';
  /** Refunds the money taken for an order (no-op for mock). */
  refund(order: Order, reason: string): Promise<void>;
  /** Moves money to a seller's connected account. */
  transfer(input: { destinationAccountId: string; amountCents: number; currency: string; idempotencyKey: string; meta: Record<string, string> }): Promise<TransferResult>;
  /** Starts (or resumes) seller onboarding and returns the URL to send them to. */
  onboardingUrl(input: { userId: string; email: string; accountId: string | null; returnPath: string }): Promise<{ url: string; accountId: string | null }>;
  /** Re-reads capability flags from the provider. */
  accountStatus(accountId: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean }>;
}

const web = (p: string) => `${config.APP_URL}${p}`;

const mockProvider: PaymentProvider = {
  name: 'mock',
  async refund() {
    /* nothing was charged */
  },
  async transfer(input) {
    return { ok: true, reference: `mock_tr_${input.idempotencyKey}` };
  },
  async onboardingUrl(input) {
    return { url: web(`${input.returnPath}?connect=mock`), accountId: input.accountId ?? `mock_acct_${input.userId}` };
  },
  async accountStatus() {
    return { chargesEnabled: true, payoutsEnabled: true };
  },
};

const stripeProvider: PaymentProvider = {
  name: 'stripe',
  async refund(order, reason) {
    if (!order.stripePaymentIntent) return;
    const { stripe } = await import('../billing.js');
    await (await stripe()).refunds.create({ payment_intent: order.stripePaymentIntent, metadata: { orderId: order.id, reason } });
  },
  async transfer(input) {
    try {
      const { stripe } = await import('../billing.js');
      const t = await (await stripe()).transfers.create(
        { amount: input.amountCents, currency: input.currency, destination: input.destinationAccountId, metadata: input.meta },
        { idempotencyKey: input.idempotencyKey },
      );
      return { ok: true, reference: t.id };
    } catch (err) {
      return { ok: false, reference: null, error: (err as Error).message };
    }
  },
  async onboardingUrl(input) {
    const { stripe } = await import('../billing.js');
    const s = await stripe();
    let accountId = input.accountId;
    if (!accountId) {
      const acct = await s.accounts.create({ type: 'express', email: input.email, metadata: { userId: input.userId }, capabilities: { transfers: { requested: true } } });
      accountId = acct.id;
    }
    const link = await s.accountLinks.create({ account: accountId, type: 'account_onboarding', refresh_url: web(`${input.returnPath}?connect=refresh`), return_url: web(`${input.returnPath}?connect=done`) });
    return { url: link.url, accountId };
  },
  async accountStatus(accountId) {
    const { stripe } = await import('../billing.js');
    const a = await (await stripe()).accounts.retrieve(accountId);
    return { chargesEnabled: !!a.charges_enabled, payoutsEnabled: !!a.payouts_enabled };
  },
};

export function getPaymentProvider(): PaymentProvider {
  // Never move "money" with a test key on production (payouts would report success without paying anyone).
  if (stripeTestKeyOnProduction()) throw new HttpError(503, 'stripe_test_key', 'Payments are temporarily unavailable.');
  if (config.STRIPE_SECRET_KEY) return stripeProvider;
  if (paymentsMock()) return mockProvider;
  throw new HttpError(503, 'payments_unavailable', 'Payments are not configured yet');
}
