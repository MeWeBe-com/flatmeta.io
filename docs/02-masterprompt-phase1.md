# MasterPrompt — FlatMeta v2, Phase 1 (≈3 days of agent work)

> **How to use this prompt.** Give this whole file to a coding agent (Claude Code, Gemini/Antigravity, or similar). Start with `docs/00-kickoff-masterprompt.md` and `tasks.md`. **All v2 code lives in one monorepo, `flatmeta.io` on branch `v2`** (`apps/web`, `apps/api`, `packages/shared`); the `flatmetaAPI` repo's `v2` only has a README pointing here (see §12). Paths such as `flatmetaAPI/src/...` below mean `apps/api/src/...`, and `flatmeta.io/app/...` means `apps/web/src/app/...`.
> The agent works only on branch **`v2`**, never on `main` or `develop`. Read `docs/00-audit.md` and `docs/01-brief.md` first; this prompt is the build spec and wins over them where they differ.
> Keep `tasks.md` (in `flatmeta.io/`) as the shared checklist: claim a task by putting your name in *Owner*, set *Status*, tick it when done. Append a summary to `docs/progress.md` after each milestone. Log decisions you can't make under **Open questions** in `docs/progress.md`, then continue with the most sensible default.

---

## 0. Mission

Ship **FlatMeta v2**: an outstanding, payable, production-ready product in which anyone can explore a stunning live world map, claim and buy plots of the real world, design them with AI, and play a light game (XP, quests, achievements, leaderboards, neighbours). Businesses and brands pay subscriptions. The map launches full of clearly-labelled **showcase** content for well-known organisations, each with a "Claim this land" sales flow.

**Quality bar:** it must feel like a polished consumer product (think Linear × Apple Maps × a cosy strategy game): fast (LCP < 2 s on 4G for SSR pages, map interactive < 3 s), beautiful in dark and light themes, mobile-first, accessible (WCAG AA), with no dead ends, no empty states without a next action, and no console errors.

**Non-negotiables**
- TypeScript strict everywhere. No `any` without a comment saying why.
- No secrets in git. Every key comes from env; `.env.example` documents all of them.
- The app must **run with zero third-party keys** (dev mode): mock payments, console email, procedural images, heuristic AI. Each integration switches on when its env var is set.
- Fiat only. No crypto, no investment language.
- Showcase plots use the organisation's **name only**, with original generated imagery. No logos, no slogans, no implied endorsement. Always labelled *Showcase · Unclaimed*, with a disclaimer and a takedown link.
- Small, frequent commits with clear messages (`feat(api): …`, `fix(web): …`).

---

## 1. Architecture

```
            ┌───────────────────────── nginx (TLS) ──────────────────────────┐
browser ──▶ │ flatmeta.io  /        → web  (Next.js, PM2, :3000)             │
            │ flatmeta.io  /api/*   → api  (Fastify, PM2, :4000) [strip /api] │
            │ flatmeta.io  /media/* → MEDIA_DIR (static)                     │
            │ api.flatmeta.io       → api  (docs /docs, MCP /mcp, /v1/*)     │
            └─────────────────────────────────────────────────────────────────┘
api ⇄ Postgres 16 (pg_trgm, unaccent, citext)    api ⇄ Redis 7 (BullMQ, rate limits, leaderboards, pub/sub)
worker (PM2): BullMQ consumers + repeatable jobs (cron)     Stripe ⇄ /v1/stripe/webhook
```

- Staging is the same layout on `STAGING_HOST` (default `staging.flatmeta.io`), web :3100, api :4100, its own database and Redis DB index.
- Browser code calls `/api/v1/...` (same origin → first-party httpOnly cookie, no CORS). In development, Next.js rewrites `/api/:path*` → `API_INTERNAL_URL/:path*`. Server components call `API_INTERNAL_URL` directly and forward the cookie.

### 1.1 Repo layout

**`flatmetaAPI/` (v2 replaces the Laravel app; legacy code stays on `main`):**
```
src/
  server.ts            # Fastify bootstrap (plugins, routes, swagger, websocket, mcp)
  worker.ts            # BullMQ workers + repeatable jobs
  config.ts            # zod-validated env
  db/ schema.ts client.ts migrate.ts
  lib/ grid.ts geo.ts pricing.ts slug.ts markdown.ts mail.ts storage.ts redis.ts errors.ts auth.ts
  game/ xp.ts levels.ts achievements.ts quests.ts leaderboards.ts
  ai/ index.ts text/{anthropic,openai,gemini,heuristic}.ts image/{openai,gemini,external,procedural}.ts moderation.ts designer.ts search.ts suggest.ts
  routes/ auth.ts me.ts world.ts plots.ts regions.ts search.ts social.ts orgs.ts billing.ts ai.ts showcase.ts admin.ts live.ts
  mcp/ server.ts tools.ts stdio.ts
  showcase/ generator.ts placement.ts cli.ts import-external.ts
  data/ cities.ts countries.ts (+ Natural Earth topojson from `world-atlas`)
db/migrations/*.sql     # drizzle-kit generated + hand-written SQL
seed/ showcase/*.json  seed.ts
scripts/ deploy.sh backup.sh
test/ *.test.ts
ecosystem.config.cjs  docker-compose.yml  .env.example  README.md
```

**`flatmeta.io/` (v2 replaces the Ionic app):**
```
app/                    # Next.js App Router
  (map)/page.tsx        # the world map (home)
  p/[slug]/  c/[code]/  r/[slug]/  u/[username]/  o/[slug]/  explore/  leaderboards/
  pricing/  business/  login/  claim/[slug]/  legal/[doc]/
  dashboard/(overview|plots|plots/[id]|progress|orgs|billing|developers)
  admin/(overview|plots|users|moderation|showcase|orders|pricing|claims)
  sitemap.ts robots.ts manifest.ts  opengraph-image routes
components/ map/ game/ plot/ ui/ admin/
lib/ api.ts (typed client) grid.ts format.ts i18n.ts
messages/en.json        # all UI copy
public/ sw.js icons/
docs/ tasks.md README.md .env.example ecosystem.config.cjs
```

