# 16 Nov Go Live: manual steps

Everything here needs a person: a purchase, an account, a key, a DNS record or a signature. Everything else is done in the repo. Each step says **who** does it and **how to check it worked**.

**Who's who:**
- **Owner:** the FlatMeta project owner.
- **Boss:** the Organisation admin (Stripe Organisation, main Cloudflare account, MeWeBe).
- **Fahad:** works in the boss's main Cloudflare account (top-left account switcher): DNS, email routing, workers.
- **Server admin:** root on cp2.

**Never paste a key into chat, a ticket or a commit.** Keys go only into the server's `.env` (or the provider's own dashboard).

---

## Round 3: one action each (17 Nov 2026)

Everything code can do is done. What is left needs a person. Each item below is **one action**: a script, an exact click-path, or copy ready to send. Do them in this order; items 1–3 unblock the rest. The later sections hold the details.

| # | Action (one each) | Who | Unblocks | Done when |
|---|---|---|---|---|
| 1 | **Run the go-live scripts on cp2.** As najamussaqib: `bash ~/golive/scripts/server/go-live-production.sh --root /home/flatmeta/web/flatmeta.io/private/flatmeta`, then as root: `sudo bash /home/flatmeta/web/flatmeta.io/private/flatmeta/scripts/server/go-live-production-root.sh`. The first-time fetch of the scripts is in Launch checklist step 1. | Server admin | CEO, CTO, QA, every live score | The root script ends with **ALL OK** (health shows the new release, apex 301, new llms.txt, sitemap index, pages 200) |
| 2 | **Stripe, one sitting.** In the FlatMeta account inside the Organisation, **Developers → Webhooks → Add endpoint** `https://www.flatmeta.io/api/v1/stripe/webhook` with the 8 events in "Payments (GL4)" step 2.4. Then paste `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET` into the production `.env` and re-run item 1. | Boss (keys), server admin (paste) | Taking payments: CEO, VC, Solutions Architect | `npm run payments:check -w flatmeta-api` prints `✓ named exactly "FlatMeta"` and `/api/v1/features` shows `"paidCheckout":true` |
| 3 | **Cloudflare, one command.** Create the token `FlatMeta-DNS` (the click-path is at the top of the script), then run `CLOUDFLARE_API_TOKEN=… bash scripts/server/cloudflare-zone.sh`. It turns Email Obfuscation off, Email Routing on, and adds DMARC (and SPF if missing). Then the one click it prints: verify the owner's inbox and add the 4 routing rules. | Fahad or owner | Email from flatmeta.io; no hydration errors on any page | The script prints **ALL OK**, and `npm run email:check -w flatmeta-api -- --domain flatmeta.io` is all ✓ |
| 4 | **Resend, 3 clicks.** resend.com → **Domains → Add** `flatmeta.io` (the DKIM records exist) → **API Keys → Create** `FlatMeta-Resend` → paste it as `RESEND_API_KEY` in the production `.env`; delete `MAIL_FROM` and `MAIL_REPLY_TO`, so the flatmeta.io defaults apply. | Owner | Welcome, activation and sign-in emails from noreply@flatmeta.io | `npm run email:check -w flatmeta-api -- --send <your inbox>` arrives from noreply@flatmeta.io |
| 5 | **Turn the schedules on, 1 click.** GitHub → repo → **Settings → General → Default branch → ⇄ → v2 → Update**. | Repository owner | Daily QA, daily SEO, weekly CEO report (CTO, QA) | Actions lists the three workflows as scheduled; the first daily run is green |
| 6 | **Send the first 10 outreach emails.** Use `docs/golive/outreach-first-10.md`: export the CSV, fill the brackets, send from hello@flatmeta.io, set each row to **Contacted**. | Owner | First customers: VC, Sales, PM | 10 rows show Contacted; replies are logged in `docs/golive/drafts/` |
| 7 | **Ask the first happy customer for a story.** Send the permission email in `docs/golive/case-study-template.md`, then add their approved entry to `apps/web/src/data/customer-stories.ts` (a pull request). | Owner | Real social proof: Sales, VC | The story shows on /business and /pricing |
| 8 | **Optional founding discount.** Stripe → **Products → Coupons → New**: 50% off for 12 months on Business. Then **Promotion codes → New** `FOUNDING50`. Set `LAUNCH_OFFER="Founding customers: 50% off Business for 12 months with code FOUNDING50"` in `.env` and re-run item 1. | Boss | A sharper offer in the founding block | /pricing shows the offer text in the founding block |
| 9 | **Set up the five agents.** Paste each `ops/agents/*.md` prompt into claude.ai scheduled tasks (or Antigravity) at the time in its header, connected to this repository only. | Owner | Daily drafts and reports: CEO, Marketing, Sales, QA | Each agent opens its first pull request |
| 10 | **Search engines, 2 clicks each.** Google Search Console and Bing Webmaster Tools → add `https://www.flatmeta.io` → **Sitemaps → submit** `https://www.flatmeta.io/sitemap.xml`. | Owner | Indexing of the new pages (SEO) | Both consoles show the sitemap as "Success" |

