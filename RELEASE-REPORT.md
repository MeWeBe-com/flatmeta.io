# FlatMeta release report: growth + gamification (11 Nov 2026)

Branch `v2`, commits `9a5fe4d`…`9dcc782` on top of G1–G6. Every task in `tasks.md` → "Release: growth + gamification" is done (G1–G15). Each one was committed and pushed after lint, typecheck, unit/API tests and the end-to-end tests passed.

**Where it runs today:**
- **Staging, https://staging.flatmeta.io: the whole release is live.** CI deploys every green push to `v2`.
- **Production, https://www.flatmeta.io: still the previous build.** Production deploys only by hand (`scripts/deploy.sh` refuses CI). Run step 1 under "Manual steps" below.

## What is live (staging URLs; the same paths on www.flatmeta.io after the production deploy)

| Task | What | Try it |
| --- | --- | --- |
| G1 | Growth analysis: market shifts, funnel leaks, top 10 changes | `docs/growth-analysis-2026-11.md` |
| G2 | Nonce CSP, HSTS, frame protection, Permissions-Policy | `curl -sI https://staging.flatmeta.io/` |
| G3 | Showcase bulk verify; "Nearby on FlatMeta" on first visit | https://staging.flatmeta.io/ |
| G4 | Canonical `www`, plot sitemaps, share cards, JSON-LD | https://staging.flatmeta.io/sitemap-index.xml |
| G5 | `/@handle` links, share panel, Visit deep link | https://staging.flatmeta.io/@flatmeta |
| G6 | Privacy-friendly unique visitors per plot | the plot page and the editor |
| G7 | EXIF-free uploads, gallery removal, edit and upload limits | the editor |
| G8 | Custom HTML/JS on a separate sandboxed origin:<br>• versions and restore<br>• first-publish review<br>• kill-switches<br>• reports<br>• scan for miners, credential forms and non-allowlisted hosts | editor → Content → Custom HTML; **Admin → Custom HTML** |
| G9 | Walk mode: WASD and on-screen joystick, emotes, avatar styles, swear-word masking, block-aware live map | https://staging.flatmeta.io/ (City level and closer) |
| G10 | Open houses with reminders, "people here now", "Happening now" on the map | the plot page; the editor's sidebar |
| G11 | Share prompt after a claim; invite links with bonus squares for both people; weekly owner email with one-click unsubscribe | `/dashboard` (Invite friends); `/?ref=CODE` |
| G12 | Company land from Wikidata (daily job) and reserved-plot labels:<br>• claim by work email or DNS TXT<br>• 48-hour takedowns<br>• `/brands` directory | https://staging.flatmeta.io/brands; `/claim/adnoc` |
| G13 | Upgrade dialog at every paywall (one click to Stripe, back to the same page); admin metrics | `/admin/metrics`; `docs/pricing-review.md` |
| G14 | "Ask FlatMeta" in the map search; MCP tools for agents; `llms.txt` and `llms-full.txt` | https://staging.flatmeta.io/llms.txt; `/api/mcp` |
| G15 | `/about/facts`; AI crawlers welcome in `robots.txt` (production only); WebSite + SearchAction JSON-LD | https://staging.flatmeta.io/about/facts |
| Security fix | Plot descriptions rendered as React elements, never `innerHTML` | — |

Docs added: `docs/company-land.md`, `docs/pricing-review.md`, `docs/positioning.md`, and `docs/deploy-hestia.md` → "Usercontent origin".

## Test results

