# FlatMeta v2 — Kickoff MasterPrompt

> Any agent (Claude Code, Gemini/Antigravity) starting work on FlatMeta v2: read this file and `/tasks.md` first, then continue from the first unchecked task. Keep `/tasks.md` and `/docs/progress.md` updated after every task so another agent can take over at any time.

## Role
You are the lead engineer, product strategist and game-UX designer for the MeWeBe **FlatMeta.io** rebuild. FlatMeta will be marketed through mewebe.com and later grown by its own AI marketing team. The goal is a next-generation, game-like web app that people and brands want to use and pay for.

## Repos & branches
- `MeWeBe-com/flatmeta.io`: the current Ionic + Angular + Leaflet app (Capacitor for iOS/Android).
- `MeWeBe-com/flatmetaAPI`: the current Laravel API and real-time WebSocket server, plus `deploy/README.md` and `deploy/LAUNCH-CHECKLIST.md`.
- All v2 work happens on branch **`v2`**. **Never touch `main` or `develop`.**
- The v2 codebase lives in **`flatmeta.io` on `v2`**, as a monorepo unless the brief justifies otherwise. On `flatmetaAPI`, `v2` only gets a README pointing to the new monorepo, and v1 code is kept for reference.

## What exists today (v1, keep the good parts)
- A shared 2D world on the real map. Your avatar appears where you are, and you can walk around by tap, drag or arrow keys.
- Exactly 3 zoom levels: Land (buy/edit squares), City (roam/meet people) and World (travel).
- Guest-first use, with an email 6-digit code to save. The first 100 squares are free.
- Then $0.10 per square per month via a PayPal subscription.
- One image stretched across many squares. Land gets a name, a /u/ link, a 3-word address, a description, and sandboxed HTML/JS or an embed.
- A marketplace with a 10% fee, nearby and private chat with speech bubbles, connections, pins, search, leaderboard and clans.
- A "Wanted" list in the README: paint tools, territory mini-games, clan alliances, server chat history, and more. Treat this as part of the Phase 2 input.
- Known problem: it's clunky and limited. v2 must be much easier, prettier and more fun, and feel like a game.

## STEP 1 — Audit → `/docs/00-audit.md`
Read all code, READMEs, `deploy/` docs and any briefs in both repos, on every branch. The `refactor/brief-alignment`, `launch-payments`, `upgrade/laravel-12` and `viewport-land-loading` branches may contain plans. Document:
- purpose, stack, data model, APIs and features
- what's broken or clunky, especially the UX
- security issues, especially **committed secrets/tokens/keys**: list them under Open questions as URGENT and remove them from `v2`
- what to keep: grid maths, land logic, map data, pricing, copy and assets

## STEP 2 — Deep research & brief → `/docs/01-brief.md` (+ `/docs/research-notes.md`)
Do deep research and deep thinking: what should FlatMeta be **now**, in a market reshaped and saturated by AI, to win the most traffic and profit?
- **Business models to weigh:** paid land, subscriptions, SaaS for brands, ecommerce, ads, affiliate, sponsorships, or a mix.
- **Comparables:** Million Dollar Homepage, Decentraland, The Sandbox, Earth 2, Upland, Pokémon GO/location games, and ad-map products. Cover what failed (crypto hype, empty worlds, bad UX) and what works.
- **Brief contents:**
  - positioning
  - personas: individuals, creators, local businesses, brands/organisations
  - monetisation and pricing
  - full feature list
  - UI/UX and game-design direction: progression, XP, quests, achievements, leaderboards, rewards, social, and a live, populated world
  - tech stack with reasoning

**Stack preference:** TypeScript, Next.js, Node, Postgres (+ PostGIS if useful), Redis, and MapLibre/deck.gl/Three.js. Self-host on our Ubuntu dedicated server with nginx, PM2 or Docker, and crons/workers on the server. Choose differently only if clearly better, and justify it. Payments: **Stripe** primary, with PayPal kept as an option.

## STEP 3 — MasterPrompts
Write two self-contained build prompts that any agent can execute alone:

### `/docs/02-masterprompt-phase1.md` — about 3 days of agent work: outstanding, payable, production-ready
- **World map:** a beautiful, fast interactive world. Explore, search, and claim or buy land by region and country. Plots get custom imagery, content, links and a mini-page. Keep the guest-first flow and the 3 zoom levels, and make them smoother.
- **Onboarding and game layer:** easy onboarding and a guided first-time tour. Game mechanics: XP, achievements, quests, leaderboards, neighbours, clans.
- **Social:** nearby and private chat, presence, and connections.
- **Payments (Stripe):** plot purchases, upgrades, business subscription tiers, and a marketplace with a platform fee.
- **Accounts and admin:** user and organisation accounts, dashboards, and an admin panel.
- **AI features:**
  - an AI plot designer that generates imagery and copy
  - AI region and plot suggestions
  - AI search
  - AI moderation of images, text and HTML
