# Go-live: FlatMeta v2 on https://flatmeta.io

Production runs as a **second instance on the staging server**, next to staging, with its own checkout, `.env`, database, Redis DB, ports and PM2 apps. At launch it runs **without payments**: free land, editing, chat, clans and showcase claim requests all work, and everything paid says "coming soon" until Stripe is ready.

| | Staging | Production |
| --- | --- | --- |
| Domain | `staging.flatmeta.io` | `flatmeta.io` (and `www.` redirecting to it) |
| Checkout | `/home/USER/web/staging.flatmeta.io/private/flatmeta` | `/home/USER/web/flatmeta.io/private/flatmeta` |
| Ports web / API / worker health | 3200 / 3201 / 3203 | **3250 / 3251 / 3253** |
| Postgres | its own database | **its own database** (e.g. `flatmeta_prod`) |
| Redis | DB 6, `REDIS_PREFIX=fm-staging` | **DB 7, `REDIS_PREFIX=fm-prod`** |
| PM2 apps | `flatmeta-{web,api,worker}-staging` | **`flatmeta-{web,api,worker}-production`** |
| Media | `…/staging.flatmeta.io/private/uploads` | **`…/flatmeta.io/private/uploads`** |
| Deploys | automatic: cron (`scripts/auto-deploy.sh --cron`) after CI passes, plus CI's SSH job | automatic from cron once you opt in (`AUTO_DEPLOY=true`): only after the commit has run on staging for 10 min with a passing smoke test; or by hand (`bash scripts/auto-deploy.sh`). See docs/deploy/auto-deploy.md |
| Payments | test mode | off (`PAID_CHECKOUT_ENABLED=auto` → off in production) |
| Robots | `Disallow: /`, `noindex` | indexed, sitemap at `/sitemap.xml`, canonical `https://flatmeta.io` |

`scripts/deploy.sh` refuses a checkout whose `.env` names a different environment. It deploys production without a person only with `--auto` from cron or the CI key, with `AUTO_DEPLOY=true` in the production `.env`; by hand it asks you to type `production`. The CI deploy job calls `deploy.sh staging --ci v2` on the staging checkout only.

Redis pub/sub ignores the DB number, which is why the prefixes must differ (`fm-staging` vs `fm-prod`). The API and the worker of one instance read the same `.env`, so they always agree.

---

## 0. Before the day (owner)

These need credentials or decisions and block a real launch:

1. **Email (required):** production never shows sign-in codes on screen. Without an email provider **nobody can sign in**. Either:
   - **Resend:** verify `flatmeta.io` (SPF, DKIM, DMARC in Cloudflare; see `deploy-hestia.md` → Email), then set `RESEND_API_KEY`, `MAIL_FROM="FlatMeta <hello@flatmeta.io>"` and `RESEND_WEBHOOK_SECRET`, or
   - **the server's own mail (stop-gap):** create a `noreply@flatmeta.io` mailbox in Hestia and set `SMTP_HOST=localhost`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. Deliverability is worse than Resend.
2. **Database:** create `flatmeta_prod` with its own user in Hestia, then the extensions as `postgres`:
   ```bash
   sudo -u postgres psql -d flatmeta_prod -c "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS unaccent;"
   ```
3. **Admin email** for `SEED_ADMIN_EMAIL` (the first admin account).
4. **v1 data:** v2 starts with a fresh database. Existing v1 users and land are **not migrated** (see `progress.md` → Open questions, item 22). Decide what to tell v1 users; v1 can stay reachable read-only on a legacy subdomain.
5. **Legal:** the terms, privacy and refund pages read `COMPANY_NAME`, `COMPANY_COUNTRY` and `CONTACT_EMAIL` (defaults: MeWeBe, United Kingdom, hello@flatmeta.io). They still need a lawyer's review.
6. **Analytics (optional):** `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=flatmeta.io` turns on Plausible (cookie-free) and the cookie notice.

