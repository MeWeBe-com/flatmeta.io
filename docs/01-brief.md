# 01 — FlatMeta v2 Product Brief

*Date: 2026-10-28 · Owner: lead engineer / product (Claude) · Status: proposed, pending owner review · Sources: `00-audit.md`, the v1 brief summarised in `FlatMeta_PROJECT_CHECKLIST.html`, and the market research in §2.*

---

## 1. The one-paragraph version

**FlatMeta is the world map you can own a piece of.** Anyone can claim a plot of the real world, the street they live on, the block their shop is on or a corner of a city they love, and make it theirs in under a minute with an AI designer that paints the plot and writes its page. Every plot is a beautiful tile on a shared living map and a fast, indexable mini-page that people, search engines and AI agents can find. A game layer (XP, quests, achievements, leaderboards, neighbours) gives people a reason to come back. Businesses and brands pay to stand out where their customers are. It's fiat-only, with no crypto, no speculation and no empty worlds: the map launches full of showcase content, and every action on it is visible live.

**Tagline options:** "Own your corner of the world." · "Claim it. Make it yours. Get found." · "The map that's made by its people."

## 2. Market reading: what failed, what works

> Full notes with sources: `docs/research-notes.md`. Numbers are rounded; some are third-party estimates.

**What failed:**

- **Crypto virtual land (Decentraland, The Sandbox, Earth 2).** Land was sold as an *investment*. When speculation ended, prices fell more than 90% from the 2021–22 peaks, and the worlds were empty: daily users in the hundreds to low thousands, against billion-dollar valuations. Every one of them had heavy onboarding (wallets, downloads, 3D clients) and nothing to *do* once you owned land. Earth 2 sold fiat tiles on a real-world map (from $0.10/tile, prices rising per country as tiles sold) and grew on referral commissions, but five years in it was still pre-alpha: a "cash shop without a game", with persistent Ponzi criticism and withdrawal complaints. The Sandbox cut more than half its staff in August 2025; average land prices fell ~95%.
- **Metaverse-as-a-place products** competed with games that have billions in content budgets, and lost.
- **v1 FlatMeta** repeated the same pattern at smaller scale: an empty map, a confusing recurring rent, and a "metaverse" framing.

**What works:**