---

## 2. Domain rules

### 2.1 Grid (keep v1's)
- Web-Mercator, **cell = 40 px at zoom 15**. `WORLD = 256·2^15`. `gx = floor(x/40)`, `gy = floor(y/40)` where `x = (lng+180)/360·WORLD`, `y = (0.5 − ln((1+sinφ)/(1−sinφ))/(4π))·WORLD`. Inverse gives the NW corner. Port `grid.ts` from v1 with tests.
- A **plot** is an axis-aligned rectangle `[minGx..maxGx] × [minGy..maxGy]`. Cells are unique in `plot_cells (gx, gy) PRIMARY KEY`, so the DB rejects overlaps.
- Size limits: Free/Plus ≤ 10×10, Business/Brand ≤ 20×20, min 1×1. Plot count limits: Free 3, Plus 10, Business 25, Brand 100 (config).
- Default 3-word address: v1's `gridToThreeWords` for the NW cell.

### 2.2 Zone tiers and pricing (config table `pricing_tiers`, editable in admin)
| Tier | Rule | Default price/cell |
| --- | --- | --- |
| S | ≤ 2.5 km from an S-city centre | $25 |
| A | ≤ 8 km from any featured city (S or A) | $9 |
| B | ≤ 25 km from any featured city | $4 |
| C | on land (inside a country polygon) | $2 |
| O | not inside any country polygon | $1 |

- Featured cities: `src/data/cities.ts`, ~150 entries `{slug, name, country, lat, lng, tier: 'S'|'A', population}` (~25 S).
- Plot tier = the **highest** tier of its cells (sampled at corners + centre is enough). Price = `cell_count × tier price`, minus 10% for Plus. Minimum charge $2.
- **Homestead:** one free plot per verified user: ≤ 4 cells if tier ∈ {B, C, O}, or exactly 1 cell in tier A. Never S.
- Upgrades: Spotlight $9 (7 days), Beacon $3 (24 h), AI Design Pack $5 (+25 credits). Landmark claim of a showcase plot: $990 (includes 3 months of Brand).
- Plans (Stripe Prices from env): Plus $5/mo, $48/yr · Business $29/mo, $290/yr · Brand $249/mo, $2,490/yr. AI credits/month: Free 3, Plus 30, Business 100, Brand 500.

### 2.3 Plot lifecycle
`pending_payment` (cells held 30 min) → `active` (paid or free) → optional `hidden` (moderation/admin) → `released` (refund/admin; cells freed).
Showcase plots: `kind='showcase'`, `status='showcase'`, owner null, `showcase.approved` must be true to appear publicly. Claimed showcase → `kind='landmark'`, `status='active'`, owner = verified organisation.

### 2.4 Game rules
- **XP table:** claim plot +100 · first AI design +50 · apply design +20 · publish +30 · share +10 (3/day) · visit a new country page/plot +15 · visit plot +2 (40/day) · like +2 (20/day) · guestbook post +5 (10/day) · wave +3 (10/day) · receive like +3 · receive guestbook +5 · daily check-in +10×min(streak,7) · quests 25–250. No XP for actions on your own plots. Every award is a row in `xp_events` (audit trail, idempotency key `(user_id, kind, ref, day)`).
- **Levels:** XP needed for level n = `round(50 · n^1.8)`, cap 50. Level titles: 1 Wanderer, 5 Settler, 10 Pathfinder, 15 Cartographer, 20 Landholder, 30 Governor, 40 Archon, 50 World-Shaper.
- **Achievements (30):** catalogue in code `{key, name, description, icon, rarity: common|rare|epic|legendary, xp, condition}`. Evaluated after relevant events. Include: First Flag, Homesteader, Landlord (10 cells), Baron (50), Magnate (200), Designer (first AI design), Art Director (10 designs), Publisher, Globetrotter (visit 10 countries), World Tourist (30), Neighbourly (5 waves), Guest of Honour (10 guestbook received), Loved (10 likes received), Beloved (100), Trendsetter (plot in top 10 of a country), Streak 3/7/30, Night Owl (action 00–04 local), Early Settler (first plot in a country), Founder (first 10k accounts), Business Verified, Brand Verified, Spotlight, Social (5 follows), Explorer (visit 50 plots), Collector (like 50 plots), Curator (5 guestbook posts), Shareable (share 5 times), Quest Master (complete 20 quests), Level 10, Level 25.
- **Quests:** onboarding chain (`take-tour`, `find-your-city`, `claim-homestead`, `design-with-ai`, `publish-plot`, `share-plot`, `wave-neighbour`), daily (3 picked deterministically per user per day from a pool of ≥ 12), weekly (3 from a pool of ≥ 8). `user_quests` rows keyed by `(user, quest_key, period_key)`. Rewards: XP + optional AI credits. "Claim reward" button in the quest tracker.
- **Leaderboards:** Redis sorted sets `lb:xp:all`, `lb:xp:week:{isoWeek}`, `lb:xp:country:{cc}`, `lb:cells:country:{cc}`, `lb:likes:plots`. Rebuilt from Postgres by a job if Redis is empty. Endpoint returns top 100 + "you".
- **Neighbours:** active plots whose rectangle is within 5 cells of this plot.
- **Live world:** every notable event creates an `activity` row and is published on Redis channel `live`. The WS `/v1/live` sends `{type:'activity'}` events and `{type:'presence', online}` every 10 s. Online = number of WS connections (Redis key per connection, TTL 30 s).

