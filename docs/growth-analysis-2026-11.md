# FlatMeta growth analysis (November 2026)

**Question from the brief:** how does FlatMeta win traffic, growth and profit in today's AI market, and what should change first?
**Where we stand (production, 11 Nov 2026):** the product is complete: a map with land, plots with mini-pages, avatars, live chat, clans, a marketplace, and live Stripe. But the public world is **empty**: `/api/v1/world/stats` shows 1 plot (FlatMeta HQ), 0 visible showcase plots and 1 explorer. Nothing in the product brings people back or makes them invite others yet. Traffic comes almost entirely from the insights articles.

## 1. What changed in the market, and what it means for FlatMeta

| Shift | What it means for us | Play |
| --- | --- | --- |
| **AI answer engines** (ChatGPT search, Perplexity, Google AI Overviews, Claude) answer instead of linking | Thin, templated articles stop earning clicks, and can count as scaled-content abuse. What gets cited is **unique, structured, verifiable data**: places, companies and coordinates | Make every plot and company a crawlable page with JSON-LD and a stable URL (G4, G12). Keep the insights on-topic (G15). |
| **AI agents and MCP**: assistants act for users | Agents need an API they can call: "find a spot near the Louvre", "show me Nike's FlatMeta plot", "claim land for my café". We already have REST + MCP. | Publish them: llms.txt, an MCP listing, and agent-friendly search and claim (G14). Treat agents as a distribution channel. |
| **Cheap AI images and 3D** | Anyone can make good-looking content in seconds, so an empty plot has no excuse | AI design for every new plot (exists); generated artwork for company plots (G12); paid premium themes (G13). |
| **Creator economy and link-in-bio** | People share a page that is *theirs* | `flatmeta.io/@handle` as a link-in-bio with a map pin; share buttons; visitor counts that are worth showing off (G5, G6, G11). |
| **Brands want presence where attention is**, cheaply after the "metaverse" bust | A plot on a world map, where people actually walk past, is a low-risk, measurable presence | Reserve land for real companies near their HQ (G12) and sell it as a Brand plan with verification (G13). |
| **Trust and safety expectations** | Custom HTML, chat and brand names are liabilities if handled loosely | Strict CSP, sandboxed custom code on its own origin, moderation, takedown within 48 h (G2, G8, G9, G12). |

## 2. The funnel today and where it leaks

**Visit → see something → claim → personalise → share → return → pay**

1. **Visit → see something.** *Biggest leak.* A new visitor lands on an empty globe, and the avatar starts where they are with nothing around. The 140 showcase plots are hidden until their locations are checked. → G3 (bulk verify + nearest content), G12 (more content), G10 ("people here now").
2. **Claim.** Free land works, but nothing tells the visitor *why* to claim or what they get. → G11 share prompt + referral bonus, clearer call to action.
3. **Personalise.** It works (AI designer, images), but owners can't add their own HTML safely, and galleries are limited. → G7, G8.
4. **Share.** *Second-biggest leak.* Plot URLs are slugs, there is no handle, there are no share buttons and no "visit me" link. Each share is a free acquisition channel we aren't using. → G5, G4 (good share cards).
5. **Return.** No visitor counts, no events, no weekly email: nothing pulls owners back. → G6, G10, G11.
6. **Pay.** Plans exist but nothing upsells them. Brands, the highest-value buyers, have nothing to claim yet. → G12, G13.
7. **Organic and AI search.** The sitemap lists only insights articles (0 plot pages), canonicals point at the redirecting apex `flatmeta.io` instead of `www`, and `llms.txt` describes a "3D digital twin marketplace" rather than the product. → G4, G14, G15.
8. **Trust.** Web pages send no CSP, frame protection or HSTS. → G2.

## 3. The 10 highest-impact changes (ranked by impact ÷ effort)

| # | Change | Impact | Effort | Task |
| --- | --- | --- | --- | --- |
| 1 | Show content on first visit: bulk-verify the 140 showcase plots, and show the nearest plots around the visitor | Very high (fixes the empty world) | S | G3 |
| 2 | Canonical `www` host, plot sitemap, per-plot share cards and JSON-LD | High (SEO + AI citations) | S | G4 |
| 3 | Handles and share links (`/@handle`), share buttons, "visit" deep link | High (viral loop) | M | G5 |
| 4 | Security headers (CSP, HSTS, frame-ancestors) | High (trust, required before custom HTML) | S | G2 |
| 5 | Company land automation from Wikidata, reserved for brands | Very high (content + revenue pipeline) | L | G12 |
| 6 | Brand upsell on reserved plots + an admin metrics page | High (profit, measurement) | M | G13 |
| 7 | Visitor counter (privacy-friendly) | Medium-high (gives owners a reason to return and share) | S | G6 |
| 8 | Growth loop: share prompt, referral bonus, weekly owner email | High | M | G11 |
| 9 | AI-native: llms.txt, MCP/agent search and claim, "Ask FlatMeta" | Medium-high (new channel) | M | G14 |
| 10 | Walk mode, proximity chat, open-house events | Medium (engagement and retention) | L | G9, G10 |

Custom HTML/JS (G8) and richer personalisation (G7) are table stakes for creators, but they come after G2 because they depend on its security model.

## 4. Extra quick wins (G15+)

- **G15a Fix positioning in the external content.** The insights automation writes `llms.txt` and articles about VR headsets and "3D digital twins". Point it at what FlatMeta is (a shared world map where people and brands own land), and add an app-generated facts page that AI engines can cite (`/about/facts`).
- **G15b Explicitly welcome AI crawlers** (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) for public pages in robots.txt, and keep them out of private areas.
- **G15c `WebSite` + `SearchAction` JSON-LD** on the home page (sitelinks search box; agents understand the search URL).

## 5. What we measure

Daily signups, claims (free and paid), shares (link copies, share-sheet uses), unique plot visitors, returning owners (7-day), paid conversions and revenue. The admin metrics page (G13) shows these per day. Target for the first month: 1,000 claimed plots, 10% of owners sharing, 5 brand claims.
