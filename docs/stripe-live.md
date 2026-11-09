# Stripe: going live

How FlatMeta uses Stripe, what to set up in the Stripe dashboard, which env vars to set, and the live smoke test. Rehearse every step in **test mode on staging** first, then repeat in **live mode on production**.

## What the app does with Stripe

| Flow | Stripe feature | Code |
| --- | --- | --- |
| Paid land, Spotlight/Beacon boosts, AI Design Packs, marketplace purchases, Landmark claims | **Checkout** (one-time, `mode: payment`, inline `price_data`, order ID in `metadata` and `client_reference_id`, 31-minute expiry) | `createCheckout` in `apps/api/src/services/billing.ts` |
| Plus (personal), Business and Brand (organisation) plans | **Checkout** (`mode: subscription`) with recurring prices | `createSubscriptionCheckout` |
| Change card, see invoices, cancel | **Customer Portal** | `portalUrl` (`POST /v1/billing/portal`) |
| Refunds (land taken before payment, marketplace re-pricing, admin) | **Refunds** | `refundOrder` |
| Seller payouts (marketplace) | **Connect Express**, Account Links, Transfers | `apps/api/src/services/payments/provider.ts`, worker job `payouts` (every 15 min) |
| Everything above becoming real in the app | **Webhooks** (signature-verified, idempotent by event ID) | `POST /v1/stripe/webhook` → `handleStripeEvent` |

Checkout is a redirect to Stripe's hosted page, so **no publishable key (`pk_…`) is needed**; the app never loads Stripe.js.

Safety rails built in:
- **A test key on `APP_ENV=production`:** checkout, the portal and payouts are refused (HTTP 503 `stripe_test_key`, "Payments are temporarily unavailable"), and every admin page shows a red banner.
- **A live key on staging, or a missing webhook secret:** admins see a warning, and the API logs it at start-up.
- `PAID_CHECKOUT_ENABLED` (auto = off in production) keeps every paid path on "coming soon" until you switch it on.

## Env vars (production `.env`)

| Variable | Value | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | `sk_live_…` (or a restricted `rk_live_…`, below) | Staging keeps `sk_test_…`. Never commit it. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the live endpoint | Each endpoint (staging test, production live) has its own. |
| `STRIPE_PRICE_PLUS_MONTH` … `STRIPE_PRICE_BRAND_YEAR` | empty, or `price_…` | Empty: prices are found by lookup key (`flatmeta_plus_month` …), created by `stripe-sync`. Set one only to pin a specific price. |
| `STRIPE_LOOKUP_PREFIX` | `flatmeta` | Change only if two apps share one Stripe account. |
| `STRIPE_AUTOMATIC_TAX` | `false`, or `true` once Stripe Tax is set up | Adds tax at checkout. |
| `CURRENCY` | `usd` | One currency for everything; `stripe-sync` creates prices in it. |
| `PAID_CHECKOUT_ENABLED` | `auto` (off) until the smoke test, then `true` | The web build reads it too: **redeploy** after changing it. |
| `PAYMENTS_MOCK` | anything | Ignored on production. |
| `MARKETPLACE_FEE_BPS`, `MARKETPLACE_MIN_HOLD_DAYS`, `MARKETPLACE_PRICE_CAP_MULT`, `MARKETPLACE_PRICE_CAP_DAYS`, `MARKETPLACE_MIN_PRICE_CENTS`, `PAYOUT_MIN_CENTS` | defaults in `.env.example` | Marketplace rules and the minimum payout. |

Plan amounts come from `SUBSCRIPTION_PRICES` in `apps/api/src/lib/pricing.ts`: Plus $5/mo or $48/yr, Business $29/mo or $290/yr, Brand $249/mo or $2,490/yr. Land prices per zone are in **Admin → Pricing**. Boosts and AI packs are in `UPGRADES`.

## Webhook endpoint

