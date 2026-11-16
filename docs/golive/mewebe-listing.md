# FlatMeta on mewebe.com: the product listing (GL9)

This is the copy and data for FlatMeta's product page and card on mewebe.com, ready to paste.

- **Prices:** taken from the live price list (`/api/v1/billing/plans`) on 16 Nov 2026. If they change, update them from the same place, never from memory.
- **Numbers:** use them only once production runs the current build (see `MANUAL-STEPS.md` → Launch checklist, step 1). On 16 Nov, production shows 1 user plot, 1 explorer, 369 reserved company plots and 20 countries. Until the user numbers grow, show only the company and country numbers.

**Who:** the owner or the boss publishes it on mewebe.com. The Marketing agent may draft updates but never publishes.

---

## Card (portfolio grid)

| Field | Value |
|---|---|
| Name | FlatMeta |
| Status | Live · https://www.flatmeta.io |
| One-liner (≤ 60) | The world map where you can claim your own place |
| Card text (≤ 140) | Free land on a shared world map, turned into your page. Verified business pages AI assistants can read. |
| Category | Maps · Local business marketing · AI-ready web |
| Button | "Visit FlatMeta" → `https://www.flatmeta.io/?utm_source=mewebe&utm_medium=portfolio&utm_campaign=card` |
| Second button | "For business" → `https://www.flatmeta.io/for/local-businesses?utm_source=mewebe&utm_medium=portfolio&utm_campaign=card` |
| Image | 1200×630 share image: `https://www.flatmeta.io/opengraph-image`, or a fresh screenshot of the globe view |
| Logo | `https://www.flatmeta.io/icons/icon-512.png` |

---

## Product page

**Page title (≤ 60):** FlatMeta: a world map where every plot is a page | MeWeBe
**Meta description (≤ 160):** FlatMeta by MeWeBe: claim free land on a shared world map and make it your page. Verified business pages that people and AI assistants find.

### Hero
**Heading:** Your place on the world map
**Text:** FlatMeta is a shared, real-world map where people, businesses and brands claim land and turn it into a page: a cover, a story, links, a gallery, hours and offers. Explorers walk the map as avatars and visit. Every page is structured data that search engines and AI assistants read.
**Buttons:** "Claim free land" (`/?claim`), "See pricing" (`/pricing`). Add the UTM tags from the card.

### Who it is for
- **Companies:** many already have a landmark reserved next to their headquarters. Verified staff claim it with a work email or a DNS record, free during launch. → `/for/brands`
- **Local businesses:** a verified page at your real address, with hours, an "Open now" marker, offers and booking links, readable by AI assistants. → `/for/local-businesses`
- **Creators and everyone:** free land, your own page, one short link. → `/for/creators`

### Features
- A living world map, from the globe down to the street, with avatars, chat with people nearby, guestbooks and leaderboards.
- An AI Designer that drafts your page's copy and artwork from one line.
- Verified business and brand badges, team seats, and visit and like analytics.
- An open REST API and an MCP server, so AI agents can search places and read pages. Agents never pay on someone's behalf.
- Fast, accessible pages, tested on 12 screen sizes, with a Lighthouse mobile budget on every release.
- No crypto, no NFTs: a plot is a page, not an investment.

### Pricing (from the live price list, 16 Nov 2026)

| Plan | Price | For |
|---|---|---|
| Free | $0, with your first land free | Everyone |
| Plus | $5/month or $48/year | Explorers and creators |
| Business | $29/month or $290/year | Local businesses |
| Brand | $249/month or $2,490/year | Brands and organisations |
| Company landmark claim | Free during the launch offer | Verified staff of the company |
| Extra land | From $1 to $25 per cell, by area tier | Anyone |

Under the table: "Prices in USD. Card payments by Stripe; PayPal for one-time purchases. Cancel any time." Show the PayPal mention only once PayPal is live (`MANUAL-STEPS.md` → Payments).

### Proof
Use only real facts:
- "369 companies have a landmark waiting in 20 countries." These are the production numbers from 16 Nov.
- "Built and run by MeWeBe."
- Add user numbers, quotes or logos only once they exist and the people concerned have given written permission.

### FAQ
Reuse these three from the site, word for word:
- "Is FlatMeta crypto, NFTs or a virtual real-estate investment?"
- "What does a business get?"
- "Can I cancel?"

The full answers are in `apps/web/src/components/trust.tsx`.

---

## Structured data for the mewebe.com page

Paste it into the page `<head>`. The publisher is MeWeBe, the product is FlatMeta, and the offers match the table above.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "FlatMeta",
  "url": "https://www.flatmeta.io",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web browser",
  "description": "A shared world map where people, businesses and brands claim land and publish a page on it. The first land is free.",
  "publisher": { "@type": "Organization", "name": "MeWeBe", "url": "https://mewebe.com" },
  "offers": [
    { "@type": "Offer", "name": "Free", "price": "0.00", "priceCurrency": "USD" },
    { "@type": "Offer", "name": "Plus", "price": "5.00", "priceCurrency": "USD" },
    { "@type": "Offer", "name": "Business", "price": "29.00", "priceCurrency": "USD" },
    { "@type": "Offer", "name": "Brand", "price": "249.00", "priceCurrency": "USD" }
  ]
}
</script>
```

On flatmeta.io, add `https://mewebe.com/<the FlatMeta page>` to `NEXT_PUBLIC_SAME_AS`, comma-separated. The site's Organization JSON-LD then links back to mewebe.com.

---

## Machine-readable export (for mewebe.com's marketing tools)

```json
{
  "product": "FlatMeta",
  "url": "https://www.flatmeta.io",
  "status": "live",
  "tagline": "The world map where you can claim your own place",
  "short": "Claim free land on a shared world map and turn it into your page. Businesses get found by people and AI assistants; companies claim their landmark.",
  "audiences": ["companies with a reserved landmark", "local businesses", "creators"],
  "links": {
    "home": "https://www.flatmeta.io/",
    "pricing": "https://www.flatmeta.io/pricing",
    "business": "https://www.flatmeta.io/for/local-businesses",
    "brands": "https://www.flatmeta.io/for/brands",
    "creators": "https://www.flatmeta.io/for/creators",
    "companies": "https://www.flatmeta.io/brands",
    "facts": "https://www.flatmeta.io/about/facts",
    "llms": "https://www.flatmeta.io/llms.txt",
    "api": "https://www.flatmeta.io/api/docs",
    "mcp": "https://www.flatmeta.io/api/mcp"
  },
  "pricesFrom": "https://www.flatmeta.io/api/v1/billing/plans",
  "statsFrom": "https://www.flatmeta.io/api/v1/world/stats",
  "assets": {
    "logo": "https://www.flatmeta.io/icons/icon-512.png",
    "shareImage": "https://www.flatmeta.io/opengraph-image"
  },
  "contact": "hello@flatmeta.io",
  "operator": "MeWeBe"
}
```

**Checks after publishing (who: owner):**
- The mewebe.com page links to `https://www.flatmeta.io`, not to the bare domain or the old build.
- The UTM visits show up in FlatMeta analytics (`NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, if set).
- Google's Rich Results Test passes the JSON-LD on the mewebe.com page.
