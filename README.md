# FlatMeta

**The world map you can own a piece of.** Claim a plot of the real world, make it yours in seconds with AI, level up with quests and badges, and get found by people and AI agents.

This repo is the **web app** (Next.js). The backend lives in [`flatmetaAPI`](https://github.com/MeWeBe-com/flatmetaAPI) (Fastify + Postgres + Redis). Product docs are in [`docs/`](docs):

| Doc | What it is |
|---|---|
| [`docs/00-audit.md`](docs/00-audit.md) | Audit of v1 |
| [`docs/01-brief.md`](docs/01-brief.md) | Product brief: positioning, personas, pricing, features, game and UX direction, stack |
| [`docs/02-masterprompt-phase1.md`](docs/02-masterprompt-phase1.md) | Phase 1 build spec (what is in this branch) |
| [`docs/03-masterprompt-phase2.md`](docs/03-masterprompt-phase2.md) | Phase 2 plan (enterprise-ready) |
| [`docs/progress.md`](docs/progress.md) | Progress log, decisions and **open questions** |
| [`tasks.md`](tasks.md) | Task board |

---

## Contents

1. [Architecture](#architecture)
2. [Local development](#local-development)
3. [Server setup (Ubuntu 24.04)](#server-setup-ubuntu-2404)
4. [Deploying with GitHub Actions](#deploying-with-github-actions)
5. [Staging](#staging)
6. [Stripe](#stripe)
7. [AI providers and images](#ai-providers-and-images)
8. [Showcase plots](#showcase-plots)
9. [API, OpenAPI and MCP](#api-openapi-and-mcp)
10. [Backups, logs and monitoring](#backups-logs-and-monitoring)
11. [Troubleshooting](#troubleshooting)

---

## Architecture

```
                 ┌──────────────── nginx (TLS) ────────────────┐
 browser ──────▶ │ flatmeta.io        /        → web  :3000    │
                 │                    /api/*   → api  :4000    │  (same origin: first-party cookie)
                 │                    /media/* → files on disk │
 agents, devs ─▶ │ api.flatmeta.io    /docs /openapi.json /mcp │
                 └─────────────────────────────────────────────┘
 web  (this repo)   Next.js 16 · React 19 · Tailwind 4 · MapLibre GL (globe) · PWA
 api  (flatmetaAPI) Fastify 5 · Zod · Drizzle · Postgres 16 · Redis 7 · BullMQ worker
                    Stripe · Anthropic / OpenAI / Gemini · MCP server · WebSocket live feed
```

- **Map:** MapLibre GL with FlatMeta's own night/day styles on OpenMapTiles vector tiles (OpenFreeMap by default; self-hostable). Plots are rectangles on a fixed grid (40 px cells at zoom 15). Plot artwork is drawn on the map from zoom 12.5.
- **Server-rendered SEO pages** for every plot (`/p/[slug]`), country (`/c/[code]`), city (`/r/[slug]`), profile (`/u/[username]`) and organisation (`/o/[slug]`), each with JSON-LD and a generated share image. `sitemap.xml` comes from the API.
- **Auth:** passwordless email codes (optional Google), session cookie `fm_session`, API keys for developers.
- **Everything third-party is optional in development:** without keys you get console email, a mock checkout, heuristic AI and procedural artwork.

### Repo layout (web)

```
src/app/            routes (map, plot pages, explore, leaderboards, pricing, dashboard, admin, legal …)
src/components/     map/, world/ (map UI), plot/, admin/, providers (session, game, live), ui kit
src/lib/            config, API clients, grid maths (shared with the API), formatting, i18n, SEO
messages/en.json    all UI copy (i18n-ready)
public/sw.js        service worker (offline page, static/media caching)
scripts/            deploy.sh, make-icons.mjs, copy-maplibre-worker.mjs
test/unit, test/e2e Vitest unit tests, Playwright smoke tests
```

---

## Local development

Requirements: **Node 22+**, **Docker** (for Postgres and Redis) or local Postgres 16 and Redis 7.

```bash
mkdir flatmeta && cd flatmeta
```

```bash
git clone -b v2 https://github.com/MeWeBe-com/flatmetaAPI.git api
```

```bash
git clone -b v2 https://github.com/MeWeBe-com/flatmeta.io.git web
```

**API** (terminal 1):

```bash
cd api && cp .env.example .env && docker compose up -d && npm install && npm run setup && npm run dev
```

`npm run setup` runs migrations, seeds countries, cities, price tiers, the admin user (`SEED_ADMIN_EMAIL`), FlatMeta HQ, demo players, and the first showcase batch (140 plots in 10 countries, procedural art). It takes about two minutes.

**Worker** (terminal 2, optional in dev; runs scheduled jobs):

```bash
cd api && npm run dev:worker
```

**Web** (terminal 3):

```bash
cd web && cp .env.example .env && npm install && npm run dev
```

Open <http://localhost:3000>. To sign in, enter any email: the code is shown in the dialog in development (and printed in the API log). Sign in with `SEED_ADMIN_EMAIL` to get the admin panel at `/admin`.

### Useful commands (web)

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 (proxies `/api` and `/media` to `API_INTERNAL_URL`) |
| `npm run build && npm start` | Production build and server |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Playwright smoke tests against `E2E_BASE_URL` (default `http://localhost:3000`). Run `npx playwright install chromium` once, or set `PW_CHROMIUM_PATH` to an existing Chromium. |
| `npm run icons` | Regenerate PWA icons from the logo |

---

## Server setup (Ubuntu 24.04)

One server runs production and staging side by side:

| | Production | Staging |
|---|---|---|
| Host | `flatmeta.io`, `api.flatmeta.io` | `$STAGING_HOST` (default `staging.flatmeta.io`), `api.$STAGING_HOST` |
| Web | `$DEPLOY_PATH/web` on :3000 (`flatmeta-web`) | `$DEPLOY_PATH/staging/web` on :3100 (`flatmeta-web-staging`) |
| API | `$DEPLOY_PATH/api` on :4000 (`flatmeta-api`, `flatmeta-worker`) | `$DEPLOY_PATH/staging/api` on :4100 (`…-staging`) |
| DB / Redis | `flatmeta` / Redis DB 0 | `flatmeta_staging` / Redis DB 1 |

The examples use `DEPLOY_PATH=/srv/flatmeta` and a `deploy` user. Run each block as root (or with `sudo`) unless it says otherwise.

### 1. Base system, user and firewall

```bash
apt update && apt -y upgrade && apt -y install git curl build-essential ufw fail2ban unattended-upgrades gettext-base
```

```bash
adduser --disabled-password --gecos "" deploy && mkdir -p /srv/flatmeta && chown deploy:deploy /srv/flatmeta
```

```bash
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

(Run the `ufw` line after installing nginx in step 3, or use `ufw allow 80,443/tcp` now.)

Give GitHub Actions a key to log in as `deploy`. Generate it on your machine, put the **public** key on the server, and the **private** key in the repo secret `DEPLOY_KEY`:

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f flatmeta_deploy -N ""
```

```bash
mkdir -p /home/deploy/.ssh && cat flatmeta_deploy.pub >> /home/deploy/.ssh/authorized_keys && chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

The server also needs read access to both GitHub repos. Add a deploy key (read-only) per repo, or use HTTPS with a fine-grained token, as the `deploy` user.

### 2. Node 22 and PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt -y install nodejs && npm install -g pm2
```

Make PM2 start on boot (as root; it prints nothing else to do):

```bash
env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy
```

### 3. Postgres 16, Redis 7 and nginx

```bash
apt -y install postgresql-16 postgresql-contrib-16 redis-server nginx certbot python3-certbot-nginx
```

Create the databases (choose real passwords):

```bash
sudo -u postgres psql -c "CREATE USER flatmeta WITH PASSWORD 'change-me';" -c "CREATE DATABASE flatmeta OWNER flatmeta;" -c "CREATE DATABASE flatmeta_staging OWNER flatmeta;"
```

The migrations create the `citext`, `pg_trgm` and `unaccent` extensions; they ship with `postgresql-contrib`. If your DB user is not a superuser, create them once as `postgres`:

```bash
for db in flatmeta flatmeta_staging; do sudo -u postgres psql -d $db -c "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS unaccent;"; done
```

Redis: keep it bound to localhost (the default). Optionally set `maxmemory 256mb` and `maxmemory-policy noeviction` in `/etc/redis/redis.conf` (BullMQ needs `noeviction`), then:

```bash
systemctl restart redis-server
```

### 4. Code and environment files

As `deploy`:

```bash
sudo -iu deploy
```

```bash
cd /srv/flatmeta && git clone -b v2 git@github.com:MeWeBe-com/flatmetaAPI.git api && git clone -b v2 git@github.com:MeWeBe-com/flatmeta.io.git web
```

```bash
cp /srv/flatmeta/api/.env.example /srv/flatmeta/api/.env && cp /srv/flatmeta/web/.env.example /srv/flatmeta/web/.env
```

Edit **`api/.env`** for production. The minimum:

```ini
NODE_ENV=production
APP_ENV=production
PORT=4000
PUBLIC_WEB_URL=https://flatmeta.io
PUBLIC_API_URL=https://api.flatmeta.io
STAGING_HOST=staging.flatmeta.io
DATABASE_URL=postgres://flatmeta:change-me@localhost:5432/flatmeta
REDIS_URL=redis://localhost:6379/0
SESSION_SECRET=<openssl rand -hex 32>
COOKIE_SECURE=true
SEED_ADMIN_EMAIL=you@yourcompany.com
SMTP_HOST=… SMTP_USER=… SMTP_PASS=… MAIL_FROM="FlatMeta <hello@flatmeta.io>"
MEDIA_DIR=/srv/flatmeta/api/storage/media
PAYMENTS_MOCK=false
STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=… STRIPE_PRICE_…=…
ANTHROPIC_API_KEY=… (and/or OPENAI_API_KEY, GEMINI_API_KEY)
```

Edit **`web/.env`**:

```ini
API_INTERNAL_URL=http://127.0.0.1:4000
NEXT_PUBLIC_SITE_URL=https://flatmeta.io
NEXT_PUBLIC_API_DOCS_URL=https://api.flatmeta.io/docs
NEXT_PUBLIC_MCP_URL=https://api.flatmeta.io/mcp
NEXT_PUBLIC_WS_URL=
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_STAGING_HOST=staging.flatmeta.io
PORT=3000
```

`NEXT_PUBLIC_*` values are baked in at build time, so rebuild the web app after changing them. Never commit `.env` files. Every variable is documented in the two `.env.example` files.

### 5. First deploy

As `deploy`, API first (it runs migrations), then seed and start:

```bash
cd /srv/flatmeta/api && APP_ENV=production bash scripts/deploy.sh origin/v2
```

```bash
cd /srv/flatmeta/api && npm run db:seed && npm run showcase -- --countries all --approve
```

```bash
cd /srv/flatmeta/web && APP_ENV=production bash scripts/deploy.sh origin/v2
```

```bash
pm2 save && pm2 ls
```

You should see `flatmeta-api`, `flatmeta-worker` and `flatmeta-web` online. In production the seed adds no demo users; the showcase plots are labelled "unclaimed showcase".

### 6. nginx and TLS

Point DNS `A`/`AAAA` records for `flatmeta.io`, `www`, `api`, `$STAGING_HOST` and `api.$STAGING_HOST` at the server. Then, as root:

```bash
cp /srv/flatmeta/api/deploy/nginx-flatmeta.conf /etc/nginx/sites-available/flatmeta && ln -sf /etc/nginx/sites-available/flatmeta /etc/nginx/sites-enabled/flatmeta && rm -f /etc/nginx/sites-enabled/default
```

Get certificates before enabling the 443 blocks. The simplest route is `certbot certonly --nginx` with a temporary minimal config, or comment out the `listen 443` servers first:

```bash
mkdir -p /var/www/certbot && certbot certonly --nginx -d flatmeta.io -d www.flatmeta.io -d api.flatmeta.io
```

```bash
nginx -t && systemctl reload nginx
```

Certbot installs a renewal timer automatically (check it with `systemctl list-timers | grep certbot`). The config serves `/media` straight from disk, proxies `/api/` (including the WebSocket) to the API, and serves `/_next/static` with long-lived caching.

---

## Deploying with GitHub Actions

Both repos have `.github/workflows/ci.yml` (lint, typecheck, tests, build; the API's runs against Postgres and Redis services) and `.github/workflows/deploy.yml`.

**Deploy** runs on every push to `v2` (to **staging**), or manually from *Actions → Deploy → Run workflow* with `staging` or `production`. It connects over SSH and runs `scripts/deploy.sh <sha>` in `DEPLOY_PATH/{api,web}` (production) or `DEPLOY_PATH/staging/{api,web}`. The script does fetch, checkout, `npm ci`, build, migrate (API), `pm2 startOrReload`, a health check, and rolls back to the previous commit if the health check fails. The web build compiles into a side directory and swaps it in, so the site keeps serving during the build.

Add these **repository secrets** in both repos (*Settings → Secrets and variables → Actions*):

| Secret | Example |
|---|---|
| `DEPLOY_HOST` | `203.0.113.10` or `server.flatmeta.io` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_KEY` | the private key from step 1 (whole file, including the BEGIN/END lines) |
| `DEPLOY_PATH` | `/srv/flatmeta` |

Until they are set, the deploy job logs "Deploy secrets are not set yet; skipping deploy." and succeeds. Optionally create GitHub *Environments* named `staging` and `production` (the job uses them) to add required reviewers for production.

When a change spans both repos, deploy the API first.

---

## Staging

Staging is the same code on the same server, under the subdomain in **`STAGING_HOST`** (API `.env`) and **`NEXT_PUBLIC_STAGING_HOST`** (web `.env`). Changing the subdomain is a config change. Staging shows a banner, sends `noindex`, and serves a `robots.txt` that blocks everything.

```bash
sudo -iu deploy
```

```bash
mkdir -p /srv/flatmeta/staging && cd /srv/flatmeta/staging && git clone -b v2 git@github.com:MeWeBe-com/flatmetaAPI.git api && git clone -b v2 git@github.com:MeWeBe-com/flatmeta.io.git web && cp api/.env.example api/.env && cp web/.env.example web/.env
```

In `staging/api/.env` use `APP_ENV=staging`, `PORT=4100`, `DATABASE_URL=…/flatmeta_staging`, `REDIS_URL=redis://localhost:6379/1`, `PUBLIC_WEB_URL=https://$STAGING_HOST`, `PUBLIC_API_URL=https://api.$STAGING_HOST`, Stripe **test** keys, and `PAYMENTS_MOCK=false` (or `true` without Stripe keys). In `staging/web/.env` use `API_INTERNAL_URL=http://127.0.0.1:4100`, `PORT=3100`, `NEXT_PUBLIC_APP_ENV=staging` and the staging URLs. Then deploy both:

```bash
cd /srv/flatmeta/staging/api && APP_ENV=staging bash scripts/deploy.sh origin/v2 && npm run setup
```

```bash
cd /srv/flatmeta/staging/web && APP_ENV=staging bash scripts/deploy.sh origin/v2
```

nginx for staging is generated from a template using `STAGING_HOST` (as root):

```bash
set -a && . /srv/flatmeta/staging/api/.env && set +a && DEPLOY_PATH=/srv/flatmeta envsubst '${STAGING_HOST} ${DEPLOY_PATH}' < /srv/flatmeta/api/deploy/nginx-flatmeta-staging.conf.template > /etc/nginx/sites-available/flatmeta-staging && ln -sf /etc/nginx/sites-available/flatmeta-staging /etc/nginx/sites-enabled/
```

```bash
certbot certonly --nginx -d "$STAGING_HOST" -d "api.$STAGING_HOST" && nginx -t && systemctl reload nginx
```

To password-protect staging, add `auth_basic` to its `server` blocks.

---

## Stripe

1. In Stripe (test mode first), create Products and recurring Prices for **Plus** ($5/mo, $48/yr), **Business** ($29/mo, $290/yr) and **Brand** ($249/mo, $2,490/yr). Put the price IDs in `STRIPE_PRICE_PLUS_MONTH`, `…_YEAR` and so on. Land, boosts, design packs and Landmark claims are one-off charges created on the fly; they need no Stripe products.
2. Add a webhook endpoint `https://api.flatmeta.io/v1/stripe/webhook` with the events `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` and `charge.refunded`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Enable the Customer Portal (*Settings → Billing → Customer portal*) so users can manage plans.
4. For local testing:

```bash
stripe listen --forward-to localhost:4000/v1/stripe/webhook
```

Without `STRIPE_SECRET_KEY` (and with `PAYMENTS_MOCK=true`, never in production) checkout goes to `/checkout/mock`, which completes the order the same way the webhook would. Prices per zone are editable in **Admin → Pricing**.

---

## AI providers and images

All AI is behind env-selected providers; nothing is hard-coded.

| Feature | Variable | Options |
|---|---|---|
| Plot designer, suggestions, AI search intent | `AI_TEXT_PROVIDER` | `anthropic` (default when `ANTHROPIC_API_KEY` is set), `openai`, `gemini`, `heuristic` |
| Moderation | `AI_MODERATION_PROVIDER` | `openai` (moderation endpoint), `anthropic`, `heuristic` (+ `MODERATION_BLOCKLIST`) |
| Images | `AI_IMAGE_PROVIDER` | `procedural` (built-in, free), `openai`, `gemini` (Imagen), `external` |

Models are configured with `ANTHROPIC_MODEL`, `ANTHROPIC_MODEL_FAST` (moderation and search intent; set a smaller model to save cost), `OPENAI_MODEL`, `OPENAI_IMAGE_MODEL`, `GEMINI_MODEL` and `GEMINI_IMAGE_MODEL`. AI credits per plan are enforced by the API.

**Google Flow (or any manual image pipeline):** set `AI_IMAGE_PROVIDER=external`. Prompts are written to `EXTERNAL_IMAGE_DIR/outbox/prompts.jsonl` with an `id`. Generate the images in Flow, save each as `EXTERNAL_IMAGE_DIR/inbox/<id>.png`, and they are imported hourly by the worker, or immediately with `npm run images:import`. Until then the plot keeps its procedural art.

---

## Showcase plots

Showcase plots show how well-known organisations *could* use FlatMeta. They use the organisation's **name only**, with **original generated artwork**: no logos and no implied endorsement. They are always labelled "Unclaimed showcase · not affiliated", and the organisation can claim them (work-email verification, then a Landmark checkout) or ask for removal from the plot page.

- Curated seed data: `api/seed/showcase/<CC>.json` (10 countries, 140 entries).
- Generate (from the API directory):

```bash
npm run showcase -- --countries GB,US --approve
```

```bash
npm run showcase -- --countries IT --source ai --count 12
```

```bash
npm run showcase -- --countries all --images openai --regenerate-images
```

- Or from **Admin → Showcase**: generate a batch for any country, filter, edit, regenerate an image with a chosen provider, bulk approve or unpublish, and export JSON. Only approved showcase plots are public.

---

## API, OpenAPI and MCP

- REST API under `/v1`. Interactive docs at `https://api.flatmeta.io/docs`, spec at `/openapi.json`. Developers create API keys in **Dashboard → Developers** and send `Authorization: Bearer fm_live_…`.
- **MCP server** for AI agents at `https://api.flatmeta.io/mcp` (Streamable HTTP). Tools: `search_plots`, `get_plot`, `list_countries`, `get_country`, `get_region`, `check_availability`, `suggest_plots`, `get_leaderboard` and, with an API key, `list_my_plots`, `update_plot` and `claim_plot`. For Claude Desktop or other stdio clients, run `npm run mcp:stdio` in the API repo. Setup snippets are on the Developers page.

---

## Backups, logs and monitoring

**Backups.** `scripts/backup.sh` (API repo) writes a gzipped `pg_dump` to `/var/backups/flatmeta` and keeps 14 days. Add it to the `deploy` user's crontab (`crontab -e`):

```cron
15 2 * * * /srv/flatmeta/api/scripts/backup.sh >> /home/deploy/flatmeta-backup.log 2>&1
```

Create the directory once as root:

```bash
mkdir -p /var/backups/flatmeta && chown deploy:deploy /var/backups/flatmeta
```

Copy backups off the server too (for example with `rclone` to S3/R2), together with `api/storage/media` if you use the local storage driver.

To restore:

```bash
gunzip -c /var/backups/flatmeta/flatmeta-YYYYMMDD-HHMMSS.sql.gz | psql "$DATABASE_URL"
```

**Logs.**

```bash
pm2 logs flatmeta-api --lines 200
```

```bash
pm2 install pm2-logrotate
```

nginx logs are in `/var/log/nginx/`. Health endpoints: `GET /healthz` on the API (also pings Redis) and `/robots.txt` on the web app.

**Scheduled jobs** run in `flatmeta-worker` (BullMQ): expire unpaid holds (5 min), country stats and leaderboard rebuilds (hourly), external image import (hourly), dormant-plot reminders, ended plan grants and clean-up (daily), link health (weekly). No system cron is needed apart from backups.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `502 Bad Gateway` | `pm2 ls`. If an app is errored, `pm2 logs <name>`. Check the ports in `.env` match nginx (3000/4000, staging 3100/4100). |
| Sign-in emails never arrive | Check `SMTP_*` in `api/.env` and `pm2 logs flatmeta-api`. Without `SMTP_HOST` emails are only logged. |
| Logged out after every request | Production needs HTTPS and `COOKIE_SECURE=true`; the site and `/api` must share one origin through nginx. |
| Map is blank | The browser must reach the tile host (`NEXT_PUBLIC_MAP_TILES_URL`). The MapLibre worker must be served from `/vendor/maplibre-gl-worker.mjs` (copied by `npm install`/`npm run build`). |
| Live feed doesn't update | nginx must pass `Upgrade`/`Connection` headers for `/api/` (included in the config). |
| Stripe payments don't activate plots | Check the webhook endpoint and secret, and the API log for `stripe` errors. In the Stripe dashboard, re-send the event. |
| Migration failed on deploy | The deploy rolls the code back, but **migrations are not reverted**. Fix forward, or restore from backup. |
| `permission denied to create extension` | Create the extensions as `postgres` (step 3). |
| Changed a `NEXT_PUBLIC_*` value and nothing happened | Rebuild the web app (`bash scripts/deploy.sh origin/v2`). |
| Workflow says "skipping deploy" | Add the four `DEPLOY_*` secrets. |
