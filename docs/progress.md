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

**Done:** GitHub access was granted and `v2` is on `origin` at `a132fdd` (40 commits since the owner's kickoff). A fresh clone of the pushed branch installs, lints, type-checks, passes all tests (50 API, 8 web) and builds; a scan of the tree finds no secrets or env files other than `.env.example`; no v1 (Laravel/Ionic) code remains on `v2`. The first CI run on GitHub passed install, lint, typecheck, unit and API tests, build and stack start The first full run then failed one e2e test (`/pricing` was prerendered during the build with no API, and cached its placeholder for 5 minutes); fixed in `06f863a` (the page now loads plans in the browser in that case). CI run 3 on `06f863a` is **green end to end**: lint, typecheck, 58 unit/API tests, build, stack start, 16 Playwright tests (desktop + mobile), and the deploy job ran its secrets check and skipped SSH because no `DEPLOY_*` secrets are set.

**Kickoff re-check, point by point:**
- Branch rules: all work on `v2`, nothing on `main` or `develop`; v2 code lives in this monorepo; `flatmetaAPI` `v2` holds only the owner's `V2.md` pointer. The `bolt-optimize-*` branches were ignored as instructed.
- Step 1–3 docs: audit (all branches of both public repos plus `MeWeBe-com/flatmetaAPI` main), brief, research notes, two masterprompts (§12 of Phase 1 is the kickoff alignment). Secrets: one found (v1 `APP_KEY`), listed URGENT, absent from `v2`.
- Step 4 build: `.env.example` (every variable; no secrets), Postgres migrations and seeds, showcase generator run for a first batch (140 plots, 10 countries; works without any image key), README with local dev, API/MCP use and the server guide, PM2 ecosystem, deploy script, `docs/deploy-hestia.md`, `deploy/hestia/nodejs-app.conf`.
- CI/deploy: one `ci.yml` with Postgres + Redis, tests, build and e2e, then a final deploy job on push to `v2`; no `workflow_run` or `workflow_dispatch`; secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, `DEPLOY_PATH` (optional `DEPLOY_PORT`); skips with a notice when unset.
- Server lessons: normal user with nvm Node 22 and its own PM2, no root; ports from env (`WEB_PORT`, `PORT`, `MCP_PORT`, `WORKER_HEALTH_PORT`, defaults avoid 3000/3010/3100); `deploy.sh` loads nvm and `.env`, exports `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, defaults to `v2`, health-checks on `$PORT`; every absolute URL comes from `APP_URL`; config values `APP_NAME`, `PRODUCTION_DOMAIN=flatmeta.io`, `STAGING_DOMAIN=flatmeta.mewebe.net`.
- Phase 1 scope: guest-first map with World/City/Land levels, avatars, nearby and private chat, connections, clans, XP/quests/achievements/leaderboards, Stripe plots/upgrades/subscriptions, marketplace with a 10% fee and ledger, user and organisation accounts, dashboards, admin, AI designer/suggestions/search/moderation with deterministic fallbacks, REST + OpenAPI, MCP server, SEO pages and share cards, unclaimed-showcase system with the Claim flow, PWA, i18n-ready, tests (unit, API, e2e).

**Not verified (needs your environment):** a real Stripe test-mode run; the Hestia proxy include path and WebSocket pass-through on your server; a real deploy through the SSH job (no `DEPLOY_*` secrets yet); real AI-provider calls. All are listed in `tasks.md` and the open questions.

**Next:** with the checkpoint accepted, continue Phase 1 follow-ups (Stripe test-mode run, staging deploy) once the secrets and keys exist, then Phase 2.

## Staging live and staging fixes (2026-11-02)

**Done:** staging is live at https://staging.flatmeta.io (HestiaCP; app user `najamussaqib`; checkout at `/home/flatmeta/web/staging.flatmeta.io/private/flatmeta`; web 3200, API 3201, worker 3203). The `DEPLOY_*` secrets are set, so every green push to `v2` deploys there through the forced-command SSH key. Fixes for what staging showed:
1. **Security:** Next.js listened on 0.0.0.0. The PM2 ecosystem now runs `next start -H $HOST -p $WEB_PORT`; the API (and optional MCP port) and the worker health server already listen on `HOST`. Keep `HOST=127.0.0.1`.
2. **Deploy:** with `NODE_ENV=production`, npm skipped devDependencies and the shared package's `postinstall` (`tsc`) failed. `deploy.sh` runs `npm ci --include=dev` and exports `NPM_CONFIG_INCLUDE=dev`; `DEPLOY_PRUNE=1` prunes afterwards (off by default because tsx scripts need dev deps).
3. **Hestia:** `deploy/hestia/nodejs-app-fallback.conf` holds the catch-all `location /` → web; the `/media/` alias is an `__MEDIA_DIR__` placeholder. The guide notes that Hestia only rewrites and reloads nginx when the proxy template is re-applied (switch to `default` and back to NodeJS, or `v-change-web-domain-proxy-tpl`).
4. **Sign-in without SMTP:** with `SMTP_HOST` empty and `APP_ENV` not production, the sign-in code is shown in the dialog and logged (`DEV_CODE_ECHO=auto|true|false`). Production never echoes, refuses `DEV_CODE_ECHO=true` at startup, and never logs email bodies.
5. **Staging readiness:** the fake checkout and the on-screen codes are now keyed on `APP_ENV` (they were keyed on `NODE_ENV`, so a production build such as staging could not use them). `PAYMENTS_MOCK` works with `APP_ENV=staging` + `NODE_ENV=production` and is forced off when `APP_ENV=production`. A production build with no `APP_ENV` gets production rules. Without AI keys the text, moderation and search features use heuristics and images use the procedural generator, so the showcase generator runs without image keys. New tests load the real config in fresh processes to prove each case.

**Verified on staging:** CI run 7 (`999f6c2`) passed all tests and its deploy job ran `deploy.sh` over SSH for the first time (run 6 had skipped: the secrets weren't visible yet): install, build, migrations applied, PM2 reloaded `flatmeta-web/api/worker-staging`, health check `✓ Healthy: API :3201, web :3200 (999f6c2)`; `https://staging.flatmeta.io/api/healthz` answers `env: staging`. Found in that log: `pm2 reload` keeps an app's original start arguments, so the `-H 127.0.0.1` change could not reach a web process started earlier; `deploy.sh` now runs `scripts/pm2-sync.cjs`, which recreates FlatMeta apps whose start command changed (other apps on the server are untouched). The log also shows the server's PM2 daemon (7.0.3) is older than the CLI (7.1.1): run `pm2 update` once.

**Decisions:** staging domain confirmed as `staging.flatmeta.io` (defaults updated); fail safe: an unlabelled production build behaves as production.

**Next:** keys (SMTP, Stripe test, AI) on staging; then the production cutover plan.

## Email through Resend (2026-11-04)

**Done:** Resend (official `resend` SDK) is the email provider, with SMTP as fallback and log-only when neither is set (`RESEND_API_KEY` → Resend; else `SMTP_*`; else logged, and on non-production the sign-in code is shown on screen). New module `apps/api/src/email`:
- **Templates** (HTML + plain text from one layout, user text escaped): sign-in and claim codes, organisation and clan invites, marketplace sold / purchased / refund / payout sent / payout failed, claim approved / rejected, Landmark ready, removal-request result, admin notices (claim needing manual review, removal request), and a generic notice. Every email carries Resend tags `type` and `env`, and `MAIL_REPLY_TO` when set.
- **Queue:** with a real provider, emails go through the BullMQ `email` queue in `flatmeta-worker`: sign-in codes first, 8 attempts with exponential backoff, `rate_limit_exceeded` honoured using Resend's `retry-after` without spending an attempt, permanent errors (invalid address, unverified sender, bad key) dropped and logged, limiter `EMAIL_RATE_PER_SECOND` (default 2, Resend's default limit). Idempotency keys on event emails. If Redis is unreachable the API sends inline with short retries. The worker health check includes the email worker.
- **Suppression:** table `email_suppressions` (migration 0003). `POST /v1/email/webhooks/resend` verifies the Svix signature with `RESEND_WEBHOOK_SECRET` (standardwebhooks, the library the Resend SDK uses) and suppresses `email.bounced` and `email.complained` recipients; suppressed addresses are skipped.
- **Privacy:** the API key, recipients and message bodies never reach the logs (only provider, message id and type); production logs no bodies even without a provider.
- **Tests:** 10 new (mocked Resend client): payload (from, reply-to, HTML + text, tags, idempotency key), HTML escaping, inline retries vs permanent failure, worker rate-limit / permanent / network handling, no secrets in logs, suppression, webhook signature (valid, wrong secret, tampered body, disabled without secret), queue, and that a marketplace sale and a clan invite actually send their emails. Provider selection is tested by loading the real config in fresh processes.

