import { describe, expect, it } from 'vitest';
import Stripe from 'stripe';

/**
 * GL4: the real Stripe API in TEST mode, end to end, when a test key is provided (repository secret
 * STRIPE_TEST_SECRET_KEY in CI, or the same variable locally). It reads the account the key belongs to (it should be
 * named after the project), creates a hosted Checkout Session for a one-time item and a customer-portal-ready
 * customer, then cleans up. Skipped (not failed) without a key; never runs with a live key.
 */
const key = process.env.STRIPE_TEST_SECRET_KEY ?? '';
const run = /^(sk|rk)_test_/.test(key);

describe.skipIf(!run)('Stripe test mode (GL4)', () => {
  it('the key belongs to an account that can be identified, and Checkout returns a hosted page', async () => {
    const s = new Stripe(key);
    const account = await s.accounts.retrieveCurrent();
    expect(account.id).toMatch(/^acct_/);
    const name = account.settings?.dashboard?.display_name || account.business_profile?.name;
    expect(name, 'the test account should be named after the project').toBeTruthy();
    const customer = await s.customers.create({ email: 'gl4-testmode@example.com', metadata: { test: 'gl4' } });
    try {
      const session = await s.checkout.sessions.create({
        mode: 'payment',
        customer: customer.id,
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: 500, product_data: { name: 'GL4 test-mode check' } } }],
        success_url: 'https://www.flatmeta.io/dashboard/billing?checkout=success',
        cancel_url: 'https://www.flatmeta.io/dashboard/billing?checkout=cancelled',
        allow_promotion_codes: true,
      });
      expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      expect(session.livemode).toBe(false);
      await s.checkout.sessions.expire(session.id);
    } finally {
      await s.customers.del(customer.id);
    }
  });
});
