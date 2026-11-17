# GL1: Domain research report (16 Nov 2026)

> **Boss decision, 17 Nov 2026: FlatMeta keeps `flatmeta.io` only. No other domain is bought or planned.** The availability findings below are kept as research only; §3 is updated to match the decision.

**Decision already made by the owner: `flatmeta.io` stays, no rename.** This report checks that decision from three angles (an SEO Director, a Brand Strategist and a Startup VC) and lists defensive domains worth buying because they are cheap.

**How it was checked:**
- **Availability:** a direct RDAP lookup at each registry (Verisign for .com/.net, Google Registry for .app, Nominet for .uk, Identity Digital for .io), calibrated against known-registered names (google.com, google.co.uk, get.app). The script is `scripts/rdap-check.sh`.
- **The search landscape:** web searches on 16 Nov 2026.
- **Not checked:** I had no paid SEO tool here (Ahrefs/Semrush), so keyword difficulty is a reasoned estimate, labelled as such. I could not search the trademark registers (USPTO, UKIPO, EUIPO) from this environment either: the trademark section is a risk assessment, and MANUAL-STEPS.md → "Domains" step 4 is the 10-minute register search to confirm it.

## 1. The current name: FlatMeta / flatmeta.io

| Question | Finding |
|---|---|
| Who else ranks for "FlatMeta"? | **Nobody.** A search for "FlatMeta" on 16 Nov returned only unrelated developer pages (a Rust `FlattenMeta` trait, "flat file metadata" docs). No company, app or social brand uses the name. A brand search can be won with the site's own pages plus a handful of profiles. |
| Category competitors on Google (non-brand terms) | **"Own land on a world map" (virtual land):** Earth2, Atlas Earth, Upland, Next Earth, Decentraland, The Sandbox. These are crypto or speculative "virtual real estate" products with strong domains and years of links.<br>**"Business on a map" / link in bio:** Linktree, Taplink, UniLink, Bio Sites, Google Business Profile. All are very strong domains. |
| Keyword difficulty (estimate) | "virtual land", "buy land on earth map": **high** (Earth2/Upland plus press). "link in bio for local business": **very high** (Linktree and the big blog networks). **Low** for long-tail, place-bound queries FlatMeta can own with its programmatic pages: "<company> headquarters on a map", "<city> businesses map", "claim <company> plot". That is where the 368 `/p/<company>` pages, `/brands/<cc>` and `/c/<cc>` already compete. The brand query "flatmeta" has zero competition. |
| Memorability | Two common words, 8 letters, one spelling, easy to say. Weaknesses: "Meta" makes people think of Meta (Facebook) and the "metaverse", which the positioning explicitly avoids, and "Flat" can suggest "flat earth" or a flat (apartment). It reads as a tech brand, not a local or map brand. |
| Trademark and confusion risk (assessment, not legal advice) | **Medium.** Meta Platforms actively opposes "Meta + X" marks in tech and payments: oppositions against MetaPay (Canada, 2026) and disputes with MetaX, Metabyte and Metacapital. Meta has also been on the other side of reverse-confusion suits. A "FlatMeta" class 9/35/42 filing could attract an opposition; using the name for a small map product is lower risk than registering it. Mitigation: never use Meta's logo style or blue, never say "metaverse" (already in `positioning.md`), file a UK mark for the word with a clear description ("online world map of user-owned plots"), and run the register search in MANUAL-STEPS.md → "Domains" step 4 first. |
| `.io` | Trusted by developers and startups; slightly less trusted by small-business buyers than `.com`. The registration (2022-04-21, expires 2027-04-21) should be **set to auto-renew**. |