**Decisions:** one sending path for all email; side-effect emails never break the flow that triggers them; admins in the database plus `ADMIN_EMAILS` get admin notices. The YourBidReady project's code wasn't available here, so this follows the same described pattern (SDK, env names, queue, Svix webhook) rather than copying its code.

**Next (owner):** create the Resend account, verify the domain in Cloudflare DNS (SPF on the `send` subdomain, DKIM `resend._domainkey`, DMARC), then set `RESEND_API_KEY`, `MAIL_FROM` and the webhook secret on staging.

## Staging bug: live chat and notifications (2026-11-04)

Reported: chat (nearby, private, clan) never reached the other player, and follows or connection requests gave the recipient nothing. Reproduced locally on a staging-like stack: production builds, `APP_ENV=staging`, Redis DB 6 with `REDIS_PREFIX=fm-staging`, one API process plus a separate worker, and `scripts/edge-proxy.mjs` in front, which routes `/api` and the WebSocket upgrade the way the Hestia nginx template does.

**Causes found**
1. **The chat panel crashed the page when opened.** `useEffect(() => endRef.current?.scrollIntoView(...))` returned the value of `scrollIntoView`, and current Chromium returns a Promise from scroll methods. React then called that Promise as a cleanup function ("destroy is not a function"), which unmounted the map, so nothing after it could work. Fixed with a block body.
2. **The client ignored `notification` events**, and the map had no bell. The server stored rows for follows and requests, but nothing showed them live.
3. **DMs created no notification**, and DM threads were keyed by user id until the friends list had loaded, so a first message could land in the wrong thread.
4. **Clan chat used the clan known when the socket connected**, so after joining a clan, chat only worked after a reload.

