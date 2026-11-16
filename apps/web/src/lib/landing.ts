import { SITE_HOST } from '@/lib/config';

/**
 * GL7: buyer-intent landing pages (/for/<slug>) and fair "FlatMeta vs X" comparisons (/compare/<slug>). Plain data,
 * so the pages, the sitemap, llms.txt and the tests all read one list. Claims about other products are kept to what
 * their own sites say publicly (checked November 2026) and say "check their site" for anything that changes.
 */
export interface LandingFaq { q: string; a: string }
export interface Landing {
  slug: string;
  title: string;
  description: string;
  chip: string;
  h1: string;
  intro: string;
  points: { title: string; body: string }[];
  cta: { label: string; href: string };
  faq: LandingFaq[];
}

export const FOR_PAGES: Landing[] = [
  {
    slug: 'local-businesses',
    title: 'Local business listing on a map AI can read',
    description: 'Put your café, shop or studio on a living world map: a verified page with hours, offers, booking links and an "Open now" marker, built as structured data for search engines and AI assistants.',
    chip: 'For local businesses',
    h1: 'Get your business found on the map, by people and by AI',
    intro: 'More people ask an AI assistant "where should I eat near me?" than ever. FlatMeta gives your business a verified page at its real address, written as clean structured data (schema.org LocalBusiness) that assistants and search engines read, on a map people enjoy exploring.',
    points: [
      { title: 'Your real address, on a living map', body: 'Claim the squares where your customers are. Your page glows on the map from the globe down to the street.' },
      { title: 'Hours, offers and "Open now"', body: 'Opening hours, a live open or closed marker, a featured offer and booking and contact links.' },
      { title: 'Read by AI assistants', body: 'Every page is in our sitemaps, our llms.txt and our MCP server, the way AI agents look up places.' },
      { title: 'Ready in minutes', body: 'Describe your place and the AI Designer drafts the copy and artwork. Edit anything later.' },
    ],
    cta: { label: 'Claim your spot free', href: '/?claim' },
    faq: [
      { q: 'Does this replace my Google Business Profile?', a: 'No. Keep it. FlatMeta is an extra place to be found, with structured data that AI assistants read and a map that people browse for fun.' },
      { q: 'What does it cost?', a: 'Your first land is free. The Business plan adds the verified badge, offers, hours, team seats and analytics; prices are on the pricing page.' },
      { q: 'Do I need a website?', a: 'No. Your FlatMeta page has its own link you can share, with a cover, a description, a gallery and your contact and booking links.' },
    ],
  },
  {
    slug: 'brands',
    title: 'Claim your company’s reserved landmark',
    description: 'FlatMeta reserved land next to many companies’ real headquarters. Verified staff claim it with a work email or a DNS record and turn it into a branded landmark.',
    chip: 'For brands',
    h1: 'Your company may already have a landmark waiting',
    intro: 'We reserved land next to the public headquarters of many companies, clearly labelled "not affiliated" until someone from the company claims it. Verify with a work email or a DNS record and it becomes your branded landmark: logo, story, links, careers and offers.',
    points: [
      { title: 'Already on the map', body: 'Search the companies list for yours. If it is there, the plot is waiting next to your headquarters.' },
      { title: 'Verified in minutes', body: 'A work email on your domain or one DNS TXT record proves you work there. No paperwork.' },
      { title: 'A landmark, not a listing', body: 'A larger plot with your logo, cover and story, plus the Brand plan’s Spotlight to glow brighter.' },
      { title: 'Or ask us to remove it', body: 'Not interested? We handle removal requests within 48 hours.' },
    ],
    cta: { label: 'Find your company', href: '/brands' },
    faq: [
      { q: 'Why is my company on FlatMeta?', a: 'We reserved land next to public headquarters using open data from Wikidata (CC0), so every big company has a place waiting. It is clearly marked as not affiliated until claimed.' },
      { q: 'Who can claim it?', a: 'Anyone who can prove they work there: an email on the company’s domain, or a DNS TXT record on it.' },
      { q: 'Can we have it removed?', a: 'Yes. Email us and we remove the reserved plot within 48 hours.' },
    ],
  },
  {
    slug: 'creators',
    title: 'A free world-map home for creators',
    description: 'Claim free land where you live or create, make it yours with a cover, links and a gallery, and share one link. A playful link-in-bio that sits on a real-world map.',
    chip: 'For creators',
    h1: 'Your own corner of the world map, with one link to share',
    intro: 'Claim free squares where you live, work or create. Add a cover, your links, a gallery and a guestbook, then share your page or your @handle. Visitors walk the map as avatars, find you, and leave a note.',
    points: [
      { title: 'Free land to start', body: 'Everyone gets their first squares free. No card needed.' },
      { title: 'All your links in one place', body: 'Links, a gallery, a guestbook and optional custom HTML on your own page.' },
      { title: 'People find you on the map', body: 'Explorers walk past, visit and like your plot. Leaderboards show the most-loved places.' },
      { title: 'A short link', body: `Share ${SITE_HOST}/@yourname anywhere.` },
    ],
    cta: { label: 'Claim free land', href: '/?claim' },
    faq: [
      { q: 'Is it free?', a: 'Yes, your first land is free forever. Plus adds more land and reach if you want them.' },
      { q: 'Is it crypto or NFTs?', a: 'No. There are no tokens and no blockchain. A plot is a place to show your content on our map.' },
    ],
  },
];

