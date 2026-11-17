# FlatMeta: launch and 9/10 proof report (GL10)

16 Nov 2026 · branch `v2` · build `93dbf39` · repository MeWeBe-com/flatmeta.io

## One page

**Where we are.** The go-live build is finished, tested and running on **staging**:
- **Selling:** a free company claim with a Business upsell and a launch offer; a trust block, FAQ and refunds; buyer pages and fair comparisons.
- **Payments:** Stripe with an account check, and PayPal Checkout.
- **Operations:** email from the project's domain, a health URL, error alerts, Cloudflare Workers, and daily QA and SEO checks with a weekly CEO report.
- **Promotion:** five agents with guardrails, a growth plan with 30 submission sites and a 30-day calendar, and the mewebe.com listing.

CI is green and staging deploys automatically. The release smoke test passes 19/19 on staging.

**What is not live yet, and why.** **www.flatmeta.io still runs an old build.** It shows "coming soon" on pricing, `/insights` is 404, the leaderboards return 500, and `llms.txt` is the old "Digital Twin" text. The cause is not the code. The production deploy path is switched off: CI has no `PROD_DEPLOY_*` secrets and the server has `AUTO_DEPLOY=false`. Payments, email and the schedules also wait on accounts, keys, DNS and one GitHub setting. Every one of these is a numbered step with an owner in `MANUAL-STEPS.md`.

**The score.** Round 1 averaged 5.4/10 and Round 2 averages 7.3/10.
- Lead Developer is at 9.
- No role was scored up for work that isn't live. VC, CEO and QA stay below 9 until production runs the build and takes money.
- The last points come from people, not code: deploying, adding keys, and winning the first customers.

**The decision for the boss.** Two server steps make everything above live, in about 30 minutes:
1. Turn production deploys on, with `AUTO_DEPLOY=true` or the CI secrets.
2. Re-render nginx.

Then confirm the Stripe account. That is the shortest path from 7.3 to 9.

| | Before (Round 1) | After (Round 2) |
|---|---|---|
| Average score | 5.4 | **7.3** |
| Production can take payments | No | Built; waits on Launch checklist steps 1–3 and Payments steps 1–5 |
| Real bugs on company pages and leaderboards | 2 (404, 500) | 0 on staging |
| Buyer and comparison pages | 2 | 8 |
| Scheduled checks of the live site | 0 | 3 workflows, waiting on the default branch |
| Agents | 0 | 5, with guardrails |
| Tests | 195 API + 55 web unit + ~240 e2e | 207 API + 76 web unit + ~295 e2e, CI green |

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
- `docs/golive/evidence/round1/` and `round2/`, each with `staging/` and `live/` screenshots and `audit.json`, plus Lighthouse `summary.json`;
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
- **Staging (`staging.flatmeta.io`, release `3b435f1`; `93dbf39` deploys after its CI):**
  - the new build: health, buyer pages, the free claim and the trust block;
  - the GL3a fixes and the Round 2 fixes.
- **Production (`www.flatmeta.io`):**
  - the old build: the map, plots, 369 reserved company plots and sign-in;
  - not the go-live build.
- **GitHub:** CI with a deploy to staging. The three scheduled workflows are committed but not yet scheduled.

**Waits on people:** these are the full numbered steps in `MANUAL-STEPS.md`.

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
