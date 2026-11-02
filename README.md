# FlatMeta

**The world map you can own a piece of.** Explore a live globe with other players, claim a plot of the real world, make it yours in seconds with AI, trade land on a marketplace, team up in clans, and level up with quests and badges. Businesses and brands get public pages, subscriptions and an AI-readable presence (REST + MCP).

This is the **v2 monorepo** (branch `v2`). The v1 Ionic/Laravel apps stay on `main` for reference; `flatmetaAPI` `v2` only points here.

| Where | What |
|---|---|
| [`docs/00-kickoff-masterprompt.md`](docs/00-kickoff-masterprompt.md) | The owner's brief and rules |
| [`tasks.md`](tasks.md) | Task board (source of truth) |
| [`docs/progress.md`](docs/progress.md) | What was done, decisions, next steps, **open questions** |
| [`docs/00-audit.md`](docs/00-audit.md) | Audit of v1 (all branches) |
| [`docs/01-brief.md`](docs/01-brief.md) | Positioning, personas, monetisation, features, UX and game design, stack |
| [`docs/02-masterprompt-phase1.md`](docs/02-masterprompt-phase1.md) | Phase 1 build spec (§12 aligns it with the kickoff) |
| [`docs/03-masterprompt-phase2.md`](docs/03-masterprompt-phase2.md) | Phase 2 plan (enterprise-ready) |
| [`docs/deploy-hestia.md`](docs/deploy-hestia.md) | **Server setup, deploys, staging, backups (HestiaCP, Ubuntu 24.04)** |

## Contents