- **The Million Dollar Homepage (2005)** was simple, finite, legible ("$1 a pixel") and *funny*, so the press did the marketing. It grossed $1,037,100 and sold out in about 138 days. Its weaknesses: a one-off with nothing to do afterwards, and **link rot** (≈40% of links dead by 2019): a static canvas becomes a graveyard without upkeep.
- **Reddit r/place (2017/2022/2023) and wplace.live (2025)** show that a collaborative canvas, especially *on the real world map* (wplace), goes massively viral: tribes form around places (my city, my country, my fandom), and every screenshot is an ad. wplace reached 1M users in 4 days and ~10.6M by September 2025, monetised with $5–100 packs of paint currency, and fought bots, griefing and server collapse.
- **Location games and contribution systems** (Pokémon GO sponsored locations, Foursquare/Swarm mayorships and badges, Google Maps Local Guides levels, GeoGuessr's subscription) prove that *place + progression + status* retains people for years, and that brands pay to be part of the map (Pokémon GO sponsored locations at under $0.50 per daily visitor; Waze local ads from ~$60/month; Snap Map Promoted Places). GeoGuessr reached ~$45M revenue in 2025 on subscriptions alone. Foursquare's usage collapsed when it removed mayorships and badges: progression matters.
- **Link-in-bio tools** (Linktree: $8/$15/$35 per month tiers, ~$60M revenue est.) prove that people and small businesses will pay a few dollars a month for a simple page that represents them.
- **Brand worlds** in Roblox and Fortnite show that big brands budget six- to seven-figure sums for *engaging* placements, but only where an audience already is.

**The 2026 context: AI saturation.** Generated content is effectively free and infinite, so feeds are flooded and generic. What stays scarce is **attention, identity, verified real-world place and community**. At the same time **AI answer engines and agents** (ChatGPT search, Google AI Mode, Claude, Gemini, and MCP-connected agents) increasingly decide which local businesses people find, and they reward clean, structured, trustworthy entities. Consumers using AI for local recommendations rose from 6% to 45% in a year (BrightLocal 2026), while only ~8% of searches with an AI Overview lead to a link click. MCP is now Linux Foundation infrastructure, so agent access is table stakes, but *being an AI-readable profile for a real place* is a genuine selling point.

**Where FlatMeta wins:** combine the *virality of a world-map canvas*, the *legibility of the Million Dollar Homepage*, the *retention mechanics of location games*, and the *utility of a link-in-bio/local-business page*, with AI removing all creation friction and an MCP/API layer making every plot readable by agents. None of the comparables does all of that.

## 3. Positioning

- **Category:** a *living world map of people, places and brands*. A social canvas and local discovery layer, not a metaverse and not an NFT.
- **For individuals:** "Claim your street. Make it beautiful. Climb the ranks."
- **For creators:** "Your link-in-bio, on the world map."
- **For local businesses:** "Be the place people and AI find on the map." A verified, structured business plot with offers, hours and contact, with schema.org data and MCP visibility.
- **For brands and organisations:** "Own your territory on the world's playful map." Flagship plots, multi-city portfolios, quests and campaigns (Phase 2).
- **What we never say:** investment, returns, scarcity *value*, "metaverse real estate". Plots are a **digital product with a licence to display content**, not property or securities (Terms to state this; see Open questions).

**Principles:** (1) value in 10 seconds without an account; (2) never an empty screen; (3) every action is shareable; (4) AI does the work, humans get the credit; (5) fun first, pay for status and reach, never pay-to-win; (6) honest labelling, especially for showcase and sponsored content.

## 4. Personas

| Persona | Who | Jobs to be done | What they pay for | Acquisition channel |
| --- | --- | --- | --- | --- |
| **Explorer** | 16–40, casual gamer, map lover, proud of their city | Explore a beautiful world, claim "my place", show friends, compete with their city or country | Mostly free; Plus for cosmetics and more AI designs; occasional extra cells | Social shares, TikTok/Shorts, "my city vs yours" leaderboards, Reddit |
| **Creator** | Artist, streamer, musician, indie maker | A striking presence that links to their work; fans visit and leave guestbook notes | Plus or Creator plan, Spotlight boosts, premium plot sizes | Their own audience; share cards; "creators of London" lists |
| **Local business** | Café, gym, salon, shop, agency, venue | Be found locally, look great, capture leads, appear in AI answers | **Business plan** ($29/mo), Spotlight, extra plots | Local SEO pages, "claim your business plot" outreach, agencies, mewebe.com |
| **Brand / organisation** | National and global brands, tourism boards, universities, museums, NGOs, sports clubs | Flagship territory in key cities, campaigns and quests, community engagement, measurable traffic | **Brand plan** ($249/mo+), showcase claim, sponsored quests and events (Phase 2) | Showcase-to-claim outreach CRM (Phase 2), case studies, PR |
| **Agent / developer** (secondary) | AI agents, integrators | Search plots/places, manage a portfolio programmatically | API/MCP via plans; paid API tiers in Phase 2 | MCP registries, docs |

## 5. Monetisation and pricing

All prices live in config (`pricing` table + Stripe Price IDs in env), so they can be changed without a deploy. USD at launch; Stripe handles tax (Stripe Tax) and local currencies later.

### 5.1 Land (one-time purchase: a "Deed")

The world is divided into the v1 grid of **cells** (40 px at zoom 15: ≈120–190 m). A **plot** is a rectangle of cells (1×1 up to 10×10 for individuals, up to 20×20 for Business/Brand). Price = Σ cell price by **zone tier**:

| Tier | Where | Price per cell |
| --- | --- | --- |
| **S — Icon** | Within ~2.5 km of the centre of ~25 world-icon cities (London, NYC, Paris, Tokyo, Dubai…) | $25 |
| **A — Prime** | Within ~8 km of ~150 major cities | $9 |
| **B — City** | Within ~25 km of those cities | $4 |
| **C — Land** | Everywhere else on land | $2 |
| **O — Ocean** | Water (the v1 brief asked for sea plots) | $1 |

- **Free Homestead:** every verified account can claim **one free plot of up to 2×2 cells in tiers B/C/O, or 1 cell in tier A** (none in S). This is the v1 "first 100 squares free" hook in a form that doesn't hand away the map.
- **Showcase plots** (pre-made for well-known organisations) are claimable only by that organisation after verification, at a **Landmark price** ($990 one-time, includes 3 months of Brand) or included with an annual Brand plan.
- **Upgrades (one-time):** *Spotlight* (featured in its region and country, glowing on the map for 7 days) $9 · *Beacon* (24 h pulse visible from world zoom) $3 · *AI Design Pack* (+25 AI designs) $5 · *Expand* (add adjacent cells to an existing plot, priced per cell).
- Plots are held for as long as the service runs, with fair-use and content rules. No rent (rent was the most confusing part of v1). Resale and rentals come in Phase 2 with a 10% fee.

### 5.2 Subscriptions

| Plan | Price | For | Includes |
| --- | --- | --- | --- |
| **Free** | $0 | Everyone | Homestead plot, mini-page, 3 AI designs/month, quests, leaderboards |
| **Plus** | $5/mo or $48/yr | Explorers, creators | 30 AI designs/mo, custom slug, animated frames and cosmetic effects, visit analytics, up to 10 plots, 10% off cells, Plus badge |
| **Business** | $29/mo or $290/yr | Local businesses | Verified business badge; business mini-page (hours, offers, contact/lead form, booking link, schema.org `LocalBusiness`); "Open now" map marker; 1 Spotlight/month; leads inbox; analytics; 100 AI designs/mo; 3 seats; organisation account |
| **Brand** | $249/mo or $2,490/yr | Brands, organisations | Everything in Business; multi-region portfolio (up to 100 plots); showcase claim eligibility; brand verification; 10 seats; API and MCP access with higher limits; priority support; campaign tools (Phase 2) |
| **Enterprise** | Custom | Large brands, tourism boards | SSO, custom quests/events, dedicated support, SLAs (Phase 2) |

**Never pay-to-win:** XP, levels and leaderboards cannot be bought. Paid plans buy reach, tools and cosmetics.

### 5.3 Other revenue (mostly Phase 2)

- **Marketplace resale and rentals:** 10% fee (Stripe Connect).
- **Sponsored quests and events:** brands sponsor a quest ("Explore 5 riverside plots in Lisbon") or a seasonal event. $2k–$50k per campaign.
- **Plot ads:** native, clearly labelled "Sponsored" cards in discovery and search. CPM/CPC, self-serve for Business plans. **No display ads** anywhere.
- **Affiliate:** opt-in affiliate links on plots via partner programmes (FlatMeta takes nothing from users' own links).
- **API tiers:** free developer tier; paid tiers for volume (Phase 2).

### 5.4 Why this mix

- One-time land purchases mirror the Million Dollar Homepage's clarity and produce cash from launch.
- Subscriptions (Business especially) are where durable revenue is. A local business already spends $20–$100/month on its online presence; FlatMeta has to be the best-looking and most fun option, and the one AI agents read.
- Brand revenue is lumpy but large, and the showcase system is the sales engine for it.
- Ads are last because they degrade the experience and need scale.

**Illustrative year-1 scenario** (an assumption for planning, not a forecast): 150k registered users; 2.5% on Plus ($5) → ~$225k ARR; 600 Business ($29) → ~$210k ARR; 15 Brand ($249) → ~$45k ARR; land and boosts ~$120k. Total ≈ **$600k**. Sensitivity is dominated by Business conversion, so local-business acquisition is the growth priority after the viral launch.

## 6. Full feature list

**P1** = Phase 1 (≈3 days of agent work, production-ready) · **P2** = Phase 2 (≈2 weeks, enterprise-ready) · **L** = later.

### 6.1 World and map
- P1 Fast, beautiful MapLibre map with smooth zoom, a globe at world zoom, custom dark "night" and light "day" styles, and plots rendered as glowing tiles that turn into their artwork as you zoom in.
- P1 Plot layers: owned plots (artwork at zoom ≥ 13, coloured tiles below), showcase plots (dashed gold outline, "Sample" chip), for-claim highlight, my plots, neighbours.
- P1 Claim mode: a cell grid appears at zoom ≥ 14; drag to draw a rectangle; live price, tier and availability; snaps to cells.
- P1 Search: places (geocoder), plots, users, organisations, countries and regions; **AI-assisted natural-language search** ("vegan cafés near the Thames").
- P1 Region and country browsing: country pages, featured-city region pages, top plots, showcase gallery, local leaderboards.
- P1 Live layer: "N explorers online", a live activity ticker (claims, designs, achievements) and pulses on the map where things happen.
- P2 3D/immersive plot view (Three.js): extruded plot "buildings", fly-through; seasonal map skins; heatmaps.

### 6.2 Plots and mini-pages
- P1 Plot = rectangle of cells with title, slug, cover image (one image across the plot), tagline, rich description (sanitised Markdown), links (up to 5), CTA button, category, tags, contact (Business), opening hours (Business), gallery (up to 6 images), theme colour, frame cosmetic.
- P1 Public mini-page `/p/{slug}`: SSR, SEO metadata, JSON-LD (`Place` / `LocalBusiness` / `Organization`), share card (OG image), neighbours, guestbook, likes, visit counter, "Show on map".
- P1 Upload images (validated, resized, WebP) or generate with AI.
- P1 **Plot health:** a weekly link check notifies owners of broken links; plots untouched for 12 months show as "dormant" (dimmed) so the map never becomes a graveyard (the Million Dollar Homepage's link-rot lesson).
- P1 Plot editor with live preview.
- P2 Custom domains for plots, embeds, events on plots, forms builder.

### 6.3 AI
- P1 **AI Plot Designer:** from a short brief (name, vibe, purpose) it generates title, tagline, description, CTA, tags, theme colours and a cover image; up to 3 variations; apply with one click. Pluggable image providers (OpenAI Images, Google Imagen/Gemini, an external pipeline such as Google Flow, and a built-in procedural art generator as a free fallback).
- P1 **AI suggestions:** "Where should I claim?" (goal → ranked available spots with reasons) and "What should I build?" (ideas for a selected spot).
- P1 **AI-assisted search:** natural language → structured filters plus geocoding.
- P1 **AI moderation:** text and images checked on publish; flagged content goes to the admin queue; plots are hidden only on a high-confidence flag.
- P2 AI growth agent (SEO pages, social posts, outreach drafts), AI support agent, AI campaign builder for brands.

### 6.4 Game layer
- P1 **XP and levels** (1–50, smooth curve) earned for meaningful actions (claim, design, share, explore new countries, guestbook, likes received, daily streak).
- P1 **Achievements** (30 at launch: First Flag, Globetrotter, Landlord, Night Owl, Neighbourly, Trendsetter…) with rarity tiers and a share card each.
- P1 **Quests:** onboarding chain ("Your first day"), 3 daily quests, 3 weekly quests; rewards in XP and AI credits.
- P1 **Leaderboards:** global and weekly XP, by country (XP and land), most-loved plots, top explorers; "my city vs yours".
- P1 **Neighbours and social:** neighbours are plots within 5 cells; wave at a neighbour, follow users, guestbook entries, likes; profile pages; activity feed.
- P1 **Rewards:** cosmetic plot frames and effects unlocked by level; AI credits; badges on profiles.
- P2 Seasons (quarterly, themed, with season pass cosmetics), live events, guilds/alliances with territory, plot challenges, sponsored quests.

### 6.5 Accounts, organisations and payments
- P1 Guest browsing; sign-in by email one-time code (passwordless) with optional Google OAuth; profile; avatar (generated identicon or upload).
- P1 Organisations: create, invite members (owner/admin/editor), org-owned plots, org subscription, brand verification request (domain email or manual review).
- P1 Stripe Checkout for land and upgrades; Stripe Billing for plans; Customer Portal; webhooks; receipts; refunds by admin.
- P1 Dashboard: my plots, XP and quests, achievements, organisations, billing, API keys.
- P2 Marketplace resale and rentals (Stripe Connect), team roles per plot, SSO (SAML/OIDC) for Enterprise.

### 6.6 Showcase system
- P1 Pre-populated, clearly labelled **"Showcase · Unclaimed"** plots for 10–20 well-known organisations per launch country/region, with original AI art and copy (brand *name* only, no logos, no implied endorsement, a visible disclaimer and a one-click takedown request).
- P1 **"Claim this land" flow:** "Are you from {brand}?" → verify with a work email at the brand's domain (or request manual review) → choose a plan → Stripe → the plot transfers to the organisation and is unlocked for editing.
- P1 Admin: bulk generate (by country, list of names or AI-suggested list), edit, regenerate image, approve/publish, unpublish, export.
- P2 Outreach CRM: contacts, sequences, tracking of claim-link visits, AI-written outreach.

### 6.7 Platform
- P1 REST API `/v1` with OpenAPI 3.1 docs (Swagger UI), API keys (personal and org), rate limits.
- P1 **MCP server** (Streamable HTTP at `/mcp`, plus stdio) with tools to search, view and manage land.
- P1 SEO: SSR pages for plots, regions and countries, sitemaps, robots, JSON-LD, OG images, canonical URLs, hreflang-ready.
- P1 PWA: installable, offline shell, mobile-first layout, i18n-ready (all copy in message catalogues).
- P1 Admin panel: overview metrics, users, organisations, plots, moderation queue, showcase manager, payments, pricing tiers, audit log.
- P1 Tests: API unit and integration tests (Vitest + real Postgres), web unit tests, Playwright smoke test; CI on every push; SSH deploy workflow.
- P2 Public API keys with plans, webhooks, usage dashboards; full observability (OpenTelemetry, Prometheus/Grafana, Sentry), load testing, CDN, read replicas.

## 7. UI/UX direction

**Look: "night-flight cartography".** A deep-navy basemap with soft teal water, faint golden roads and labels in a clean geometric sans. Plots glow like city lights from the globe view, and turn into vivid tiles of art as you zoom in. Light "day" mode uses a parchment-and-pastel palette. Visual references: Apple Maps' flyover polish, Mini Metro and Monument Valley's clarity, Linear and Arc's UI restraint, and wplace's density of colour.

**Design system**
- Type: *Space Grotesk* (display), *Inter* (UI). Tokens for colour, radius (16 px cards, 999 px chips), elevation (soft glows instead of hard shadows) and motion (spring 200–300 ms; respects `prefers-reduced-motion`).
- Colour: navy `#0B1020` background; plot neon accents (teal `#2DE2C4`, gold `#FFC94D` for showcase, coral `#FF6B6B` for live events, violet `#8B7CFF` for the player's own plots). WCAG AA contrast for all text.
- Components: glass panels (backdrop blur, 1 px light border), chunky friendly buttons, chips, bottom sheets on mobile and a side panel on desktop.

**Layout**
- **Map screen (home):** full-bleed map. Top: search bar (AI sparkle icon), level ring and XP bar, avatar menu. Left (desktop) or bottom sheet (mobile): context panel (plot details, region info, claim flow). Right rail: quest tracker, live ticker, explorers online. Bottom-centre primary CTA: **Claim land**.
- **Never more than one primary action per screen.** Secondary tools go in the avatar menu or ⌘K command palette.
- **Mini-pages** look like premium link-in-bio pages: full-width cover art, title, tagline, CTA, links, neighbours strip, guestbook.

**Onboarding (≤ 60 seconds to the first "wow")**
1. The map opens on the globe and flies to the visitor's country (IP geolocation, no permission prompt). The world is already full: showcase plots and live activity.
2. A three-step coach-mark tour: *Explore* (zoom into a glowing plot) → *Discover* (open a plot page) → *Claim* ("Your free Homestead is waiting").
3. Claiming asks for an email only at the moment of value, gets a 6-digit code, and the plot is theirs. The AI Designer opens automatically with suggestions pre-filled from the location.
4. Confetti, achievement "First Flag", +XP, and a share card ("I just claimed a piece of Lisbon on FlatMeta").
5. The quest tracker shows the next three quests.

## 8. Game design

- **Core loop (minutes):** Explore → find something delightful → like or wave → claim or improve your plot → share → get visits and likes → XP.
- **Daily loop:** 3 daily quests (rotating from a pool of ~20), streak bonus, a "plot of the day" in your country.
- **Weekly loop:** weekly quests, weekly leaderboard reset with top-10 badges, "city of the week".
- **Long loop:** levels 1–50, achievements with rarity, unlocking frames and effects, expanding your territory, guilds and seasons (Phase 2).
- **Status levers:** country and city leaderboards (civic pride, the r/place effect), rare badges, Founder badge for the first 10k accounts, verified business badge.
- **Social levers:** neighbours (proximity creates relationships, as in Animal Crossing), guestbooks, waves, follows and shareable cards.
- **Anti-abuse:** XP for social actions is capped daily; no XP for actions on your own plots; rate limits; moderation for guestbooks; no self-likes.
- **XP table (P1):** claim plot +100 · first AI design +50 · design applied +20 · publish plot +30 · share +10 (max 3/day) · visit new country +15 · visit plot +2 (max 40/day) · like +2 (max 20/day) · guestbook entry +5 (max 10/day) · receive like +3 · receive guestbook entry +5 · daily login +10 × streak (max ×7) · quest rewards 25–250.
- **Level curve:** XP to reach level *n* = `round(50 · n^1.8)` (L2 = 174, L10 ≈ 3,155, L50 ≈ 57,000).

## 9. Recommended tech stack

| Concern | Choice | Why |
| --- | --- | --- |
| Language | **TypeScript everywhere** | One language for web, API, workers, MCP and scripts; shared types. |
| Web app | **Next.js 16 (App Router, React 19)**, Tailwind CSS 4 | SSR/ISR for SEO pages, `next/og` share images, streaming, PWA support, huge ecosystem. Runs on Node under PM2. |
| Map | **MapLibre GL JS** (globe projection, vector tiles) | Open source, no per-load fees, great performance, globe view. **deck.gl** is not needed in P1 (MapLibre layers cover plots); **Three.js** arrives in P2 for 3D plot views. |
| Basemap tiles | OpenFreeMap (free, no key) by default; MapTiler/Stadia via env; option to self-host Protomaps PMTiles on our server | No vendor lock-in; self-hosting removes the dependency entirely. |
| API | **Fastify 5** + Zod (type provider) + `@fastify/swagger` | Fastest mainstream Node framework; schemas give validation and OpenAPI from one source. |
| Database | **PostgreSQL 16** with `pg_trgm` and `unaccent`; **Drizzle ORM** + SQL migrations | Relational integrity (unique cell ownership, money), full-text and fuzzy search. |
| PostGIS | **Not required in P1** | The integer grid (`gx`, `gy`) with B-tree indexes answers every bbox and neighbour query; country lookup uses Natural Earth polygons in Node. PostGIS can be added in P2 for advanced spatial analytics without schema changes. |
| Cache, queues, realtime | **Redis 7**: BullMQ (AI and image jobs, emails, showcase generation), rate limiting, leaderboard sorted sets, pub/sub for the live feed | One small dependency with many uses; works on a single server. |
| Realtime transport | WebSocket (`@fastify/websocket`) with Redis pub/sub fan-out | Live ticker and presence; stateless API processes can scale out. |
| Payments | **Stripe** (Checkout, Billing, Customer Portal, Tax; Connect in P2) | Best-in-class; replaces PayPal; handles subscriptions and payouts. |
| AI | Provider-agnostic layer: **Anthropic Claude** (default text model `claude-opus-5-5`), OpenAI, Gemini for text; OpenAI Images / Google Imagen / external pipeline / procedural fallback for images; OpenAI moderation endpoint or LLM classification for moderation | Swap by env; no hard dependency; the app works with no AI keys at all. |
| MCP | `@modelcontextprotocol/sdk`, Streamable HTTP + stdio | The standard way for agents to use FlatMeta. |
| Email | Nodemailer over SMTP (Postmark, SES or Mailgun via env); dev logs to console | Simple and portable. |
| Storage | Local disk served by nginx by default; S3-compatible (R2, S3, MinIO) via env | Self-host first, cloud later. |
| Images | `sharp` (resize/WebP), `@resvg/resvg-js` (procedural SVG → PNG) | Fast, native. |
| Testing | Vitest (API + web), Playwright (smoke/E2E) | Fast and modern. |
| Hosting | **Ubuntu dedicated server: nginx (TLS via certbot) → PM2** (web, api, worker, cron); Postgres and Redis from apt (or Docker Compose) | Matches the owner's preference; cheap; no vendor lock-in. Docker Compose is provided for local and dev parity. |
| CI/CD | GitHub Actions: test on push; deploy over SSH (`DEPLOY_HOST/USER/KEY/PATH`) with zero-downtime `pm2 reload` | Simple and reliable. |
| Observability | P1: pino JSON logs, `/healthz`, PM2 monitoring, Stripe/AI error alerts by email. P2: OpenTelemetry, Prometheus, Grafana, Sentry | Grows with need. |

**Repos:** `flatmeta.io` holds the Next.js web app, product docs and `tasks.md`; `flatmetaAPI` holds the Fastify API, database, workers, MCP server and showcase generator. The web app reaches the API at `/api/*` on the same origin (nginx in production, a Next rewrite in development), so auth cookies are first-party and there's no CORS for the app.

## 10. Metrics

- **North star:** weekly active claimers (accounts that created or edited a plot or completed a quest that week).
- Activation: % of new visitors who claim a Homestead within 24 h (target 15%).
- Retention: D1/D7/D30 (targets 35/18/10%).
- Virality: shares per claimer, K-factor.
- Revenue: land GMV, paid conversion by persona, MRR, Business churn.
- Content health: % plots with AI design, moderation queue time, flag rate.

## 11. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Trademark complaints about showcase plots | Brand name only, original art, "Showcase · Unclaimed · not affiliated" label, claim restricted to verified brand staff, one-click takedown, legal review before launch (Open question). |
| Seen as "another metaverse/NFT scam" | No crypto, no investment language, clear licence terms, fun-first marketing. |
| Empty world | Showcase content, live activity, homesteads for everyone, city leaderboards. |
| Moderation load | AI moderation, rate limits, reputation thresholds, community reporting, admin queue. |
| AI cost | Credits per plan, caching, procedural fallback, cheap models for classification. |
| Map tile provider limits | Self-hostable tiles (PMTiles), provider switch by env. |

## 12. Appendix: research notes

See `docs/research-notes.md` for the full market research with sources.