### 2.5 Showcase system
- Curated source: `flatmetaAPI/seed/showcase/{ISO2}.json` (schema in §6.3), 14 entries each for the first batch: **GB, US, FR, DE, JP, IN, BR, AE, AU, ES**.
- Generator (`src/showcase/generator.ts`, CLI `npm run showcase -- --countries GB,US --images procedural --approve`):
  1. Load entries (curated JSON, or `--source ai` → ask the text model for N notable organisations in a country with the same schema; heuristic fallback refuses).
  2. Place: snap `(lat,lng)` to the grid, centre a `w×h` rectangle on it; if any cell is taken, spiral outward up to 30 cells.
  3. Copy: use the curated copy; if `--rewrite` and a text model is configured, polish it.
  4. Image: via the configured image provider (§5.2); store in media; set `cover_image_url`.
  5. Upsert the plot (`kind='showcase'`, `status='showcase'`, `showcase={brand, website, sector, useCase, highlights, imagePrompt, palette, motif, batchId, approved}`), idempotent by slug.
- Admin can run the same generator as a BullMQ job from `/admin/showcase` (choose countries, count, source, image provider), then **edit**, **regenerate image**, **approve/unapprove** in bulk, **export** JSON.
- **Claim flow** (`/claim/[slug]`): explain → "I work at {brand}" → enter work email → if the email domain matches the registrable domain of `showcase.website`, send a 6-digit code; else create a `claim_requests` row in `manual_review` → on verify, create or attach a verified organisation → Stripe Checkout (Landmark) → webhook transfers the plot to the organisation (`kind='landmark'`), keeps the content, unlocks editing, grants Brand for 3 months, awards achievements, posts an activity.
- **Takedown:** "Request removal" link on every showcase plot → form → `takedown_requests` → admin queue; admin can unpublish instantly.
- Every showcase page shows: "**Showcase · Unclaimed.** This sample plot shows how {brand} could use FlatMeta. It is not created, endorsed or affiliated with {brand}. Imagery is original and AI-generated. [Is this your organisation? Claim it] · [Request removal]".

---

## 3. Data model (Postgres, Drizzle schema + SQL migrations)

Extensions: `citext`, `pg_trgm`, `unaccent`. All ids `uuid` (`gen_random_uuid()`) unless noted. Timestamps `timestamptz`. Money in integer cents.

| Table | Key columns |
| --- | --- |
| `users` | email citext unique, username citext unique, display_name, avatar_url, bio, role (`user`/`moderator`/`admin`), plan (`free`/`plus`), xp int, level int, streak int, last_checkin date, home_country char(2), homestead_used bool, ai_credits_used int, ai_credits_bonus int, ai_period char(7), stripe_customer_id, banned_at, created_at |
| `login_codes` | email, code_hash, purpose (`login`/`claim`), expires_at, attempts, consumed_at |
| `sessions` | user_id, token_hash unique, expires_at, user_agent, ip |
| `api_keys` | user_id, org_id null, name, prefix, key_hash unique, scopes text[], last_used_at, revoked_at |
| `organizations` | slug unique, name, kind, website, domain, description, logo_url, plan (`free`/`business`/`brand`/`enterprise`), verified_at, stripe_customer_id |
| `org_members` | (org_id, user_id) pk, role (`owner`/`admin`/`editor`) |
| `org_invites` | org_id, email, role, token_hash, expires_at, accepted_at |
| `plots` | slug unique, owner_user_id, owner_org_id, kind (`standard`/`homestead`/`showcase`/`landmark`), status, min_gx, min_gy, max_gx, max_gy, cell_count, center_lat, center_lng, country_code, region_slug, tier, title, tagline, description_md, cover_image_url, thumb_url, gallery jsonb, links jsonb, cta jsonb, category, tags text[], theme jsonb, frame, business jsonb, showcase jsonb, moderation_status, likes_count, visits_count, guestbook_count, spotlight_until, beacon_until, broken_links jsonb, links_checked_at, published_at, last_edited_at, search tsvector (generated) |
| `plot_cells` | (gx, gy) pk, plot_id fk on delete cascade |
| `plot_likes` | (plot_id, user_id) pk |
| `plot_visit_days` | (plot_id, day) pk, visits |
| `user_country_visits` | (user_id, country_code) pk |
| `guestbook_entries` | plot_id, user_id, body (≤ 280), moderation_status, deleted_at |
| `follows` | (follower_id, followee_id) pk |
| `waves` | from_user_id, plot_id, day; unique (from_user_id, plot_id, day) |
| `xp_events` | user_id, kind, amount, ref, day; unique (user_id, kind, ref, day) |
| `user_achievements` | (user_id, key) pk, unlocked_at |
| `user_quests` | user_id, quest_key, period_key, progress, target, completed_at, claimed_at; unique (user_id, quest_key, period_key) |
| `activity` | kind, actor_user_id, plot_id, country_code, lat, lng, payload jsonb |
| `notifications` | user_id, kind, payload jsonb, read_at |
| `orders` | user_id, org_id, kind (`land`/`upgrade`/`landmark`/`credits`), status (`pending`/`paid`/`failed`/`expired`/`refunded`), amount_cents, currency, items jsonb, plot_id, stripe_session_id unique, stripe_payment_intent, paid_at |
| `subscriptions` | user_id, org_id, plan, interval, status, stripe_subscription_id unique, current_period_end, cancel_at_period_end |
| `stripe_events` | id pk (Stripe event id), type, processed_at |
| `pricing_tiers` | tier pk, label, price_cents, description |
| `countries` | code pk, name, lat, lng, continent, plot_count, cell_count |
| `regions` | slug pk, name, country_code, lat, lng, tier |
| `media` | owner_user_id, path, url, thumb_url, mime, width, height, bytes, source (`upload`/`ai`/`procedural`/`external`), prompt |
| `ai_jobs` | user_id, kind, status, input jsonb, output jsonb, provider, error, finished_at |
| `moderation_flags` | target_type, target_id, source (`ai`/`report`/`system`), reason, score, status (`open`/`actioned`/`dismissed`), reporter_id, resolved_by, resolved_at |
| `claim_requests` | plot_id, user_id, org_id, email, status, created_at |
| `takedown_requests` | plot_id, name, email, organisation, message, status |
| `showcase_batches` | countries text[], status, params jsonb, stats jsonb, created_by |
| `audit_log` | actor_id, action, target_type, target_id, meta jsonb |