export interface Compare {
  slug: string;
  other: string;
  title: string;
  description: string;
  summary: string;
  rows: { label: string; flatmeta: string; other: string }[];
  verdict: string;
  faq: LandingFaq[];
}

export const COMPARE_PAGES: Compare[] = [
  {
    slug: 'google-business-profile',
    other: 'Google Business Profile',
    title: 'FlatMeta vs Google Business Profile: do you need both?',
    description: 'Google Business Profile puts you in Google Search and Maps. FlatMeta adds a designed page on a world map people explore, built for AI assistants. How they differ and why most businesses use both.',
    summary: 'Google Business Profile is the free listing behind your business in Google Search and Google Maps, and every local business should have one. FlatMeta is not a replacement: it is a designed page on a world map people explore for fun, written as structured data that AI assistants and agents read through our MCP server.',
    rows: [
      { label: 'Price', flatmeta: 'First land free; Business plan for the verified badge and tools', other: 'Free' },
      { label: 'Where people see you', flatmeta: 'The FlatMeta world map, your page’s own link, AI assistants', other: 'Google Search and Google Maps' },
      { label: 'Design', flatmeta: 'Your own cover, story, gallery and optional custom HTML', other: 'A standard listing layout' },
      { label: 'AI agents', flatmeta: 'Open MCP server and llms.txt; agents can search and read your page', other: 'Used by Google’s own products' },
      { label: 'Reviews', flatmeta: 'Likes and a guestbook', other: 'Google reviews' },
    ],
    verdict: 'Keep your Google Business Profile, and add FlatMeta for a page you design yourself, a map people enjoy, and reach in AI assistants outside Google.',
    faq: [
      { q: 'Will FlatMeta hurt my Google ranking?', a: 'No. It is a separate site that links to yours. A consistent name, address and links across sites is generally good for local search.' },
      { q: 'Can I copy my hours from Google?', a: 'You add your hours once on FlatMeta; the "Open now" marker follows them.' },
    ],
  },
  {
    slug: 'linktree',
    other: 'Linktree',
    title: 'FlatMeta vs Linktree: a link-in-bio page on a world map',
    description: 'Linktree is a link-in-bio page. FlatMeta gives you a page with your links too, placed on a real-world map where people find and visit you. How they compare.',
    summary: 'Linktree is a popular link-in-bio page: one link that lists all your others, with free and paid plans. FlatMeta gives you a page with your links as well, but it lives on a shared world map, where explorers can walk past, visit, like and sign your guestbook.',
    rows: [
      { label: 'Price', flatmeta: 'Free land to start; Plus for more land and reach', other: 'Free plan and paid plans (see their site)' },
      { label: 'Your page', flatmeta: 'Cover, story, links, gallery, guestbook, optional custom HTML', other: 'A list of links with themes' },
      { label: 'Discovery', flatmeta: 'People find you on the map, in leaderboards and by AI assistants', other: 'People arrive from your bio link' },
      { label: 'Location', flatmeta: 'A real place on the map: where you live, work or create', other: 'None' },
      { label: 'Short link', flatmeta: `${SITE_HOST}/@you`, other: 'linktr.ee/you' },
    ],
    verdict: 'If you only need a list of links, Linktree does that well. If you want a page that people can also discover on a map, FlatMeta adds that, and the first land is free.',
    faq: [{ q: 'Can I use both?', a: 'Yes. Many people put their FlatMeta link in their Linktree, or the other way round.' }],
  },
  {
    slug: 'earth2',
    other: 'Earth 2',
    title: 'FlatMeta vs Earth 2: a world map, not an investment',
    description: 'Earth 2 sells tiles of a virtual Earth that players trade. FlatMeta is a free-to-start world map where plots are pages for people and businesses, with no tokens and no resale for cash.',
    summary: 'Earth 2 is a virtual-land platform where players buy tiles of a digital copy of the Earth and trade them with each other. FlatMeta also puts land on a real-world map, but for a different job: each plot is a page for a person, a business or a brand. Plots have no cash value, there are no tokens, and we never present land as an investment.',
    rows: [
      { label: 'What a plot is', flatmeta: 'A page: cover, story, links, offers, guestbook', other: 'Virtual land tiles (see their site for what you can do with them)' },
      { label: 'Price to start', flatmeta: 'First land free', other: 'Tiles are bought (see their site)' },
      { label: 'Cash value', flatmeta: 'None; land is a licence to show content, not an investment', other: 'Players trade tiles with each other' },
      { label: 'Businesses', flatmeta: 'Verified business pages with hours, offers and analytics', other: 'Not the focus' },
      { label: 'AI agents', flatmeta: 'Open MCP server and llms.txt', other: 'Not stated' },
    ],
    verdict: 'If you want virtual land as a game of buying and trading, look at Earth 2. If you want a page on the map for yourself or your business that people and AI find, FlatMeta is built for that.',
    faq: [{ q: 'Is FlatMeta land an investment?', a: 'No. A plot is a licence to show your content on part of our map. It has no cash value and cannot be cashed out.' }],
  },
];

export const LANDING_PATHS = [...FOR_PAGES.map((p) => `/for/${p.slug}`), ...COMPARE_PAGES.map((c) => `/compare/${c.slug}`)];

export const faqJsonLd = (faq: LandingFaq[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })),
});
