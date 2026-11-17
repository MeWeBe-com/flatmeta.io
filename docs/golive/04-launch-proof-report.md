# FlatMeta: launch and 9/10 proof report (GL10)

17 Nov 2026 (Round 3) · branch `v2` · staging build `9592742` · repository MeWeBe-com/flatmeta.io · domain: **flatmeta.io only** (boss decision, 17 Nov)

## One page

**Where we are.** The go-live build is finished, tested and running on **staging**:
- **Selling:**
  - a free company claim with a Business upsell;
  - founding places counted from the database, and customer stories shown only with permission;
  - a trust block, FAQ and refunds; buyer pages and fair comparisons;
  - a 30-second demo, and one clear first action on the home page.
- **Activation:** a welcome email, one activation nudge, helpful errors, and a cookie-free funnel at `/admin/funnel` (Visitors > Sign-ups > First value > Paid).
- **Payments:** Stripe with an account check, and PayPal Checkout.
- **Operations:**
  - one-command scripts for production go-live and for Cloudflare;
  - a health URL, error alerts and Cloudflare Workers;
  - daily QA and SEO checks and a weekly CEO report.
- **Promotion:** five agents with guardrails, a growth plan, ready-to-send outreach for the first 10 customers, and the mewebe.com listing.

CI is green on `9592742` and staging deploys automatically. On staging:
- **Lighthouse mobile:** accessibility 100 and best practices 100 on all 11 measured pages; performance 93–100 on every content page. The map home page is 63 in headless Chrome, which draws its WebGL in software.
- **No console errors** on 24 page loads (12 pages × desktop and phone).
- **The release smoke test** passes 19/19.

**What is not live yet, and why.** **www.flatmeta.io still runs the old build**: `/insights` is 404, `/p/tesla` and `/leaderboards` show console errors, and `llms.txt` is the old "Digital Twin" text. That is not a code problem: the build reaches production when the go-live scripts run on the server. Payments, email from flatmeta.io and the daily schedules wait on accounts, keys and settings too. Each is one action with an owner in `MANUAL-STEPS.md` → "Round 3: one action each".

**The score:** 5.4 → 7.3 → **7.6**/10.
- Lead Developer is at 9.
- No role was scored up for work that isn't live, or for customers who don't exist yet.
- Each remaining point needs a person: running the scripts, adding keys, and winning the first customers.

**The decision for the boss.** Run Round 3 item 1, the two go-live scripts on cp2 (about 30 minutes). Then item 2, the Stripe webhook and keys. Together they make everything above live and able to take money.

| | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Average score | 5.4 | 7.3 | **7.6** |
| Lighthouse mobile accessibility (staging) | 94–100 | 94–100 | **100 on 11 pages** |
| Console errors (12 pages × 2 devices, staging) | errors on 2 pages | errors on 2 pages | **0** |
| First-visit path | map only | map + buyer pages | **one first action + 30-second demo** |
| Activation | none | none | **welcome + one nudge; funnel measured** |
| Social proof | none | real counts | **founding places, permission-only stories, case-study kit** |
| Person-only blockers | scattered | listed with owners | **one action each, 3 of them scripts** |
| Production can take payments | No | Built; waits on keys | Built; waits on Round 3 items 1–2 |
| Tests | 195 API + 55 unit + ~240 e2e | 207 + 76 + ~295 | **221 + 85 + ~300, CI green** |

---

## Appendix A: Viability (summary of `02-viability-profit-report.md`)

**Buyers and why they pay:**
- **A, primary: companies with a reserved landmark.** 369 landmarks in 20 countries are on production. Claiming is free; the money is the Business ($29/month) and Brand ($249/month) upsells and Spotlight. The pain: being represented accurately where people and AI assistants look.
- **B: local businesses**, for the Business plan. They want to be found, show hours and offers, and appear in AI answers.
- **C: creators and people.** They start free and pay for Plus ($5/month) for more land and reach. They fill the map, which makes it worth visiting for A and B.

**Weak points that remain:**
- No traction yet: 1 user plot and 1 explorer on production.
- An empty-world feel outside the launch cities.
- "Meta" in the name carries a medium trademark risk.

**Growth:** the outreach to reserved companies (Sales agent), 30 free directories, a 30-day social calendar, the SEO, GEO and AI-SEO surface (structured data, llms.txt, MCP), and the mewebe.com listing.

**Profit:** the stack runs on one shared server and free tiers (OpenFreeMap tiles, Cloudflare). Every paid plan is close to pure margin after Stripe fees.

## Appendix B: Domain (summary of `01-domain-report.md`)

- **Recommendation:** keep **flatmeta.io**, registered 2022-04-21 and expiring 2027-04-21. Turn on auto-renew and the registrar lock.
- **No rename.** "FlatMeta" has zero brand competition in search. Do the 10-minute trademark search before PR.
- **Brand from config:** the brand, domain, emails and URLs all come from `.env` (`APP_NAME`, `APP_URL`, `PRODUCTION_DOMAIN`, `MAIL_FROM`). A unit test fails on any hard-coded domain.

## Appendix C: Scores before and after, with evidence

The Round 3 table, with what blocks 9 for each role, is in `02-viability-profit-report.md` §7. The Round 2 table follows.