Indexes: `plots (min_gx, max_gx, min_gy, max_gy)` for bbox; `plots (country_code, status)`; `plots USING gin(search)`; `plots USING gin(title gin_trgm_ops)`; `activity (created_at desc)`; `xp_events (created_at)`.

Seeds (`npm run db:seed`): pricing tiers, countries (from `world-atlas` + `i18n-iso-countries`, centroids computed), regions (featured cities), an admin user from `SEED_ADMIN_EMAIL`, the FlatMeta HQ plot, and ~12 demo community plots so the world feels lived-in in development. Showcase plots come from the generator.

---

## 4. REST API (`/v1`, OpenAPI 3.1 at `/openapi.json`, Swagger UI at `/docs`)

Conventions: JSON; errors `{error: {code, message, details?}}` with proper status codes; cursor pagination `?cursor=&limit=`; Zod schemas for every request/response (they generate the OpenAPI). Auth: `fm_session` cookie **or** `Authorization: Bearer fm_live_…` API key. Rate limits (Redis): global 300/min/IP, auth 10/min, AI 20/hour/user, writes 60/min/user.

| Area | Endpoints |
| --- | --- |
| Health | `GET /healthz` |
| Auth | `POST /v1/auth/request-code {email}` · `POST /v1/auth/verify-code {email, code}` → sets cookie, returns user · `POST /v1/auth/logout` · `GET /v1/auth/google` + `/callback` (only if `GOOGLE_CLIENT_ID`) |
| Me | `GET /v1/me` · `PATCH /v1/me` · `GET /v1/me/plots` · `GET /v1/me/progress` (xp, level, next level, quests, achievements, streak) · `POST /v1/me/checkin` · `POST /v1/me/quests/:id/claim` · `GET /v1/me/notifications` · `POST /v1/me/notifications/read` · `GET/POST/DELETE /v1/me/api-keys` · `POST /v1/me/share {plotId}` |
| World | `GET /v1/world/plots?bbox=w,s,e,n&zoom=` (≤ 1,000 lightweight plots, owner and showcase marked) · `GET /v1/world/stats` · `GET /v1/world/activity` · `WS /v1/live` |
| Plots | `GET /v1/plots?q=&country=&region=&category=&kind=&sort=trending|new|loved` · `GET /v1/plots/:idOrSlug` · `GET /v1/plots/:id/neighbours` · `POST /v1/plots/quote {minGx,minGy,maxGx,maxGy}` → tier, price, homestead eligibility, conflicts · `POST /v1/plots/claim {rect, title?, orgId?}` → `{plot}` (free) or `{checkoutUrl}` · `PATCH /v1/plots/:id` · `POST /v1/plots/:id/publish` · `POST /v1/plots/:id/media` (multipart, ≤ 8 MB, jpg/png/webp/gif) · `POST|DELETE /v1/plots/:id/like` · `POST /v1/plots/:id/visit` · `POST /v1/plots/:id/wave` · `GET|POST /v1/plots/:id/guestbook` · `DELETE /v1/guestbook/:id` · `POST /v1/plots/:id/report` · `POST /v1/plots/:id/upgrade {kind}` → checkout |
| Regions | `GET /v1/countries` · `GET /v1/countries/:code` · `GET /v1/regions` · `GET /v1/regions/:slug` |
| Social | `GET /v1/users/:username` · `POST|DELETE /v1/users/:username/follow` · `GET /v1/leaderboards/:board?country=` (`xp`, `xp-week`, `xp-country`, `cells-country`, `plots-loved`) |
| Orgs | `POST /v1/orgs` · `GET /v1/orgs/:slug` · `PATCH /v1/orgs/:id` · `GET /v1/orgs/:id/members` · `POST /v1/orgs/:id/invites` · `POST /v1/orgs/invites/accept {token}` · `DELETE /v1/orgs/:id/members/:userId` |
| Search | `GET /v1/search?q=&ai=1` → `{intent?, plots, users, orgs, countries, regions, places}` |
| AI | `POST /v1/ai/design {plotId, brief, style?}` → job · `GET /v1/ai/jobs/:id` · `POST /v1/ai/suggest-plots {goal, lat?, lng?, country?}` · `POST /v1/ai/ideas {plotId}` |
| Billing | `GET /v1/billing/plans` · `POST /v1/billing/checkout {plan, interval, orgId?}` · `POST /v1/billing/portal {orgId?}` · `POST /v1/stripe/webhook` · `GET /v1/billing/mock/:sessionId/complete` (dev mock only) |
| Showcase | `POST /v1/showcase/:slug/claim {email, orgName}` · `POST /v1/showcase/claim/verify {requestId, code}` · `POST /v1/showcase/:slug/takedown` |
| Admin (role admin/moderator) | `GET /v1/admin/stats` · `GET/PATCH /v1/admin/users` · `GET/PATCH /v1/admin/plots` · `GET /v1/admin/moderation` · `POST /v1/admin/moderation/:id/resolve` · `GET /v1/admin/orders` · `POST /v1/admin/orders/:id/refund` · `GET/PUT /v1/admin/pricing` · `GET /v1/admin/showcase` · `POST /v1/admin/showcase/generate` · `PATCH /v1/admin/showcase/:id` · `POST /v1/admin/showcase/:id/regenerate-image` · `POST /v1/admin/showcase/approve {ids, approved}` · `GET /v1/admin/showcase/export` · `GET/POST /v1/admin/claims` · `GET/POST /v1/admin/takedowns` · `GET /v1/admin/audit` |