**Changes**
- API: `notify()` stores the row and publishes `{id, kind, payload, createdAt}` on `<prefix>:notify:<userId>` (from the API or the worker; both read the same `.env`). DMs notify the recipient and collapse into one unread entry per sender, with a count. Chat messages carry `senderUsername` and `toUsername`.
- Live hub: each signed-in socket subscribes its own user channel on connect (ref-counted per process, released on close). Signing in reconnects the socket, so the subscription follows the user without a reload. A `clan_changed` signal (no stored row) updates clan routing live, and so does a membership check every 30 s and before each clan message.
- `GET /v1/live/health`: sockets, signed-in vs guests, user channels subscribed on this process, the API processes listening, and a Redis publish → receive round trip (HTTP 503 if it fails). Counts only.
- `LOG_LEVEL=debug` logs `live: socket opened/closed`, `subscribed/unsubscribed user channel`, `published notification` (with `receivers`), `delivered notification`, and `published/delivered chat message` (with `sockets`).
- Web: the live provider turns `notification` events into a toast, bumps the unread count and tells listeners. A new bell in the map and site headers shows "Notifications, N unread" and opens a list that marks everything read, with Accept/Decline on connection requests and Reply on messages. Toasts are announced (`role="status"`). The peer card gained Follow. Guests see "Guests can read. Sign in to chat, follow and connect." with a Sign in button, instead of silent failures.
- Map header raised above the quests rail: its dropdowns (bell and account menu) were hidden under it.
- Tests: an API test covers the fan-out, DM collapsing, health and channel release (67 API tests). The new e2e `social-live.spec.ts` uses two browser contexts and covers nearby chat, DM with unread badge and toast, follow plus connection request with toast, bell count and list, accept notifying the sender, clan chat without reload, and the guest prompt. It passes 3/3 on the staging-like stack. CI now runs the whole e2e suite (and the worker) behind the edge proxy, so WebSockets go same-origin through `/api` as on staging.

