# tasks.md: shared task list (single source of truth)

**How to use:** read `docs/00-kickoff-masterprompt.md` first, then pick the first unchecked task.
1. Set Owner to your agent/session name and Status to `in-progress`, then commit.
2. Do the work.
3. Tick `[x]`, set Status to `done`, then commit and push.

Status values: `todo` · `in-progress` · `done` · `blocked (reason)`. Once `docs/02-masterprompt-phase1.md` exists, it is the spec for every Phase 1 item; section numbers are in brackets (§12 is the kickoff alignment and wins over earlier sections).

Owner `claude` = Claude Code cloud session `01LEq4cqBwnNj9v3GR8k2J4p`.

> **Push status:** the Claude GitHub App has no write access to `MeWeBe-com/*`: `git push` and the GitHub API both return 403. Commits are kept on local `v2` (with git bundles as a backup); see `docs/progress.md` → Open questions.

## Phase 0: Docs
| ✓ | Task | Owner | Status |
|---|------|-------|--------|
| [x] | Audit both repos (all branches) → docs/00-audit.md | claude | done (§8 covers the extra branches) |
| [x] | Remove committed secrets from v2 branches; list them as URGENT in progress.md | claude | done (one: v1 `APP_KEY`; not present on v2) |
| [x] | Deep research + brief → docs/01-brief.md, docs/research-notes.md | claude | done (§13 aligns it with the kickoff) |
| [x] | Phase 1 masterprompt → docs/02-masterprompt-phase1.md | claude | done (§12 kickoff alignment) |
| [x] | Phase 2 masterprompt → docs/03-masterprompt-phase2.md | claude | done (scope note added) |
| [x] | Expand Phase 1 tasks below with section refs from the masterprompt | claude | done |

## Phase 1: MVP (about 3 days)
Staging fixes (2026-11-02): web/API/worker bound to `HOST`; deploy installs devDependencies; Hestia fallback conf; on-screen sign-in codes and fake checkout on staging only; AI and art fall back without keys.

Status note: milestones M1–M12 were first built **before** the kickoff file was visible, as two repos. Rows marked *(rework)* are built but must change to match the kickoff (monorepo, ports, `APP_URL`); rows marked *(new)* were missing.