**What each role needs, after these:** see `02-viability-profit-report.md` §7, "Round 3 scores".

---

## Domains (GL1)

**Boss decision, 17 Nov 2026: `flatmeta.io` is the only domain. Do not buy or redirect any other domain.**

**1. Keep `flatmeta.io` safe (who: whoever holds the flatmeta.io registrar account).** Turn **auto-renew** on. It expires 2027-04-21. Turn on the registrar lock and 2FA on the registrar account.

**2. Trademark check before filing (who: owner, 10 minutes).** Search the word "FLATMETA", and "FLAT META" with the gap, in:
- UKIPO: https://trademarks.ipo.gov.uk/ipo-tmtext
- USPTO: https://tmsearch.uspto.gov
- EUIPO: https://euipo.europa.eu/eSearch

If nothing in classes 9, 35, 41 or 42 is identical or near-identical, a UK word mark (classes 9 and 42; £170 online) is worth filing before launch PR. Use a plain description, "online world map on which users claim and publish plots", with no "Meta" logo styling. See `docs/golive/01-domain-report.md` §1 for why "Meta" carries some opposition risk.

**3. Switching domain later (who: owner + server admin).** It is a `.env` change, `APP_URL` and `PRODUCTION_DOMAIN`, plus the external dashboards:
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

**1. Confirm the Stripe account (who: boss, 5 minutes).** The keys must come from **one account named exactly "FlatMeta" inside the boss's Stripe Organisation**, never a standalone account. Since 25 Nov the expected name is a setting: `STRIPE_ACCOUNT_NAME` in `.env` (empty = `APP_NAME`, "FlatMeta"). For the shared account set `STRIPE_ACCOUNT_NAME="Mewebe.com Sites"`; see `docs/ops/go-live-25nov.md`.
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

---

## Email from flatmeta.io (GL5)

**Code (done):**
- Every email is sent from `MAIL_FROM`, which defaults to `FlatMeta <noreply@<PRODUCTION_DOMAIN>>`. Replies go to `MAIL_REPLY_TO`, default `support@<PRODUCTION_DOMAIN>`.
- On production the API logs a warning while `MAIL_FROM` is on another domain (today: mail.mewebe.net).
- `npm run email:check -w flatmeta-api` checks the DNS (MX, SPF, DKIM, the bounce domain, DMARC) over DNS-over-HTTPS. With `--send you@example.com` it also sends one test email with the current settings.

**State of flatmeta.io on 16 Nov** (`npm run email:check -- --domain flatmeta.io`):

| Record | State |
|---|---|
| DKIM `resend._domainkey.flatmeta.io` | ✓ present (Resend sending is partly set up) |
| Bounce domain `send.flatmeta.io` (MX + SPF) | ✓ present |
| Inbound MX (Cloudflare Email Routing) | ✗ missing |
| SPF on `flatmeta.io` | ✗ missing |
| DMARC `_dmarc.flatmeta.io` | ✗ missing |

**Until the steps below are done, keep sending from the current, verified sender.** Production keeps `MAIL_FROM="FlatMeta <…@mail.mewebe.net>"` in its `.env`. Don't change it until step 3 passes.

