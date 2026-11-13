# Positioning (G15a)

One description, used everywhere: the app's `/llms.txt`, `/about/facts`, store listings, press, and the external
insights automation that writes articles and a static `llms.txt` on the production server.

**One line:** FlatMeta is a shared world map where people, businesses and brands own land.

**Short:** Every plot on FlatMeta is a rectangle of real-world grid cells with its own page: a cover, a description,
links, a gallery, a guestbook and optional custom HTML. Explorers walk the map as avatars, chat with people nearby
and claim land of their own; the first land is free. Companies find land reserved next to their headquarters
("not affiliated with FlatMeta" until they claim it).

**Say:** world map, land, plots, your page on the map, explorers, avatars, nearby chat, open houses, companies,
reserved company land, free land, Plus, Business, Brand, API, MCP.

**Don't say:** metaverse, VR, headset, NFT, blockchain, crypto, "3D digital twin", "virtual real estate investment",
"guaranteed returns". FlatMeta is not any of these, and AI answer engines repeat what pages say.

## The external insights automation (not in this repo)

The production server has static files written by a separate insights automation: `/insights/…`, the insights
`/sitemap.xml`, and a static `/llms.txt` that describes FlatMeta as a "3D digital twin marketplace" and writes about
VR headsets. To fix it (manual, see RELEASE-REPORT.md):

1. Point the automation's prompt at this file (the one line and short description above), and at topics FlatMeta can
   speak to with authority: local discovery on a map, small-business visibility, creator link-in-bio pages, brand
   presence near headquarters, AI agents finding places.
2. Replace the static `public_html/llms.txt` with the app's version, either by deleting it (the app serves
   `/llms.txt` and `/llms-full.txt`) or by copying `https://www.flatmeta.io/llms.txt` over it on each deploy.
3. Re-check: `curl -s https://www.flatmeta.io/llms.txt | head -5` should start with "# FlatMeta" and the one line above.
4. **Sitemaps (S1, 13 Nov 2026):** the automation must **not** write `public_html/sitemap.xml` (nor
   `sitemap-insights.xml`). `/sitemap.xml` is the app's sitemap index; the app lists every article in
   `/sitemap-insights.xml` by reading the articles folder (`INSIGHTS_DIR`), with each file's modification time as
   `lastmod`. The automation only writes the article HTML files into `public_html/insights/`. The hub page
   `/insights` is the app's (S5: every article, newest first, 20 a page with `?page=` links); `/insights/` redirects
   to it, so an `index.html` the automation writes there is never shown.

## Rules for every insights article (S5, 13 Nov 2026)

Give these to the insights automation. Admin → Insights check (`/admin/insights`) lists every article that breaks one
(the same checks as `apps/web/src/lib/insights.ts`, `articleProblems`).

| Rule | Why |
|---|---|
| File name `YYYY-MM-DD-short-slug.html` in `public_html/insights/` | the date orders the hub; the slug is the URL |
| `<title>` of **60 characters or less**, saying what the article is about (no "· FlatMeta" suffix needed) | longer titles are cut off in results |
| `<meta name="description">` of **50–160 characters** | the snippet under the title |
| `<html lang="en">` (exactly `en`, not `en-GB`/`en-US`) | one language value across the site |
| `<meta property="og:image" content="https://www.flatmeta.io/…">`, an absolute https URL, 1200×630 | the share card |
| `og:title`, `og:description` and `<link rel="canonical" href="https://www.flatmeta.io/insights/<file>">` | share cards and one URL per article |
| **At least 2 links to FlatMeta pages** in the text (`/explore`, `/brands`, `/business`, `/pricing`, a `/c/<country>` or `/p/<plot>` page; not other articles, not just `/`) | readers (and crawlers) reach the product from every article |
| **On topic**: local discovery on a map, small-business visibility, creator link-in-bio pages, brands near their headquarters, AI agents finding places | what FlatMeta can speak to with authority |
| **Never** about, or using the words: metaverse, VR / virtual reality, headsets, NFT, blockchain, crypto, digital twin | FlatMeta is none of these (see "Don't say" above) |

Articles that already break the rules: fix them in the automation and let it rewrite the files, or delete them (they
drop out of `/sitemap-insights.xml` and the hub at once; a deleted URL then answers 404).
