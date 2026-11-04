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
| [ ] | Verify curated showcase coordinates in admin (written from memory; some may sit a few blocks off) | — | todo |
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
| [ ] | Owner: if `useSession() used outside <Providers>` shows up in `pm2 logs flatmeta-web-staging`, send the stack: it names the component | owner | todo |
| [ ] | Owner: verify chat and notifications on staging with two accounts (steps in docs/progress.md, 2026-11-04 entry) | owner | todo |
| [ ] | Owner: Resend account, verify `flatmeta.io` in Resend (SPF/DKIM/DMARC records in Cloudflare), set `RESEND_API_KEY`, `MAIL_FROM`, `RESEND_WEBHOOK_SECRET` on staging (see docs/deploy-hestia.md → Email) | owner | todo |
| [ ] | Owner: Stripe test keys, products/prices and webhook for staging; live keys later | owner | todo |
| [ ] | Owner: AI keys (Anthropic and/or OpenAI/Gemini) and the image provider choice (procedural, OpenAI, Imagen or the Google Flow file drop) | owner | todo |
| [ ] | Owner: production cutover plan from v1 flatmeta.io, including migrating existing land and users (see progress.md open questions) | owner | todo |
| [ ] | Owner: legal review and fill `[COMPANY NAME]`, `[COUNTRY]`, `[CONTACT EMAIL]` in the legal pages | owner | todo |

## Phase 2: see docs/03-masterprompt-phase2.md. Not started.