**1. Inbound: hello@ and support@ (who: Fahad or the owner, in the boss's main Cloudflare account, flatmeta.io zone).**
1. Cloudflare → flatmeta.io → **Email → Email Routing → Get started / Enable**. Accept the records Cloudflare adds:
   - MX `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net` and `route3.mx.cloudflare.net`;
   - TXT `v=spf1 include:_spf.mx.cloudflare.net ~all` on `flatmeta.io`.
2. **Destination addresses:** add the owner's inbox and verify it (Cloudflare emails a link).
3. **Routing rules:**
   - `hello@flatmeta.io` → the owner's inbox;
   - `support@flatmeta.io` → the owner's inbox (or the support desk);
   - `dmarc@flatmeta.io` → the owner's inbox (DMARC reports);
   - `admin@flatmeta.io` → the owner's inbox (the seeded admin login).

   Leave **Catch-all** set to **Drop**.
4. Check: send an email to hello@flatmeta.io from any mailbox; it arrives in the owner's inbox.

**2. Sending (who: owner).** Cloudflare's own email sending ("Email Service") is in beta and only on some accounts. If the boss's account shows **Email → Email Sending**, use it: add `flatmeta.io` and the records it shows. Ask before switching providers, because the app sends through Resend or SMTP today.

**Otherwise use the existing Resend account (recommended now):**
1. https://resend.com/domains → **Add domain** `flatmeta.io`. The DKIM and `send.` records already exist, so Resend may verify at once. If it asks for different values, update those records in Cloudflare (DNS only, grey cloud).
2. **API Keys → Create** `FlatMeta-Resend` with sending access only, restricted to the flatmeta.io domain. Put it in the production `.env` as `RESEND_API_KEY`, replacing the old key, then revoke the old one.
3. **Webhooks:** endpoint `https://www.flatmeta.io/api/v1/email/webhooks/resend`, events `email.bounced` and `email.complained`. Put the signing secret in `RESEND_WEBHOOK_SECRET`.

**3. DMARC (who: Fahad or the owner, Cloudflare DNS).** Add TXT `_dmarc` with:
```
v=DMARC1; p=none; rua=mailto:dmarc@flatmeta.io; fo=1
```
After two weeks of clean reports, change `p=none` to `p=quarantine`.

**4. Switch the sender (who: server admin).** Once `npm run email:check -w flatmeta-api -- --domain flatmeta.io` shows ✓ on every line, set this in the production `.env`:
```
MAIL_FROM="FlatMeta <noreply@flatmeta.io>"
MAIL_REPLY_TO=support@flatmeta.io
```
(or delete both lines: those are the defaults). Then reload the app and run:
```bash
npm run email:check -w flatmeta-api -- --send <owner inbox>
```
Sign in on the site once to confirm the sign-in code arrives from noreply@flatmeta.io.

---

## Launch checklist (GL6)

Do these in order. Steps 1 to 3 are what makes www.flatmeta.io show the build in this repo. **Today (16 Nov) production still runs an older build**: it shows doubled page titles, "Free" on the pricing page, a 404 on `/insights`, and the old static `llms.txt` ("3D Virtual Land… Digital Twin"). CI's production job skips because the `PROD_DEPLOY_*` secrets are not set, and the server's cron deploys nothing while `AUTO_DEPLOY=false`.

**Steps 1–3 in one go (who: server admin):** `scripts/server/go-live-production.sh` runs as najamussaqib and `scripts/server/go-live-production-root.sh` runs as root. Both have `--dry-run`, are safe to run twice, print OK or FAIL for each step, never print a secret, and end with a smoke test of the live URLs. The first script stops, naming the key, if `.env` lacks something production needs. The steps below are what the scripts do, for reference.

**1. Turn production deploys on (who: server admin, 10 minutes). Pick one of the three.**
- **A (recommended), cron on the server:** in the production checkout's `.env` set `AUTO_DEPLOY=true`, `DEPLOY_BRANCH=v2` and `REQUIRE_CI=true`. Keep `DEPLOY_STAGING_SOAK=600`, so a commit must be healthy on staging for 10 minutes first. The existing cron (`scripts/auto-deploy.sh --cron`, every 2 minutes) then deploys each green commit. See `docs/deploy/auto-deploy.md`.
- **B, from CI:** in GitHub → repo → Settings → Secrets and variables → Actions, add `PROD_DEPLOY_HOST`, `PROD_DEPLOY_USER`, `PROD_DEPLOY_PATH` and `PROD_DEPLOY_KEY`. The key is an SSH key allowed only to run the deploy script. CI's `deploy-production` job then runs after staging passes.
- **C, once by hand now:** as the app user, in the production checkout:
  ```bash
  bash scripts/deploy.sh production
  ```
  It asks you to type "production".
- Check: `curl -s https://www.flatmeta.io/api/v1/health` shows `"ok":true` and a `release` equal to the latest green commit on `v2`.

**2. Re-render nginx and remove the stale static files (who: server admin, root).**
1. Run:
   ```bash
   node scripts/new-instance.mjs production --nginx-only
   ```
   Install the rendered `deploy/out/production/nodejs-app.conf` as the domain's Hestia nginx template, as in `docs/deploy-hestia.md`, then `nginx -t && systemctl reload nginx`. The new template sends `/llms.txt`, `/llms-full.txt`, `/sitemap.xml`, `/robots.txt` and `/insights` to the app, and 301s the bare `flatmeta.io` to `www`.
2. Delete the old static files in the domain's `public_html`: `llms.txt`, `llms-full.txt`, `sitemap.xml` and `robots.txt`, if present. Back them up first. Leave `public_html/insights/*.html` in place: those articles are still served as files.
3. Check:
   - `curl -s https://www.flatmeta.io/llms.txt | head -1` → `# FlatMeta`, and no "Digital Twin";
   - `curl -sI https://flatmeta.io/pricing` → `301` to `https://www.flatmeta.io/pricing`.

**3. Production `.env` (who: server admin; values from the owner and the boss).**
- `APP_URL=https://www.flatmeta.io`, `PRODUCTION_DOMAIN=flatmeta.io`.
- Payments, from "Payments (GL4)" above: the `STRIPE_*` keys, `PAYPAL_*` with `PAYPAL_ENV=live` only after the sandbox test passes, and `PAID_CHECKOUT_ENABLED=true`. In production, `auto` means checkout is **off**: it is turned on only by `true`, once the live keys and the webhook pass `npm run payments:check`. `scripts/server/go-live-production.sh` checks the keys and sets `true` for you.
- `MAIL_FROM`, from "Email from flatmeta.io (GL5)" above, once the domain is verified.
- `ERROR_WEBHOOK_URL`: a Slack, Discord or Google Chat incoming webhook for the team's alerts channel. Name it `FlatMeta-Errors`.
- Then deploy again (step 1). Check: `npm run payments:check -w flatmeta-api` and `npm run email:check -w flatmeta-api` both end with ✓.

**4. DNS and SSL (who: Fahad or the owner, in the boss's main Cloudflare account; top-left account switcher).**
1. If `flatmeta.io` is not yet a zone in the boss's main Cloudflare account: **Add a site** → `flatmeta.io` → Free plan.
   - Cloudflare imports the existing records. Check that `A @`, `A www` (or `CNAME www`), `A staging`, the mail records (DKIM, `send.`) and any MX records are all there.
   - At the registrar, change the nameservers to the two Cloudflare shows.
2. Records for the web: `@`, `www` and `staging` → the server IP, **Proxied**.
3. **SSL/TLS → Overview → Full (strict).** The server already has Let's Encrypt certificates from Hestia. Then **Edge Certificates**: turn on Always Use HTTPS, set Minimum TLS 1.2, and turn on HSTS, but only after the site has worked for a week on HTTPS.
5. **Security → Settings (Scrape Shield) → Email Address Obfuscation: Off**, for `flatmeta.io` (www and staging). Cloudflare rewrites every address in the HTML into a "[email protected]" span, so the page no longer matches what React rendered and hydration fails. Round 2 found this as React error #418 on `/pricing`, `/business` and `/for/*` on staging. The app's own addresses are now protected with `<!--email_off-->` (`components/email-text.tsx`). Addresses that owners type into their plots are only safe with the setting off.
6. Check: `curl -sI https://www.flatmeta.io` → `200`, `server: cloudflare`, plus the app's own `strict-transport-security` and `content-security-policy` headers.

**5. Cloudflare Workers (who: Fahad or the owner; optional but recommended).** Deploy `flatmeta-edge`, which resizes and caches images and caches feeds, and `flatmeta-uptime`, which alerts when the site goes down, by the steps in `ops/cloudflare/README.md`. The API token is named `FlatMeta-Workers`.

**6. Uptime and error alerts (who: owner).**
- The uptime URL is `https://www.flatmeta.io/api/v1/health`. It answers 200 with `"ok":true` when the database and Redis answer, and 503 when either is down.
- The `flatmeta-uptime` worker checks it every 5 minutes. Add it to any other monitor you already use as well, for example UptimeRobot (free) with a keyword check for `"ok":true`.
- Errors arrive in the `ERROR_WEBHOOK_URL` channel: server 5xx, crashes and browser errors, with emails, tokens and keys removed.

**7. Production smoke test (who: owner, 15 minutes, on a phone and a laptop).**
1. Run:
   ```bash
   node scripts/release-smoke.cjs https://www.flatmeta.io
   ```
   Every line must be ✓.
2. By hand, then tick each check:
   - [ ] home loads with the map;
   - [ ] sign in with an email code;
   - [ ] claim free land;
   - [ ] edit the plot and open its `/p/<slug>` page;
   - [ ] `/pricing` shows real prices;
   - [ ] buy the cheapest item with a real card, then refund it in Stripe (Payments → the payment → Refund);
   - [ ] PayPal on the same order, sandbox first;
   - [ ] the email arrives from `noreply@flatmeta.io` and is not in spam;
   - [ ] `/brands` and a company page load;
   - [ ] `/llms.txt` is the new one;
   - [ ] Google Search Console → Sitemaps → submit `https://www.flatmeta.io/sitemap.xml`.
3. If anything fails, roll back:
   ```bash
   bash scripts/deploy.sh production --rollback --commit <previous sha from logs/releases>
   ```
   Then send the failing step to the developer.

---

## Agents and daily checks (GL8)

**Already in the repo:**
- `.github/workflows/daily-qa.yml`: the release smoke test on www and staging, and the Lighthouse mobile budget on www, daily.
- `.github/workflows/daily-seo.yml`: sitemaps, page tags, JSON-LD and llms.txt, daily.
- `.github/workflows/weekly-ceo-report.yml`: writes `docs/golive/weekly/<date>.md` every Monday.
- `ops/agents/*.md`: five prompts (CEO, Marketing, Sales, Developer, QA), each with its guardrails.

**1. Make `v2` the default branch (who: the repository owner on GitHub, 1 minute).** GitHub only runs `schedule:` workflows from the default branch, and the default branch is `main` today. Without this step the three schedules never run.
1. GitHub → the repo → **Settings → General → Default branch**.
2. Click ⇄, choose `v2`, then **Update**.
3. The `ci.yml` comment already says the project works on `v2`; `main` stays as it is.

Then:
1. **Actions** → "Daily QA (live)" → **Run workflow**, once, to check it runs.
2. Check: the Actions tab lists all three workflows with a "This workflow has a schedule" note.

**2. Optional: the report key (who: owner, 3 minutes).** Without it, the weekly report says "not available" for sign-ups, orders and revenue.
1. Sign in to FlatMeta with a **moderator** account, not the admin account.
2. Dashboard → Developers → **New API key**, named `FlatMeta-Reports`.
3. GitHub → Settings → Secrets and variables → Actions → **New repository secret**: name `FM_REPORT_API_KEY`, and paste the key.
4. The key can read the admin numbers but cannot change roles or money, because that needs `requireAdmin`.

**3. The weekly report commits to `v2` (who: repository owner).** If branch protection on `v2` blocks the GitHub Actions bot, allow "github-actions" to push in the rule, or set the workflow to open a pull request instead.

**4. The five agents (who: owner; Antigravity or claude.ai, whichever the team uses).** For each file in `ops/agents/`:
1. **claude.ai:** open a new scheduled task, connect the GitHub repo `MeWeBe-com/flatmeta.io` (read, plus pull requests), paste the "Prompt" section, and set the schedule in the file's header (UK time).
2. **Antigravity Cloud Automations:** create an automation with the same prompt and schedule, and give it the same repository access.
3. Give the agents **no** payment, email-sending or social-posting connectors. They draft; people publish.
4. Check after the first run: a pull request to `v2` from each agent, touching only `docs/golive/drafts/` or `docs/golive/weekly/`. The Developer agent's pull requests touch code and come with tests.

| Agent | Schedule (UK) | Needs |
|---|---|---|
| QA | daily 06:15 | Repository: read, issues, pull requests |
| Developer | daily 06:30 | Repository: read, branches, pull requests, issues |
| Marketing | daily 08:00 | Repository: read, pull requests |
| Sales | weekdays 09:00 | Repository: read, pull requests; web access to public company sites |
| CEO | Mondays 07:30 | Repository: read, pull requests |
