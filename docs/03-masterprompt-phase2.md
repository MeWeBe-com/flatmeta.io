# MasterPrompt — FlatMeta v2, Phase 2 (≈2 weeks): enterprise-ready

> **How to use this prompt.** Give this file to a coding agent with both repos (`flatmeta.io/`, `flatmetaAPI/`) checked out on branch **`v2`** (or a `v2-phase2-*` feature branch merged into `v2`). Phase 1 (`docs/02-masterprompt-phase1.md`) must be complete; read it, `docs/01-brief.md`, `tasks.md` and `docs/progress.md` first. The Phase 1 conventions (stack, env-only secrets, zero-key dev mode, tests, small commits, `tasks.md` ownership, progress log, Open questions) apply unchanged.
> Work in the **order of the tracks below**; each track ends with tests, docs and a progress entry. Ship behind feature flags (`features` table + `FEATURE_*` env overrides) so production can enable tracks one by one.

---

## 0. Goals

Turn FlatMeta from a great consumer product into a platform that brands, creators and partners can build businesses on, with the operations (observability, scale, support, growth) to run it with a small team.

Success at the end of Phase 2:
- Brands run measurable campaigns (sponsored quests, events, plot ads) with analytics and invoices.
- Creators earn money on FlatMeta (marketplace resale, rentals, tips, paid memberships), paid out with Stripe Connect.
- Partners integrate through a public API with keys, plans, rate limits and webhooks.
- An outreach CRM turns showcase plots into paying Landmark customers.
- AI agents do growth marketing and first-line support under human approval.
- The system is observable, load-tested to 5k concurrent map users and 200 req/s API, and ready for a second server.

---

## Track A — Deeper game systems (days 1–3)

**Seasons**
- `seasons` (key, name, theme, starts_at, ends_at, map_skin, rules jsonb), `season_progress` (user_id, season_key, xp, tier, claimed jsonb).
- 10-week seasons; a free track and a **Season Pass** ($6, Stripe one-time) track of cosmetic rewards (frames, plot effects, map markers, profile banners). Season XP comes from the same `xp_events` stream (tagged by season). End-of-season badges for the top 1%/10% per country.
- Seasonal map skin: style overrides (e.g. "Aurora", "Lantern Festival") swapped by the season.

**Live events**
- `events` (kind: `treasure_hunt` | `build_off` | `city_clash` | `sponsored`, region, starts/ends, rules, rewards, sponsor_org_id). Admin event builder.
- Treasure hunt: hidden waypoints (plots) with clues; first N finders get rewards. Build-off: themed design contest, community voting (one vote per account, anti-sybil: verified email + level ≥ 3). City clash: countries/cities compete on weekly XP; live scoreboard on the map.