**How to verify on staging with two accounts** (two browsers, or one normal and one private window)
1. Open `https://staging.flatmeta.io/api/v1/live/health`: expect `"ok": true`, `"prefix": "fm-staging"`, `apiProcessesListening: 1`.
2. Window A: sign in with email 1 (the code is shown on screen on staging). Window B: sign in with email 2. Each can change their @username in Settings.
3. Both open `https://staging.flatmeta.io/?at=41.3874,2.1686,12`. Each should see the other's avatar within a few seconds. Health now shows `signedIn: 2`, `userChannels: 2`.
4. Nearby: A opens Chat → Nearby and sends a message. B sees a speech bubble over A and the message in Chat → Nearby; B's chat button shows "1".
5. Follow: B taps A's avatar → Follow. A gets a toast "B started following you", and the bell shows 1.
6. Connect: B taps A's avatar → Connect (or Chat → Friends → add `@A`). A gets a toast "B wants to connect", and the bell count goes up. A opens the bell: both entries are listed and the count clears. A presses Accept; B gets "A accepted your connection request".
7. DM: A opens Chat → Friends → B, and sends a message. B gets a toast "New message from A: …", an unread badge on the chat button and a bell entry. Reply in the bell opens the thread.
8. Clan: A (level 2+, e.g. after claiming the free Homestead) founds a clan at /clans and invites `@B`. B gets "A invited you to join …", then accepts on /clans. Both use Chat → Clan, with no reload needed.
9. Guest: in a third private window (signed out), Chat shows "Guests can read. Sign in to chat, follow and connect.", and tapping an avatar → Connect/Follow opens sign-in with the reason.
10. Logs (optional): set `LOG_LEVEL=debug` in the staging `.env`, run `pm2 reload flatmeta-api flatmeta-worker --update-env`, then `pm2 logs flatmeta-api | grep 'live:'` while repeating a step. `published notification … receivers: 1` followed by `delivered notification … sockets: 1` means the path works end to end.

## Staging bugs after the live fix: DM page crash and Redis "Connection is closed" (2026-11-04)

**1. "This page couldn't load", with `⨯ Error: useSession outside provider` in the web log.** I could not reproduce it. On a staging-like build, every component that calls `useSession` renders under `<Providers>` in the root layout. There are no parallel/intercepting routes, no portals, and no separate React roots. Building a new version into the build folder while the old server runs, and swapping folders under a running server, both break things in other ways, but not with this error. (The swap window in `deploy.sh` is closed by the PM2 restart.) So the fix is defensive and diagnostic:
- `useSession`, `useGame` and `useLive` no longer throw. Outside the providers they return a signed-out, inert context and log once: `[flatmeta] useSession() used outside <Providers>; rendering as a guest.` plus a stack naming the component. If it happens again, `pm2 logs flatmeta-web-staging` shows where.
- Error boundaries around the chat panel ("Chat is unavailable. Reload"), the peer card and the notification bell, so a failure there can't take the page down.
- `app/error.tsx` (keeps the header, offers Try again) and `app/global-error.tsx` replace Next's bare "This page couldn't load".
- Profile pages (`/u/<username>`) have a **Message** button. It opens `/?dm=<username>` when connected, and offers Connect otherwise.

**2. ioredis `Connection is closed` (with `previousErrors`) in the API.** That error means a command ran on a client after `quit()`. `previousErrors` is the shape of a failed `multi().exec()`, which the live hub's socket close handler ran without a catch. The API only quits Redis in its shutdown handler, so the likely trigger was work still running during a PM2 reload. A second problem made it loud: the rate limiter used the same client on every request without `skipOnError`, so whenever that client was unusable, every request failed (DM history included).
- `lib/redis.ts`: separate long-lived clients: `redis` (commands), `publisher()` (PUBLISH only), `subscriber()` (subscribe mode only, auto re-subscribe), and BullMQ's own. They reconnect forever with a capped backoff (200 ms … 5 s). Commands give up after 3 retries instead of hanging. Drops, reconnects and an unexpected `end` are logged (`redis: connection error / reconnecting / reconnected`). Connections are named `<REDIS_PREFIX>:<cmd|pub|sub|bull>:<pid>` (see `redis-cli -n 6 CLIENT LIST`).
- All publishing goes through `publish()`, which never throws and returns -1 when Redis is unavailable. After shutdown starts, socket close handlers and timers skip Redis. The welcome step's Redis calls are caught.
- Shutdown: idempotent (PM2 can send SIGINT and SIGTERM), then app (sockets) → short drain → database → Redis.
- Rate limiter: `skipOnError: true`, so a Redis hiccup doesn't 500 every request.
- Ghost avatars: a `move` that was still being written when its socket closed could re-add the avatar for up to 40 s. It is now removed again.
- Test: kills this process's pub and sub connections server-side (`CLIENT KILL`), waits for the hub to recover, then checks that a notification published afterwards still reaches the open socket (68 API tests).

