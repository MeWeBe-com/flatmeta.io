# Progress log

Each step appends a short summary: what was done, decisions made, what's next.

## Step 1 — Audit (2026-10-28)

**Done:** read both repos (`flatmeta.io` Ionic/Angular app, `flatmetaAPI` Laravel API), the project checklist HTML (21 phases, built from the client brief), deploy and launch docs, migrations, routes, services. Wrote `docs/00-audit.md`.

**Decisions:**
- `v2` is a clean rebuild on a new stack; legacy code remains on `main` for reference.
- Keep: the z15/40 px land grid and its maths, free starter land, one image across a plot, slugs/3-word addresses/mini-pages, guest-first email-code login, leaderboards, moderation pieces, 10% resale rule (for Phase 2).
- Drop: walking avatars and proximity chat, 3 hard zoom levels, PayPal, Ionic/Capacitor shells, PHP WebSocket server, Blade CMS.
- Product docs live in `flatmeta.io/docs/` (the API repo links to them).

**Next:** research and write `docs/01-brief.md`.

## Step 2 — Research and brief (2026-10-28)

**Done:** market research on comparables (Million Dollar Homepage, Decentraland, The Sandbox, Earth 2, Upland, r/place, wplace, Pokémon GO, Swarm, Local Guides, GeoGuessr, Waze/Snap ads, Roblox/Fortnite brand worlds, Linktree, the 2026 AI-search context) in `docs/research-notes.md`. Wrote `docs/01-brief.md`.

**Decisions:**
- Positioning: "the world map you can own a piece of": a living, social, AI-readable map. No crypto, no investment language.
- Money: one-time land purchases priced by zone tier ($1–25/cell), a free Homestead per verified user, one-time boosts, and subscriptions (Plus $5, Business $29, Brand $249, Enterprise). Business subscriptions are the main recurring-revenue bet. Phase 2 adds resale/rental fees, sponsored quests and native plot ads. No display ads.
- Game: XP/levels, 30 achievements, daily/weekly/onboarding quests, leaderboards (global, weekly, by country), neighbours, guestbooks, waves, likes. Never pay-to-win.
- Stack: Next.js 16 + Tailwind 4 + MapLibre (globe) for web; Fastify 5 + Zod/OpenAPI + Drizzle + Postgres 16 (pg_trgm; PostGIS not needed in P1) + Redis/BullMQ for the API; Stripe; provider-agnostic AI (Claude default); MCP SDK; nginx + PM2 on Ubuntu.
- Added "plot health" (link checks, dormant plots), from the Million Dollar Homepage's link-rot lesson.

**Next:** Phase 1 and Phase 2 masterprompts.

## Step 3 — Masterprompts (2026-10-28)

**Done:** `docs/02-masterprompt-phase1.md` (the Phase 1 build spec: architecture, domain rules, data model, REST API, AI layer, MCP, web app, ops, tests, acceptance checklist, order of work) and `docs/03-masterprompt-phase2.md` (10 tracks over ~2 weeks: seasons/events/guilds, marketplace/rentals/plot ads on Stripe Connect, 3D views, brand campaigns + analytics, creator economy, public API platform + webhooks, outreach CRM, AI growth agent, AI support agent, observability/performance/scaling). Created `tasks.md`.

**Decisions:**
- First showcase batch: GB, US, FR, DE, JP, IN, BR, AE, AU, ES (14 organisations each), curated JSON in `flatmetaAPI/seed/showcase/` written by data agents, with coordinates from memory that admins can correct.
- The browser calls the API at `/api/*` on the same origin; `api.flatmeta.io` serves docs and MCP.
- Showcase claims require a work email at the brand's domain, or manual review.
- The default text model is `claude-opus-5-5` (configurable). The app runs fully without keys (heuristic AI, procedural art, mock payments).

**Next:** build Phase 1 (API first, then web).

## Step 4 — Phase 1 build (2026-10-28)

**Done (API, `flatmetaAPI` v2):** the Laravel code is replaced by Fastify 5 + Zod + Drizzle on Postgres 16 and Redis 7.
- Data and reference: 33-table schema with SQL migrations; seeds for price tiers, countries, 162 featured cities, the admin user, FlatMeta HQ, and demo players outside production.
- Accounts and land: email-code and optional Google auth, sessions and API keys; plot quote, claim (no double-selling, enforced by a per-cell primary key) and editing.
- Game and social: XP, levels, 32 achievements, quests and leaderboards; likes, waves, guestbooks, follows, reports; live WebSocket activity and presence.
- Payments and orgs: Stripe checkout, plans, portal, webhooks and refunds, with a dev mock mode; organisations and invites.
- AI: designer, suggestions, AI search intent and moderation across Anthropic, OpenAI, Gemini or heuristic providers; images from procedural, OpenAI, Imagen or an external pipeline (Google Flow).
- Showcase: generator, CLI, claim and takedown flows.
- Admin, REST and agents: admin API with an audit log; OpenAPI 3.1 and Swagger UI; MCP server with 11 tools (HTTP and stdio); sitemap feed.
- Ops and tests: BullMQ worker with 8 scheduled jobs; deploy and backup scripts; nginx configs (production, plus a staging template driven by `STAGING_HOST`); CI and an SSH deploy workflow. 32 tests pass against real Postgres and Redis.