| Role | Round 1 | Round 2 | Main evidence | To reach 9 (who) |
|---|---|---|---|---|
| Senior VC | 3 | 5 | The funnel exists, but $0 revenue and 1 user plot on production | 3 paying customers and 50 claimed or published plots in 30 days (owner) |
| CEO | 4 | 6 | Every blocker is an owned step; production is still the old site | Launch checklist 1–4, and the first live weekly report (server admin, boss) |
| CTO | 7 | 8 | Health, alerts, workers, scheduled checks, CI green | Production deploys on, and `v2` as the default branch (server admin, repo owner) |
| Product Manager | 5 | 7 | The claim → verify → upsell path, 3 buyer pages, a fresh Live panel | ≥ 25 real plots in the launch cities (owner, Marketing agent) |
| Sales & Marketing | 3 | 7 | Offer, FAQ, comparisons, growth plan, Sales agent, listing | The first 10 submissions and 2 customer stories (owner) |
| Solutions Architect | 7 | 8 | PayPal with server-side capture checks, Stripe checks, email DNS checker, edge workers | GL5 DNS, Stripe webhook, PayPal app (boss, Fahad) |
| Lead Developer | 8 | **9** | Tests across every change, green CI, the Round 2 regression fixed with tests | — |
| QA Lead | 6 | 8 | Staging smoke 19/19, full e2e, scheduled workflows, the QA agent | The production smoke test, and the schedules running (server admin, repo owner) |

**Where the evidence is:**
- `docs/golive/evidence/round1/`, `round2/` and `round3/`, each with `staging/` and `live/` screenshots and `audit.json`, plus Lighthouse `summary.json`;
- `round2/staging-smoke.txt` and `round2/staging-seo-check.txt`;
- CI run 43840928188, green on `3b435f1`;
- `docs/golive/weekly/2026-11-16.md`, the first weekly report, taken from production.

## Appendix D: Payments status

| | Status | Waiting on |
|---|---|---|
| Stripe Checkout, portal, signed webhooks (8 events, each processed once), prices from config | Built and tested | Boss: confirm the live keys belong to the "FlatMeta" account inside the Organisation (`npm run payments:check` prints it), then add the webhook endpoint |
| Stripe test-mode e2e | Built; runs when CI has `STRIPE_TEST_SECRET_KEY` | Owner: add the secret |
| PayPal Checkout (Orders v2), sandbox first | Built and tested (3 tests covering 7 cases) | Boss or owner: create the `FlatMeta-PayPal` app, sandbox then live. **The $40 PayPal credit is not used by anything here.** |
| Production checkout switched on | `PAID_CHECKOUT_ENABLED=true`. In production, `auto` means off; `scripts/server/go-live-production.sh` sets `true` once the live keys pass its checks | Server admin: production `.env`, then the script |

## Appendix E: What is live, and what waits on whom

**Live now:**
- **Staging (`staging.flatmeta.io`, release `9592742`):**
  - the full go-live build: health, buyer pages, the free claim, the trust block and the founding places;
  - the demo, the onboarding emails and the funnel;
  - the Round 2 and Round 3 fixes.
- **Production (`www.flatmeta.io`):**
  - the old build: the map, plots, 369 reserved company plots and sign-in;
  - not the go-live build.
- **GitHub:** CI with a deploy to staging. The three scheduled workflows are committed but not yet scheduled.

**Waits on people:** the short version is `MANUAL-STEPS.md` → "Round 3: one action each" (10 rows). The full list follows.

| # | Step | Who |
|---|---|---|
| 1 | Turn production deploys on (`AUTO_DEPLOY=true`, or the CI `PROD_DEPLOY_*` secrets) | Server admin |
| 2 | Re-render nginx; remove the stale `public_html` llms.txt, sitemap and robots files | Server admin |
| 3 | Production `.env`: Stripe and PayPal keys, `MAIL_FROM`, `ERROR_WEBHOOK_URL` | Server admin (values from the boss and owner) |
| 4 | Confirm or create the Stripe account "FlatMeta" in the Organisation; webhook; portal | Boss |
| 5 | PayPal app `FlatMeta-PayPal`: sandbox, then live | Boss or owner |
| 6 | `flatmeta.io` in the boss's Cloudflare account: DNS, SSL Full (strict), Email Obfuscation off | Fahad or owner |
| 7 | Email: Cloudflare Email Routing (hello@, support@), the Resend domain, SPF and DMARC, then switch `MAIL_FROM` | Fahad or owner, then server admin |
| 8 | Make `v2` the default branch on GitHub, so the schedules run | Repository owner |
| 9 | Optional: the `FM_REPORT_API_KEY` secret for revenue numbers in the weekly report | Owner |
| 10 | Set up the 5 agents in claude.ai or Antigravity, with no payment or posting connectors | Owner |
| 11 | Deploy the Cloudflare Workers (`ops/cloudflare/`) | Fahad or owner |
| 12 | Production smoke test on a phone and a laptop; submit the sitemap in Search Console | Owner |
| 13 | Trademark search; auto-renew and registrar lock on `flatmeta.io` | Owner |
| 14 | Publish the mewebe.com listing (`mewebe-listing.md`) | Owner or boss |
| 15 | The first 10 submissions and outreach from the agents' drafts | Owner |
