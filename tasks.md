# FlatMeta v2 — shared task list

Single source of truth for all agents and humans. **Rules:** put your name in *Owner* before starting; keep *Status* current (`todo` · `doing` · `done` · `blocked`); tick the box when done and merged into `v2`; add new tasks at the end of the relevant section. Spec: `docs/02-masterprompt-phase1.md` (Phase 1) and `docs/03-masterprompt-phase2.md` (Phase 2). Log decisions and blockers in `docs/progress.md`.

Repos: **web** = `flatmeta.io` · **api** = `flatmetaAPI` (both on branch `v2`).

## Steps 1–3 — Planning

| | Task | Repo | Owner | Status |
| --- | --- | --- | --- | --- |
| [x] | Audit v1 (`docs/00-audit.md`) | web | claude-lead | done |
| [x] | Research + brief (`docs/01-brief.md`, `docs/research-notes.md`) | web | claude-lead | done |
| [x] | Phase 1 masterprompt (`docs/02-masterprompt-phase1.md`) | web | claude-lead | done |
| [x] | Phase 2 masterprompt (`docs/03-masterprompt-phase2.md`) | web | claude-lead | done |
| [x] | Curated showcase data, first batch (GB, US, FR, DE, JP, IN, BR, AE, AU, ES) | api | claude-lead (+ data agents) | done |

## Phase 1 — API (`flatmetaAPI`)

| | Task | Owner | Status |
| --- | --- | --- | --- |
| [ ] | P1-A1 Scaffold: TS, Fastify, config (zod env), logging, docker-compose, ecosystem, .env.example | claude-lead | todo |
| [ ] | P1-A2 DB schema (Drizzle) + migrations + extensions | claude-lead | todo |
| [ ] | P1-A3 Seeds: pricing tiers, countries, featured cities, admin, HQ + demo plots | claude-lead | todo |
| [ ] | P1-A4 Libs: grid, geo (country lookup), pricing/tiers, slug, markdown sanitising, storage, mail | claude-lead | todo |
| [ ] | P1-A5 Auth: email codes, sessions, API keys, Google OAuth (optional), rate limits | claude-lead | todo |
| [ ] | P1-A6 Plots: world bbox, quote, claim, update, publish, media upload, neighbours | claude-lead | todo |
| [ ] | P1-A7 Regions + countries + search (incl. geocoder) | claude-lead | todo |
| [ ] | P1-A8 Game: XP, levels, achievements, quests, leaderboards, check-in | claude-lead | todo |
| [ ] | P1-A9 Social: likes, visits, waves, guestbook, follows, notifications, reports | claude-lead | todo |
| [ ] | P1-A10 Live: activity feed + WebSocket + presence | claude-lead | todo |
| [ ] | P1-A11 Stripe: checkout (land/upgrade/landmark/credits/plans), webhook, portal, mock mode | claude-lead | todo |
| [ ] | P1-A12 Organisations: create, members, invites, verification | claude-lead | todo |
| [ ] | P1-A13 AI layer: text providers, image providers (procedural art), moderation, designer, search intent, suggestions, credits | claude-lead | todo |
| [ ] | P1-A14 Showcase generator + CLI + external image import; run first batch | claude-lead | todo |
| [ ] | P1-A15 Showcase claim + takedown flows | claude-lead | todo |
| [ ] | P1-A16 Admin API (stats, users, plots, moderation, orders/refunds, pricing, showcase, claims, takedowns, audit) | claude-lead | todo |
| [ ] | P1-A17 OpenAPI + Swagger UI | claude-lead | todo |
| [ ] | P1-A18 MCP server (HTTP + stdio) | claude-lead | todo |
| [ ] | P1-A19 Worker: repeatable jobs (expiry, stats, leaderboards, link checks, dormant, image import, cleanup) | claude-lead | todo |
| [ ] | P1-A20 Tests (Vitest, real Postgres/Redis) | claude-lead | todo |
| [ ] | P1-A21 CI + deploy workflow + deploy/backup scripts + README (Ubuntu setup) | claude-lead | todo |

