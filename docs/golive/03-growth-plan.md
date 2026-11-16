# FlatMeta growth plan (GL7)

16 Nov 2026. This plan builds on what is already in the product: sitemaps with real lastmod, llms.txt and llms-full.txt, the MCP server, `/brands`, `/p/<slug>`, `/insights`, and the new `/for/*` and `/compare/*` pages. **Nothing here spends money.** Posts are drafted for the owner to publish from the **FlatMeta brand accounts**, never as a person.

**Who the plan sells to** (from `02-viability-profit-report.md`):
- **A, primary:** companies whose landmark is already reserved: "claim your company's landmark, free during launch".
- **B:** local businesses: "be found on the map by people and by AI assistants".
- **C:** creators and people: "free land, your own page, one link".

**Measured weekly** by the CEO agent (`ops/agents/ceo.md`):
- sign-ups;
- plots published;
- company claims;
- paid orders;
- referring domains, from Search Console and Bing Webmaster Tools;
- pages indexed.

---

## 1. On-site SEO (done in the code, GL7)

| Item | Where | Check |
|---|---|---|
| Titles ≤ 60 characters with "FlatMeta" once; meta descriptions; OG and Twitter cards | every page (`siteTitle`, the plot page rules from S3 and S4) | e2e `seo.spec.ts`, `golive-seo.spec.ts` |
| JSON-LD: **Organization** on every page | `layout.tsx` | |
| JSON-LD: **SoftwareApplication** with real offers | `/pricing` | |
| JSON-LD: **FAQPage** | `/pricing`, `/business`, `/for/*`, `/compare/*` | |
| JSON-LD: **BreadcrumbList** | all hub pages | |
| JSON-LD: **Place**, **LocalBusiness** or **Organization** | plot pages | |
| Sitemap index with a real `lastmod` per child sitemap | `/sitemap.xml` | the newest entry in each child |
| `robots.txt` lists only the index; private pages are disallowed | `/robots.txt` | `crawl-hygiene.spec.ts` |
| Buyer-intent pages | `/for/local-businesses`, `/for/brands`, `/for/creators` | |
| Fair comparisons | `/compare/google-business-profile`, `/compare/linktree`, `/compare/earth2` | each says it is not affiliated, and dates the facts |
| `llms.txt` and `llms-full.txt` from the app | they list the new pages, and point to `/pricing` for prices instead of copying them | `landing.test.ts` |
| Lighthouse, mobile | the new pages score performance 96, accessibility 100, best practices 100 (local build) | the SEO score needs production: local builds are `noindex` on purpose. CI runs Lighthouse on every push; GL8 adds a daily run on the live site. |

**After launch (owner, once):**
- Google Search Console and Bing Webmaster Tools: verify `www.flatmeta.io` and submit `/sitemap.xml`.
- IndexNow is already wired.
- Watch "Pages → Why pages aren't indexed" weekly.

---

## 2. Copy to paste

**Name:** FlatMeta
**URL:** https://www.flatmeta.io
**Tagline (≤ 60):** The world map where you can claim your own place
**Short (≤ 160):** Claim free land on a shared world map and turn it into your page. Businesses get found by people and AI assistants; companies claim their landmark.
**Categories:** Maps · Local business marketing · Social · Developer tools (API + MCP)
**Tags:** world map, local SEO, link in bio, AI agents, MCP, small business, landmarks

**Long (≈ 500 characters):**
> FlatMeta is a shared world map where people, businesses and brands own land. Every plot is a page: a cover, a story, links, a gallery, a guestbook, hours and offers. Explorers walk the map as avatars, chat with people nearby and visit plots. Your first land is free. Local businesses get a verified page at their real address, written as structured data that search engines and AI assistants read. Many companies already have a landmark reserved next to their headquarters; verified staff claim it. No crypto, no NFTs.

**Maker comment (Product Hunt, Hacker News, Indie Hackers):**
> We built FlatMeta because "where should I go?" is moving from search boxes to AI assistants, and local businesses have no say in what those assistants see. Every FlatMeta plot is a page you design and also clean structured data, and we run an open MCP server so any agent can search it. Claim free land, try the AI Designer, and tell us what's missing. We read every comment.

**Developer copy (for API and MCP directories):**
> FlatMeta's MCP server lets agents search places on a world map, find what's nearby, list companies and open houses, read a plot page, check availability and start a claim. Agents never pay: paid land returns a checkout link for the human. Read tools need no key. Endpoint: https://www.flatmeta.io/api/mcp · OpenAPI: https://www.flatmeta.io/api/openapi.json

---

## 3. 30 places to submit to (free)

**Order:**
1. **Week 1:** 1–10, as soon as production runs the new build (Launch checklist step 1).
2. **Week 2:** 11–20.
3. **Week 3:** 21–30.
4. **Product Hunt:** on a Tuesday, once 20+ real plots exist.