| ✓ | Task | Owner | Status |
|---|------|-------|--------|
| [x] | M1 Monorepo scaffold (`apps/web`, `apps/api`, `packages/shared`), typed config, root `.env.example`, `APP_URL`/`STAGING_DOMAIN`/port env, flatmetaAPI pointer [§12.1] | claude | done |
| [x] | M1 DB schema + migrations (users, orgs, plots/tiles, regions, listings, orders, subscriptions, XP, quests, achievements, chat, showcase) [§3, §12.3–12.5] | claude | done (migrations 0000–0002: 40+ tables incl. listings, ledger_entries, payout_accounts, connections, chat_messages, clans) |
| [x] | M1 Seed data: regions/countries, demo users, plots (listings come with the marketplace task) | claude | done |
| [x] | M2 Auth: guest-first identity, email code, password, sessions, API keys [§12.1] | claude | done (guests explore and appear anonymously; email code; optional scrypt password; sessions; `fm_live_` API keys) |
| [x] | M2 Land service: grid maths, claim, edit, image across tiles, 3-word address, /u/ links, sandboxed HTML [§2, §12.6] | claude | done (custom HTML only in a CSP-wrapped sandboxed iframe, screened, Plus+; `/u/<plot>` redirects to `/p/<plot>`) |
| [x] | M2 Marketplace: list, buy, sell, platform fee, ledger [§12.4] | claude | done (API + web: /marketplace, sell/buy on plot pages, balance and payouts in Billing, admin overview) |
| [x] | M2 Payments: Stripe checkout, subscriptions, webhooks (PayPal adapter optional) [§12.4] | claude | done (Stripe + mock behind a PaymentProvider interface; PayPal documented, not built) |
| [x] | M2 Real-time: presence, avatars, nearby + private chat, connections [§12.3] | claude | done (Redis geo presence, viewport avatars, chat with moderation, connections and blocking) |
| [x] | M2 Game layer: XP, levels, quests, achievements, leaderboards, clans [§2.4, §12.5] | claude | done (36 achievements incl. clan and marketplace ones; clans with roles, leaderboard, clan chat) |
| [x] | M3 AI layer: provider adapters + plot designer (image + copy), suggestions, AI search, moderation + fallbacks [§5] | claude | done |
| [x] | M3 Showcase system: generator for 10–20 brands per region, "unclaimed" labels, Claim-this-land flow, admin bulk approve [§2.5] (140 plots, 14 per country, 10 countries) | claude | done |
| [x] | M3 Core tests (land maths, payments, ledger, auth, moderation) [§9] | claude | done (50 API tests: marketplace ledger and refunds, realtime, clans, passwords, HTML screening, plus the earlier suite; 8 web unit tests) |
| [x] | M4 REST API + OpenAPI docs + rate limits [§4] | claude | done |
| [x] | M4 MCP server (search/view/manage land) + tests [§6.1] | claude | done |
| [x] | M5 Web: design system, map/world (MapLibre/deck.gl), 3 zoom levels, smooth avatar movement [§7, §12.2–12.3] | claude | done (World/City/Land switch, avatars with smooth movement, tap and arrow-key walking, bubbles; deck.gl is Phase 2) |
| [x] | M5 Web: onboarding + guided tour, plot editor, AI designer UI, search | claude | done |
| [x] | M6 Web: marketplace, checkout, dashboards (user + org), game HUD, chat UI [§12.3–12.5] | claude | done (marketplace, clans, chat and friends panel, settings with avatar and password) |
| [x] | M7 Admin panel: users, moderation queue, showcase manager, payments, settings, audit | claude | done (incl. marketplace: volume, fees, seller balances, manual payouts, void listing) |
| [x] | M8 SEO: plot/region/country pages, share cards, sitemap, JSON-LD [§6.2] | claude | done |
| [x] | M8 PWA, mobile-first QA, i18n-ready [§7.4] | claude | done |
| [x] | M9 Worker: crons (subscriptions, showcase generation, digests, cleanup) [§8] (marketplace payouts and chat cleanup join under their tasks) | claude | done |
| [x] | M10 Run showcase generator for a first batch of regions | claude | done |
| [x] | M11 Playwright e2e smoke (guest → claim → pay → edit, showcase claim) | claude | done (8 specs × desktop and mobile; found and fixed a real sign-in bug) |
| [x] | M11 CI workflow (ci.yml) with a final deploy job on push to v2. Do NOT use workflow_run/workflow_dispatch (they only work from main) [§12.7] | claude | done (one ci.yml: test + e2e, then deploy; skips with a notice when the secrets are unset) |
| [x] | M11 PM2, server scripts, README + HestiaCP guide (NodeJS proxy template, configurable ports, APP_URL-based redirects) [§12.7] | claude | done (ecosystem.config.cjs, scripts/deploy.sh, deploy/hestia/nodejs-app.conf, docs/deploy-hestia.md, README; PM2 stack verified locally) |
| [x] | M12 Polish: a11y, Lighthouse, copy, performance | claude | done (mobile Lighthouse on a plot page: performance 87, accessibility 100, best practices 100, every SEO audit passes except the intentional noindex outside production) |
| [x] | flatmetaAPI v2: README pointing to the new monorepo (`V2.md`, added by the owner) | owner | done |

