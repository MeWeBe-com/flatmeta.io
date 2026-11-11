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
