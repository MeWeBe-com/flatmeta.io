# Server steps, 25 Nov 2026: Google sign-in, live Stripe, the Cloudflare rule

Everything from 25 Nov in one place. The server steps run on cp2 **as najamussaqib**, and none needs root. Nothing here prints a secret: hidden prompts (`read -rsp`) write keys straight into `shared/.env`, which is mode 600.

Every production `.env` change ends with a **rebuild**, because `NEXT_PUBLIC_*` values are built into the web app and PM2 must pick up the new environment (see `docs/ops/pm2-and-restarts.md`):

```bash
bash /home/flatmeta/web/flatmeta.io/private/bin/autodeploy.sh rebuild
```

A rebuild builds and tests the live commit in a new folder and swaps it in. If the new build does not come up, the old one is put back.

Set the file path once per shell session; the commands below use it:

```bash
F=/home/flatmeta/web/flatmeta.io/private/shared/.env
```

---

## 1. Google sign-in

Until this is done, `/api/v1/auth/google` answers 404. That means the client ID and secret are not both set.

### 1a. In Google Cloud (whoever owns the Google account)

APIs & Services → **Credentials** → Create credentials → **OAuth client ID**, application type **Web application**, name `FlatMeta-Google-Login`.

| Field | Value |
|---|---|
| Authorized JavaScript origins | `https://www.flatmeta.io` |
| Authorized redirect URIs | `https://www.flatmeta.io/api/v1/auth/google/callback` |

On the **OAuth consent screen**, add the scopes `openid`, `email` and `profile`, then set the publishing status to **In production**. Otherwise only listed test users can sign in.

### 1b. On cp2, as najamussaqib

1. This must print `APP_URL=https://www.flatmeta.io`, because the redirect URI is built from it:
   ```bash
   grep '^APP_URL=' "$F"
   ```
2. Client ID (not a secret, so the prompt is visible):
   ```bash
   read -rp 'Google client ID: ' ID; sed -i '/^GOOGLE_CLIENT_ID=/d' "$F"; printf 'GOOGLE_CLIENT_ID=%s\n' "$ID" >> "$F"
   ```
3. Client secret (hidden prompt, never echoed):
   ```bash
   read -rsp 'Google client secret: ' SEC; echo; sed -i '/^GOOGLE_CLIENT_SECRET=/d' "$F"; printf 'GOOGLE_CLIENT_SECRET=%s\n' "$SEC" >> "$F"; unset SEC
   ```
4. Show the button in the web app:
   ```bash
   sed -i '/^NEXT_PUBLIC_GOOGLE_AUTH=/d' "$F"; echo 'NEXT_PUBLIC_GOOGLE_AUTH=true' >> "$F"
   ```
5. Rebuild:
   ```bash
   bash /home/flatmeta/web/flatmeta.io/private/bin/autodeploy.sh rebuild
   ```

### 1c. Check

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://www.flatmeta.io/api/v1/auth/google
```

It must answer `302` to `https://accounts.google.com/...`, with `redirect_uri=https%3A%2F%2Fwww.flatmeta.io%2Fapi%2Fv1%2Fauth%2Fgoogle%2Fcallback` in the URL. Then, in a private window, the sign-in dialog shows "Continue with Google", and one round trip ends signed in.

---

## 2. Live Stripe (account "Mewebe.com Sites")

FlatMeta's live payments go into the shared Stripe account **Mewebe.com Sites**. FlatMeta's prices carry the lookup prefix `flatmeta_`, so they stay separate from the other sites' prices in that account.

### Environment variables (`shared/.env`)

| Key | Value | |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` (or a restricted `rk_live_…`) | required |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_…`, from the same account | required |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` of the endpoint in step 4 | required |
| `PAID_CHECKOUT_ENABLED` | `true` (in production `auto` means **off**) | required |
| `STRIPE_ACCOUNT_NAME` | `"Mewebe.com Sites"` (empty means `APP_NAME`, i.e. "FlatMeta") | so the account check passes |
| `CURRENCY` | `usd` (the default) | optional |
| `STRIPE_AUTOMATIC_TAX` | `false` until Stripe Tax is set up | optional |
| `STRIPE_LOOKUP_PREFIX` | `flatmeta` (the default) | optional |
| `STRIPE_PRICE_{PLUS,BUSINESS,BRAND}_{MONTH,YEAR}` | leave empty: step 3 creates the prices | optional |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=live` | separate from Stripe, and only after the sandbox test passes | optional |

A test key on production is refused at checkout, and admins see a red warning.

### Order of steps

**0. See what is there now.** This prints only the prefixes (`sk_live`, `pk_test`, `whsec`…), never a key:

```bash
sed -n 's/^\(STRIPE_SECRET_KEY\|STRIPE_PUBLISHABLE_KEY\|STRIPE_WEBHOOK_SECRET\)=["'"'"']\{0,1\}\([a-z]*_\(live\|test\)\?\).*/\1 \2/p' "$F"
```

**1. Paste the live keys and name the account** (hidden prompts):

