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

## Open questions

1. The planning gdoc (y3.0 "Logins" tab) is not in the repos. Assumed the login model stays email + one-time code (no passwords), plus optional Google sign-in.
2. The `APP_KEY` committed in the v1 `.env.example` is a real key; rotate it on any server still running v1.
3. **Legal review of showcase plots** (brand names of real companies, no logos, labelled unclaimed): needs a trademark/legal check before public launch. A takedown flow is built in.
4. **Pricing** in the brief ($1–25/cell, Plus $5, Business $29, Brand $249, Landmark claim $990) is a starting proposal; all values are config.
5. **Plot terms:** plots are a licence to display content, not property. Terms of Service need a lawyer.
6. **One-time land vs rent:** v1 charged rent; v2 proposes one-time purchases plus subscriptions. Measure repeat revenue early.