**3. Two-player e2e extended.** It now opens a DM from a profile page (Message → map with the thread open → send → the other player gets it live with an unread badge and a toast) and from the peer card on the map. It also checks there's exactly one avatar per player after a reload. Every test fails on any page error or console error (except blocked map tiles from the public tile server). 8/8 passed three times in a row on the staging-like stack. A PM2-style SIGINT with five live sockets logged no Redis errors.

**How to verify on staging** (after the CI deploy of this commit)
1. `https://staging.flatmeta.io/api/v1/live/health` → `"ok": true`.
2. On the server: `redis-cli -n 6 CLIENT LIST | grep -o 'name=fm-staging:[a-z]*:[0-9]*'`. Expect `cmd`, `pub` and `sub` for the API pid, and `cmd` plus `bull` for the worker.
3. Two windows, A and B, signed in with two emails (codes on screen), already connected (or connect via a peer card → Connect, then Accept in the bell).
4. **DM from a profile:** B opens `https://staging.flatmeta.io/u/<A's username>` → **Message**. The map opens with the private chat to A. B sends a message. A (chat closed) gets a toast "New message from B: …", the chat button shows 1 unread, and Chat → Friends → B shows the message.
5. **DM from the map:** both at `https://staging.flatmeta.io/?at=41.3874,2.1686,12`. A taps B's avatar → **Message** → sends. B gets it live with the unread badge.
6. Open DevTools → Console in both windows during steps 4–5: there should be no red errors, and the page must not show "This page couldn't load".
7. Logs: `pm2 logs flatmeta-api-staging --lines 200 | grep -E 'Connection is closed|redis:'` should show nothing new. `pm2 logs flatmeta-web-staging --lines 200 | grep 'outside <Providers>'` should be empty; if not, send me the stack.
8. Optional reconnect check: `redis-cli -n 6 CLIENT KILL TYPE pubsub`. The API logs `redis: reconnecting` then `redis: reconnected`, health stays `ok`, and DMs keep arriving live.

## Staging bug: an avatar's whole row opened its card (2026-11-04)

**Cause.** `.fm-avatar` had `position: relative` and `display: grid`. Our stylesheet loads after MapLibre's, so this overrode `.maplibregl-marker { position: absolute }`. Each avatar marker became a block as wide as the map (1280 px on desktop, 412 px on a Pixel 7), placed at the avatar's height. Any click on that row hit the marker and opened the card.

**Fix (CSS only).** `.maplibregl-marker.fm-avatar` stays `position: absolute` with `width: max-content`. The wrapper, the name label, the accessory and the speech bubble have `pointer-events: none`. Only the face takes clicks, with a transparent ring that makes a 44 px target (34 px face, 2 px border, 7 px padding). Clicks anywhere else reach the map as before: tap to walk, or open a plot. Keyboard access (Tab, then Enter on an avatar) is unchanged.

**Test.** `avatar-hit.spec.ts` runs on desktop and mobile (Pixel 7, touch taps). Two guests are about 120 m apart in a quiet valley. It checks that the marker is narrower than 160 px; that clicks 150 px left and right of the avatar on the same row open no card, and that my avatar walks toward them; and that a tap on the icon, or 2–3 px outside it within the 44 px ring, opens the card. Against the old CSS it failed (marker 1280 px / 412 px wide); with the fix it passes on both viewports, twice in a row.

**Verify on staging.** Open `https://staging.flatmeta.io/?at=41.3874,2.1686,15` in two windows (guests are fine). In window A, click empty map well to the left and right of B's avatar on the same row: A's avatar walks there and no card opens. Click B's avatar icon: B's card opens. On a phone, do the same with taps.

## Go-live preparation (2026-11-05)