**Stripe:** Checkout Sessions (`mode=payment` for land/upgrades/landmark/credits, `mode=subscription` for plans), `client_reference_id = order id`, metadata `{orderId, kind}`. Webhook (raw body, signature verified with `STRIPE_WEBHOOK_SECRET`, idempotent via `stripe_events`) handles `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created|updated|deleted`, `invoice.payment_failed`, `charge.refunded`. **Mock mode** (`STRIPE_SECRET_KEY` unset and `PAYMENTS_MOCK=true`, forbidden in production): checkout URL points to a local mock page that calls the same fulfilment code.

---

## 5. AI layer (`src/ai/`)

Provider-agnostic; selected by env; everything degrades gracefully.

### 5.1 Text (`AI_TEXT_PROVIDER = anthropic | openai | gemini | heuristic`)
- Anthropic: official `@anthropic-ai/sdk`, model `ANTHROPIC_MODEL` (default `claude-opus-5-5`), structured JSON output via `output_config.format` with Zod schemas; handle `stop_reason: "refusal"`; enable server-side fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). OpenAI and Gemini via their official SDKs (`openai`, `@google/genai`), models from env.
- `heuristic`: deterministic templates (no network), good enough for demos and tests.
- Uses: **designer** (brief → `{title, tagline, descriptionMd, cta, tags, theme:{primary,accent}, imagePrompt}` × up to 3 variations), **search intent** (query → `{keywords, category?, country?, near?: {place}, kind?, sort?}`), **suggest plots** (goal → criteria; candidates are scored in code, the model writes the reasons), **ideas** for a plot, **showcase list** for a country.

### 5.2 Images (`AI_IMAGE_PROVIDER = openai | gemini | external | procedural`)
- `openai`: Images API (`OPENAI_IMAGE_MODEL`, default `gpt-image-1`), 1536×1024.
- `gemini`: Imagen via `@google/genai` (`GEMINI_IMAGE_MODEL`).
- `external` (e.g. **Google Flow**): writes `{id, prompt, aspect}` lines to `EXTERNAL_IMAGE_DIR/outbox/prompts.jsonl`; a human or pipeline drops `{id}.png|jpg|webp` into `EXTERNAL_IMAGE_DIR/inbox/`; `npm run images:import` (and an hourly job) attaches them. Until then the plot uses a procedural placeholder.
- `procedural` (default): deterministic SVG art from `{seed, palette, motif}`: layered gradient sky, sun/moon, isometric terrain tiles, the motif glyph, particles. Rendered to PNG with resvg, then WebP + thumbnail with sharp. No text, no logos.
- Every prompt gets the suffix *"original illustration, no logos, no text, no trademarks, no real people"*.

### 5.3 Moderation (`AI_MODERATION_PROVIDER = openai | anthropic | heuristic`)
- Runs on plot publish/update (title, tagline, description, links), guestbook posts, uploaded images (OpenAI omni-moderation supports images), and display names.
- Result `{flagged, categories, score}` → if score ≥ 0.9: content hidden, `moderation_flags` open; 0.5–0.9: published but queued for review; otherwise OK. `heuristic`: word list + URL blocklist + caps/spam checks.

### 5.4 Credits
AI design calls consume 1 credit (3 variations). Credits reset monthly (`ai_period`), plus bonus credits from packs and quests. Admins are unlimited.

---

## 6. MCP server, content and data formats

### 6.1 MCP (`@modelcontextprotocol/sdk`)
- Streamable HTTP at `POST/GET /mcp` (auth: API key bearer; read-only tools work without a key) and stdio entry `npm run mcp:stdio` (uses `FLATMETA_API_KEY`).
- Tools: `search_plots {query, country?, near?, limit?}` · `get_plot {idOrSlug}` · `list_countries` · `get_country {code}` · `get_region {slug}` · `check_availability {lat, lng, width, height}` (quote) · `suggest_plots {goal, country?}` · `list_my_plots` · `update_plot {id, fields}` · `claim_plot {lat, lng, width, height, title}` (returns a checkout link for paid plots) · `get_leaderboard {board, country?}`.
- Resources: `flatmeta://plot/{slug}` (markdown), `flatmeta://country/{code}`.
- Document in README and `/dashboard/developers` (copy-paste config for Claude Desktop/Code).

### 6.2 SEO and sharing
- SSR pages with `generateMetadata` (title, description, canonical, OG, Twitter), JSON-LD (`Place`; `LocalBusiness` for business plots; `Organization` for org pages; `BreadcrumbList`), `sitemap.xml` (index + plots/countries/regions chunks), `robots.txt`.
- OG images with `next/og`: plot (cover + title + country flag + "on FlatMeta"), country, region, achievement, user. 1200×630.
- Share buttons: native Web Share API, copy link, X, Facebook, LinkedIn, WhatsApp. Each share POSTs `/v1/me/share` (XP + quest).

### 6.3 Showcase JSON schema (curated seed)
```json
{ "country": {"iso2": "GB", "name": "United Kingdom"},
  "entries": [{ "brand": "…", "slug": "…", "kind": "company|organisation", "sector": "…", "city": "…",
    "lat": 0, "lng": 0, "website": "https://…", "title": "…", "tagline": "…", "description": "…",
    "useCase": "…", "cta": {"label": "…", "url": "…"}, "highlights": ["…"], "imagePrompt": "…",
    "palette": ["#…","#…","#…"], "motif": "waves|circuit|leaf|…", "size": {"w": 3, "h": 2}, "tags": ["…"] }] }
```

---

## 7. Web app (Next.js 16, React 19, Tailwind 4, MapLibre GL)

### 7.1 Design system
Implement the brief's "night-flight cartography": tokens in CSS variables (`--bg #0B1020`, `--panel rgba(17,24,48,.72)`, `--ink`, `--muted`, `--teal #2DE2C4`, `--gold #FFC94D`, `--coral #FF6B6B`, `--violet #8B7CFF`), light theme overrides, Space Grotesk + Inter via `next/font`, glass panels, spring micro-animations (CSS + `motion` only where needed), `prefers-reduced-motion`, focus rings, 44 px touch targets. Components: Button, IconButton, Chip, Card, Sheet (mobile bottom sheet / desktop side panel), Dialog, Tabs, Toast, Avatar, LevelRing, XPBar, Badge, Skeleton, EmptyState, CommandPalette (⌘K).