**Done (web, `flatmeta.io` v2):** Next.js 16, React 19, Tailwind 4.
- Map home: a MapLibre globe with custom night/day styles, glowing plots and artwork on the map, drag-to-claim, a quest tracker, live ticker, guided tour and ⌘K search with AI.
- Public pages: plot pages with JSON-LD and share images; country, city, explore, leaderboards, profile, organisation, pricing, business, about, legal and login pages; the showcase claim wizard.
- Dashboard: plots, an editor with the AI Designer, quests and badges, organisations, billing, and a developers page with API keys and MCP setup.
- Admin panel: overview charts, showcase manager, moderation, claims and takedowns, plots, users, orders and refunds, pricing, audit log.
- Platform: sitemap, robots, manifest, icons, a service worker with an offline page, and a 404 page.
- Quality and ops: Vitest unit tests (8) and Playwright smoke tests (8, desktop and mobile); CI; SSH deploy with a zero-downtime build swap and rollback; README with the full Ubuntu 24.04 server guide.

**First showcase batch:** 140 approved showcase plots in 10 countries (GB, US, FR, DE, JP, IN, BR, AE, AU, ES), with procedural artwork. They are regenerated by `npm run setup` on any new environment.

**Decisions:**
- No PostGIS: plots are grid rectangles, so integer cell ranges plus a `plot_cells` primary key give exact, race-free overlap checks. A 1:50m country polygon lookup, with the nearest featured city as a fallback, sets each plot's country.
- The browser talks to the API on the same origin (`/api/*`, proxied by nginx) so the session cookie stays first-party. Share images are rendered by Next from a JPEG cover endpoint on the API.
- Without third-party keys, everything works in development: console email, mock checkout (refused in production), heuristic AI and procedural art. This keeps CI and local setup key-free.
- Staging shares the server with production: separate directories, ports 3100/4100, its own database and Redis DB. The host name is the `STAGING_HOST` / `NEXT_PUBLIC_STAGING_HOST` config value, and staging always sends noindex.
- Deploy secrets are unset, so `deploy.yml` skips cleanly. A push to `v2` deploys staging; production is a manual run.

**Next:** grant GitHub write access so the `v2` branches can be pushed; add the deploy secrets and stand up the server per the README; Stripe and AI keys; legal review; then a Lighthouse pass on staging and Phase 2 (`docs/03-masterprompt-phase2.md`).

## Open questions

1. The planning gdoc (y3.0 "Logins" tab) is not in the repos. Assumed the login model stays email + one-time code (no passwords), plus optional Google sign-in.
2. The `APP_KEY` committed in the v1 `.env.example` is a real key; rotate it on any server still running v1.
3. **Legal review of showcase plots** (brand names of real companies, no logos, labelled unclaimed): needs a trademark/legal check before public launch. A takedown flow is built in.
4. **Pricing** in the brief ($1–25/cell, Plus $5, Business $29, Brand $249, Landmark claim $990) is a starting proposal; all values are config.
5. **Plot terms:** plots are a licence to display content, not property. Terms of Service need a lawyer.
6. **One-time land vs rent:** v1 charged rent; v2 proposes one-time purchases plus subscriptions. Measure repeat revenue early.
7. **GitHub push access:** pushes to `MeWeBe-com/flatmeta.io` and `MeWeBe-com/flatmetaAPI` fail with 403 (the Claude GitHub App has no write access). Commits are kept locally on `v2` until access is granted.
8. **AI model costs:** moderation and search intent default to the same model as the designer (`claude-opus-5-5`). Set `ANTHROPIC_MODEL_FAST` (e.g. `claude-haiku-5-5`) to cut cost on high-volume calls.
9. **Refund policy details** (`/legal/refunds`): proposed a 14-day refund on land with no published content, no refunds on used boosts, and refundable Landmark claims within 14 days. Confirm, or adjust to your jurisdiction.
10. **Legal placeholders:** `[COMPANY NAME]`, `[COUNTRY]` and `[CONTACT EMAIL]` in the terms, privacy and refunds pages need real values.
11. **Google Flow:** it has no public API we can call, so the "external" image provider is a file drop. Prompts go to an outbox, you drop the finished images in an inbox, and the worker imports them. If you prefer automation, use Imagen through `GEMINI_API_KEY` (`AI_IMAGE_PROVIDER=gemini`).
12. **Showcase coordinates** were written by research agents from memory. Some may be a few blocks off; correct them in Admin → Showcase (edit) before launch.
13. **Map tiles and geocoding** use free public services (OpenFreeMap, Photon). That is fine for launch, but self-host both before heavy traffic (see `.env.example`).