Everything for launching v2 at https://flatmeta.io that doesn't need owner credentials. Full runbook: [docs/go-live.md](go-live.md).

**1. Production mode and the payment switch.** `APP_ENV=production` already refused mock checkout and on-screen sign-in codes (covered by the env-policy tests). New: `PAID_CHECKOUT_ENABLED`, where `auto` means off in production and on elsewhere. With it off:
- Every checkout path (`createCheckout`, subscriptions, upgrades, AI packs, marketplace buy and listing, Landmark checkout) answers HTTP 403 `coming_soon` with a friendly message.
- The web hides each pay button behind a "coming soon" note: pricing, billing, organisation plans, plot boosts, the AI designer's out-of-credits box, marketplace buy/sell, and the claim panel's prices.
- **Free land:** each person (or organisation) can claim up to `FREE_LAND_CELLS` = 100 squares in total, **in any tier**. Larger claims say how many free squares are left, and a recount after insert stops two parallel claims from exceeding the allowance. The small Homestead keeps working as before.
- **Showcase claims:** work-email verification still runs. A verified claim is kept as a lead, the admins get an email, and the brand sees "Landmark checkout opens soon".
- `GET /v1/features` reports the switch.

The web reads the same rule at build time (`NEXT_PUBLIC_PAID_CHECKOUT` from the shared `.env`). 5 new API tests.