**Who:** the owner, from the brand accounts. The Marketing agent drafts, and it never submits or posts.

| # | Site | Section | Copy | Notes |
|---|---|---|---|---|
| 1 | Google Search Console | — | — | Verify, then submit the sitemap |
| 2 | Bing Webmaster Tools | — | — | Import from Search Console. Also feeds DuckDuckGo and ChatGPT search |
| 3 | Product Hunt | Launch | Tagline + Long + Maker comment | Use 5 gallery images from `docs/golive/evidence/round2/` |
| 4 | Hacker News | Show HN | Title "Show HN: FlatMeta – a world map where every plot is a page agents can read" + Maker comment | Post at 8–9am US Eastern. Answer every comment |
| 5 | Indie Hackers | Products + a post | Long + Maker comment | Share the honest numbers from the weekly report |
| 6 | Reddit r/SideProject | Post | Maker comment | Follow the sub's rules. One post, no cross-posting the same day |
| 7 | Reddit r/InternetIsBeautiful | Post | Title "A shared world map where anyone can claim a plot and make it a page" | Link to the home page, not to /pricing |
| 8 | BetaList | Startup | Short + Long | The free queue takes a few weeks |
| 9 | AlternativeTo | App | Long | List it as an alternative to Linktree and Earth 2. Link the `/compare` pages |
| 10 | SaaSHub | Product | Long | Alternatives: Linktree, Google Business Profile |
| 11 | Crunchbase | Company | Long | Operator: MeWeBe |
| 12 | LinkedIn | Company page | Long | Name "FlatMeta". Link from the MeWeBe page |
| 13 | G2 | Product listing (free) | Long | Category: Local Marketing |
| 14 | Capterra (Gartner) | Vendor listing (free) | Long | The same data as G2 |
| 15 | There's An AI For That | Tool | Short + Developer copy | Mention the AI Designer and the MCP server |
| 16 | Futurepedia | Tool | Short | Free listing |
| 17 | Toolify | Tool | Short | Free listing |
| 18 | mcp.so | MCP server | Developer copy | Endpoint and tool list from `llms.txt` |
| 19 | Smithery | MCP server | Developer copy | Remote server URL |
| 20 | Glama (MCP servers) | MCP server | Developer copy | |
| 21 | PulseMCP | MCP server | Developer copy | |
| 22 | llms.txt directories (llmstxt.site, directory.llmstxt.cloud) | Site | URL of `/llms.txt` | |
| 23 | DevHunt | Dev tool | Developer copy | The API and MCP angle |
| 24 | Uneed | Launch | Short + Long | Free queue |
| 25 | Microlaunch | Launch | Short + Long | |
| 26 | Peerlist | Launchpad | Short + Maker comment | |
| 27 | Fazier | Launch | Short | |
| 28 | Launching Next | Startup | Long | |
| 29 | BetaPage | Startup | Long | |
| 30 | StartupBase | Startup | Long | |

Rules for every submission:
- Use only real numbers, from the weekly report.
- Never buy upvotes, reviews or "featured" slots.
- Log every submission in `docs/golive/weekly/<date>.md`: the site, the date, the live URL and the status.

---

## 4. App store optimisation

FlatMeta is a web app and an installable PWA (`/manifest.webmanifest`, offline page). There is no native app, so App Store and Google Play ASO does not apply yet. Two free options:
- **Microsoft Store (PWA):** package with PWABuilder (pwabuilder.com) and list it free with a Microsoft Partner Center developer account. Developer accounts are free for individuals.
  - Title: "FlatMeta: claim your place on the map".
  - Keywords: world map, local business, link in bio, explore, landmarks.
  - Screenshots: the map, a plot page, the claim wizard, `/brands`.
- **Google Play (Trusted Web Activity):** the same PWABuilder package. It needs a one-time $25 developer fee, which is **not in this plan**: it needs the boss's approval.

---

## 5. 30-day social calendar (X, LinkedIn, Facebook, Instagram)

**How to use it:**
- Day 1 is the day production runs the new build.
- One post per network per day. Facebook reuses the LinkedIn copy; Instagram uses the visual with the X copy as the caption, plus 5 hashtags: `#FlatMeta #worldmap #smallbusiness #localSEO #AI`.
- Visuals are screenshots of the real site (`docs/golive/evidence/`), never mock-ups of things that don't exist.
- `{n}` is a real number from the weekly report; leave the line out if the number is small.