```bash
read -rsp 'sk_live / rk_live key: ' K; echo; sed -i '/^STRIPE_SECRET_KEY=/d' "$F"; printf 'STRIPE_SECRET_KEY=%s\n' "$K" >> "$F"; unset K
```
```bash
read -rsp 'pk_live key: ' K; echo; sed -i '/^STRIPE_PUBLISHABLE_KEY=/d' "$F"; printf 'STRIPE_PUBLISHABLE_KEY=%s\n' "$K" >> "$F"; unset K
```
```bash
sed -i '/^STRIPE_ACCOUNT_NAME=/d' "$F"; echo 'STRIPE_ACCOUNT_NAME="Mewebe.com Sites"' >> "$F"
```

**2. Check the account.** It must print `Stripe account: "Mewebe.com Sites" acct_… · LIVE · charges enabled` and `✓ named exactly "Mewebe.com Sites"`:

```bash
cd /home/flatmeta/web/flatmeta.io/private/flatmeta && npm run payments:check -w flatmeta-api
```

**3. Create the products and prices.** First a dry run, which lists what it would create:

```bash
npm run stripe:sync -w flatmeta-api
```

Then create them:

```bash
npm run stripe:sync -w flatmeta-api -- --apply --live
```

It is safe to run again: it finds existing prices by lookup key. It creates 3 products with 6 prices:

| Plan | Monthly | Yearly | Lookup keys |
|---|---|---|---|
| Plus | $5 | $48 | `flatmeta_plus_month`, `flatmeta_plus_year` |
| Business | $29 | $290 | `flatmeta_business_month`, `flatmeta_business_year` |
| Brand | $249 | $2,490 | `flatmeta_brand_month`, `flatmeta_brand_year` |

One-time charges use inline prices, so nothing is created for them in Stripe:
- land per cell, by zone: $25, $9, $4, $2 or $1;
- Spotlight $9, Beacon $3, AI pack $5;
- the company claim, which is $0 now.

**4. Add the webhook** in Stripe (Mewebe.com Sites, live mode): Developers → Webhooks → **Add endpoint**.

- URL: `https://www.flatmeta.io/api/v1/stripe/webhook`
- These 8 events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.expired`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
  - `charge.refunded`

Paste its signing secret:

```bash
read -rsp 'whsec_ signing secret: ' K; echo; sed -i '/^STRIPE_WEBHOOK_SECRET=/d' "$F"; printf 'STRIPE_WEBHOOK_SECRET=%s\n' "$K" >> "$F"; unset K
```

**5. Turn checkout on and rebuild:**

```bash
sed -i '/^PAID_CHECKOUT_ENABLED=/d' "$F"; echo 'PAID_CHECKOUT_ENABLED=true' >> "$F"
```
```bash
bash /home/flatmeta/web/flatmeta.io/private/bin/autodeploy.sh rebuild
```

**6. Check:**
- `npm run payments:check -w flatmeta-api`: LIVE, charges enabled, `✓ named exactly "Mewebe.com Sites"`, and no `✗` lines.
- `curl -s https://www.flatmeta.io/api/v1/features` shows `"paidCheckout":true`.
- Admin → Overview → Payments: no red banner, and every price shows `lookup`.
- Buy the cheapest item with a real card, then refund it in Stripe (Payments → the payment → Refund). The order must show paid, then refunded, in Admin.

---

## 3. Cloudflare: `/.well-known/mcp-registry-auth` on the bare domain

The MCP registry needs `https://flatmeta.io/.well-known/mcp-registry-auth` to answer **200** with the proof line, while every other bare-domain path keeps its 301 to www.

**Where the 301 comes from: Cloudflare.** The redirect body says "cloudflare", not "nginx". The app and the nginx template already skip this one path (commit `15a50fa`, live), so this needs a Cloudflare change, not root.

**Who:** whoever holds the boss's Cloudflare account. **Where:** zone `flatmeta.io` → **Rules → Redirect Rules** → edit the rule that sends `flatmeta.io` to www. Set its match to **Custom filter expression**:

```
(http.host eq "flatmeta.io" and not http.request.uri.path eq "/.well-known/mcp-registry-auth")
```

Keep the rest as it is: status 301, the `https://www.flatmeta.io` target and "Preserve query string".

If the redirect is a **Page Rule** instead (Rules → Page Rules, a `flatmeta.io/*` "Forwarding URL"), add a new page rule for `flatmeta.io/.well-known/mcp-registry-auth` with "Cache Level: Bypass", and drag it above the forwarding rule. Only the first matching page rule applies.

**Check:**

```bash
curl -s -w '\n%{http_code}\n' https://flatmeta.io/.well-known/mcp-registry-auth
```

It must print the `v=MCPv1; k=ed25519; …` line and `200`.

```bash
curl -sI https://flatmeta.io/pricing | grep -i '^location'
```

It must still show `location: https://www.flatmeta.io/pricing`.

**If it still answers 301 and the body now says "nginx"**, the server's own redirect is next. Both fixes need root, the one part of this doc that does:
- **The old rendered include is installed.** Re-render it as najamussaqib:
  ```bash
  cd /home/flatmeta/web/flatmeta.io/private/flatmeta && node scripts/new-instance.mjs production --nginx-only
  ```
  Then root installs it:
  ```bash
  sudo bash /home/flatmeta/web/flatmeta.io/private/flatmeta/scripts/server/go-live-production-root.sh
  ```
- **Hestia's "domain redirection" is on for the domain.** Turn it off in the panel; our include already redirects every other path.