### 7.2 Map (home `/`)
- MapLibre with **globe projection** at low zoom and a custom dark/light style built on OpenMapTiles-schema vector tiles (`NEXT_PUBLIC_MAP_TILES_URL`, default OpenFreeMap `https://tiles.openfreemap.org/planet`) plus `NEXT_PUBLIC_MAP_STYLE_URL` override; glyphs from `NEXT_PUBLIC_MAP_GLYPHS_URL`.
- Layers: plots as GeoJSON fill (theme colour) + outline (showcase = dashed gold, mine = violet, spotlight = animated glow); centroid circles with bloom at zoom < 9; labels at zoom ≥ 11; **artwork**: for zoom ≥ 13, up to 120 visible plots get MapLibre `image` sources (thumb URLs) across their exact rectangles; beacons pulse at every zoom.
- Data: `GET /v1/world/plots?bbox` on `moveend` (debounced 250 ms, cached by tile key).
- Interactions: hover → tooltip; click → plot sheet (cover, title, owner, likes, visit, wave, open page, share). Search box (⌘K) with AI toggle. "Locate me" (IP country by default, GPS on request).
- **Claim mode** (primary CTA "Claim land"): fly to zoom ≥ 15 if needed, show the cell grid (a GeoJSON line grid for the viewport), drag (mouse/touch) to draw a rectangle (snaps to cells, shows size, tier colour, conflicts in red), live quote panel (tier, price, homestead badge "FREE"), "Claim" → sign-in if needed (email code dialog, without leaving the map) → free: celebration + AI designer; paid: Stripe Checkout → return to `/dashboard/plots/[id]?welcome=1`.
- HUD: level ring + XP bar (animated gain toasts "+100 XP"), quest tracker (collapsible, right), live ticker (bottom-left on desktop, collapsed on mobile), "N explorers online", theme toggle.
- First-visit **guided tour** (3–5 coach marks; stored in localStorage; quest `take-tour`).

### 7.3 Pages
- `/p/[slug]`: plot mini-page (hero cover, title, tagline, CTA, description, highlights/gallery, links, business info with hours and "Open now", mini-map, neighbours carousel, guestbook, like/share, owner card, showcase banner + claim CTA, report). Visit is recorded client-side.
- `/c/[code]`, `/r/[slug]`: hero with map snapshot, stats (plots, cells, explorers), trending plots, **showcase gallery**, local leaderboard, "Claim land in {name}" CTA, cities list.
- `/explore`: tabs Trending, New, Most loved, Showcase, Businesses; filters by country and category.
- `/leaderboards`: boards with tabs; your rank sticky row.
- `/u/[username]`, `/o/[slug]`: profiles (level, badges, plots).
- `/pricing`, `/business` (landing for local businesses and brands with showcase examples), `/login`, `/legal/terms|privacy|refunds` (port v1 placeholders).
- `/claim/[slug]`: showcase claim wizard.
- `/dashboard`: overview (XP, quests, recent activity), `plots` (cards with status, edit, upgrade), `plots/[id]` (**editor** with live preview: content, links, CTA, business info, theme, frame (cosmetics unlocked by level), media upload, and the **AI Designer** panel: brief → 3 variations with images → apply), `progress` (achievements grid, quest log), `orgs` (create, members, invites, verification), `billing` (plan, upgrade, portal, orders), `developers` (API keys, MCP setup, OpenAPI link).
- `/admin`: overview (users, plots, revenue, AI usage, moderation backlog), plots (search, hide/release, feature), users (role, ban), moderation queue (approve/remove with context), **showcase manager** (generate, grid of cards, inline edit, regenerate image, bulk approve, export), orders (refund), pricing tiers, claim requests, takedowns, audit log.

### 7.4 PWA, i18n, a11y
- `manifest.ts`, icons, `public/sw.js` (cache-first for static assets and media thumbs, network-first for pages, offline fallback page). Install prompt in the avatar menu.
- i18n: every UI string in `messages/en.json`, `t()` helper and `<T>` component, `Intl` for numbers, currency and dates; locale list in config (only `en` shipped).
- Keyboard: map focusable, arrows pan, `+`/`-` zoom, `c` toggles claim mode, `/` focuses search, `Esc` closes sheets.

---

## 8. Ops

- `.env.example` in both repos (every variable documented: app URLs, `STAGING_HOST`, DB, Redis, cookie domain, SMTP, Stripe keys and price IDs, AI keys and models, image provider, geocoder, map tiles, storage driver and S3 vars, admin seed email, rate limits).
- `docker-compose.yml` (Postgres 16 + Redis 7) for development.
- `ecosystem.config.cjs` (PM2): `flatmeta-api`, `flatmeta-worker` (API repo); `flatmeta-web` (web repo); names and ports suffixed for staging via `APP_ENV=staging`.
- Worker repeatable jobs: expire pending plots (every 5 min), refresh country stats (hourly), rebuild leaderboards if missing (hourly), link health check (weekly), dormant plots (daily), import external images (hourly), clean sessions/codes (daily).
- `scripts/backup.sh` (pg_dump, 14-day retention) and a system crontab line in the README.
- GitHub Actions in each repo:
  - `ci.yml`: on push/PR → install, lint, typecheck, test (API with Postgres + Redis services), build.
  - `deploy.yml`: on push to `v2` (and manual dispatch with `environment: production|staging`) → SSH with `DEPLOY_KEY` to `DEPLOY_USER@DEPLOY_HOST`, run `scripts/deploy.sh` in `DEPLOY_PATH/{api|web}` (or `DEPLOY_PATH/staging/...`): fetch, checkout SHA, `npm ci`, build, migrate (API), `pm2 reload --update-env`, health check, roll back to the previous SHA on failure. The job **skips cleanly when the secrets are not set**.