1. [Architecture](#architecture) · 2. [Local development](#local-development) · 3. [Configuration](#configuration) · 4. [Deploying](#deploying) · 5. [Product guide for developers](#product-guide-for-developers) · 6. [Testing and CI](#testing-and-ci)

---

## Architecture

```
browser ──▶ proxy (HestiaCP nginx, TLS)
              /            → web    Next.js 16 · React 19 · Tailwind 4 · MapLibre globe · PWA   (WEB_PORT 3200)
              /api/*       → api    Fastify 5 · Zod/OpenAPI · REST /v1 · WebSocket /v1/live · /mcp · /docs   (PORT 3201)
              /media/*     → files on disk (or S3/R2 with STORAGE_DRIVER=s3)
api ⇄ Postgres 16 (citext, pg_trgm, unaccent) · Redis 7 (BullMQ, rate limits, leaderboards, presence geo-index, pub/sub)
worker (BullMQ): expiry, stats, leaderboards, payouts, link checks, chat cleanup, image import        (health WORKER_HEALTH_PORT 3203)
```

```
apps/web         Next.js app: map, plot pages, marketplace, clans, dashboard, admin, SEO, PWA
apps/api         Fastify API, WebSocket hub, MCP server, worker, showcase generator, migrations, seeds, tests
packages/shared  Grid maths shared by both (built to dist on npm install)
docs/            Brief, audit, masterprompts, progress log, Hestia guide
deploy/hestia/   nodejs-app.conf + nodejs-app-fallback.conf for HestiaCP's NodeJS proxy template
scripts/         deploy.sh, backup.sh, print-env.mjs
```

- **Map:** MapLibre GL globe with FlatMeta's own night/day styles on OpenMapTiles vector tiles (OpenFreeMap by default). Plots are rectangles on a fixed grid (40 px cells at zoom 15); artwork is drawn on the map from zoom 12.5. Three named levels (**World**, **City**, **Land**) are presets on top of smooth continuous zoom: avatars appear from City, the claim grid and editing at Land.
- **Live world:** a WebSocket (`/v1/live`) carries online count, activity, avatars in your viewport, chat and notifications. Presence is a Redis geo-index shared by all API processes.
- **Land and money:** free Homestead for every verified player; paid land priced per cell by zone; plans (Plus, Business, Brand); boosts; a **marketplace** where sellers keep 90% (10% fee, configurable) with an append-only zero-sum **ledger**; Stripe for checkout and Connect payouts. Everything runs without keys in development (mock checkout).
- **AI:** plot designer, suggestions, search and moderation behind provider adapters (Anthropic, OpenAI, Gemini or built-in heuristics); images from a procedural generator, OpenAI, Imagen or an external pipeline.
- **No secrets in git:** every key comes from `.env`; every integration switches on when its variables are set.

---

## Local development

Requires **Node 22+**, and Postgres 16 + Redis 7 (`docker compose up -d` provides both).

```bash
git clone -b v2 https://github.com/MeWeBe-com/flatmeta.io.git && cd flatmeta.io
```

```bash
cp .env.example .env && docker compose up -d && npm install && npm run setup
```

`npm run setup` migrates, seeds countries, cities, price tiers, the admin user (`SEED_ADMIN_EMAIL`), FlatMeta HQ, demo players, and the first showcase batch (140 plots in 10 countries; about 2 minutes with procedural art).

Then, in three terminals:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

```bash
npm run dev:worker
```

Open <http://localhost:3200>. Sign in with any email: in development the sign-in code is shown in the dialog and printed in the API log. Sign in as `SEED_ADMIN_EMAIL` to get `/admin`. Open the site in two browsers to see each other's avatars walk around at City level and to try nearby chat.

| Command | What it does |
|---|---|
| `npm run build` | Build shared, API and web |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript, both apps |
| `npm test` | API tests (real Postgres, Redis and WebSockets) + web unit tests |
| `npm run test:e2e` | Playwright smoke tests against `E2E_BASE_URL` (default <http://localhost:3200>); run `npx playwright install chromium` once, or set `PW_CHROMIUM_PATH` |
| `npm run db:migrate` · `db:seed` · `setup` | Database |
| `npm run showcase -- --countries GB,US --approve` | Showcase generator (see below) |
| `npm run -w flatmeta-api db:generate` | New SQL migration from `apps/api/src/db/schema.ts` |
| `npm run -w flatmeta-api mcp:stdio` | MCP server over stdio (Claude Desktop and similar) |
| `npm run -w flatmeta-api openapi:export` | Write `openapi.json` |

---

## Configuration

One file: **`.env` in the repo root** (copy `.env.example`; every variable is documented there). Highlights:

| Variable | Meaning |
|---|---|
| `APP_URL` | Public origin. **Every absolute URL, redirect, email link, sitemap entry and share card is built from it.** Production refuses `localhost`. |
| `APP_ENV` / `NODE_ENV` | `development` · `staging` · `production` (banners, robots, PM2 names) |
| `PRODUCTION_DOMAIN`, `STAGING_DOMAIN` | `flatmeta.io`, `flatmeta.mewebe.net` (placeholder until confirmed) |
| `WEB_PORT`, `PORT`, `MCP_PORT`, `WORKER_HEALTH_PORT` | 3200, 3201, (optional), 3203; avoid 3000, 3010 and 3100 which the server uses |
| `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `COOKIE_SECURE` | Data and sessions |
| `STRIPE_*`, `PAYMENTS_MOCK` | Payments. Without keys, development uses a mock checkout (never in production) |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `AI_*_PROVIDER` | AI (all optional; heuristics and procedural art are the fallback) |
| `SMTP_*`, `MAIL_FROM` | Email (printed to the log in development) |
| `STORAGE_DRIVER`, `MEDIA_DIR`, `S3_*` | Media storage |
| `MARKETPLACE_FEE_BPS`, `MARKETPLACE_MIN_HOLD_DAYS`, `MARKETPLACE_PRICE_CAP_*`, `PAYOUT_MIN_CENTS` | Marketplace rules |
| `NEXT_PUBLIC_*` | Browser-visible map, analytics and feature flags (baked in at build time: rebuild after changing) |

---

## Deploying

Follow [`docs/deploy-hestia.md`](docs/deploy-hestia.md). In short: HestiaCP domain with the generic **NodeJS** proxy template and both [`deploy/hestia/nodejs-app.conf`](deploy/hestia/nodejs-app.conf) and [`nodejs-app-fallback.conf`](deploy/hestia/nodejs-app-fallback.conf) (catch-all `location /`); apps bind to `HOST=127.0.0.1`; Node 22 via nvm and PM2 as a normal user; `.env`; then `bash scripts/deploy.sh`. A push to `v2` runs `.github/workflows/ci.yml`: tests, then, only if they pass and the repository secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, `DEPLOY_PATH` (optional `DEPLOY_PORT`) exist, a deploy job over SSH. Without the secrets it prints a skip notice.

---

## Product guide for developers

### API, OpenAPI and MCP
- REST under `/v1`; interactive docs at `<APP_URL>/api/docs`, spec at `/api/openapi.json`. API keys (Dashboard → Developers) are sent as `Authorization: Bearer fm_live_…`.
- **MCP server** (`<APP_URL>/api/mcp`, Streamable HTTP, stateless): `search_plots`, `get_plot`, `list_countries`, `get_country`, `get_region`, `check_availability`, `suggest_plots`, `get_leaderboard`, and with an API key `list_my_plots`, `update_plot`, `claim_plot`.

### Live protocol (`/v1/live`, JSON messages)
Client → server: `{type:'move',lat,lng}` (≤ 5/s), `{type:'view',bbox:[w,s,e,n]}`, `{type:'chat',scope:'nearby'|'dm'|'clan',body,to?}`, `{type:'ping'}`. Server → client: `welcome`, `presence {online}`, `avatars [...]` (≤ 200, only when the viewport is under ~600 km wide), `chat {message}`, `activity`, `notification`, `error`. Chat is limited to 5 messages per 10 s, moderated, 280 characters; nearby chat reaches players within 2 km and is kept 24 h; private chat needs an accepted connection; guests can read but not write.

### Marketplace
`POST /v1/plots/:id/list`, `PATCH|DELETE /v1/listings/:id`, `POST /v1/listings/:id/buy` (checkout bound to the listing version; if the price changed or someone else bought first, the buyer is refunded automatically). Homestead land can't be resold; plots must be held 7 days; the first 30 days cap the price at 50× the zone price. Each sale writes `platform_fee` and `seller_credit` ledger entries that sum to the price.

### Showcase generator
Showcase plots show how well-known organisations could use FlatMeta. They use the organisation's **name only** with **original generated artwork** (no logos, no implied endorsement), are always labelled "Showcase · Unclaimed", and organisations can claim them (work-email verification, then a Landmark checkout) or request removal.

```bash
npm run showcase -- --countries GB,US --approve
```

```bash
npm run showcase -- --countries IT --source ai --count 12
```

Options: `--countries` (ISO codes or `all`), `--source curated|ai`, `--count`, `--names`, `--images procedural|openai|gemini|external`, `--approve`, `--force`, `--regenerate-images`. Curated data is in `apps/api/seed/showcase/<CC>.json`; the same controls are in **Admin → Showcase**. For Google Flow (no public API), set `AI_IMAGE_PROVIDER=external`: prompts are written to `EXTERNAL_IMAGE_DIR/outbox/prompts.jsonl`; drop the finished images in `EXTERNAL_IMAGE_DIR/inbox/<id>.png` and the worker imports them hourly (or run `npm run -w flatmeta-api images:import`).

### Stripe
Create recurring Prices for Plus ($5/mo, $48/yr), Business ($29/mo, $290/yr), Brand ($249/mo, $2,490/yr) and put the IDs in `STRIPE_PRICE_*`. Add a webhook to `<APP_URL>/api/v1/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `customer.subscription.created|updated|deleted`, `invoice.payment_failed`, `charge.refunded`. Enable the Customer Portal and Connect (Express) for seller payouts. Prices per zone are editable in **Admin → Pricing**. A PayPal adapter can implement the same `PaymentProvider` interface (`apps/api/src/services/payments/provider.ts`); it is not built in Phase 1.

---

## Testing and CI

- **API** (Vitest, real Postgres/Redis/WebSockets): grid and pricing rules, claiming land (no double sales under concurrency), auth and passwords, plot permissions, custom-HTML screening, XP/quests/achievements, Stripe webhooks, showcase generation and claims, marketplace (fees, ledger balance, refunds, concurrent buyers, payouts), realtime presence and chat, connections, clans, MCP, OpenAPI.
- **Web** (Vitest): grid, formatting, i18n keys. **E2E** (Playwright, desktop and mobile): map renders, plot page JSON-LD and share image, pricing, sitemap and robots.
- **CI:** `.github/workflows/ci.yml` runs lint, typecheck, all tests, the build and the e2e smoke tests with Postgres and Redis services, then deploys on `v2` when the secrets are set.