| Day | Theme | X (≤ 280) | LinkedIn / Facebook | Instagram visual |
|---|---|---|---|---|
| 1 | Launch | FlatMeta is live: a shared world map where you claim free land and turn it into your page. Businesses get found by people and AI assistants. flatmeta.io | Today we launch FlatMeta, a world map where every plot is a page. Built for the shift from search boxes to AI assistants: every plot is structured data and readable over our open MCP server. Your first land is free. | Globe view of the map |
| 2 | How it works | 1. Pick a spot. 2. Claim free squares. 3. Make it yours: cover, links, gallery. That's your page on the map. | Three steps to your own corner of the world map, and why we made the first land free. | Claim wizard, 3 frames |
| 3 | Brands | Your company may already have a landmark on FlatMeta, next to its real HQ. Verified staff claim it free during launch. flatmeta.io/brands | We reserved land next to many companies' headquarters, clearly marked "not affiliated" until claimed. Verify with a work email or DNS and it's yours. | `/brands` country page |
| 4 | Local business | "Best coffee near me" is increasingly asked to an AI. Is your café in the answer? flatmeta.io/for/local-businesses | Why local businesses need a page that AI assistants can read, and how FlatMeta writes yours as schema.org LocalBusiness data. | A business plot page |
| 5 | Creator | Free land, your own page, one link: flatmeta.io/@you | A playful link-in-bio that sits on a real-world map. | A creator plot |
| 6 | Behind the build | We run an open MCP server: any AI agent can search FlatMeta places. Agents never pay for you; they hand you a checkout link. | How we designed agent access with a human in the loop for payments. | MCP tools list |
| 7 | Week recap | Week 1: {n} plots published in {n} countries. Thank you! | Week 1 in numbers, and what we fix next. | Map heat view |
| 8 | Compare | FlatMeta vs Google Business Profile? Use both. Here's why: flatmeta.io/compare/google-business-profile | An honest comparison, including when you don't need us. | Comparison table |
| 9 | AI Designer | Describe your place in one line and the AI Designer drafts your page. | How the AI Designer works, and what it won't do. | Before and after of a plot |
| 10 | Explore | Walk the map as an avatar, wave at people nearby, sign guestbooks. | Social discovery on a map: what we learned from the first explorers. | An avatar walking |
| 11 | Trust | No crypto. No NFTs. A plot is a page, not an investment. | Why we made "not an investment" a rule, not a disclaimer. | A quote card |
| 12 | Open now | Your hours on the map, with a live "Open now" marker. | Small details that bring foot traffic. | The Open now badge |
| 13 | Leaderboards | The most-loved places on FlatMeta this week 👇 | Spotlight on the week's most-loved plots, with the owners' permission. | Leaderboard |
| 14 | Week recap | Week 2: {n} new plots, {n} companies claimed. | Week 2 numbers and the top requests. | A collage of plots |
| 15 | Compare | Want virtual land as an investment? That's not us. A plot on FlatMeta is a page. flatmeta.io/compare/earth2 | Where FlatMeta differs from virtual-land games, fairly stated. | Comparison table |
| 16 | Brands how-to | Claim your company's landmark in 2 minutes: find it on /brands → verify with your work email → add your logo. | A step-by-step for marketing teams. | 3-step carousel |
| 17 | Guestbook | Leave a note on any plot. Owners see who stopped by. | Small social features that make a page feel alive. | A guestbook |
| 18 | Developers | Our REST API and MCP server are documented and open to read. Build on the map. flatmeta.io/api/docs | For developers: what you can build with FlatMeta's API. | API docs screenshot |
| 19 | City spotlight | Exploring {city} on FlatMeta: {n} plots and counting. | A city spotlight, from real plots only. | City zoom |
| 20 | Customer story | (Only with written permission) How {business} uses its FlatMeta page. | A customer story. | Their plot |
| 21 | Week recap | Week 3 numbers + one thing we shipped from your feedback. | What we shipped because you asked. | Changelog card |
| 22 | Compare | Linktree lists your links. FlatMeta puts them on a map people explore. flatmeta.io/compare/linktree | When to use both. | Comparison table |
| 23 | Offers | Run a featured offer on your plot and change it whenever you like. | Promotions on the map. | An offer card |
| 24 | Accessibility | FlatMeta works on phones, with keyboards and with screen readers. We test every release on 12 screen sizes. | How we test: the device matrix, Lighthouse, accessibility checks. | The device matrix |
| 25 | Insights | New on our blog: {latest insight title} flatmeta.io/insights | Share the latest article. | Article cover |
| 26 | Team seats | Business plots can have a team: owners, admins and editors. | Running a brand presence as a team. | The team page |
| 27 | Free land | Reminder: your first land on FlatMeta is free. Claim yours. | Invite the network. | Free-land graphic |
| 28 | Week recap | Week 4: {n} plots, {n} countries, {n} companies. | A month in numbers. | Growth chart from the real data |
| 29 | Roadmap | What's next: you tell us. Reply with the one thing you want on FlatMeta. | A roadmap poll. | Poll card |
| 30 | Thank you | 30 days of FlatMeta. Thank you to everyone who claimed a place on the map. | A thank-you and the month's lessons. | Map at night |

**Guardrails for social:**
- Never claim a number that isn't in the weekly report.
- Never feature a person's or a company's plot without permission.
- Never reply as a named person from the brand account.
- No paid boosts without the boss's approval.