## Phase 1 — Web (`flatmeta.io`)

| | Task | Owner | Status |
| --- | --- | --- | --- |
| [ ] | P1-W1 Scaffold: Next.js 16, Tailwind 4, fonts, design tokens, i18n, API client, ecosystem, .env.example | claude-lead | todo |
| [ ] | P1-W2 UI kit: buttons, chips, sheets, dialogs, toasts, avatar, level ring, XP bar, skeletons, command palette | claude-lead | todo |
| [ ] | P1-W3 Map: MapLibre globe, custom dark/light styles, plot layers, artwork, beacons, hover/click | claude-lead | todo |
| [ ] | P1-W4 Claim mode: grid, drag-select, quote, sign-in dialog, free claim, Stripe redirect | claude-lead | todo |
| [ ] | P1-W5 HUD: XP/level, quest tracker, live ticker, explorers online, toasts, guided tour | claude-lead | todo |
| [ ] | P1-W6 Search (⌘K) with AI intent | claude-lead | todo |
| [ ] | P1-W7 Plot mini-page + JSON-LD + OG image + guestbook/likes/share | claude-lead | todo |
| [ ] | P1-W8 Country / region pages, explore, leaderboards, profiles (user/org) | claude-lead | todo |
| [ ] | P1-W9 Pricing, business landing, legal pages, login | claude-lead | todo |
| [ ] | P1-W10 Dashboard: overview, plots, editor + AI designer, progress, orgs, billing, developers | claude-lead | todo |
| [ ] | P1-W11 Showcase claim wizard + takedown form | claude-lead | todo |
| [ ] | P1-W12 Admin panel | claude-lead | todo |
| [ ] | P1-W13 SEO: sitemap, robots, metadata, canonical | claude-lead | todo |
| [ ] | P1-W14 PWA: manifest, icons, service worker, offline page | claude-lead | todo |
| [ ] | P1-W15 Tests (Vitest + Playwright smoke), CI, deploy workflow, README | claude-lead | todo |
| [ ] | P1-W16 QA pass: a11y, performance, mobile, empty states | claude-lead | todo |

## Phase 1 — Owner actions (humans)

| | Task | Owner | Status |
| --- | --- | --- | --- |
| [ ] | Grant the Claude GitHub App write access to the MeWeBe-com repos (pushes were refused with 403) | owner | blocked |
| [ ] | Add repo secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, `DEPLOY_PATH` in both repos | owner | todo |
| [ ] | Create Stripe products/prices and set the `STRIPE_*` env vars; add webhook endpoint | owner | todo |
| [ ] | Set AI keys (`ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`/`GEMINI_API_KEY`) | owner | todo |
| [ ] | SMTP provider + DNS (SPF/DKIM) for `flatmeta.io` | owner | todo |
| [ ] | DNS: `flatmeta.io`, `www`, `api`, `staging`, `api.staging` → server | owner | todo |
| [ ] | Legal review: terms, privacy, showcase/trademark approach | owner | todo |

## Phase 2 — see `docs/03-masterprompt-phase2.md`

| | Track | Owner | Status |
| --- | --- | --- | --- |
| [ ] | A Game systems: seasons, events, guilds/alliances | — | todo |
| [ ] | B Land economy: marketplace, resale, rentals, plot ads (Stripe Connect) | — | todo |
| [ ] | C 3D / immersive plot views (Three.js, extrusions, deck.gl overlays) | — | todo |
| [ ] | D Brand campaigns + analytics pipeline | — | todo |
| [ ] | E Creator economy: tips, memberships, templates | — | todo |
| [ ] | F Public API platform: keys v2, plans, rate limits, webhooks, SDK, MCP OAuth | — | todo |
| [ ] | G Outreach CRM for showcase → Landmark sales | — | todo |
| [ ] | H AI growth/marketing agent | — | todo |
| [ ] | I AI support agent | — | todo |
| [ ] | J Observability, performance, load testing, scaling, security | — | todo |
