# Company land (G12)

FlatMeta reserves land for real companies next to their public headquarters, so the map has content on day one and
each company can later claim (buy) its plot.

## What each plot is

- **Company facts only**, from [Wikidata](https://www.wikidata.org) (CC0 1.0): name, official website, industry, the
  headquarters and its coordinates. Source, Q-id and licence are stored in `company_sources` and on the plot
  (`showcase.source`, `sourceId`, `sourceUrl`, `license`).
- **Generic artwork made by FlatMeta**: procedural images from an industry motif and palette
  (`apps/api/src/companies/land.ts` → `ART`). No logos, trademarks or brand imagery are fetched or generated.
- **A welcome scene, a showroom layout and a "Claim this land" call to action** in the description and the button.
- **The label** "Reserved for {Company}, not affiliated with FlatMeta" (tagline, plot page banner, JSON-LD, `/brands`).
- **Hidden until the location check passes**: the plot must sit in the right country, within 1.5 km of the
  Wikidata HQ point. With `COMPANY_LAND_AUTO_VERIFY=true` (default) plots that pass are shown at once; the rest wait
  in **Admin → Showcase locations**.

Companies whose HQ is in another country are handed to that country's queue (e.g. AstraZeneca from SE goes to GB).
Companies without a website, without coordinates, with a name the moderation heuristics flag, or whose website
already has land, are skipped with a reason (`company_sources.skip_reason`).

## Schedule

Worker job `company-land`, daily at 04:13 UTC:

1. First the top `COMPANY_LAND_FIRST_PER_COUNTRY` (50) companies in each of `COMPANY_LAND_FIRST_COUNTRIES`
   (`CA,MX,IT,NL,SE,CH,KR,SG,ZA,NG`: countries the curated showcase does not cover yet).
2. Then `COMPANY_LAND_PER_DAY` (40) a day, rotating through `COMPANY_LAND_COUNTRIES`.

`COMPANY_LAND_ENABLED=auto` runs it on staging and production only. One run at a time (Redis lock). Wikidata asks
for a descriptive User-Agent: the job sends `FlatMetaBot/1.0 (+APP_URL/about/facts)`, no personal details.

Try a country by hand first (dry run by default):

```bash
npm run company-land -- --country CA            # which companies would get land, and why others not
npm run company-land -- --country CA --take 5 --apply
npm run company-land -- --daily                  # the daily plan now
```

Admins can do the same from the API: `POST /api/v1/admin/company-land/run` with `{ "country": "CA", "take": 5, "apply": false }`.

## Claiming and removal

- **Claim** (`/claim/<slug>`): verify with a work email at the company's domain, **or** a DNS TXT record
  (`_flatmeta.<domain>` or the domain itself: `flatmeta-verify=<token>`). Then the Landmark checkout, which includes
  3 months of the Brand plan (while paid checkout is off, the verified claim is saved as a lead and admins are emailed).
- **Removal** ("Request removal" on every plot): admins are emailed at once. Requests are handled within 48 hours;
  if one is still open after 48 hours the `takedown-sla` job hides the plot automatically until someone has looked.

## Discovery

`/brands` (all countries) and `/brands/<cc>` list the public company plots; both are in `sitemap-pages.xml`, and each
company page (`/p/<slug>`, titled "{Company} on FlatMeta") is in `sitemap-plots.xml`.