**The surprise finding: `flatmeta.com` is not registered (RDAP 404 at Verisign, 16 Nov 2026).** Neither are `flatmeta.app`, `flatmeta.co.uk`, `flatmeta.uk`, `flatmeta.co` or `flatmeta.net`. Anyone can register the `.com` for about $10 and then own the more trusted version of the brand (typo traffic, email lookalikes, a squatter's resale price). That makes `flatmeta.com` the one domain to buy today.

## 2. Top 5 alternative domains (for reference; the owner keeps flatmeta.io)

All checked by RDAP on 16 Nov 2026 (available = no record at the registry; confirm at the registrar, since premium-priced names also return 404).

| # | Domain | RDAP | Why it is low-competition and high-trust |
|---|---|---|---|
| 1 | **plotglobe.com** | available | Says exactly what it is (a plot on the globe); a `.com`; nobody ranks for "plot globe"; no famous mark to collide with. |
| 2 | **claimaplot.com** | available | Built around the action ("claim a plot") and buyer intent; easy to brand "Claim a plot near your shop". |
| 3 | **ownthemap.app** | available | Strong verb and promise; `.app` is HTTPS-only by registry rule (a trust signal). `ownthemap.com` is taken (2017). |
| 4 | **worldplot.app** | available | Short, generic, map-native; `worldplots.com` is taken (2010) and may compete for the brand query. |
| 5 | **earthplot.app** | available | Short and clear; it may be confused with Earth2, which is the trade-off. |

Also checked: myplotmap.com, plotmap.app, mapplots.com, pinplot.app, plotpin.com/.app, yourplot.app and claimtheglobe.com are **registered** (by others). The full output is in the appendix.

## 3. Recommendation (updated 17 Nov 2026)

**`flatmeta.io` is the one and only domain** (boss decision, 17 Nov). No defensive domains are bought or planned.

What keeps the brand safe without extra domains:
- **Renewal and lock:** turn on auto-renew (it expires 2027-04-21), the registrar lock, and 2FA on the registrar account (MANUAL-STEPS → Domains).
- **The trademark search** before any PR (MANUAL-STEPS → Domains). A UK word mark is the real protection against lookalikes, more than a parked `.com`.
- **Say the full address in all marketing:** "flatmeta.io" in copy, voice and print, never "FlatMeta dot com".
- **Email authentication** (SPF, DKIM, DMARC with `p=quarantine`, GL5), so lookalike senders fail delivery checks.

**Why no rename:** a rename resets brand searches, inbound links, the 600+ indexed URLs, the sitemaps and the IndexNow history, for a small trust gain. Revisit it only if a trademark opposition appears. Then the switch is a `.env` change (§4).

## 4. Switching domain is a `.env` change (done in GL1)

Every absolute URL, link, email address and the brand name in metadata come from configuration:

| Setting | Used for |
|---|---|
| `APP_URL` | every link, canonical, sitemap, OAuth callback, Stripe/PayPal return URL and email link (the production canonical host is `www.` + `PRODUCTION_DOMAIN` unless `CANONICAL_URL` is set) |
| `PRODUCTION_DOMAIN`, `STAGING_DOMAIN` | the bare-domain → www redirect, cookies, robots and staging checks, the nginx include rendered by `scripts/new-instance.mjs` |
| `APP_NAME` | page titles, JSON-LD, emails, the web manifest |
| `MAIL_FROM` | the sender of every email (default `<APP_NAME> <noreply@<PRODUCTION_DOMAIN>>`) |
| `CONTACT_EMAIL` | the contact address on legal pages and in the footer (default `hello@<PRODUCTION_DOMAIN>`) |

`apps/web/test/unit/no-hardcoded-domain.test.ts` fails the build if source code writes the production domain outside the config defaults. The copy that shows a link to users ("your link: flatmeta.io/@you") reads the domain from config too.

## Appendix: RDAP results, 16 Nov 2026

```
flatmeta.io: registered (created 2022-04-21, expires 2027-04-21)
flatmeta.com: available (RDAP 404)
flatmeta.net: available (RDAP 404)
flatmeta.app: available (RDAP 404)
flatmeta.co.uk: available (RDAP 404)
flatmeta.uk: available (RDAP 404)
flatmeta.co: available (RDAP 404)
getflatmeta.com: available (RDAP 404)
flatmetamap.com: available (RDAP 404)
plotglobe.com: available (RDAP 404)
plotglobe.app: available (RDAP 404)
myplotmap.com: registered (created 2025-07-02)
plotmap.app: registered (created 2020-10-28)
claimaplot.com: available (RDAP 404)
claimmyplot.com: available (RDAP 404)
mapplots.com: registered (created 2025-02-26)
plotsonearth.com: available (RDAP 404)
earthplot.app: available (RDAP 404)
worldplot.app: available (RDAP 404)
worldplots.com: registered (created 2010-10-13)
ownthemap.com: registered (created 2017-07-21)
ownthemap.app: available (RDAP 404)
pinplot.app: registered (created 2025-08-30)
mapclaim.app: available (RDAP 404)
landpin.app: available (RDAP 404)
plotpin.com: registered (created 2026-10-30)
plotpin.app: registered (created 2026-06-04)
worldplot.co.uk: available (RDAP 404)
claimtheglobe.com: registered (created 2026-08-31)
yourplot.app: registered (created 2026-04-14)
```

**Sources (16 Nov 2026):**
- Earth2 vs Decentraland vs Sandbox (e2japan.com/blog/earth2-vs-decentraland-sandbox)
- Atlas Earth adds real-world landmarks (gamesbeat.com)
- Earth 2 alternatives (cbinsights.com/company/earth-2/alternatives-competitors)
- Meta named in a reverse-confusion trademark suit (thefashionlaw.com)
- MetaX opposition (mandourlaw.com)
- Metabyte v. Meta (mondaq.com)
- CIPO MetaPay opposition decision (decisions.opic-cipo.gc.ca)
- UniLink map block (unil.ink/marketplace/blocks/map)
- atom.bio for small business (atom.bio)