- README: full Ubuntu 24.04 setup (users, firewall, Node 22, Postgres 16, Redis, nginx, certbot, PM2 startup, env files, first deploy, staging, backups, logs, troubleshooting) + local dev quick start + architecture + API/MCP docs.

---

## 9. Tests (must pass in CI)

- API (Vitest, real Postgres `DATABASE_URL_TEST` + Redis): grid maths; tier/price/homestead rules; quote + claim + overlap conflict (concurrent claims → one wins); auth code flow (expiry, attempts); plot update permissions (owner/org editor/other); XP idempotency and level-ups; quest progress and claim; achievements; Stripe webhook fulfilment (signed test payload) and idempotency; mock checkout; showcase placement collision avoidance and idempotent upsert; moderation heuristic; MCP `tools/list` and `search_plots`; OpenAPI document builds.
- Web (Vitest): grid utils, price formatting, i18n helper; Playwright smoke (`E2E_BASE_URL`): home renders the map canvas, plot page renders title and JSON-LD, pricing renders plans.

---

## 10. Acceptance checklist (Definition of Done)

1. `docker compose up -d && npm run setup` (API) then `npm run dev` in both repos gives a working app at `http://localhost:3000` with seeded world, showcase plots for 10 countries, and an admin user.
2. A guest explores the globe → zooms into London → sees showcase artwork tiles → opens a plot page → it has SEO metadata, JSON-LD and an OG image.
3. The guest claims a free homestead (email code via console log) → AI Designer → applies a design → publishes → +XP, achievement toast, quest progress, share card, activity appears live in another browser.
4. A paid claim goes through Stripe test mode (or mock) and the plot activates via webhook. Upgrades and plans work; the Customer Portal opens.
5. An organisation is created, a member invited, a business plot shows "Open now" and `LocalBusiness` JSON-LD.
6. Showcase claim: matching-domain email → code → Landmark checkout → plot transfers to the organisation.
7. Admin: generate showcase for a new country, edit, regenerate image, approve; moderate a flagged guestbook entry; refund an order.
8. `/docs` shows the OpenAPI UI; an API key can call `/v1/me/plots`; Claude Desktop connects to `/mcp` and runs `search_plots`.
9. Lighthouse (mobile) on `/p/[slug]`: Performance ≥ 85, Accessibility ≥ 95, SEO 100. PWA installable.
10. CI green in both repos; `deploy.yml` present and skipping without secrets; README server guide complete; `tasks.md` and `docs/progress.md` up to date.

---

## 11. Suggested order of work

1. API scaffold, config, DB schema + migrations, seeds (countries, cities, tiers), grid/pricing libs + tests.
2. Auth (codes, sessions, API keys), me, plots (quote/claim/update/media), world bbox, regions, search.
3. Game (XP, levels, quests, achievements, leaderboards), social (likes, visits, waves, guestbook, follows), activity + WS live.
4. Stripe (checkout, webhook, mock, portal), orgs.
5. AI layer (text/image/moderation providers, designer, search intent, suggestions) + procedural art.
6. Showcase generator + run for the first 10 countries; claim and takedown flows.
7. Admin API; OpenAPI polish; MCP server.
8. Web: design system, layout, map + claim mode, plot sheet, HUD, tour.
9. Web: SEO pages + OG images, explore, leaderboards, profiles, pricing/business.
10. Web: dashboard + editor + AI designer, billing, developers; admin panel.
11. PWA, i18n pass, a11y pass, performance pass.
12. Tests, CI, deploy workflow, README, final QA against §10.

---

## 12. Kickoff alignment (supersedes earlier sections where they differ)

`docs/00-kickoff-masterprompt.md` is the owner's brief. It keeps several v1 features that §§0–11 originally left out. Build them in Phase 1 with the rules below.

### 12.1 Monorepo and config
- npm workspaces: `apps/web` (Next.js), `apps/api` (Fastify, worker, MCP, CLI), `packages/shared` (grid maths, shared types, pricing constants). One root `.env.example` documents every variable; each app also loads `apps/<app>/.env` if present.
- `flatmetaAPI` `v2` branch: only a README that points to the monorepo. v1 code stays on its other branches.
- Config values: `APP_NAME=FlatMeta`, `APP_URL` (public origin, **every absolute URL and redirect is built from it; the API refuses to start in production if it contains `localhost` or `127.0.0.1`**), `PRODUCTION_DOMAIN=flatmeta.io`, `STAGING_DOMAIN=flatmeta.mewebe.net` (placeholder until confirmed). `STAGING_HOST` in §1 is renamed `STAGING_DOMAIN`.
- Ports are env values, defaults chosen to avoid 3000, 3010 and 3100: `WEB_PORT=3200`, `PORT=3201` (API), `MCP_PORT=3202` (optional separate MCP listener; `/mcp` is always on the API port too), `WORKER_HEALTH_PORT=3203`.
- Auth keeps guest-first identity and the email 6-digit code, and adds an **optional password** (scrypt hash, set from the dashboard; password sign-in with a rate limit). Sessions and API keys as before.

### 12.2 Three zoom levels, smoother
Continuous zoom stays, with three named presets shown as a segmented control (World, City, Land) that fly smoothly (1.2 s ease) and are also the semantic levels: **World** (z < 6.5: globe, glowing plots, country labels, no avatars), **City** (6.5 ≤ z < 13.5: plots as tiles, **avatars and presence**, city labels), **Land** (z ≥ 13.5: the claim grid, plot artwork, edit/select). The level is derived from zoom, so pinch/scroll never "snaps back".