- **URL:** `https://flatmeta.io/api/v1/stripe/webhook` (staging: `https://staging.flatmeta.io/api/v1/stripe/webhook`). nginx strips `/api`, so the API route is `POST /v1/stripe/webhook`. It reads the raw body for the signature and is not rate-limited.
- **Events to send:**

| Event | What the app does |
| --- | --- |
| `checkout.session.completed` | One-time payment: marks the order paid and delivers it (activates land, adds the boost or AI credits, completes a marketplace sale or Landmark claim). Subscription: fetches the subscription and applies the plan. |
| `checkout.session.async_payment_succeeded` | Same, for delayed payment methods. |
| `checkout.session.expired` | Marks the order expired and releases land held for it. |
| `customer.subscription.created` | Stores the subscription and applies the plan. |
| `customer.subscription.updated` | Status, renewal date and cancel-at-period-end. **The plan is read from the price**, so plan or interval changes made in the portal or dashboard are applied. |
| `customer.subscription.deleted` | Status `canceled`: the account or organisation falls back to Free (time-limited grants such as a Landmark's 3 months of Brand are kept). |
| `invoice.payment_failed` | In-app notification and one email per invoice ("update your card"). The plan stays while Stripe retries (status `past_due`). Reads the subscription from `invoice.parent.subscription_details` (current API) or `invoice.subscription` (older). |
| `charge.refunded` | A refund made in the Stripe dashboard marks the order refunded and releases the land. |

- **API version:** the server SDK (stripe-node 23) uses `2026-10-28.endive`. Create the endpoint with that version (or the account default if it is the same).
- **Retries:** events are de-duplicated by ID. If handling fails, the app answers 500 and forgets the event, so Stripe's automatic retry is processed rather than skipped.

## Stripe dashboard setup (live mode)

1. **Activate the account:** business details for MeWeBe, a bank account for payouts, statement descriptor `FLATMETA` (short descriptor `FLATMETA`), support email `hello@flatmeta.io`, public website `https://flatmeta.io`, and the terms, privacy and refund URLs (`/legal/terms`, `/legal/privacy`, `/legal/refunds`).
2. **Branding** (Settings → Branding): icon, colours (`#0B1020` background, `#2DE2C4` accent). Checkout and the portal use them.
3. **API key:** Developers → API keys. Either use the standard secret key, or create a **restricted key** with:
   - **Write:** Checkout Sessions, Customers, Customer portal, Refunds, Transfers, Accounts, Account Links;
   - **Read:** Prices, Products, Subscriptions.

   `stripe-sync` also needs **Write** on Products and Prices, so run it once with the standard key, or give the restricted key those two permissions.
4. **Products and prices:** on the production server, with the live key in `.env`:
   ```bash
   cd ~/web/flatmeta.io/private/flatmeta && npm run stripe:sync           # dry run: shows what it would create
   npm run stripe:sync -- --apply --live                                    # creates FlatMeta Plus/Business/Brand + 6 prices
   ```
   Products get IDs `flatmeta_plus`, `flatmeta_business` and `flatmeta_brand`; prices get lookup keys `flatmeta_<plan>_<interval>`. It is safe to run again (it only reports). If you later change an amount in `pricing.ts`, run it with `--apply --live --update-prices`: new sign-ups get the new price, and existing subscribers keep theirs.
5. **Webhook:** Developers → Webhooks → *Add endpoint*: the URL, API version and the 8 events above. Copy the **signing secret** into `STRIPE_WEBHOOK_SECRET`.
6. **Customer portal** (Settings → Billing → Customer portal):
   - **On:** update payment methods, invoice history, cancel subscriptions (*at end of billing period*), and the cancellation reason prompt.
   - **Plan switching:** keep it **off** at launch. Plus is personal while Business and Brand belong to organisations, and the portal can't keep those apart. Customers change plans from **Pricing** in the app. (If you turn it on, the app applies whatever price they switch to, so data stays correct.)
   - Business information: the same terms and privacy URLs.
7. **Customer emails** (Settings → Customer emails): **on** for successful-payment receipts and refunds. **Revenue recovery** (Billing → Revenue recovery): Smart Retries on, and Stripe's failed-payment emails on (the app sends its own notice too).
8. **Tax (optional):** Stripe Tax → origin address and registrations, then `STRIPE_AUTOMATIC_TAX=true`. Prices from `stripe-sync` are tax-exclusive.
9. **Connect (only for marketplace payouts):** Connect → get started → **Express**, platform profile (marketplace, you collect payments and pay sellers), branding, and payouts schedule. Sellers onboard from **Billing → Payouts** in the app, and their status refreshes when they return or press *Refresh*. No Connect webhook is needed.
10. **Radar:** keep the default rules, and add "Block if CVC check fails" if you like.

## Turn it on

1. In the production `.env`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (and optionally `STRIPE_AUTOMATIC_TAX`). **Leave `PAID_CHECKOUT_ENABLED=auto`** for now.
2. `bash scripts/deploy.sh production`.
3. **Admin** (any page): there must be **no red "Payments setup needs attention" banner**. The detail is at `https://flatmeta.io/api/v1/admin/payments-status` (signed in as admin), which should show `"mode":"live"`, `"webhookSecret":true`, every price `"lookup"` or `"env"`, `"problems":[]` and `"checkoutBlocked":false`.
4. Set `PAID_CHECKOUT_ENABLED=true`, deploy again, then run the smoke test.

## Live smoke test (real card, small amounts, refund afterwards)

| # | Do | Expect |
| --- | --- | --- |
| 1 | Billing → **Design Pack** ($5) with your own card | back on Billing with `?checkout=success`; +25 AI designs; order **paid** in Billing and Admin → Orders; receipt email from Stripe |
| 2 | Refund that payment in the Stripe dashboard | `charge.refunded` delivered; the order shows **refunded** |
| 3 | After your free Homestead, claim a 1-cell plot in the cheapest zone and pay | the plot turns **active**; the order is paid |
| 4 | Start a land checkout and abandon it | after ~31 min `checkout.session.expired` arrives; the held cells are free again |
| 5 | Pricing → **Plus monthly** | plan **Plus** in the header and on Billing; the subscription shows *Renews …* |
| 6 | Billing → **Manage payment methods** | the Stripe portal opens for the same customer and returns to `/dashboard/billing` |
| 7 | In the portal: **cancel** the plan | Billing shows *Ends …* (cancel at period end); still Plus until then |
| 8 | Stripe dashboard → the subscription → **Cancel immediately**, refund the invoice | `customer.subscription.deleted`: plan back to **Free** |
| 9 | Organisation → **Business** (if organisations will pay at launch) | the organisation's plan is **Business** |
| 10 | Stripe → Webhooks → endpoint → *Event deliveries* | every delivery since step 1 is **200**, none failing |
| 11 | `pm2 logs flatmeta-api-production --lines 200` | no `Stripe webhook handling failed`, no `Invalid Stripe signature` |

**Failed payments** can't be produced with real cards in live mode. Check them in **test mode on staging**:

```bash
stripe trigger invoice.payment_failed
```

Or use test card `4000 0000 0000 0341` (attaches, then fails), then advance a test clock. Expect the in-app "Payment failed" notification and the email.

**Marketplace payouts** (when enabled): a seller connects an Express account (Billing → Payouts), a buyer purchases their listing, and after `MARKETPLACE_MIN_HOLD_DAYS` the worker transfers 90% to the seller. Check the transfer in Stripe → Connect → the account.

## Turning payments off again

Set `PAID_CHECKOUT_ENABLED=false` (or `auto`) and deploy. Every paid path goes back to "coming soon". Existing subscriptions keep renewing in Stripe and the webhook keeps applying them; cancel them in the dashboard if you need to stop billing.