## Follow-ups found during the build
| ✓ | Task | Owner | Status |
|---|------|-------|--------|
| [ ] | End-to-end Stripe test-mode run with real keys (tested so far: mock checkout and signed webhook payloads) | — | todo |
| [ ] | Check every showcase location in Admin → Showcase locations (tooling done; an automatic check of all 140 curated entries found no wrong coordinates; production hides unchecked plots) | owner/admin | todo |
| [ ] | Self-host map tiles (PMTiles) and the geocoder before heavy traffic | — | todo |
| [ ] | Translate `messages/en.json` when a second locale is chosen | — | todo |
| [ ] | Owner: rotate the v1 Laravel `APP_KEY` (URGENT, see progress.md) | owner | todo |
| [x] | Owner: grant the Claude GitHub App write access to `MeWeBe-com/flatmeta.io` and `flatmetaAPI` | owner | done (2026-11-02) |
| [x] | Owner: set `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, `DEPLOY_PATH` (and optional `DEPLOY_PORT`) repo secrets | owner | done: push to v2 deploys staging |
| [x] | Owner: staging server live at https://staging.flatmeta.io (HestiaCP, user `najamussaqib`, web 3200 / api 3201 / worker 3203, deploy via forced-command SSH key) | owner | done |
| [x] | Email provider: Resend integrated (`apps/api/src/email`: templates, Resend/SMTP/log providers, worker queue with retries and rate limits, Svix-verified webhook suppressing bounces and complaints, tests with a mocked client) | claude | done (2026-11-04) |
| [x] | Staging bug: live chat (nearby, DM, clan) not reaching the other player. Cause: chat panel crashed the page on open (an effect returned the Promise that `scrollIntoView` now returns in Chromium); DM threads keyed by ids until the friends list loaded; clan chat used the clan known at connect time | claude | done (2026-11-04) |
| [x] | Staging bug: follow / connection request / accept / DM / clan invite gave the recipient no notification. Server: every one stores a row and pushes a WS event (DMs collapse per sender while unread); client: handles `notification` events with a toast, a bell with the unread count and a list (Accept for requests, Reply for messages) in the map and site headers | claude | done (2026-11-04) |
| [x] | WS fan-out: explicit per-user `<REDIS_PREFIX>:notify:<userId>` subscription on connect (ref-counted, released on close, re-made after sign-in through the socket reconnect); channel names shared by API and worker; `clan_changed` signal re-routes clan chat without a reload | claude | done (2026-11-04) |
| [x] | Guests: clear sign-in prompts before chat, follow and connect (chat panel, peer card); guest avatars explain why they can't be followed | claude | done (2026-11-04) |
| [x] | Debug logs (`LOG_LEVEL=debug`, `live:` messages for subscribe, publish, deliver) and `GET /v1/live/health` (sockets, user channels, Redis round trip) | claude | done (2026-11-04) |
| [x] | Two-player e2e (`social-live.spec.ts`: nearby, DM + unread, follow + request + accept notifications, clan chat, guest prompt); CI now runs e2e and the worker behind `scripts/edge-proxy.mjs`, which routes `/api` and the WebSocket like nginx | claude | done (2026-11-04) |
| [x] | Staging bug (after 4b4b88d): "This page couldn't load" + `useSession outside provider` in the web log when opening/sending a DM. Not reproducible locally (every hook caller is under the root providers; deploy-overlap scenarios tried). Hardened: `useSession`/`useGame`/`useLive` fall back to a guest/inert context and log once with a stack instead of throwing; error boundaries around chat, peer card and the bell; `app/error.tsx` and `app/global-error.tsx`; profile pages gained Message | claude | done (2026-11-04) |
| [x] | Staging bug (after 4b4b88d): ioredis `Connection is closed` (with `previousErrors`) in the API around DM requests. Fixed: separate long-lived publisher and subscriber clients, reconnect forever with capped backoff and logged drops/reconnects, named connections, bounded retries for commands, rate limiter skips on Redis errors, nothing touches Redis after shutdown starts (socket close handlers, timers), ordered shutdown; ghost avatars after reloads removed. Test kills the pub/sub connections and publishes after the reconnect | claude | done (2026-11-04) |
| [x] | Staging bug: clicking anywhere on an avatar's row opened that player's card. Cause: `.fm-avatar { position: relative }` overrode MapLibre's absolute marker positioning, so each marker was a full-width block. Fixed: markers stay absolute and shrink-wrapped; only the face takes clicks (44 px target); wrapper, name and bubble pass clicks to the map. e2e `avatar-hit.spec.ts` (desktop + mobile) | claude | done (2026-11-04) |
| [ ] | Owner: if `useSession() used outside <Providers>` shows up in `pm2 logs flatmeta-web-staging`, send the stack: it names the component | owner | todo |
| [ ] | Owner: verify chat and notifications on staging with two accounts (steps in docs/progress.md, 2026-11-04 entry) | owner | todo |
| [ ] | Owner: Resend account, verify `flatmeta.io` in Resend (SPF/DKIM/DMARC records in Cloudflare), set `RESEND_API_KEY`, `MAIL_FROM`, `RESEND_WEBHOOK_SECRET` on staging (see docs/deploy-hestia.md → Email) | owner | todo |
| [x] | Stripe live-readiness audit: test key on production refused (checkout, portal, payouts) with an admin banner; prices from env or lookup keys created by `npm run stripe:sync` (no hardcoded IDs); plan read from the price (portal changes); `invoice.payment_failed` fixed for the current API (`invoice.parent`) + email; failed webhook handling retried by Stripe instead of skipped; duplicate DM notifications race fixed; docs/stripe-live.md | claude | done (2026-11-09) |
| [ ] | Owner: Stripe test keys + webhook on staging, rehearse docs/stripe-live.md in test mode; then live keys, `stripe:sync --apply --live`, live webhook, `PAID_CHECKOUT_ENABLED=true`, live smoke test | owner | todo |
| [ ] | Owner: AI keys (Anthropic and/or OpenAI/Gemini) and the image provider choice (procedural, OpenAI, Imagen or the Google Flow file drop) | owner | todo |
| [ ] | Owner: production cutover plan from v1 flatmeta.io, including migrating existing land and users (see progress.md open questions) | owner | todo |
| [ ] | Owner: legal review of terms, privacy and refunds (placeholders now come from `COMPANY_NAME`, `COMPANY_COUNTRY`, `CONTACT_EMAIL`; defaults MeWeBe, United Kingdom, hello@flatmeta.io) | owner | todo |

## Go-live (2026-11-05): see docs/go-live.md
| ✓ | Task | Owner | Status |
|---|------|-------|--------|
| [x] | Production mode: `APP_ENV=production` refuses mock checkout and on-screen codes; `PAID_CHECKOUT_ENABLED` (auto = off in production) blocks plans, paid land, boosts, AI packs, marketplace and Landmark checkout with "coming soon" (API 403 `coming_soon` + web notices); free land up to `FREE_LAND_CELLS` (100) per person/organisation; showcase claims become leads (admins emailed) | claude | done |
| [x] | Legal pages filled from env (no brackets); cookie notice when Plausible is on; privacy section on cookies and analytics | claude | done |
| [x] | Admin → Showcase locations: bulk check/uncheck, nudge (move keeping size), automatic suspect flags; unchecked showcase plots hidden publicly in production (map, lists, search, counts, sitemap, plot page) | claude | done |
| [x] | Launch SEO: production robots/sitemap allow indexing, `noindex` elsewhere, canonical URLs on all public pages, site-wide OG image, 404/500 pages | claude | done |
| [x] | Production instance: `scripts/new-instance.mjs` (ports 3250/3251/3253, Redis DB 7, `fm-prod`, media under `flatmeta.io/private/uploads`, nginx files rendered), PM2 `flatmeta-*-production`, `deploy.sh production` by hand only; docs/go-live.md with cutover, smoke checks, 1-minute rollback; CI builds the web app with production settings too | claude | done |
| [x] | Production bug: avatar spawned at a random spot (the map centre at whatever zoom the visitor reached). Fixed spawn order: signed-in saved position → this device → Cloudflare approximate location (`GET /v1/me/approx-location`, nothing stored or logged) → country centre → FlatMeta Home plaza; "Start where you are?" prompt, precise geolocation (high accuracy, 8 s) glides the avatar there and the consent is remembered; Locate me uses the same path; approximate-location note. Unit + e2e (mocked geolocation and cf-* headers, desktop + mobile) | claude | done (2026-11-05) |
| [ ] | Owner: email provider for production (Resend, or the server's own SMTP as a stop-gap). **Blocks sign-in**: production never shows codes on screen | owner | todo |
| [ ] | Owner: create the `flatmeta_prod` database and user, run `new-instance.mjs` + first `deploy.sh production` + `npm run setup` (go-live.md §1) | owner | todo |
| [ ] | Owner: cutover on Hestia (record v1 templates, install include files, switch proxy template; go-live.md §2–3) | owner | todo |
| [ ] | Owner: decide what happens to v1 users and land (v2 starts with a fresh database; see progress.md item 22) | owner | todo |

## Release: growth + gamification (boss brief, 11 Nov 2026)
Live at https://www.flatmeta.io (branch `v2`; CI deploys on green). One commit per task ID. `[!]` = blocked, with the reason.

**P0: today**
- [x] **G1** Growth analysis → `docs/growth-analysis-2026-11.md` (AI market, funnel and leaks, top 10 changes ranked; G15+ quick wins). *Done: biggest leaks are the empty first visit (G3) and no share loop (G5); G15a–c added.*
- [x] **G2** Security headers on the web app: nonce-based CSP (Next.js + map tiles), `frame-ancestors 'none'`, X-Frame-Options DENY, HSTS 1 year + subdomains, nosniff, Referrer-Policy; e2e header check; map, Stripe checkout and WebSockets still work *Done: `apps/web/src/proxy.ts` sends a per-request nonce CSP (pages render per request); headers on every response from `next.config`; owner HTML now loads from `/api/v1/plots/:id/sandbox` with `CSP: sandbox allow-scripts` (srcdoc would inherit the page CSP); e2e `security-headers.spec.ts`.*
- [x] **G3** Empty map, part 1: admin bulk "verify all showcase locations that passed the automatic check" + CLI (no auto-publish in production; command in the report); map shows the nearest showcase/landmark plots around the visitor's start *Done: `npm run showcase:verify` (dry run; `-- --apply` to publish) + Admin → Showcase locations → "Verify all that passed the automatic check"; `GET /v1/plots/nearest` + "Nearby on FlatMeta" card next to the welcome card. Not applied in production: the command is in RELEASE-REPORT.md.*
- [x] **G4** SEO and canonical host: robots.txt and sitemaps on www.flatmeta.io; `sitemap-plots.xml` (sitemap index) with every public plot; per-plot OpenGraph/Twitter images and titles; JSON-LD (Place / Organization); canonical URLs *Done: canonical origin = www when production runs on the bare domain (`CANONICAL_URL` overrides); robots.txt → `/sitemap-index.xml` (+ the insights `/sitemap.xml`); `/sitemap-pages.xml` and paged `/sitemap-plots.xml` with cover images; Twitter image route; showcase JSON-LD `Place` about the `Organization`; e2e `seo.spec.ts`.*
- [x] **G5** Share links: owner handles → `/@handle` and `/@handle/{plot-slug}`; copy link, native share, WhatsApp/X/Facebook/LinkedIn on the plot page and dashboard; "Visit" deep link flies the map there and spawns the avatar next to it; reserve handles matching showcase companies *Done: username = handle; `/@handle` → main plot (or profile), `/@handle/{slug}` → that plot (404 if not theirs); handles matching showcase companies, organisations and system names are reserved (`GET /v1/handles/:h`, `/available`); SharePanel (copy, native, WhatsApp/X/Facebook/LinkedIn) on the plot page and dashboard; `/?visit=slug` flies there and spawns the avatar beside the plot; e2e `share-links.spec.ts`.*
- [x] **G6** Visitor counter: unique visits per plot (no IP storage), "visitors today / this week" on the plot page and owner dashboard *Done: visitors are a SHA-256 of a daily-rotating random salt + account or IP/browser (no IP stored, the old raw-IP Redis key is gone); HyperLogLog uniques per day/week; owners and bots excluded; `GET /v1/plots/:id/visitors`; shown on the plot page and in the plot editor.*

**P1: today if time allows**
- [x] **G7** Personalise land: image uploads (type/size checks, EXIF stripped, resized, media dir), cover, colours, title, description, links, small gallery; edit rate limits *Done: uploads already decoded, type-checked (JPG/PNG/WebP/GIF, 8 MB, ≤12k px), re-encoded to WebP ≤1600 px under the media dir; now tested to drop EXIF/GPS and refuse SVG. Added: remove one gallery image, edit rate limit 30/min + 300/day, uploads 60/day.*
- [x] **G8** Custom HTML/JS in plots, secure: sandboxed iframe (`allow-scripts` only) on a separate origin (usercontent.flatmeta.io) with its own strict CSP and `connect-src` allowlist; 200 KB limit; versioned saves; report + moderation queue; admin kill-switch per plot and global; automated scan + manual review of the first publish; Hestia subdomain steps
  - Done: `USERCONTENT_URL` origin serves only sandbox documents (the site host refuses them, the usercontent host drops cookies); drafts preview via short-lived tokens; versions + restore; first publish waits in **Admin → Custom HTML**; per-plot and global kill-switches; 3 reports pause it; scan blocks miners, password/card forms and non-allowlisted script/connect hosts; e2e proves no cookies, storage, parent access or top navigation. Hestia steps in `docs/deploy-hestia.md` (needs root: see RELEASE-REPORT.md).
- [x] **G9** Walk mode upgrade: WASD/arrows + on-screen joystick, smooth movement across plots, avatar styles, emotes, nearby players live, proximity chat bubbles, block/report, profanity filter, rate limits, signed-in chat only, smooth on mobile
  - Done: WASD + arrows, touch joystick (pointer: coarse), 8 emotes over avatars (fixed set, 1 per 1.5 s, delivered within 2 km), 5 avatar styles (Settings), swear words masked in public chat, blocks now hide avatars, nearby chat and emotes both ways live; existing slow mode (5/10 s), sign-in-only chat and message reports kept. API + e2e tests (two players, phone joystick). CI browser install retries apt mirror failures.
- [x] **G10** Plot events and hangouts: "open house" times with visitor notifications; "people here now" count on the map
  - Done: owners schedule open houses in the editor (15 min–4 h, up to 60 days ahead, 5 upcoming, no overlaps); visitors press “Notify me”; a worker job (every minute) notifies them and the owner’s followers once, 10 min before; “N people here now” on the plot page and plot card (live presence, counts only); “Happening now” card on the map. API + e2e tests. Fixed: the map’s left column could cover the Locate me button.
- [ ] **G11** Growth loop: share prompt after a free claim; referral (both get a bonus cell when the invitee claims); weekly owner email (visits, neighbours, messages) via Resend, with unsubscribe
- [ ] **G12** Company land automation: daily worker job sourcing large companies with public HQ coordinates from Wikidata (source + licence stored); top 50 × 10 more countries, then N per day; generic industry artwork (no logos), welcome scene, showroom layout, "Claim this land"; "Reserved for {Company}, not affiliated with FlatMeta"; claim by email domain or DNS TXT → Brand checkout; takedown within 48 h; hidden until the location check passes; `/brands` directory and per-company pages in the sitemap
- [ ] **G13** Pricing and profit: review plans against G1; implement the top paid upsell with Stripe; admin metrics page (signups, claims, paid conversions, revenue per day)
- [ ] **G14** AI-native: plots, search and claim through the API/MCP for AI agents; `llms.txt`; "Ask FlatMeta" search on the map (AI with a no-AI fallback)

**P2: then**
- [ ] **G15+** Extra quick wins from G1: G15a fix positioning in llms.txt and insights (about/facts page); G15b welcome AI crawlers in robots.txt; G15c WebSite + SearchAction JSON-LD
- [ ] **G-final** `RELEASE-REPORT.md`: what is live (URLs), what is left and why, test results, production smoke test, manual steps (showcase verify command, usercontent subdomain on Hestia, env vars)

## Phase 2: see docs/03-masterprompt-phase2.md. Not started.