**Guilds / alliances**
- `guilds` (slug, name, emblem (procedural), motto, home_country, level, xp), `guild_members` (role: leader/officer/member), `guild_invites`, `guild_territory` (computed: union of members' plots; contiguous clusters).
- Guild chat (moderated, WebSocket rooms keyed `guild:{id}`), guild quests, guild leaderboard, territory outline on the map, alliances between guilds (`guild_alliances`, max 3).

**Achievements & quests v2**: 30 more achievements; quest chains with branching; streak protection item (earned, not bought).

## Track B — Land economy: marketplace, resale, rentals, plot ads (days 3–5)

- **Stripe Connect Express** onboarding for sellers (`connect_accounts`: user_id/org_id, stripe_account_id, charges_enabled, payouts_enabled).
- **Listings** (`listings`: plot_id, seller, price_cents, status, created_at; `offers`: listing_id, buyer, amount, status, expires_at). Buy now and make an offer. Checkout uses **destination charges** with `application_fee_amount = 10%` (config). Ownership transfers on `checkout.session.completed`, in one DB transaction (cells unchanged, owner changed, history row in `plot_transfers`, guestbook kept, likes kept, frames reset). Refund automatically if the listing changed between checkout and payment (v1 rule).
- Anti-speculation guard rails: minimum hold 7 days before resale; price cap of 50× the tier price for 30 days after a claim; no resale of homesteads; clear "not an investment" copy; KYC via Connect.
- **Rentals** (`rentals`: plot_id, tenant, period (week/month), price, status, starts/ends; Stripe subscription with Connect fee 10%). Tenant gets editor rights on content; owner keeps ownership; auto-revert content on rental end (snapshot in `plot_revisions`).
- **Plot ads** (`ad_campaigns`, `ad_creatives`, `ad_impressions` (aggregated per day), `ad_clicks`): native "Sponsored" cards in explore, search and region pages, and a "Sponsored" pin layer at zoom ≥ 10. Self-serve for Business/Brand plans: target countries/regions/categories, daily budget, CPM or CPC bidding (simple second-price), Stripe prepaid balance (`ad_balances`). Frequency caps; brand-safety via moderation; clear labelling.
- `plot_revisions` table for every content change (revert in admin and owner UI).

## Track C — 3D and immersive plot views (days 5–6)

- **Three.js** (`@react-three/fiber` + `drei`) plot viewer at `/p/[slug]/3d` and in the plot sheet: the plot as an extruded tile island with its artwork as the top texture, frame/effects as shaders, neighbours as lower-detail islands, day/night lighting, gentle idle animation, orbit controls, share screenshot.
- Map: MapLibre `fill-extrusion` for plots at zoom ≥ 15 (height from level/likes/upgrades), and an optional **deck.gl** overlay (MapboxOverlay, interleaved) for heatmaps (activity, visits) and arcs (follows, guild links) at world zoom.
- "Fly-through" mode: a camera tour over a region's top plots (exportable as a 15-second WebM via the MediaRecorder API for social sharing).
- Performance budget: 3D chunk lazy-loaded, < 250 KB gz; falls back to 2D on low-end devices (`navigator.hardwareConcurrency < 4` or `prefers-reduced-motion`).

## Track D — Brand campaign tools and analytics (days 6–7)

- **Analytics pipeline:** first-party, cookie-light event collection (`POST /v1/e` batched; page views, plot views, map impressions, CTA clicks, link clicks, shares, quest completions) → Redis stream → worker → `analytics_events` (partitioned monthly) + daily rollups `analytics_daily` (plot_id/org_id/campaign_id × metric × day). Bot filtering, IP truncation, no third-party trackers; GDPR consent banner for non-essential events.
- **Org analytics dashboard:** impressions, visits, unique visitors, CTA clicks, CTR, top referrers, countries, quest completions, guestbook sentiment (AI); date ranges; CSV export; scheduled weekly email report.
- **Campaign builder** (Brand/Enterprise): goal (awareness, visits, leads), regions, duration, assets; components: sponsored quest, sponsored event, plot ads, Spotlight bundle; AI campaign assistant drafts copy and quest designs; preview; approval; Stripe invoice (`invoices` via Stripe Invoicing for Enterprise, card for others).
- **Lead capture:** forms on business/brand plots (`forms`, `form_submissions`), leads inbox, CSV export, webhook to the org's CRM.
- **Multi-plot portfolio management:** bulk edit, templates (`plot_templates`) applied across many plots, scheduled content changes.

## Track E — Creator economy (days 7–8)

- **Tips** on plots and profiles (Stripe Connect, 5% platform fee, min $1).
- **Plot memberships:** creators offer a paid tier ($2–20/mo) for supporters: supporter badge, members-only guestbook and posts, early access. Stripe subscriptions with Connect, 10% fee.
- **Template marketplace:** creators sell plot design templates (theme + layout + AI prompt preset); 70/30 revenue share.
- **Creator dashboard:** earnings, payouts (Connect), supporters, analytics.
- **Creator verification** and a Creator plan ($12/mo): lower fees (5%), custom domain for plot pages (`custom_domains`, nginx + on-demand TLS via certbot DNS or Caddy for the custom-domain edge), advanced analytics.

## Track F — Public API platform (days 8–9)

- **Developer portal** at `/developers`: docs (OpenAPI rendered with Scalar), guides, MCP setup, changelog, status.
- **API keys v2:** per-org keys with scopes (`plots:read`, `plots:write`, `analytics:read`, `webhooks:manage`, `ads:manage`), key rotation, last-used and IP allow-lists.
- **API plans:** Free (1k req/day), Pro ($49/mo, 50k/day), Scale ($299/mo, 1M/day), Enterprise. Enforced with Redis sliding windows; headers `RateLimit-Limit/Remaining/Reset`; usage metering into `api_usage_daily`; Stripe metered billing for overage.
- **Webhooks:** `webhook_endpoints` (url, secret, events[], status), `webhook_deliveries` (payload, attempts, last_status, next_attempt_at). Events: `plot.created|updated|transferred|liked`, `guestbook.created`, `order.paid`, `subscription.updated`, `lead.created`, `campaign.updated`. HMAC-SHA256 signatures (`FlatMeta-Signature: t=…,v1=…`), exponential retries for 24 h, replay from the portal, test-event button.
- **SDK:** generate a TypeScript client from OpenAPI (`openapi-typescript` + a thin fetch wrapper), published as `@flatmeta/sdk`.
- **MCP v2:** OAuth 2.1 for remote MCP (authorization server endpoints, PKCE, dynamic client registration), more tools (analytics, campaigns, listings), and a listing in public MCP registries.

## Track G — Outreach CRM: sell showcase land back to brands (days 9–10)

- Tables: `crm_companies` (linked to showcase plot(s), domain, sector, country, size), `crm_contacts` (name, title, email, linkedin, source, consent basis), `crm_sequences` (steps: email/LinkedIn task/wait), `crm_enrollments`, `crm_messages` (sent/opened/clicked/replied), `crm_deals` (stage: new → contacted → engaged → demo → won/lost, value), `crm_tasks`, `crm_notes`.
- **Claim-link tracking:** each outreach gets a signed link `flatmeta.io/claim/{slug}?ref={token}`; visits and claim starts update the deal and notify the owner.
- **AI SDR assistant:** researches the company from public info (website fetch), drafts a personalised email + a custom preview image of their plot, and suggests a sequence; **humans approve every send** (no auto-send in Phase 2). Respect GDPR/PECR/CAN-SPAM: B2B legitimate-interest notes, unsubscribe link, suppression list, sending-domain warm-up, daily caps.
- Email sending via a dedicated outreach domain (`OUTREACH_SMTP_*`) separate from transactional mail.
- Kanban pipeline UI in `/admin/crm`, contact import (CSV), deal analytics (pipeline value, conversion by stage, by country).

## Track H — AI growth/marketing agent (day 11)

- An **agent service** (`src/agents/growth.ts`) on Claude (`claude-opus-5-5`) with tool use: `query_metrics`, `list_trending_plots`, `draft_social_post`, `draft_blog_post`, `generate_share_image`, `propose_seo_page`, `create_draft_campaign`, `schedule_post` (queues for approval only).
- Weekly plan → drafts in an **approval inbox** (`/admin/growth`): social posts (X, LinkedIn, Instagram captions, TikTok scripts) built from real activity ("this week's most-loved plot in Lisbon"), SEO landing pages for "{category} in {city}" from real plot data (published only if ≥ 5 real plots, avoiding thin content), newsletter digests, and city-of-the-week features.
- Guardrails: never fabricate stats (tools only), brand-safety moderation pass, human approval before anything is published, audit log, cost cap per week (`AGENT_WEEKLY_BUDGET_USD`).
- Hand-off for the "FlatMeta AI marketing team": an export format (JSON + assets) for mewebe.com's marketing tooling.

## Track I — AI support agent (day 11–12)

- In-app help widget (dashboard + `/help`) and email inbound (`support@`): an agent with tools `search_help_docs` (markdown help centre in the repo, embedded in Postgres with `pgvector`), `get_user_account` (scoped to the requester), `get_orders`, `get_plot`, `resend_login_code`, `create_ticket`, `escalate_to_human`.
- Refunds, account deletion, moderation appeals and anything legal → always escalated (creates a ticket in `/admin/support` with an AI summary and suggested reply).
- Tickets (`support_tickets`, `support_messages`), SLA timers, macros, CSAT survey.
- Evaluate with a test set of 50 realistic questions (accuracy, correct escalation) before enabling (`FEATURE_SUPPORT_AGENT`).

## Track J — Observability, performance and scaling (days 12–14)

- **Observability:** OpenTelemetry SDK in API, worker and web (traces + metrics) → OTLP collector → Prometheus + Grafana (+ Tempo for traces, Loki for logs) via `deploy/observability/docker-compose.yml`; Sentry (self-hosted or SaaS via `SENTRY_DSN`) for errors in web and API; dashboards: RED metrics per route, DB pool, queue depths, Stripe webhook lag, AI latency/cost per provider, WS connections, business KPIs; alerts (Grafana → email/Slack) for 5xx rate, p95 latency, queue backlog, webhook failures, disk, certificate expiry.
- **Performance:** vector tile endpoint for plots (`/v1/tiles/plots/{z}/{x}/{y}.mvt` generated in Node with `geojson-vt` + `vt-pbf`, cached in Redis and by nginx `proxy_cache`) replacing bbox JSON at low zooms; image CDN (Cloudflare in front of `/media` with immutable URLs); Next.js ISR for public pages with on-demand revalidation on plot updates; DB tuning (pgbouncer, `pg_stat_statements` review, missing indexes, partitioning `analytics_events` and `activity`); N+1 audit; bundle analysis (map chunk split, < 180 KB gz initial JS).
- **Load testing:** k6 scripts for map browsing, plot pages, claim flow, WS fan-out; targets: 5k concurrent WS, 200 req/s API at p95 < 300 ms on one 8-core server; results committed to `docs/perf/`.
- **Scaling plan:** stateless API (sessions in Postgres, cache in Redis) → PM2 cluster mode; WS fan-out via Redis pub/sub across instances; second server behind nginx upstream or a load balancer; Postgres streaming replica for reads and backups; object storage (S3/R2) for media; Redis persistence (AOF) and Sentinel later.
- **Security hardening:** CSP with nonces, rate-limit review, dependency scanning (Dependabot, `npm audit` in CI), secret scanning, security headers, OWASP ASVS L2 checklist pass, penetration-test checklist, GDPR tooling (data export, account deletion with cascade and anonymisation, DPA template), SSO (SAML/OIDC via `@node-saml/node-saml` / `openid-client`) for Enterprise orgs, audit log UI for orgs.
- **Reliability:** blue-green deploys (two PM2 app sets, nginx switch), DB migration safety checks (no long locks), nightly restore test of backups, status page.

---

## Deliverables and Definition of Done

1. Every track's features behind flags, with migrations, OpenAPI docs, tests (unit + integration; Playwright flows for marketplace purchase, rental, campaign creation, webhook delivery, support escalation) and admin tooling.
2. Updated `README.md` (new services, env vars, observability stack), `docs/progress.md` entries per track, `tasks.md` fully ticked or re-planned.
3. Load test report and Grafana dashboards JSON in `deploy/observability/`.
4. Legal/compliance checklist for marketplace (Connect terms, refunds, tax), outreach (consent) and AI (disclosures) logged under Open questions for the owner.
5. A 2-minute screen-recorded demo script in `docs/demo-phase2.md` covering a brand campaign, a creator sale, an API webhook and the growth agent's approval inbox.
