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

## Step 1 follow-up — extra branches and secrets (2026-10-30)

**Done:** read every branch of the public `flatmeta/flatmeta.io` and `flatmeta/flatmetaAPI` repos (all are ancestors of `main`; summarised in audit §8) and scanned all branches and history for secrets (audit §9). Merged the owner's `origin/v2` (kickoff masterprompt, `tasks.md`) into the rebuild.

**Finding that changes the plan:** the kickoff brief keeps marketplace, nearby/private chat, connections, clans, the 3 zoom levels, a PayPal option, a **monorepo in `flatmeta.io`** (the API repo's `v2` only gets a README), a deploy job inside `ci.yml`, and a HestiaCP deployment. My first Phase 1 build (written without that file) has none of the following: marketplace, chat/presence/clans, monorepo layout, Hestia, `ci.yml` deploy job. These are now tasks in `tasks.md`.

**Next:** finish Phase 0 (brief and masterprompts updated to the kickoff scope), then the missing Phase 1 milestones.

## Step 4 — M1 monorepo (2026-10-30)

**Done:** all v2 code now lives in `flatmeta.io` `v2` as an npm-workspaces monorepo: `apps/web` (Next.js), `apps/api` (Fastify, worker, MCP, CLI), `packages/shared` (grid maths). One root `.env.example` (and `.env`) configures both apps. `APP_URL` is the single source for every absolute URL (production refuses a localhost `APP_URL`), `STAGING_DOMAIN=flatmeta.mewebe.net` (placeholder), ports are env values (`WEB_PORT=3200`, `PORT=3201`, `MCP_PORT`, `WORKER_HEALTH_PORT=3203`, avoiding 3000/3010/3100), the API can serve `/mcp` on its own port, and the worker exposes a health endpoint. `flatmetaAPI` `v2` is reset to the owner's pointer branch (`V2.md`); my earlier standalone API work is kept locally as branch `v2-phase1-backup` and was imported into `apps/api` (history not carried over). 32 API tests and 8 web tests pass; lint and typecheck are clean.

**Decisions:** the shared package builds to `dist/` (compiled on `npm install`) so both the Node API and Next can import it; Next reads the root `.env` through `@next/env` and exposes `NEXT_PUBLIC_*` from `APP_URL`/`APP_NAME`/…; `API_INTERNAL_URL` is explicit (Next overwrites `PORT` for its own process).

**Next:** the remaining Phase 1 tasks in `tasks.md` order: DB additions (listings, ledger, connections, chat, clans, avatar, password), auth password, land content (sandboxed HTML, `/u/`), marketplace, payments provider interface, real-time presence and chat, clans, then web UI for them, `ci.yml` with the deploy job, PM2/Hestia, e2e, polish.

## Step 4 — M1–M2 API completion (2026-10-30)

**Done (`apps/api`):** migration `0002` (listings, ledger_entries, payout_accounts, connections, chat_messages, clans, clan_members, clan_requests, users.avatar/password_hash, plots.custom_html); optional scrypt password sign-in (`/v1/auth/password-login`, `PUT /v1/me/password`) and an avatar field; sandboxed custom HTML (screened, Plus and above, served only as a CSP-wrapped `srcdoc` document); the **marketplace** (list, change price, cancel, buy with Stripe or mock checkout bound to the listing version, 10% fee, append-only zero-sum ledger, automatic refund when the listing changed or sold, 7-day hold and 30-day price-cap rules, homesteads excluded, seller balance, Stripe Connect payouts job, admin overview and manual payouts); a `PaymentProvider` interface (Stripe, Mock; PayPal documented only); the **realtime hub** (Redis geo presence, viewport avatars at 1 Hz, throttled position updates, nearby chat within 2 km, private chat for connections, clan chat, 5 messages per 10 s, moderation, 24 h nearby retention job); **connections** with block/report; **clans** (found at level 2, join requests, invites, officer/leader roles, kick, leadership transfer, leaderboard by member XP, activity and achievements Clan Founder, Together, Ten Strong, Dealmaker). 50 API tests pass (real Postgres, Redis and WebSockets); lint and typecheck clean.

**Decisions:** nearby chat is delivered by distance from the sender (2 km), stored per ~5 km cell for history; guests can read and appear as anonymous avatars but must sign in to write; DMs require an accepted connection; marketplace money is only ever moved by ledger entries that sum to zero per order; payouts are skipped quietly where payments aren't configured; the wire protocol is documented in code comments in `realtime/hub.ts` and will be added to the OpenAPI/README.

**Next:** the web UI for all of this (zoom levels, avatars and walking, chat, connections, marketplace, clans, custom HTML, password and avatar settings, `/u/` fallback), then `ci.yml` with the deploy job, PM2 and the HestiaCP guide, e2e tests, and polish.

## Step 4 — M5–M12 web, ops and polish (2026-10-30)

**Done (`apps/web`):** World/City/Land level switch (presets over smooth zoom; avatars from City, claim grid at Land); avatars on the map with smooth movement, tap and arrow-key walking and speech bubbles; chat panel (nearby, clan, private) with connections and a peer card; **marketplace** (`/marketplace`, sell/buy on plot pages, seller balance and payouts in Billing, admin overview with manual payouts and void); **clans** (`/clans`, `/clan/[slug]`, found, requests, invites, roles, leaderboard); **settings** (profile, emoji avatar look, optional password); sandboxed **custom HTML** on plot pages and in the editor; `/u/<plot>` vanity redirect. Playwright e2e now covers guest → sign-in → free claim → edit → publish, paid land through the mock checkout, showcase labels and claim, and the new pages (8 specs × desktop and mobile, all pass).

**Done (ops):** one `.github/workflows/ci.yml` (Postgres + Redis services; lint, typecheck, tests, build, e2e; final **deploy** job on push to `v2`, skipped with a notice when `DEPLOY_*` secrets are unset; no `workflow_run`/`workflow_dispatch`); root `ecosystem.config.cjs` (web, API, worker; verified running under PM2 locally in production mode); `scripts/deploy.sh` (loads nvm and `.env` itself, `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, defaults to branch `v2`, side-directory web build, migrate, PM2 reload, health checks on `$PORT` and `$WEB_PORT`, rollback); `scripts/backup.sh`; `deploy/hestia/nodejs-app.conf`; `docs/deploy-hestia.md`; monorepo README.

**Bugs found by the new tests and QA, fixed:** claiming land or buying a plot as a guest re-opened the sign-in dialog after signing in (a stale closure still saw no user) — now resumed from an effect via `useAfterSignIn`; the production build shipped the entire icon library (~230 KB gz) — named imports; the mini map loaded its 300 KB library on every plot page — now loads near the viewport; the chat button overlapped the zoom controls. Mobile Lighthouse on a plot page went from 49 to **87** performance (accessibility 100, best practices 100).

**Decisions:** the deploy job deploys the checkout at `DEPLOY_PATH` (staging or production depending on where it points; GitHub Environments can split them later); the API serves `/mcp` on its own port only when `MCP_PORT` is set; avatars are emoji looks (face, colour, accessory) rather than drawn sprites, which keeps the realtime payload tiny and works with the privacy of guests; PayPal is an interface-only option.

**Next:** the owner actions in `tasks.md` (GitHub write access, deploy secrets, Stripe/AI/SMTP keys, staging domain, legal), then a staging deploy and a real Stripe test-mode run, then Phase 2.

## Checkpoint — pushed and re-checked against the kickoff (2026-11-02)

**Done:** GitHub access was granted and `v2` is on `origin` at `a132fdd` (40 commits since the owner's kickoff). A fresh clone of the pushed branch installs, lints, type-checks, passes all tests (50 API, 8 web) and builds; a scan of the tree finds no secrets or env files other than `.env.example`; no v1 (Laravel/Ionic) code remains on `v2`. The first CI run on GitHub passed install, lint, typecheck, unit and API tests, build and stack start (see the run for the e2e and deploy jobs).

**Kickoff re-check, point by point:**
- Branch rules: all work on `v2`, nothing on `main` or `develop`; v2 code lives in this monorepo; `flatmetaAPI` `v2` holds only the owner's `V2.md` pointer. The `bolt-optimize-*` branches were ignored as instructed.
- Step 1–3 docs: audit (all branches of both public repos plus `MeWeBe-com/flatmetaAPI` main), brief, research notes, two masterprompts (§12 of Phase 1 is the kickoff alignment). Secrets: one found (v1 `APP_KEY`), listed URGENT, absent from `v2`.
- Step 4 build: `.env.example` (every variable; no secrets), Postgres migrations and seeds, showcase generator run for a first batch (140 plots, 10 countries; works without any image key), README with local dev, API/MCP use and the server guide, PM2 ecosystem, deploy script, `docs/deploy-hestia.md`, `deploy/hestia/nodejs-app.conf`.
- CI/deploy: one `ci.yml` with Postgres + Redis, tests, build and e2e, then a final deploy job on push to `v2`; no `workflow_run` or `workflow_dispatch`; secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, `DEPLOY_PATH` (optional `DEPLOY_PORT`); skips with a notice when unset.
- Server lessons: normal user with nvm Node 22 and its own PM2, no root; ports from env (`WEB_PORT`, `PORT`, `MCP_PORT`, `WORKER_HEALTH_PORT`, defaults avoid 3000/3010/3100); `deploy.sh` loads nvm and `.env`, exports `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, defaults to `v2`, health-checks on `$PORT`; every absolute URL comes from `APP_URL`; config values `APP_NAME`, `PRODUCTION_DOMAIN=flatmeta.io`, `STAGING_DOMAIN=flatmeta.mewebe.net`.
- Phase 1 scope: guest-first map with World/City/Land levels, avatars, nearby and private chat, connections, clans, XP/quests/achievements/leaderboards, Stripe plots/upgrades/subscriptions, marketplace with a 10% fee and ledger, user and organisation accounts, dashboards, admin, AI designer/suggestions/search/moderation with deterministic fallbacks, REST + OpenAPI, MCP server, SEO pages and share cards, unclaimed-showcase system with the Claim flow, PWA, i18n-ready, tests (unit, API, e2e).

**Not verified (needs your environment):** a real Stripe test-mode run; the Hestia proxy include path and WebSocket pass-through on your server; a real deploy through the SSH job (no `DEPLOY_*` secrets yet); real AI-provider calls. All are listed in `tasks.md` and the open questions.

**Next:** with the checkpoint accepted, continue Phase 1 follow-ups (Stripe test-mode run, staging deploy) once the secrets and keys exist, then Phase 2.

## Open questions

0. **URGENT: rotate the Laravel `APP_KEY`.** `flatmetaAPI/.env.example` (all v1 branches, since commit `363faab`) contains a real key: `APP_KEY=base64:ah1EUh…`. Rotate it on every server that ever ran it. It is removed from `v2`; it stays in v1 history unless you rewrite it.

1. The planning gdoc (y3.0 "Logins" tab) is not in the repos. Assumed the login model stays email + one-time code (no passwords), plus optional Google sign-in.
2. The `APP_KEY` committed in the v1 `.env.example` is a real key; rotate it on any server still running v1.
3. **Legal review of showcase plots** (brand names of real companies, no logos, labelled unclaimed): needs a trademark/legal check before public launch. A takedown flow is built in.
4. **Pricing** in the brief ($1–25/cell, Plus $5, Business $29, Brand $249, Landmark claim $990) is a starting proposal; all values are config.
5. **Plot terms:** plots are a licence to display content, not property. Terms of Service need a lawyer.
6. **One-time land vs rent:** v1 charged rent; v2 proposes one-time purchases plus subscriptions. Measure repeat revenue early.
7. **GitHub push access (still blocked 2026-10-30):** `git push` and the GitHub API both return 403 (the Claude GitHub App cannot write to `MeWeBe-com/*`). All work is committed on local `v2`; bundles were sent to the owner. Fix: connect GitHub at https://claude.ai/connect-github and install the Claude GitHub App on both repos. Original note: pushes to `MeWeBe-com/flatmeta.io` and `MeWeBe-com/flatmetaAPI` fail with 403 (the Claude GitHub App has no write access). Commits are kept locally on `v2` until access is granted.
8. **AI model costs:** moderation and search intent default to the same model as the designer (`claude-opus-5-5`). Set `ANTHROPIC_MODEL_FAST` (e.g. `claude-haiku-5-5`) to cut cost on high-volume calls.
9. **Refund policy details** (`/legal/refunds`): proposed a 14-day refund on land with no published content, no refunds on used boosts, and refundable Landmark claims within 14 days. Confirm, or adjust to your jurisdiction.
10. **Legal placeholders:** `[COMPANY NAME]`, `[COUNTRY]` and `[CONTACT EMAIL]` in the terms, privacy and refunds pages need real values.
11. **Google Flow:** it has no public API we can call, so the "external" image provider is a file drop. Prompts go to an outbox, you drop the finished images in an inbox, and the worker imports them. If you prefer automation, use Imagen through `GEMINI_API_KEY` (`AI_IMAGE_PROVIDER=gemini`).
12. **Showcase coordinates** were written by research agents from memory. Some may be a few blocks off; correct them in Admin → Showcase (edit) before launch.
13. **Map tiles and geocoding** use free public services (OpenFreeMap, Photon). That is fine for launch, but self-host both before heavy traffic (see `.env.example`).
14. **Hestia nginx include path:** the guide tells you to find the exact `include` line in your Hestia version's `NodeJS.tpl` and copy `deploy/hestia/nodejs-app.conf` there (or use `nginx.conf_*` / `nginx.ssl.conf_*` in the domain's conf folder). Not tested on your server: confirm on first deploy, especially the WebSocket `Upgrade` pass-through.
15. **Which environment does `ci.yml` deploy?** It deploys whatever `DEPLOY_PATH` points at on every push to `v2`. Until you confirm the staging domain, treat that as staging.
16. **Marketplace guard rails** are proposals (7-day hold, 50× price cap for 30 days, no resale of Homesteads, 10% fee). All are env values (`MARKETPLACE_*`); legal wording about "not an investment" is in the UI and needs review.
17. **Guest avatars** appear anonymously on the map ("Guest 1234") and can read chat but not write. Confirm this matches how open you want the world to be.

Session started 2026-11-02
