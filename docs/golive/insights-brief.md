# Brief for the FlatMeta insights pipeline (QA3)

**For:** whoever runs MeWeBe's SEO-article pipeline. It writes the articles into `public_html/insights/` on the FlatMeta server; its articles link to `mewebe.com/startup?utm_medium=seo_article`.

**Why:** on 17 Nov it was still publishing off-topic articles with titles of 76–95 characters, for example:
- `2026-11-17-newest-virtual-reality-headset.html`: "Newest Virtual Reality Headset — Practical Guide & Benchmarks (2026) | FlatMeta";
- `…-digital-twin-building-platform.html`.

FlatMeta is not a VR or digital-twin product. These articles teach search engines and AI assistants the wrong thing about it.

**What the site now does on its own:** any article whose title, description, first heading or file name uses an off-topic word answers **410 Gone** with `noindex`, and is left out of `/insights` and `/sitemap-insights.xml`. Admin → **Insights check** lists every article that breaks any rule below. Off-topic work is wasted until the pipeline follows this brief.

## Paste this into the pipeline's prompt or config

> You write articles for FlatMeta (https://www.flatmeta.io). FlatMeta is a shared world map where people, businesses and brands own land. Every plot is a page on the real-world map: a cover, a description, links, a gallery, a guestbook, hours and offers. The first land is free. Companies find land reserved next to their headquarters. Pages are structured data that search engines and AI assistants read.
>
> **Write only about:**
> - local discovery on a map;
> - small-business visibility (being found nearby, in maps and in AI assistants);
> - creator link-in-bio pages;
> - brand presence near headquarters;
> - AI agents finding places;
> - the world map as a social place.
>
> **Never write about, or use the words:** metaverse, VR, virtual reality, headset, NFT, blockchain, crypto, digital twin, "virtual real estate investment". Never write a product roundup of other companies' hardware.
>
> **Every article must have:**
> 1. A file name `YYYY-MM-DD-short-slug.html`. The slug is on-topic too, and ideally 6 words or fewer.
> 2. A `<title>` of **60 characters or fewer**, with no " | FlatMeta" suffix.
> 3. `<meta name="description">` of 50–160 characters.
> 4. `<html lang="en">`.
> 5. `<meta property="og:image" content="https://www.flatmeta.io/…">`: an absolute https URL to a 1200×630 image. Also `og:title`, `og:description`, and `<link rel="canonical" href="https://www.flatmeta.io/insights/<file>">`.
> 6. **At least 2 links in the body to FlatMeta pages** (not counting other articles or the home page), chosen from `/explore`, `/brands`, `/business`, `/pricing`, `/demo`, `/for/local-businesses`, `/for/brands`, `/for/creators`, or a `/c/<country>` or `/p/<plot>` page.
> 7. No `<script>` except JSON-LD. Scripts don't run on these pages.
>
> Don't write `index.html`, `sitemap.xml`, `sitemap-insights.xml` or `llms.txt`. The site owns those.

## Topic ideas that fit (titles ≤ 60 characters)

- How a café gets found by AI assistants nearby
- Put your shop on a shared world map in 3 minutes
- Link-in-bio pages, now with a place on the map
- What AI agents read when they recommend a place
- Why brands should own a page next to their HQ
- Opening hours and "Open now": small details that sell

## Checking your output

After each run, Admin → **Insights check** on `https://www.flatmeta.io/admin/insights` must show the new article as **OK**. To check one file by hand:
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://www.flatmeta.io/insights/<file>.html
```
200 means it was accepted; 410 means it is off-topic.

## Old off-topic files

They already answer 410. Delete them from `public_html/insights/` when convenient. Nothing links to them any more.
