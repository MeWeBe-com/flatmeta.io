# GL2: Viability & profit report (16 Nov 2026)

**Panel:** Senior VC, CEO, CTO, Product Manager, Sales & Marketing Director, Solutions Architect, Lead Developer, QA Lead.
**Product:** FlatMeta, a shared world map where people, businesses and brands own plots of real-world cells, each with its own page.
**Tested:**
- the live site (https://www.flatmeta.io) and staging (https://staging.flatmeta.io) with Playwright on 16 Nov, at 1440×900 and iPhone 12 (390×844): 11 key pages each;
- Lighthouse (mobile) on both sites;
- the live API's own counters.

Evidence: `docs/golive/evidence/round1/` (`live/` and `staging/` screenshots, `audit.json` per site, `lighthouse/summary.json`).

## 0. What we found before scoring (facts, not opinions)

| # | Finding | Evidence |
|---|---|---|
| F1 | **Production runs an old build.** The work merged since 13 Nov (Mobile + SEO QA, M2–M11 and S1–S6) is on staging but **not** on www. The CI production job skips (no deploy secrets), and the server's cron needs `AUTO_DEPLOY=true`. Signs: titles say "FlatMeta" twice, the pricing price reads "Free", `/insights` is 404, and `/llms.txt` is the insights automation's static file ("Interactive 3D Virtual Land… Digital Twin Marketplace"), which contradicts the positioning. | `live/audit.json`; `curl https://www.flatmeta.io/llms.txt` |
| F2 | **No money can be taken on production.** `/pricing` says "coming soon" (`PAID_CHECKOUT_ENABLED=auto` is off in production by design until live Stripe is confirmed). On staging, checkout is mock/test. | `live/desktop-pricing.jpg` |
| F3 | **No traction yet.** Live counters: **1 user-made plot**, 369 reserved company showcase plots, **1 registered explorer**, 0 online. Staging: 1 plot, 3 explorers. | `GET /api/v1/world/stats` (live, 16 Nov) |
| F4 | **Two visible bugs on every company page and the leaderboards:**<br>• `GET /v1/plots/:id/open-houses` returns 404 for company (showcase) plots (console error on every `/p/<company>`);<br>• `GET /v1/leaderboards/xp-week` returns 500 when the week is empty (a `__empty__` marker reaches a uuid query). | `failreq` run; CI Postgres log "invalid input syntax for type uuid" |
| F5 | **The empty-world feeling.** The map's "Live" panel shows achievements from 12 days ago and "1 exploring now". On a phone, the first visit stacks the guided tour, the location prompt and the panels. | `staging/desktop-home.jpg`, `staging/phone-home.jpg` |
| F6 | **Speed is good on content pages** (Lighthouse mobile performance 96–100 on /pricing, /business and /p/tesla; LCP 1.1–2.2 s). The map home measures TBT 12.6 s in headless Lighthouse because WebGL is drawn in software there. The CI budget without WebGL measures 121 ms (run 57). | `lighthouse/summary.json` |
| F7 | **Accessibility 94–100 and best practices 96–100.** SEO is 100 on production pages; 66–69 on staging only because staging is deliberately `noindex`. | `lighthouse/summary.json` |
| F8 | **Trust signals are thin.** No customer proof, no FAQ, no refund policy statement next to the prices, no visible support channel on /pricing or /business, and no "how it works" on /pricing. Legal pages exist. | screenshots |

## 1. Will customers pay for this now?

**Short answer: not at today's scale, but one buyer segment can pay soon if the offer changes.** The market in late 2026 is saturated with AI app builders, link-in-bio tools and "AI visibility" SaaS. A playful map is novel, but novelty alone doesn't sell to businesses.

| Buyer | Pain | Willingness to pay today | Verdict |
|---|---|---|---|
| **A. Companies with a reserved plot** (369 reserved next to real headquarters, e.g. Tesla, United Airlines, Coca-Cola) | "There is a page about my company I don't control" (brand control), plus being listed in a place AI agents read | **Medium–high for mid-size companies** (marketing teams pay for brand control); low for giants, who will ask for removal | **Primary.** The asset (reserved pages, the claim flow, the company register and CSV, logos) already exists. The offer should be **"Claim and verify your company page"**: free verification, then Business ($29/mo) or Brand. Sell this through outreach, not ads. |
| **B. Local small businesses** (cafés, shops, studios) | "Be found nearby and by AI assistants" | Low–medium; they already pay Google, Yelp and Instagram. $29/mo competes with those. | **Secondary.** Lead with free, then upsell Spotlight ($9) and Business when there's map traffic, which there isn't yet. |
| **C. Creators and individuals** | A fun page on the map, a link in bio | Low ($5 Plus) | A traffic and network-effect source, not revenue. Keep it free, gamified and shareable. |

**What is weak today:**
1. **No working checkout on production (F2)**, so the revenue is literally zero.
2. **No traffic or social proof (F3, F5)**, so business buyers see an empty world.
3. **The value is unproven:** no data that FlatMeta pages are cited by AI assistants or rank in Google yet (the long tail is just being indexed after S1/S2).
4. **Production is behind (F1)**, so prospects see the old positioning ("3D virtual land / digital twin"), which attracts the wrong crowd (speculators, Earth2 fans).
5. Brand at $249/mo has no proof behind it; Business at $29/mo needs proof too.

## 2. How to grow and make profit fast

**Offer (90 days):**
- **"Your company already has a plot on FlatMeta. Claim and verify it free."** After verifying: Business at **$29/mo or $290/yr** (badge, hours, offers, "Open now", contact, analytics, 1 Spotlight a month).
- **Launch offer:** the first 3 months at 50% off on yearly Business for founding companies (Stripe coupon, time-boxed, stated honestly).
- Keep **Free** for everyone (first land). Keep **Plus at $5** for creators.
- **Brand ($249)** stays "talk to us" until there are 3 paying Business customers to show as proof.
- Land by the cell and boosts stay as add-ons.

**Channels, in order of expected return:**
1. **Outbound to reserved companies** (the company register already exports a CSV with company, website and contact page): 30 personalised emails/LinkedIn messages a day, from the founder, not a bot, saying "we reserved your HQ plot, claim it free". Target: 2–5% claim, 10–20% of claimers upgrade.
2. **SEO long tail:** the `/p/<company>`, `/brands/<cc>`, `/c/<cc>` and `/r/<city>` pages, now correctly in the sitemaps with real lastmod (S1/S2) and IndexNow, plus buyer-intent landing pages (GL7).
3. **Launch sites and directories** (GL7 growth plan): Product Hunt, BetaList, Indie Hackers, Hacker News "Show HN", AI directories.
4. **Creators:** the shareable `/@handle` and plot share cards, quests and leaderboards. That's the loop that fills the map.

**Regions:** start where reserved companies cluster and English is spoken (US, UK, UAE, Australia, Canada), then the EU.

**Unit economics (planning numbers, not forecasts):** hosting is a shared server (≈ fixed cost); AI image generation is pay-per-use behind credits. One Business customer at $29/mo covers the monthly AI and email cost of hundreds of free users. **Break-even needs about 10 Business customers**; 100 Business customers ≈ $35k ARR.

## 3. Improvement list (functionality, features, UI, UX, trust, conversion)

| Area | Improvement | Priority |
|---|---|---|
| Release | Get production onto the current build and keep it in step with staging (deploy secrets or `AUTO_DEPLOY=true`) | **P0, owner/server admin** |
| Revenue | Live Stripe checkout and portal on production, plus PayPal (GL4); turn `PAID_CHECKOUT_ENABLED=true` once live keys and the webhook are verified | **P0** |
| Revenue | Claim-your-company flow: from every reserved company page, a "Claim free" CTA leading to verification, then a Business upsell with the launch offer | P0 |
| Bugs | Fix the open-houses 404 on company pages and the empty weekly leaderboard 500 (F4) | P0 |
| Trust | Real numbers only (plots, countries, companies reserved), a "How it works" in 3 steps, FAQ (refunds, cancel anytime, "is this NFT/crypto? No"), payment security line, a visible support email on /pricing and /business | P1 |
| Conversion | /pricing: show who each plan is for, the yearly saving in money, the launch offer, and one clear CTA per plan; on /business, put pricing and the FAQ on the page | P1 |
| UX | Hide stale "Live" activity (older than 7 days) and show a "be the first" prompt instead; on a phone's first visit, show the tour first and the location prompt after it | P1 |
| Positioning | Production `/llms.txt` must be the app's version (old static file: manual step from S-tasks) | P0 manual |
| SEO/GEO | Buyer-intent landing pages ("put my business on a map", "AI search visibility for local business") and comparisons (vs Earth2, vs Google Business Profile, vs Linktree); FAQPage and SoftwareApplication JSON-LD (GL7) | P1 |
| Ops | Health endpoint, uptime monitor, error tracking hook (GL6); a daily QA smoke on the live site (GL8) | P1 |
| Email | Send from noreply@flatmeta.io with SPF/DKIM/DMARC (GL5) | P1 |
| Product | Proof of AI visibility: a "Seen by AI" panel on each Business plot, showing crawls by AI bots (GPTBot, ClaudeBot, PerplexityBot) from the access log/user agent | P2 |
| Product | Monthly email report to plot owners (visits, likes, AI crawls) | P2 |

## 4. Scores, round 1 (16 Nov 2026, before the One-Go build)

**Rules:** 10 = ready to scale with confidence; 9 = launch-ready with no known blockers in that role's area; 5 = works but wouldn't bet on it. Every score cites evidence.

| Role | Score | Why (evidence) |
|---|---|---|
| Senior VC | **3/10** | Zero revenue and one real user (F3); a crowded market; the primary buyer (A) is plausible but unproven. Positives: a novel asset (369 reserved company pages) and a cheap stack. |
| CEO | **4/10** | Can't take money on production (F2); production shows old, off-message positioning (F1). The team ships fast (the 13 Nov QA list was done in a day) and the plan is clear. |
| CTO | **7/10** | Sound architecture (Next 16, Fastify, Postgres, Redis, CI with e2e, a device matrix, Lighthouse and XSD checks). Minus: the production release path is broken (F1); no error tracking or uptime monitor. |
| Product Manager | **5/10** | Rich features (map, plots, AI designer, quests, marketplace, clans, MCP). The core buyer journey (claim company → verify → pay) isn't the hero path; the empty world (F5). |
| Sales & Marketing Director | **3/10** | No offer, no proof, no outbound process, no FAQ or trust block (F8), the old positioning live (F1). The register CSV for outreach exists. |
| Solutions Architect | **7/10** | Clean integration surfaces (REST, MCP, sitemaps, llms.txt, IndexNow, JSON-LD). Minus: payments not live, email on a borrowed domain, no edge caching. |
| Lead Developer | **8/10** | Strong tests (195 API + 55 web unit tests, ~240 e2e incl. WebKit), lint and typecheck. Minus: 2 real bugs (F4); some config defaults name the old mail host (fixed in GL1). |
| QA Lead | **6/10** | Staging is green across the device matrix. But production is untested on the current build (F1), there's no scheduled test of the live site, and there are console errors on company pages and the leaderboards (F4). |

**Average 5.4/10.** The biggest gaps are commercial (VC, CEO, Sales) and release (F1, F2), not code quality.

## 5. One-Go Master Build plan (GL3), every change, grouped and ordered

**Group 1, release blockers (do first):**
- **GL3a:** fix the open-houses 404 on company pages and the empty weekly leaderboard 500 (F4), with regression tests.
- Production release path (F1) and live `llms.txt`: owner/server admin; exact steps in MANUAL-STEPS.md → Launch checklist.

**Group 2, revenue (with GL4):**
- **GL3b:** the claim-and-upgrade path. A clear "Claim this company plot (free)" CTA on every reserved page, then a post-verification upsell to Business with the launch offer, and the launch offer on /pricing. Prices and the offer come from config, not code.
- Stripe live checkout, portal, webhooks and PayPal are GL4.

**Group 3, trust and conversion:**
- **GL3c:** a trust block on /pricing and /business:
  - real counts from the API;
  - "How it works" in 3 steps;
  - an FAQ (refunds, cancel anytime, not NFT/crypto, who sees my page, AI visibility), also as FAQPage JSON-LD;
  - a secure-payment line and a visible support email;
  - the yearly saving shown in money.
- **GL3d:** the living-world feel. The Live panel hides activity older than 7 days and shows a "be the first" call to action instead. On a phone's first visit, the location prompt waits until the tour is finished or skipped.

**Group 4, discoverability and ops:** GL5 (email), GL6 (go-live config, Workers, health, uptime, errors), GL7 (landing and comparison pages, structured data, growth plan), GL8 (daily agents and scheduled checks).

**Group 5, after launch (owner-led, tracked in the proof report):** outbound to reserved companies, the first 3 paying customers (logos and quotes, with permission), "Seen by AI" proof per plot, monthly owner reports.

Round 2 scores are appended below after GL3.
