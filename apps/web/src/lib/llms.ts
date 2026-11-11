import { SITE_URL } from '@/lib/config';

/**
 * llms.txt (G14, https://llmstxt.org): what FlatMeta is, in plain words, and where an AI assistant or agent finds
 * citable facts, the API and the MCP server. Kept accurate by the app itself (no separate automation).
 */
export function llmsTxt(): string {
  const s = SITE_URL;
  return `# FlatMeta

> FlatMeta is a shared world map where people, businesses and brands own land. Every plot is a rectangle of real-world grid cells with its own mini-page: a cover, a description, links, a gallery, a guestbook and optional custom HTML. Explorers walk the map as avatars, chat with people nearby, visit plots and claim their own. The first land is free.

Key facts:
- Land: the map is divided into cells of about 120–190 m; plots are rectangles of cells. Prices depend on the area tier (big-city centres cost more). Each person gets free squares to start.
- Plots have stable public URLs: ${s}/p/<slug>. People have links like ${s}/@<handle>.
- Companies: land is reserved for many companies next to their public headquarters. Each such plot says "Reserved for <Company>, not affiliated with FlatMeta" until the company claims it (verified by work email or DNS). Company facts come from Wikidata (CC0).
- Plans: Free; Plus ($5/month or $48/year); Business ($29/month); Brand ($249/month). Company Landmark claim: one-time, includes 3 months of Brand.
- Operator: MeWeBe. FlatMeta is not a VR, NFT or blockchain product.

## Pages
- [Home: the live world map](${s}/)
- [Facts about FlatMeta](${s}/about/facts): short, citable facts and numbers
- [Explore plots](${s}/explore)
- [Companies on FlatMeta](${s}/brands): reserved company land, by country
- [Pricing](${s}/pricing)
- [For business](${s}/business)

## For developers and agents
- [REST API (OpenAPI)](${s}/api/openapi.json) · [API docs](${s}/api/docs)
- [MCP server](${s}/api/mcp): tools ask_flatmeta, search_plots, find_nearby, list_companies, list_open_houses, get_plot, check_availability, claim_plot. Read tools need no key; claiming and editing need an API key from ${s}/dashboard/developers.
- [Ask FlatMeta](${s}/api/v1/ask?q=cafes%20in%20Lisbon): a short answer with matching places, as JSON.
- Agents never pay on someone's behalf: paid land returns a checkout link for the human.

## Optional
- [Full list for AI: countries, companies and popular places](${s}/llms-full.txt)
- [Sitemap](${s}/sitemap-index.xml)
- [Terms](${s}/legal/terms) · [Privacy](${s}/legal/privacy)
`;
}

export const textResponse = (body: string) =>
  new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