### 12.3 Presence, avatars, chat, connections
- **Avatar**: `users.avatar` jsonb `{face, color, accessory}` (a handful of emoji faces and colours; set in onboarding or the profile). Rendered as MapLibre markers at the City and Land levels.
- **Movement**: tap/click the map to walk there at a fixed speed (client animates, ~2 position updates/s over the WebSocket); arrow keys nudge. A guest's avatar is anonymous ("Guest 4821").
- **Presence** (Redis): `GEOADD presence`, a hash per connection with a 30 s TTL, `ZRANGE` by radius for the viewport. `{type:'presence'}` messages carry only people within the viewport plus a global online count. Cap 200 avatars per viewport.
- **Nearby chat**: speech bubbles above avatars plus a chat panel for everyone within ~2 km at City/Land level. Messages are moderated (heuristic or AI), rate-limited (5/10 s), kept 24 h in `chat_messages` (`room = 'nearby:<geocell>'`).
- **Private chat** between **connections** only. `connections(requester_id, addressee_id, status: pending|accepted|blocked, created_at)`; `chat_messages(room = 'dm:<lowId>:<highId>')`, persistent. Block and report from the chat panel; reports go to the moderation queue.
- Notifications for connection requests and DMs (in-app + optional email digest from the worker).

### 12.4 Marketplace (platform fee 10%)
- `listings(id, plot_id, seller_user_id | seller_org_id, price_cents, status: active|sold|cancelled|void, version, created_at, sold_at)`. A plot can have one active listing. Homesteads (free land) and showcase/landmark plots under contract cannot be listed. The listing price is capped at 50× the plot's tier price during the first 30 days after a claim; plots must be held 7 days (config, shown in the UI).
- **Buy**: `POST /v1/listings/:id/buy` creates an order and a Stripe Checkout (one-time) tied to the listing `version`. The webhook (idempotent) transfers the plot **only if** the listing is still `active` and unchanged; otherwise the buyer is refunded automatically and told why.
- **Ledger**: `ledger_entries(id, order_id, account, kind: sale|platform_fee|seller_credit|payout|refund, amount_cents, currency, created_at)` where `account` is `platform` or `user:<id>`/`org:<id>`; every sale writes `seller_credit = price − fee` and `platform_fee = fee` (`MARKETPLACE_FEE_BPS=1000`). Entries are append-only and sum to zero per order.
- **Payouts**: seller connects Stripe Connect Express (`/v1/payouts/connect`); when enabled the worker transfers seller credit; otherwise credit stays in a visible balance and admin can mark manual payouts. A **payment provider interface** (`PaymentProvider`: `createCheckout`, `refund`, `transfer`, `verifyWebhook`) has Stripe and Mock implementations; a PayPal adapter is an optional extra and is documented but not required.
- UI: "List for sale" on a plot, `/marketplace` (filters: country, price, tier, newest), listing cards, buy flow, "My sales/purchases", seller balance in Billing. Marketplace activity appears in the live feed. Phase 2 adds offers, rentals and plot ads.

### 12.5 Clans
`clans(id, slug, name, tag (2-4 chars), description, emblem jsonb, leader_user_id, created_at)`, `clan_members(clan_id, user_id, role: leader|officer|member, joined_at)`, `clan_requests` (join requests and invites). One clan per user. Pages `/clan/[slug]`, a clan leaderboard (sum of members' weekly XP and cells), clan chat room (`clan:<id>`, members only), clan achievements (Founder, Ten Strong), activity events, XP for creating or joining. Phase 2 adds alliances and territory mini-games.

### 12.6 Land content
Plot owners on Plus and above can add **custom HTML**, rendered in `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc=…>` (no same-origin, no top navigation, no forms), screened by moderation (the AI or heuristic checker rejects obfuscated scripts, external form posts and known abuse) and size-limited to 50 KB. Embeds (YouTube, Vimeo, Spotify, Google Maps) via an allow-list of hostnames. Plots keep a **/u/<slug>** vanity link that redirects to `/p/<slug>`.

### 12.7 Deployment (HestiaCP, no root, Node 22 via nvm)
- The app runs as an ordinary Linux user with its own PM2 (`ecosystem.config.cjs`: `flatmeta-web`, `flatmeta-api`, `flatmeta-worker`). No nginx, no root and no Docker needed on the server.
- HestiaCP's generic **NodeJS** proxy template serves the domain and includes a per-domain `nodejs-app.conf`; ship a sample in `deploy/hestia/nodejs-app.conf` (proxy locations only, no http-level directives): `/` → web, `/api/` → API (strip prefix), `/api/v1/live` → API WebSocket with `Upgrade`/`Connection` passed through (Hestia hides `Upgrade` by default), `/media/` → static.
- `scripts/deploy.sh`: loads nvm and `.env` itself, exports `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, defaults to branch `v2`, builds, migrates, reloads PM2 and **health-checks on `$PORT`**. The server's SSH key has a forced command, so the script takes no arguments from the caller and is the only thing the key can run.
- `docs/deploy-hestia.md`: full guide (user, nvm, Postgres, Redis, Hestia domain and template, `.env`, first deploy, staging, cron/backups, troubleshooting). The README links to it.
- **CI/CD: one file, `.github/workflows/ci.yml`.** Jobs: `test` (Postgres 16 + Redis 7 services; lint, typecheck, unit and API tests, build, Playwright smoke) then `deploy` (`needs: test`, `if: github.ref == 'refs/heads/v2' && github.event_name == 'push'`). Do **not** use `workflow_run` or `workflow_dispatch` (GitHub only honours them from `main`). The deploy job reads `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, `DEPLOY_PATH` and optional `DEPLOY_PORT` from secrets into env and prints a `::notice::` and exits cleanly if any required one is unset.

### 12.8 Acceptance additions
11. Two browsers at City level see each other's avatars move; nearby chat shows bubbles; a connection request leads to a private chat.
12. A listed plot is bought through (mock) checkout; ownership moves, the ledger balances (price = seller credit + fee), and a changed listing triggers a refund instead.
13. A clan can be created, joined by a second user, and appears on the clan leaderboard.
14. `APP_URL=https://x.example` makes every link, redirect, sitemap entry, share card and email use that origin; production start refuses a localhost `APP_URL`.
15. A push to `v2` runs `ci.yml`, and its last job deploys when the secrets exist and prints a skip notice when they don't.
