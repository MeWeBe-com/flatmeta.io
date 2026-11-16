# 16 Nov Go Live: manual steps

Everything here needs a person: a purchase, an account, a key, a DNS record or a signature. Everything else is done in the repo. Each step says **who** does it and **how to check it worked**.

**Who's who:**
- **Owner:** the FlatMeta project owner.
- **Boss:** the Organisation admin (Stripe Organisation, main Cloudflare account, MeWeBe).
- **Fahad:** buys domains in the boss's main Cloudflare account (top-left account switcher).
- **Server admin:** root on cp2.

**Never paste a key into chat, a ticket or a commit.** Keys go only into the server's `.env` (or the provider's own dashboard).

---

## Domains (GL1)

**1. Buy `flatmeta.com` (who: Fahad, in the boss's main Cloudflare account).**
1. Cloudflare dashboard → top-left account switcher → the boss's main account → **Domain Registration → Register Domains**.
2. Search `flatmeta.com`. It was unregistered on 16 Nov 2026 by RDAP; if Cloudflare shows a premium price, stop and ask the boss.
3. Buy it for 1 year with **auto-renew on**. It costs about $10.
4. Optional, only if the UK is a sales focus: `flatmeta.co.uk`. Same steps.
5. Check: `bash scripts/rdap-check.sh flatmeta.com` now says "registered".

**2. Redirect it to the live site (who: Fahad or the owner, in the same Cloudflare account).**
1. `flatmeta.com` → **DNS** → add `A @ 192.0.2.1` and `CNAME www flatmeta.com`, both **Proxied** (orange cloud). The IP is a placeholder: Cloudflare answers the redirect before any server is reached.
2. **Rules → Redirect Rules → Create rule:** "All incoming requests" → **Dynamic** → expression `concat("https://www.flatmeta.io", http.request.uri.path)` → **301**, preserve query string ✓.
3. Check: `curl -sI https://flatmeta.com/pricing?x=1` → `301` and `location: https://www.flatmeta.io/pricing?x=1`.

**3. Keep `flatmeta.io` safe (who: whoever holds the flatmeta.io registrar account).** Turn **auto-renew** on. It expires 2027-04-21. Turn on the registrar lock and 2FA on the registrar account.

**4. Trademark check before filing (who: owner, 10 minutes).** Search the word "FLATMETA", and "FLAT META" with the gap, in:
- UKIPO: https://trademarks.ipo.gov.uk/ipo-tmtext
- USPTO: https://tmsearch.uspto.gov
- EUIPO: https://euipo.europa.eu/eSearch

If nothing in classes 9, 35, 41 or 42 is identical or near-identical, a UK word mark (classes 9 and 42; £170 online) is worth filing before launch PR. Use a plain description, "online world map on which users claim and publish plots", with no "Meta" logo styling. See `docs/golive/01-domain-report.md` §1 for why "Meta" carries some opposition risk.

**5. Switching domain later (who: owner + server admin).** It is a `.env` change, `APP_URL` and `PRODUCTION_DOMAIN`, plus the external dashboards:
- Stripe webhook URL;
- PayPal return URLs;
- the Google OAuth redirect URI;
- the mail domain;
- Cloudflare DNS.

Then re-render nginx: `node scripts/new-instance.mjs production --nginx-only`. Details in `docs/golive/01-domain-report.md` §4.

---

## Payments (GL4)

**Already in the code:**
- Stripe Checkout for one-time orders and subscriptions.
- The customer portal.
- Signed webhooks: the signature is checked, and each event is fulfilled once.
- Plans and prices from config: lookup keys or `STRIPE_PRICE_*`, created by `scripts/stripe-sync.ts`.
- Promotion codes accepted in Checkout.
- PayPal Checkout for one-time orders: the buyer chooses on `/pay/<order>`.
- A test-key-on-production guard.
- An account check that says which Stripe account the keys belong to.

**1. Confirm the Stripe account (who: boss, 5 minutes).** The keys must come from **one account named exactly "FlatMeta" inside the boss's Stripe Organisation**, never a standalone account.
1. https://dashboard.stripe.com → top-left account switcher. Is there an account **FlatMeta** under the Organisation?
   - **Yes:** open it, go to **Settings → Business → Account details**, and check the public business name is "FlatMeta".
   - **No, or the live keys came from a standalone account:** follow step 2.
2. On the server, after the keys are in `.env`:
   ```bash
   npm run payments:check -w flatmeta-api
   ```
   It must print `Stripe account: "FlatMeta" acct_… · LIVE · charges enabled` and `✓ named exactly "FlatMeta"`. Admin → Overview shows the same check; a red banner appears if the name does not match.

**2. If the existing live keys are NOT from a "FlatMeta" account inside the Organisation (who: boss).**
1. Stripe dashboard → Organisation → **Accounts → + New account**, named **FlatMeta**. Business details: the operating company (MeWeBe), the bank account, and the statement descriptor `FLATMETA`.
2. Activate it (identity, bank). Charges are enabled once Stripe approves.
3. In the new account:
   - **Developers → API keys:** create a **restricted key** named `FlatMeta-Stripe` with these permissions: Checkout Sessions write, Customers write, Customer portal write, Prices read, Products read, Subscriptions read, Refunds write, Webhook endpoints read. A standard secret key also works.
   - Copy the publishable key.
4. **Developers → Webhooks → Add endpoint:**
   - URL `https://www.flatmeta.io/api/v1/stripe/webhook`.
   - Events (the 8 the app handles): `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `charge.refunded`.

   Copy its signing secret (`whsec_…`).
5. **Settings → Billing → Customer portal:** turn on cancel, switch plans (Plus/Business/Brand) and update payment method. Save.
6. Server `.env` (production), then reload:
   ```
   STRIPE_SECRET_KEY=rk_live_…
   STRIPE_PUBLISHABLE_KEY=pk_live_…
   STRIPE_WEBHOOK_SECRET=whsec_…
   PAID_CHECKOUT_ENABLED=true
   ```
7. Create the prices in the new account: `npx tsx --env-file=../../.env scripts/stripe-sync.ts --apply` in `apps/api` (docs/stripe-live.md).
8. Run `npm run payments:check -w flatmeta-api` and check every line is ✓.
9. Old standalone account: leave it as it is (don't delete it, because past payments and refunds live there). Move any active subscriptions by inviting those customers to re-subscribe; there are none today (16 Nov: no paid customers).

**3. Launch offer (optional, who: owner).** Stripe → **Products → Coupons → New**: 50% off, duration 12 months, applies to the Business product. Then **Promotion codes → New**: `FOUNDING50`, with an end date. On the server, set:
```
LAUNCH_OFFER=Founding companies: 50% off the first year of Business with code FOUNDING50
```

**4. Staging test mode (who: owner).** Staging `.env` uses the **test** keys of the same FlatMeta account (`sk_test_…`, `pk_test_…`) and a test webhook endpoint `https://staging.flatmeta.io/api/v1/stripe/webhook`. For CI, add the repository secret `STRIPE_TEST_SECRET_KEY` (a `sk_test_` key): `apps/api/test/stripe-testmode.test.ts` then runs a real test-mode check on every push.

**5. PayPal (who: boss or owner, under the business account).**
1. https://developer.paypal.com → log in with the **business** PayPal account → **Apps & Credentials**.
2. **Sandbox** first: **Create App** named `FlatMeta-PayPal`, type Merchant. Copy the Client ID and Secret into the **staging** `.env`:
   ```
   PAYPAL_CLIENT_ID=…
   PAYPAL_CLIENT_SECRET=…
   PAYPAL_ENV=sandbox
   ```
3. Test it on staging: buy an AI Design Pack, choose **Pay with PayPal** and use a sandbox buyer account (Sandbox → Accounts). The order should end as paid under Dashboard → Billing.
4. **Live:** switch the toggle to **Live** → Create App `FlatMeta-PayPal` → copy the keys into the **production** `.env` with `PAYPAL_ENV=live`.
5. There are no webhooks to set up: the server captures the payment when the buyer returns. Return URL: `https://www.flatmeta.io/api/v1/paypal/return`.
6. **Do not spend the $40 PayPal credit:** no ads and no paid features in PayPal. Nothing in the code spends it.

**6. API keys: one per service, named `FlatMeta-<Service>` (who: owner/boss).** Every key is read from `.env` only. Create each key named exactly as below in the provider's dashboard, so it's clear which project uses it:

| `.env` variable | Provider | Key name | Needed for |
|---|---|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe (FlatMeta account) | `FlatMeta-Stripe` | payments (required for go-live) |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | PayPal developer app | `FlatMeta-PayPal` | second payment option |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Resend (until Cloudflare sending, GL5) | `FlatMeta-Resend` | all email (sign-in codes!) |
| `ANTHROPIC_API_KEY` | Anthropic | `FlatMeta-Anthropic` | AI Designer text, moderation (optional: the app falls back) |
| `OPENAI_API_KEY` | OpenAI | `FlatMeta-OpenAI` | AI images and moderation (optional) |
| `GEMINI_API_KEY` | Google AI Studio | `FlatMeta-Gemini` | AI images/text (optional) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client | `FlatMeta-Google-Sign-in` | "Sign in with Google" (optional) |
| `GITHUB_READ_TOKEN` | GitHub fine-grained token | `FlatMeta-Deploy-Read` | auto-deploy check (only if the repo is private) |
| `INDEXNOW_KEY` | none, generated on the server: `openssl rand -hex 16` | n/a | IndexNow pings |

The app does not use OpenRouter, Twilio or Replicate today, so no keys are needed for them.