- **Platform:** a REST API with OpenAPI docs, and an **MCP server** so AI agents can search, view and manage land.
- **SEO:** public pages for plots, regions and countries, plus social share cards.
- **Showcase content:** pre-populate the world with exceptional content for **10–20 well-known companies or organisations per region/country**. Customise imagery and content per region and country to show how the site is used.
  - Build it as an **"unclaimed showcase"** system: plots are clearly labelled as sample/unclaimed, include a **"Claim this land"** sales flow, and an admin can bulk-generate, edit and approve them.
  - Use no real logos and imply no endorsement: brand name plus original AI-generated imagery only.
  - Image generation is pluggable: an external pipeline (Google Flow/Imagen) or an API provider, selected by env vars.
- **Quality:** PWA, mobile-first layout, i18n-ready, and tests (unit, API, e2e smoke).

### `/docs/03-masterprompt-phase2.md` — 2 weeks of work: enterprise-ready final product
- **Deeper game systems:**
  - seasons and events
  - guilds/alliances and territory mini-games
  - paint tools
  - land resale/marketplace with fees
  - rentals
  - plot ads
- **Immersive and creator features:** 3D/immersive plot views and a creator economy.
- **For brands:** campaign tools and analytics, plus an **outreach CRM to sell showcase land back to brands**.
- **Developer platform:** a public API with keys, rate limits and webhooks.
- **AI agents:** an AI growth/marketing agent and an AI support agent.
- **Native apps:** wrappers via Capacitor.
- **Operations:** observability, performance and scale.

## STEP 4 — Build Phase 1
Implement Phase 1 exactly per `/docs/02-masterprompt-phase1.md`, milestone by milestone, following `/tasks.md`.
- `.env.example`, Postgres migrations and seed data.
- Run the showcase generator for at least a first batch of regions; it must also work without an image API key, using placeholder art.
- A README with local dev, API/MCP usage, and full Ubuntu server setup.
- GitHub Actions **CI** (Postgres + Redis, tests, build).
- **Deploy as the last job inside `ci.yml`**, running on push to `v2` after tests pass. Do NOT use `workflow_run` or `workflow_dispatch`: GitHub only honours them from `main`. Use repo secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, `DEPLOY_PATH` (optional `DEPLOY_PORT`); skip with a notice when they're unset.
- **Server (lessons from the Gig Economy deploy):** HestiaCP on Ubuntu 24.04. The app runs as a normal Linux user with Node 22 via nvm and its own PM2, with no root. Make ports configurable via env (`PORT`, `MCP_PORT`, worker health port); 3000, 3010 and 3100 are taken. `deploy.sh` must load nvm and `.env` itself, export `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, default to branch `v2`, and health-check on `$PORT`, because the server's SSH key uses a forced command.
- nginx is served by Hestia's generic **NodeJS** proxy template, which includes a per-domain `nodejs-app.conf` (proxy locations only, no `http`-level directives). Ship a sample of that file in `deploy/hestia/`.
- Build every absolute URL and redirect from `APP_URL`. Never emit `localhost` or `127.0.0.1` in production.
- Include a PM2 ecosystem file, a deploy script and a `docs/deploy-hestia.md` guide.
- Config values: `APP_NAME=FlatMeta`, `PRODUCTION_DOMAIN=flatmeta.io`, `STAGING_DOMAIN=flatmeta.mewebe.net` (placeholder until confirmed).
- Make small, frequent commits with clear messages, and push often.

## Rules
- After every step and milestone, append to `/docs/progress.md`: done, decisions, next.
- Tick tasks in `/tasks.md` as you go: set Owner and Status, commit, and push.
- Never hardcode secrets. Use env vars for Stripe, PayPal, AI (Anthropic/OpenAI/Gemini), maps, image generation, email and storage. Provide deterministic fallbacks when AI keys are missing.
- If a decision is needed from the owner, log it under **Open questions** in `/docs/progress.md` and continue with the most sensible default.
- The original planning gdoc (y3.0 "Logins" tab) may be added later as `/docs/original-brief.md`. Use it if present.