| Suite | Result |
| --- | --- |
| Lint and typecheck (API and web) | clean |
| API tests: real Postgres, Redis and WebSockets | **129 passed** (was 101 before G7) |
| Web unit tests | **21 passed** (CSP, canonical URL, Markdown renderer, robots) |
| End-to-end, Playwright, desktop and mobile, against a CI-identical stack | **56 passed, 0 failed** (14 device-specific skips) |
| GitHub Actions on `v2` | runs [#32](https://github.com/MeWeBe-com/flatmeta.io/actions/runs/43052408071), [#33](https://github.com/MeWeBe-com/flatmeta.io/actions/runs/43054415110) and [#34](https://github.com/MeWeBe-com/flatmeta.io/actions/runs/43056994189) **green**, each including e2e and the staging deploy; #34 is the release head (G14/G15) |

**CI note.** Runs for G7–G11 were cancelled by the next push, not failed. They sat in `playwright install --with-deps` because the runner's apt mirror was unreachable (DNS). Lint, typecheck, the API tests and the builds had all passed in those runs. CI now installs Chromium from Playwright's CDN and calls apt only if Chromium can't start, so a run takes about 9 minutes again.

New end-to-end tests cover each task. Highlights:
- **The sandboxed custom HTML can't read cookies or localStorage, can't reach the parent page, and can't navigate it.** The probe hides its intent from the scanner, so the browser's isolation is what's being tested.
- **Two signed-in players:** emotes and WASD walking seen live by the other player.
- **Phone:** the joystick walks the avatar.
- **Invite link:** sign-up, claim, both get bonus squares.
- **Paywall → Plus checkout → back on the same page, upgraded.**
- **Brands:** the directory, the label, and the DNS claim.
- **Ask FlatMeta**, `llms.txt`, and the facts page with its JSON-LD.

## Production smoke test

Run from outside, with Playwright and `curl`, on the public sites: `node scripts/release-smoke.cjs <site>`. Re-run it against https://www.flatmeta.io after step 1. Accounts can't be created on either site from outside, because codes are emailed. So the two-player checks use guests, and signed-in chat is covered by the e2e suite.

| Check | Staging (this release) | Production (previous build) |
| --- | --- | --- |
| CSP with nonce + `strict-dynamic` | PASS | FAIL (no CSP yet) |
| `frame-ancestors 'none'`, `X-Frame-Options: DENY` | PASS | FAIL |
| HSTS | PASS (`max-age=31536000; includeSubDomains`) | FAIL (missing) |
| `nosniff`, Referrer-Policy | PASS | PASS |
| `/@handle` → owner's plot | PASS (`/@flatmeta` → `/p/flatmeta-hq`) | FAIL (no handles yet) |
| Share link: plot page with `og:image` + canonical | PASS | PASS |
| Reserved company plot shows "Reserved for …, not affiliated with FlatMeta" | PASS (`/p/adnoc`) | FAIL (no visible company plots) |
| Claim page with email and DNS options | PASS (`/claim/adnoc`) | FAIL |
| `/brands` directory | PASS (10 countries) | FAIL |
| Sandbox preview needs sign-in; unknown preview token is 404 | PASS | partial |
| `llms.txt` describes FlatMeta accurately | PASS | not checked (static file, see step 5) |
| `/about/facts`; WebSite + SearchAction JSON-LD | PASS | not checked |
| Ask FlatMeta answers | PASS (search summary: no AI key on staging) | not checked |
| Two players see each other live | PASS | PASS |
| WASD walks the avatar | PASS | FAIL |
| Emote reaches the other player | PASS | FAIL |
| Chat is for signed-in players (guests get the sign-in prompt) | PASS | FAIL |
| **Total** | **19/19** (after the G14/G15 deploy) | **4/13** (the previous build; the new checks were not run there) |

Covered by the e2e suite in CI (the same code), because they need signed-in accounts:
- **Custom HTML isolation:** a sandboxed frame gets `SecurityError` for `document.cookie`, `localStorage` and `parent.document`, and can't navigate the top page.
- **Two signed-in players:** proximity chat bubbles, DMs, emotes and walking.

After the production deploy, do the two-person check in "Manual steps" (step 7).

## Still to do, and why

- **Production deploy.** CI deploys only staging; production needs a person in a terminal (step 1).
- **Usercontent origin.** `usercontent.flatmeta.io` has no DNS record yet. It needs DNS, the Hestia domain and SSL (root), then `USERCONTENT_URL` (steps 2–3).
  - Until then, custom HTML is still served sandboxed with an opaque origin, from `/api` on the site's own origin.
  - The brief asks for a separate origin, so **don't publish custom HTML widely on production before this is done**. The global kill-switch is under Admin → Custom HTML if needed.
- **Showcase location verify on production.** 140 curated plots are hidden until it runs (step 4).
- **External `llms.txt` and insights.** A static `llms.txt` written by the separate insights automation still describes FlatMeta as a "3D digital twin marketplace". It needs replacing on the server, and the automation needs pointing at `docs/positioning.md` (step 5).
- **Company land on production.** It starts by itself at 04:13 UTC after the deploy; you can start it earlier (step 6).
  - The first pass is the top 50 companies in CA, MX, IT, NL, SE, CH, KR, SG, ZA and NG. After that, 40 a day.
  - A live dry run against Wikidata from here worked: Sweden returned 44 companies and 8 would be created; AstraZeneca was correctly routed to GB.
- **Selling.** Production already reports `paidCheckout: true`, so the new upgrade dialog sells Plus for real as soon as production is deployed.
  - Before that, run through the "Turn it on" and "Live smoke test" sections of `docs/stripe-live.md`, if not done already.
- **Weekly owner email.** It is on by default for owners of published land, with one-click unsubscribe and a Settings switch. It needs the production email provider (Resend), which staging already has.
  - The first send is the next Monday after the deploy.
  - If your legal review wants opt-in for existing users instead, set everyone's `weekly_email` to false once (step 8).
- **Ask FlatMeta quality.** Without an AI key it answers with a plain search summary, which is weak for category questions: on staging "banks in Abu Dhabi" listed a museum and a university. With `ANTHROPIC_API_KEY` set on production, Claude writes the answer from the same results and cites only those plots.
- **Not done by design:**
  - Agents never pay on someone's behalf: paid land returns a checkout link.
  - The `ask_flatmeta` MCP tool uses the search summary, not the LLM, to keep agent traffic free.

## Manual steps

Replace `USER` with the Hestia user that owns `flatmeta.io`. Steps 2 and 5 need root.

**1. Deploy production** (as the app user; asks you to type `production`; runs migrations 0005–0008; health-checks, and rolls back if they fail):
```bash
cd ~/web/flatmeta.io/private/flatmeta && bash scripts/deploy.sh production
```

**2. Usercontent origin (root, Hestia).** Full guide: `docs/deploy-hestia.md` → "Usercontent origin". First add a proxied `A` record `usercontent` → the server IP in Cloudflare, then:
```bash
v-add-web-domain USER usercontent.flatmeta.io
v-add-letsencrypt-domain USER usercontent.flatmeta.io
v-change-web-domain-proxy-tpl USER usercontent.flatmeta.io NodeJS
install -m 644 /home/USER/web/flatmeta.io/private/flatmeta/deploy/hestia/usercontent.conf /home/USER/conf/web/usercontent.flatmeta.io/nodejs/nodejs-app.conf
printf '' > /home/USER/conf/web/usercontent.flatmeta.io/nodejs/nodejs-app-fallback.conf
nginx -t && systemctl reload nginx
```
For staging, repeat with `usercontent-staging.flatmeta.io`, and change `3251` to `3201` in the copied file.

**3. Env vars** (production `.env`, then run step 1 again; never commit `.env`):
```bash
USERCONTENT_URL=https://usercontent.flatmeta.io    # required for G8's separate origin
USERCONTENT_CONNECT_HOSTS=                         # optional: APIs owner code may call, comma-separated
COOKIE_DOMAIN=                                     # keep empty (host-only cookies), so the subdomain never gets the session
# Optional (defaults are fine):
# REFERRAL_BONUS_CELLS=10  REFERRAL_MAX_PER_DAY=20
# COMPANY_LAND_ENABLED=auto  COMPANY_LAND_PER_DAY=40  COMPANY_LAND_FIRST_PER_COUNTRY=50  COMPANY_LAND_AUTO_VERIFY=true
# CANONICAL_URL=https://www.flatmeta.io   (only if the canonical host should differ from the default www rule)
```
Then check:
```bash
curl -sI https://usercontent.flatmeta.io/v1/plots/<plot-id-with-live-html>/sandbox | grep -i content-security-policy   # starts with "sandbox allow-scripts;"
curl -s -o /dev/null -w '%{http_code}\n' https://www.flatmeta.io/api/v1/plots/<id>/sandbox                             # 404 on the site origin
```

**4. Showcase location verify** (production checkout; dry run first, then apply):
```bash
cd ~/web/flatmeta.io/private/flatmeta && npm run showcase:verify
npm run showcase:verify -- --apply
```

**5. Replace the external `llms.txt` (root or the app user).** The app serves an accurate `/llms.txt`; remove the static one so the app's is served. Back it up first:
```bash
mv /home/USER/web/flatmeta.io/public_html/llms.txt /home/USER/web/flatmeta.io/public_html/llms.txt.bak-2026-11-11
curl -s https://www.flatmeta.io/llms.txt | head -3      # should start with "# FlatMeta" and "a shared world map"
```
Then point the insights automation's prompt at `docs/positioning.md`.

**6. Start company land now, instead of at 04:13 UTC** (optional):
```bash
cd ~/web/flatmeta.io/private/flatmeta && npm run company-land -- --country CA   # dry run: who would get land
npm run company-land -- --daily                                                   # the first pass
```

**7. Two-person check on production after the deploy** (10 minutes):
- Both people sign in and stand at the same spot. Check you see each other walk (WASD or joystick), chat bubbles, emotes and block.
- One person publishes custom HTML. An admin approves it in Admin → Custom HTML. It shows on the plot page from `usercontent.flatmeta.io`.
- Claim a reserved company plot's page with DNS: the TXT instructions appear.

**8. Optional: weekly email as opt-in for existing users** (only if your legal review wants it):
```bash
set -a; . ./.env; set +a; psql "$DATABASE_URL" -c "update users set weekly_email = false where created_at < now();"
```

## Security summary

- **Every new endpoint has authentication where it changes or reveals private data, plus authorisation (owner, staff or admin), Zod input validation and a rate limit.** Tests cover each rule:
  - sign-in required;
  - other users and non-admins refused;
  - bad input rejected;
  - signed tokens per user;
  - unsafe return paths refused;
  - DNS tokens per claim.
- **`dangerouslySetInnerHTML` is no longer used with user content.**
  - Plot descriptions now render through a React Markdown renderer.
  - The two remaining uses are the static theme script (nonce) and JSON-LD: data serialised with `<` escaped, inside `type="application/ld+json"`.
  - Owner HTML runs only as sandboxed documents.
- **Usercontent host.** The API refuses sandbox documents on the site's host once `USERCONTENT_URL` is set. On the usercontent host it serves nothing else and drops cookies and `Authorization`.
- **No secrets** were printed, logged or committed. Wikidata requests use a generic User-Agent with no personal details.
- **Company plots** use company names only with the "not affiliated with FlatMeta" label. Artwork is generic and procedural, with no logos. Takedown requests are handled within 48 hours; if not, the plot is hidden automatically.