**2. Legal.** `COMPANY_NAME`, `COMPANY_COUNTRY` and `CONTACT_EMAIL` (defaults MeWeBe, United Kingdom, hello@flatmeta.io) fill the terms, privacy and refund pages, so no brackets remain. The land terms describe the launch allowance while payments are off. The privacy policy gained "Cookies and analytics". A small cookie notice (one essential cookie, cookie-free Plausible) shows once when `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is set. It informs rather than asks, because nothing else is set.

**3. Showcase locations.**
- **Automatic check:** I compared all 140 curated entries with their stated city (city table) and country (country outlines). No coordinate is wrong. The flags were artifacts: 20 coastal sites sit outside the coarse country outlines, and Mumbai's city-table centre is in the suburbs. So no seed data changed.
- **Admin → Showcase locations:** lists every showcase plot with links to our map and OpenStreetMap, plus automatic flags: country mismatch, more than 40 km from its city, or more than 1.5 km from its curated address (pushed aside by a collision). Admins can mark plots checked or unchecked in bulk, or paste coordinates and Move a plot. A move keeps the size, re-places it in the nearest free space and moves its cells in one transaction.
- **Production rule:** `SHOWCASE_REQUIRE_LOCATION_CHECK` (auto = on in production) keeps unchecked showcase plots off the public map, lists, search, counts, sitemap and plot pages. The rule lives in one helper, `lib/visibility.ts`.

**4. SEO.**
- Production `robots.txt` allows crawling and points to the sitemap. Elsewhere it still says `Disallow: /`, and pages now also carry `noindex`.
- Canonical URLs on the home page (all `?at=`/`?dm=` variants point to `/`), explore, leaderboards, pricing, business, about, marketplace, clans and the legal pages, in addition to the existing plot, region, country, profile, organisation and clan canonicals.
- A site-wide 1200×630 OG image (plot pages keep their own).
- 404 (`not-found.tsx`) and 500 (`error.tsx`, `global-error.tsx`) pages.

**5. Ops.**
- **`scripts/new-instance.mjs <staging|production>`** writes the instance `.env` from `.env.example`: production ports 3250/3251/3253, Redis DB 7, `REDIS_PREFIX=fm-prod`, `APP_URL=https://flatmeta.io`, random `SESSION_SECRET`, same-origin WebSockets, media at `/home/USER/web/flatmeta.io/private/uploads`. It never overwrites an existing `.env`. It also renders the two Hestia nginx include files with the right ports and media path into `deploy/out/<env>/`.
- **PM2 names** carry the environment (`flatmeta-*-production`; staging unchanged).
- **`scripts/deploy.sh [staging|production] [branch]`** refuses a checkout whose `.env` names another environment. It refuses production unless named, from CI, a forced-command key, or without a terminal, and asks you to type `production`. The old `deploy.sh v2` form still works for CI on staging.
- **Runbook:** `docs/go-live.md` has the owner prerequisites, instance setup, cutover (record v1's Hestia templates, install the include files, switch the proxy template), 13 smoke checks, and the rollback: switch the proxy template back, in under a minute.
- **CI** now also builds the web app with production settings. That build found a real bug the staging build couldn't: the "coming soon" notice used a client-only helper on the server and broke `/marketplace` prerendering, so the production deploy would have failed. Fixed.

**Checks.** Lint and typecheck clean; 74 API tests and 8 web unit tests pass. The full e2e suite on the staging-like stack passes, except the two mock-checkout tests that need a reachable `APP_URL` (environment-only, as before; they pass in CI). A production-mode stack (`APP_ENV=production`, `fm-prod`, Redis DB 7) showed:
- `robots.txt` allows indexing; canonical, `og:image` and `index, follow` present;
- legal pages without brackets;
- `/v1/features` reports `paidCheckout: false`;
- pricing and marketplace show only "coming soon" notes, with no pay buttons and no page errors;
- the sitemap lists no plots while every showcase is unchecked (the gate working).

**Still needs the owner:** an email provider (production sign-in depends on it), the production database, the cutover itself, the v1 data decision, and the legal review.

## Production bug: avatar spawned at a random location (2026-11-05)

**Cause.** On a first visit the camera flew to a time-zone guess at continent zoom. The avatar was placed the moment a visitor zoomed past City level (6.5), at the map centre wherever they happened to be looking, or at a position saved on the device the same way. So in practice it landed in a random spot, and that spot was saved and reused next time.

**Fix: one spawn order** (`apps/web/src/lib/spawn.ts`, `apps/api/src/lib/start-location.ts`):
1. **Signed-in, returning:** the last saved position. The live hub saves signed-in players' positions to `users.last_lat/last_lng` (migration 0004) at most every 30 s and when the socket closes. Guests are never stored server-side; their live presence keeps its 40 s TTL.
2. **This device:** the last position here (`localStorage`, new key `fm-pos-v2`, so old random positions are ignored).
3. **Approximate:** `GET /v1/me/approx-location` reads Cloudflare's `cf-iplatitude`, `cf-iplongitude`, `cf-ipcity` and `cf-ipcountry` (Managed Transform "Add visitor location headers"). It stores nothing, sends `Cache-Control: private, no-store`, and logs at `warn` level so no IP or coordinates reach the logs. The map starts at City zoom (12) there.
4. **Country centre** (`cf-ipcountry` only; zoom 7 so the avatar is visible).
5. **FlatMeta Home plaza**, next to the HQ landmark. Never a random point. Unknown values (`XX`, Tor `T1`, 0,0, out of range) fall through.

**Precise location:** after an approximate start, a small in-app card asks "Start where you are?". **Use my location** calls `navigator.geolocation` (high accuracy, 8 s timeout), glides the avatar there smoothly (1.4 s ease, or instant with reduced motion), flies the camera along, and remembers the consent. If the browser already allows location, it runs without the card. **Not now** is remembered. Until a precise fix arrives, a pill shows "Approximate location · <city>" (or "Starting at FlatMeta Home") with **Use precise**. The **Locate me** button (renamed from "Find me") uses the same path and explains a blocked permission. A `?at=` link still places the avatar at the linked spot. The privacy policy now describes this.

**Tests:** 7 API tests (fallback order incl. invalid headers; the endpoint for guests, country and home; a signed-in position saved over the socket and used next time; a guest position never saved) and 3 web unit tests (spawn order). New e2e `spawn.spec.ts`, desktop and mobile, with mocked `cf-*` headers and geolocation: approximate start then a glide to the precise spot; "Not now" remembered; country centre; Home plaza; a signed-in player starting at their saved spot on a fresh device; Locate me allowed and blocked. 10/10, three runs in a row; full suite green apart from the two known local-only mock-checkout tests.

## Stripe live-readiness audit (2026-11-09)

No keys or secrets were changed. Checklist and dashboard steps: [docs/stripe-live.md](stripe-live.md).

**Env vars the app reads:**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`;
- `STRIPE_PRICE_{PLUS,BUSINESS,BRAND}_{MONTH,YEAR}` (optional now);
- `STRIPE_LOOKUP_PREFIX` (new, default `flatmeta`), `STRIPE_AUTOMATIC_TAX`, `CURRENCY`;
- `PAID_CHECKOUT_ENABLED`, `PAYMENTS_MOCK`;
- the marketplace and payout limits.

There is no publishable key: checkout is a redirect to Stripe Checkout. `.env.example` now lists and explains all of them.

**Webhook:** `https://<host>/api/v1/stripe/webhook`. Events:
- `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`;
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`;
- `invoice.payment_failed`, `charge.refunded`.

**Found and fixed:**
1. **No guard against a test key on production.** Checkout, the portal and marketplace payouts are now refused (503 `stripe_test_key`), the API logs it at start-up, and every admin page shows a red banner. The details are at `GET /v1/admin/payments-status`: key mode, webhook secret present, where each price comes from, problems. It never returns secrets. Admins are also warned about a live key on staging and a missing or invalid webhook secret.
2. **Failed payments were never reported.** The SDK pins API `2026-10-28`, where an invoice's subscription moved to `invoice.parent.subscription_details`; the handler only read `invoice.subscription`. It now reads both, notifies in-app, and sends one "update your card" email per invoice.
3. **Plan changes made in the customer portal or dashboard were ignored.** The plan was read from metadata written at checkout. It is now read from the subscription's price (env price IDs or lookup keys), with the metadata as a fallback.
4. **Webhook events could be lost.** If handling an event threw, its ID was already recorded, so Stripe's retry was skipped as a duplicate. Now the ID is forgotten and the handler answers 500, so the retry is processed.
5. **Prices:** none were hardcoded. Subscription prices now resolve from `STRIPE_PRICE_*` or by lookup key. The new `npm run stripe:sync` creates the products (`flatmeta_<plan>`) and prices (lookup key `flatmeta_<plan>_<interval>`) from `SUBSCRIPTION_PRICES`. It is a dry run by default; `--apply` creates, a live key also needs `--live`, and `--update-prices` moves the lookup key to a new amount while existing subscribers keep theirs.
6. **Found while testing, unrelated to Stripe:** two DMs sent at once could each create their own unread notification instead of collapsing into one. Fixed with a per-recipient advisory lock.

**Tests:** 11 new tests in `stripe-live.test.ts`, with a fake Stripe client and real signatures:
- key-mode checks and `stripe-sync` planning;
- subscription checkout using the lookup-key price, new customer;
- the portal, and one-time checkout binding;
- bad and tampered signatures rejected;
- subscription create, then a portal interval change, then cancel (back to Free);
- an organisation switched from Business to Brand in the portal;
- failed payment under the current and the old payload shape;
- a failed handling answered with 500, then the retry processed;
- a test key on production blocking checkout, portal and payouts, with the admin status showing it and no secrets.

92 API and 11 web unit tests pass.

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
18. **Email provider:** decided: Resend (integrated 2026-11-04). Still needed: the Resend account, domain verification and keys. Sending domain: `flatmeta.io` for both environments, or a subdomain such as `mail.flatmeta.io` to keep staging and production reputations apart?
19. **Stripe test keys** for staging (secret key, webhook secret, price IDs for Plus/Business/Brand) and Connect for marketplace payouts; then live keys for production.
20. **AI keys:** Anthropic (default text model), and/or OpenAI or Gemini; without them everything falls back to heuristics.
21. **Image provider:** procedural (free, current), OpenAI Images, Google Imagen (`GEMINI_API_KEY`), or the Google Flow file-drop pipeline.
22. **Production cutover from v1 flatmeta.io:** proposed plan — (a) freeze v1 writes and take a MySQL dump; (b) import script: v1 users → v2 users (email, username, verified flag; passwords are not carried: email-code sign-in works), v1 `orders` + `user_boxes` → v2 plots (each v1 area becomes a plot rectangle where its squares form a rectangle, otherwise split into rectangles; images copied to media), v1 marketplace listings → v2 listings or dropped; active PayPal rent subscriptions → decide: grandfather as free land, or convert to one-time Deeds; (c) dry-run on staging with a copy of production data; (d) DNS switch of flatmeta.io to the v2 app, v1 kept read-only at a legacy subdomain for 30 days; (e) email all v1 users. Needs owner decisions on rent subscriptions and on users who rely on v1 passwords.