## 1. Prepare the production instance (any time before cutover, no downtime)

As the app user:

```bash
git clone -b v2 git@github.com:MeWeBe-com/flatmeta.io.git ~/web/flatmeta.io/private/flatmeta
cd ~/web/flatmeta.io/private/flatmeta
node scripts/new-instance.mjs production --domain flatmeta.io --home "$HOME" --db 'postgres://flatmeta_prod:PASSWORD@127.0.0.1:5432/flatmeta_prod'
nano .env     # email provider, SEED_ADMIN_EMAIL, optional AI keys, Plausible, company details
```

`new-instance.mjs` writes `.env` with the production ports, Redis DB 7 / `fm-prod`, `APP_URL=https://flatmeta.io`, a random `SESSION_SECRET`, `COOKIE_SECURE=true`, same-origin WebSockets and the media folder. It also renders the two nginx include files with ports 3250/3251 and the media path into `deploy/out/production/`. It never overwrites an existing `.env`; re-render the nginx files any time with `--nginx-only`.

First build, database and showcase:

```bash
bash scripts/deploy.sh production --yes      # in an interactive terminal
npm run setup                                # migrate + seed (admin, regions, cities) + showcase plots
pm2 save
```

Check it locally before touching DNS or nginx:

```bash
curl -s http://127.0.0.1:3251/healthz
curl -s http://127.0.0.1:3251/v1/features            # {"paidCheckout":false,"freeLandCells":100,"appEnv":"production"}
curl -s http://127.0.0.1:3251/v1/live/health          # "ok":true, "prefix":"fm-prod"
curl -s http://127.0.0.1:3253/healthz
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3250/
pm2 ls | grep production                             # three apps, all online
```

**Showcase locations:** in production, showcase plots stay off the public map until an admin checks each location. Sign in as the admin at `https://flatmeta.io` after cutover (or temporarily on staging with the same data), open **Admin → Showcase locations**, open each spot on the map, then mark it checked or paste the right coordinates and press **Move**. Use the *suspect* filter first. The automatic checks found no wrong coordinates in the curated files (details in `progress.md`).

## 2. Cutover (about 5 minutes; the site is briefly unavailable while nginx reloads)

As root (or in the Hestia panel). Replace `USER` with the Hestia user that owns `flatmeta.io`.

1. **Write down v1's current templates** (needed for rollback):
   ```bash
   v-list-web-domain USER flatmeta.io | grep -Ei 'TEMPLATE|BACKEND|PROXY'
   ```
   Save the output, for example `PROXY: default`, `TPL: default`, `BACKEND: PHP-8_2`.
2. **Back up v1:** dump its MySQL database and archive `public_html`, in case v1 needs restoring or migrating later.
3. **Install the include files** rendered in step 1 at the paths the NodeJS template includes (find them with `grep -rn "nodejs-app" /usr/local/hestia/data/templates/web/nginx/`). Typically:
   ```bash
   install -m 644 ~USER/web/flatmeta.io/private/flatmeta/deploy/out/production/nodejs-app.conf          /home/USER/conf/web/flatmeta.io/nodejs/nodejs-app.conf
   install -m 644 ~USER/web/flatmeta.io/private/flatmeta/deploy/out/production/nodejs-app-fallback.conf /home/USER/conf/web/flatmeta.io/nodejs/nodejs-app-fallback.conf
   ```
   Check that they point at 3250/3251: `grep -n proxy_pass /home/USER/conf/web/flatmeta.io/nodejs/*.conf`.
4. **Switch the proxy template** to NodeJS (this regenerates and reloads nginx):
   ```bash
   v-change-web-domain-proxy-tpl USER flatmeta.io NodeJS
   nginx -t && systemctl reload nginx
   ```
   If v1 ran as nginx + PHP-FPM without a proxy layer, the switch is the web template instead: `v-change-web-domain-tpl USER flatmeta.io NodeJS`.
5. **SSL** stays as it is (same domain). If `www.flatmeta.io` is an alias, keep it: the app treats `https://flatmeta.io` as canonical. Add a 301 from `www` in Hestia if you want one hostname only.
6. Run the **smoke checks** below. If any fails and can't be fixed in a few minutes, **roll back**.

## 3. Smoke checks (2 people, 10 minutes)

| # | Check | Expect |
| --- | --- | --- |
| 1 | `https://flatmeta.io/api/healthz` and `/api/v1/live/health` | `ok`, `"prefix":"fm-prod"`, `apiProcessesListening: 1` |
| 2 | `https://flatmeta.io/robots.txt` | `Allow: /`, `Sitemap: https://flatmeta.io/sitemap.xml` (not `Disallow: /`) |
| 3 | `https://flatmeta.io/sitemap.xml` | lists `https://flatmeta.io/…` URLs |
| 4 | View source of the home page | `<link rel="canonical" href="https://flatmeta.io">`, `og:image` present, no `noindex` |
| 5 | No staging banner; `/pricing` | "coming soon" notes instead of pay buttons |
| 6 | Sign in with a real email | the code arrives by email (never on screen) |
| 7 | Claim land on the map (e.g. 10×10) | free, active at once; a further claim beyond 100 squares says "coming soon" |
| 8 | Edit the plot, upload an image | image shows (served from `/media/`) |
| 9 | Second person signs in, both at the same spot | see each other's avatar; nearby chat, follow, connect, DM and the bell all work |
| 10 | A showcase claim (`/claim/<slug>` of a checked showcase plot) | verify step ends with "we'll email you", admins get a lead email |
| 11 | `/legal/terms` | no `[brackets]`; company, country and contact filled in |
| 12 | `/does-not-exist` | the FlatMeta 404 page |
| 13 | `pm2 logs flatmeta-api-production --lines 100` | no errors, no `Connection is closed` |
| 14 | Fresh private window, first visit | the avatar starts at your approximate location (City level, "Approximate location · <your city>"), never a random spot; "Use my location" glides it to your exact spot |
| 15 | `curl -s https://flatmeta.io/api/v1/me/approx-location` from your machine | `"source":"ip"` with your city (needs Cloudflare's *Add visitor location headers* Managed Transform; `"home"` means the headers aren't arriving) |

## 4. Rollback (under a minute)

Switch the domain back to v1's templates (from step 2.1). v1's files and database were never touched.

```bash
v-change-web-domain-proxy-tpl USER flatmeta.io default      # or whatever PROXY was before
# if you changed the web template instead:  v-change-web-domain-tpl USER flatmeta.io default
nginx -t && systemctl reload nginx
```

In the panel: *Web → flatmeta.io → Edit → Proxy template → (the old value) → Save*. The v2 PM2 apps can keep running on 3250–3253 (nothing routes to them), so you can fix and switch again later. Stop them with `pm2 stop flatmeta-web-production flatmeta-api-production flatmeta-worker-production` if you prefer.

## 5. After go-live

- **Deploys:** staging deploys on every push to `v2`. Production: `ssh` in, `cd ~/web/flatmeta.io/private/flatmeta && bash scripts/deploy.sh production` (asks for confirmation, health-checks 3251/3250, rolls the code back if they fail).
- **Backups:** add `15 2 * * * cd ~/web/flatmeta.io/private/flatmeta && bash scripts/backup.sh >> ~/backup-prod.log 2>&1` and copy `private/uploads` off the server.
- **Turning payments on later:** follow [stripe-live.md](stripe-live.md): live key and webhook, `npm run stripe:sync -- --apply --live`, check that the admin banner is gone, then `PAID_CHECKOUT_ENABLED=true` and deploy (the web build reads it too) and run the live smoke test.
- **Search engines:** submit `https://flatmeta.io/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
