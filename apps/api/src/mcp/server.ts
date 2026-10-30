/**
 * FlatMeta MCP server: lets AI agents search, view and manage land.
 * The same tools are served over Streamable HTTP (/mcp) and stdio.
 */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import type { User } from '../db/schema.js';
import { countryName, flagEmoji } from '../lib/geo.js';
import { rectAround } from '../lib/grid.js';
import { absoluteUrl } from '../lib/storage.js';
import { suggestPlots } from '../ai/suggest.js';
import { top, BOARDS } from '../game/leaderboards.js';
import { quoteFor } from '../services/plots.js';
import { applyPlotPatch, loadPlot, PlotPatch, visiblePlot } from '../routes/plots.js';
import { canEditPlot, ownersFor, plotView, type PlotView } from '../routes/views.js';

const web = (p: string) => `${config.APP_URL.replace(/\/$/, '')}${p}`;
const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

/** Compact plot summary for agents (absolute URLs, no internal fields). */
function brief(p: PlotView) {
  return {
    id: p.id,
    slug: p.slug,
    url: web(`/p/${p.slug}`),
    title: p.title,
    tagline: p.tagline,
    kind: p.kind,
    showcase: p.showcase ? { brand: p.showcase.brand, note: 'Sample, unclaimed showcase. Not affiliated with the organisation.' } : undefined,
    country: p.countryName,
    city: p.regionSlug,
    category: p.category,
    tags: p.tags,
    center: p.center,
    size: `${p.width}×${p.height} cells`,
    owner: p.owner ? `${p.owner.displayName} (${p.owner.type === 'org' ? `/o/${p.owner.handle}` : `@${p.owner.handle}`})` : null,
    likes: p.likesCount,
    visits: p.visitsCount,
    image: absoluteUrl(p.coverImageUrl),
    links: p.links,
    cta: p.cta,
  };
}

function plotMarkdown(p: PlotView): string {
  const lines = [`# ${p.title}`, p.tagline ? `_${p.tagline}_` : '', '', `${p.countryName ?? 'Ocean'} · ${p.width}×${p.height} cells · tier ${p.tier} · ${p.likesCount} likes`, ''];
  if (p.showcase) lines.push(`> Showcase · Unclaimed. This sample plot shows how ${p.showcase.brand} could use FlatMeta. Not created, endorsed or affiliated with ${p.showcase.brand}.`, '');
  if (p.descriptionMd) lines.push(p.descriptionMd, '');
  for (const l of p.links) lines.push(`- [${l.label}](${l.url})`);
  lines.push('', `View: ${web(`/p/${p.slug}`)}`);
  return lines.join('\n');
}

export function createMcpServer(getUser: () => User | null): McpServer {
  const server = new McpServer(
    { name: 'flatmeta', version: '2.0.0', title: 'FlatMeta' },
    {
      instructions:
        'FlatMeta is a world map where people, businesses and brands own rectangular plots of land made of grid cells (≈120–190 m each) and publish a mini-page on them. Use search_plots / get_plot to find places and organisations on the map; check_availability before claim_plot. Plots marked showcase are samples for well-known organisations and are NOT affiliated with them. Write tools need an API key (Dashboard → Developers).',
    },
  );

  const requireUser = () => {
    const u = getUser();
    if (!u) throw new Error('This tool needs a FlatMeta API key. Create one at ' + web('/dashboard/developers'));
    return u;
  };

  server.registerTool(
    'search_plots',
    {
      title: 'Search plots',
      description: 'Search published plots by keywords, optionally within a country or near a coordinate. Returns compact plot summaries.',
      inputSchema: {
        query: z.string().max(100).optional().describe('Keywords, brand or place name'),
        country: z.string().length(2).optional().describe('ISO 3166-1 alpha-2 country code'),
        near: z.object({ lat: z.number(), lng: z.number() }).optional().describe('Sort by distance to this point'),
        kind: z.enum(['any', 'showcase', 'business', 'community']).default('any'),
        limit: z.number().int().min(1).max(25).default(10),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, country, near, kind, limit }) => {
      const P = schema.plots;
      const where = [visiblePlot(), sql`(${P.publishedAt} is not null or ${P.status} = 'showcase')`];
      if (query) where.push(sql`(${P.search} @@ plainto_tsquery('simple', ${query}) or ${P.title} ilike ${'%' + query + '%'} or ${P.showcase}->>'brand' ilike ${'%' + query + '%'})`);
      if (country) where.push(eq(P.countryCode, country.toUpperCase()));
      if (kind === 'showcase') where.push(eq(P.status, 'showcase'));
      if (kind === 'business') where.push(sql`${P.business} is not null`);
      if (kind === 'community') where.push(inArray(P.kind, ['standard', 'homestead']));
      const order = near ? sql`(${P.centerLat} - ${near.lat})^2 + ((${P.centerLng} - ${near.lng}) * cos(radians(${near.lat})))^2` : desc(sql`${P.likesCount} * 3 + ${P.visitsCount}`);
      const rows = await db.select().from(P).where(and(...where)).orderBy(order).limit(limit);
      const owners = await ownersFor(rows);
      return text({ count: rows.length, plots: rows.map((p) => brief(plotView(p, owners.get(p.id) ?? null))) });
    },
  );

  server.registerTool(
    'get_plot',
    { title: 'Get a plot', description: 'Full details of a plot by id or slug, as Markdown.', inputSchema: { idOrSlug: z.string().max(80) }, annotations: { readOnlyHint: true } },
    async ({ idOrSlug }) => {
      const plot = await loadPlot(idOrSlug);
      if (!plot || (plot.status !== 'active' && plot.status !== 'showcase')) return fail('Plot not found');
      const owners = await ownersFor([plot]);
      return text(plotMarkdown(plotView(plot, owners.get(plot.id) ?? null)));
    },
  );

  server.registerTool(
    'list_countries',
    { title: 'List countries', description: 'Countries with land statistics, busiest first.', inputSchema: { limit: z.number().int().min(1).max(250).default(50) }, annotations: { readOnlyHint: true } },
    async ({ limit }) => {
      const rows = await db.select().from(schema.countries).orderBy(desc(sql`${schema.countries.plotCount} + ${schema.countries.showcaseCount}`)).limit(limit);
      return text(rows.map((c) => ({ code: c.code, name: c.name, flag: flagEmoji(c.code), plots: c.plotCount, showcase: c.showcaseCount, cells: c.cellCount, url: web(`/c/${c.code.toLowerCase()}`) })));
    },
  );

  server.registerTool(
    'get_country',
    { title: 'Get a country', description: 'Country stats, featured cities and top plots.', inputSchema: { code: z.string().length(2) }, annotations: { readOnlyHint: true } },
    async ({ code }) => {
      const cc = code.toUpperCase();
      const [c] = await db.select().from(schema.countries).where(eq(schema.countries.code, cc));
      if (!c) return fail('Country not found');
      const cities = await db.select().from(schema.regions).where(eq(schema.regions.countryCode, cc));
      const plots = await db.select().from(schema.plots).where(and(eq(schema.plots.countryCode, cc), visiblePlot())).orderBy(desc(schema.plots.likesCount)).limit(10);
      const owners = await ownersFor(plots);
      return text({ code: cc, name: countryName(cc), flag: flagEmoji(cc), plots: c.plotCount, cells: c.cellCount, showcase: c.showcaseCount, cities: cities.map((r) => ({ slug: r.slug, name: r.name, tier: r.tier })), topPlots: plots.map((p) => brief(plotView(p, owners.get(p.id) ?? null))), url: web(`/c/${cc.toLowerCase()}`) });
    },
  );

  server.registerTool(
    'get_region',
    { title: 'Get a city', description: 'A featured city (region) and its plots.', inputSchema: { slug: z.string().max(60) }, annotations: { readOnlyHint: true } },
    async ({ slug }) => {
      const [r] = await db.select().from(schema.regions).where(eq(schema.regions.slug, slug));
      if (!r) return fail('City not found. Use list_countries / get_country to discover city slugs.');
      const plots = await db.select().from(schema.plots).where(and(eq(schema.plots.regionSlug, slug), visiblePlot())).orderBy(desc(schema.plots.likesCount)).limit(15);
      const owners = await ownersFor(plots);
      return text({ slug, name: r.name, country: countryName(r.countryCode), tier: r.tier, center: { lat: r.lat, lng: r.lng }, plots: plots.map((p) => brief(plotView(p, owners.get(p.id) ?? null))), url: web(`/r/${slug}`) });
    },
  );

  server.registerTool(
    'check_availability',
    {
      title: 'Check availability and price',
      description: 'Quote for a width×height plot centred on a coordinate: tier, price, whether it is free (Homestead) and whether any cell is taken.',
      inputSchema: { lat: z.number().min(-85).max(85), lng: z.number().min(-180).max(180), width: z.number().int().min(1).max(20), height: z.number().int().min(1).max(20) },
      annotations: { readOnlyHint: true },
    },
    async ({ lat, lng, width, height }) => {
      const q = await quoteFor(getUser(), rectAround(lng, lat, width, height));
      return text({ available: q.available, reasons: q.reasons, tier: q.tier, cells: q.cells, priceUsd: q.totalCents / 100, free: q.free, country: q.countryCode, city: q.regionSlug, rect: q.rect, conflicts: q.conflicts.map((c) => web(`/p/${c.slug}`)) });
    },
  );

  server.registerTool(
    'suggest_plots',
    {
      title: 'Suggest where to claim',
      description: 'Ranked free spots for a goal (e.g. "visible spot for my café in Lisbon" or "cheap quiet plot by the sea").',
      inputSchema: { goal: z.string().min(3).max(300), country: z.string().length(2).optional(), lat: z.number().optional(), lng: z.number().optional() },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const { suggestions } = await suggestPlots(getUser(), input);
      return text(suggestions.map((s) => ({ near: s.near, center: s.center, rect: s.rect, tier: s.quote.tier, priceUsd: s.quote.totalCents / 100, free: s.quote.free, neighbours: s.neighbours, reason: s.reason, claimUrl: web(`/?claim=${s.rect.minGx},${s.rect.minGy},${s.rect.maxGx},${s.rect.maxGy}`) })));
    },
  );

  server.registerTool(
    'get_leaderboard',
    { title: 'Leaderboard', description: `Leaderboards: ${BOARDS.join(', ')}. Country boards need a country code.`, inputSchema: { board: z.enum(BOARDS as [string, ...string[]]), country: z.string().length(2).optional(), limit: z.number().int().min(1).max(50).default(10) }, annotations: { readOnlyHint: true } },
    async ({ board, country, limit }) => {
      const res = await top(board as (typeof BOARDS)[number], { country: country?.toUpperCase(), limit });
      return text(res.rows.map((r) => ({ rank: r.rank, score: r.score, name: r.user?.displayName ?? r.plot?.title, url: r.user ? web(`/u/${r.user.username}`) : r.plot ? web(`/p/${r.plot.slug}`) : null })));
    },
  );

  server.registerTool(
    'list_my_plots',
    { title: 'List my plots', description: 'Plots owned by the API key holder (personally or through organisations).', inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => {
      const user = requireUser();
      const orgIds = (await db.select({ id: schema.orgMembers.orgId }).from(schema.orgMembers).where(eq(schema.orgMembers.userId, user.id))).map((r) => r.id);
      const rows = await db
        .select()
        .from(schema.plots)
        .where(and(or(eq(schema.plots.ownerUserId, user.id), orgIds.length ? inArray(schema.plots.ownerOrgId, orgIds) : sql`false`), inArray(schema.plots.status, ['active', 'pending_payment'])));
      const owners = await ownersFor(rows);
      return text(rows.map((p) => ({ ...brief(plotView(p, owners.get(p.id) ?? null)), status: p.status, editUrl: web(`/dashboard/plots/${p.id}`) })));
    },
  );

  server.registerTool(
    'update_plot',
    {
      title: 'Update one of my plots',
      description: 'Edit title, tagline, Markdown description, links (max 5), call-to-action, category, tags or theme colours of a plot you own.',
      inputSchema: { id: z.uuid(), fields: PlotPatch.pick({ title: true, tagline: true, descriptionMd: true, links: true, cta: true, category: true, tags: true, theme: true }) },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ id, fields }) => {
      const user = requireUser();
      const plot = await loadPlot(id);
      if (!plot) return fail('Plot not found');
      if (!(await canEditPlot(user, plot))) return fail('You can only edit your own plots');
      const res = await applyPlotPatch(plot, fields, user);
      return text({ ok: true, url: web(`/p/${res.plot.slug}`), moderation: res.plot.moderationStatus });
    },
  );

  server.registerTool(
    'claim_plot',
    {
      title: 'Claim a plot',
      description: 'Claims a width×height plot centred on a coordinate. Free if it qualifies as the user’s Homestead; otherwise returns a checkout link the human must open to pay.',
      inputSchema: { lat: z.number().min(-85).max(85), lng: z.number().min(-180).max(180), width: z.number().int().min(1).max(20), height: z.number().int().min(1).max(20), title: z.string().min(2).max(80) },
      annotations: { destructiveHint: false },
    },
    async ({ lat, lng, width, height, title }) => {
      const user = requireUser();
      const rect = rectAround(lng, lat, width, height);
      const q = await quoteFor(user, rect);
      if (!q.available) return fail(q.reasons.join(' ') || 'Not available');
      // Agents never pay on someone's behalf: paid land goes through a checkout link the human opens.
      if (!q.free) {
        return text({ needsPayment: true, priceUsd: q.totalCents / 100, tier: q.tier, message: 'Open this link to review and pay for the plot.', url: web(`/?claim=${q.rect.minGx},${q.rect.minGy},${q.rect.maxGx},${q.rect.maxGy}&title=${encodeURIComponent(title)}`) });
      }
      const { createPlot, ensureCover, afterClaim } = await import('../services/plots.js');
      const [marked] = await db.update(schema.users).set({ homesteadUsed: true }).where(and(eq(schema.users.id, user.id), eq(schema.users.homesteadUsed, false))).returning({ id: schema.users.id });
      if (!marked) return fail('Free Homestead already used');
      let plot = await createPlot({ rect: q.rect, title, kind: 'homestead', status: 'active', ownerUserId: user.id, tier: q.tier, countryCode: q.countryCode, regionSlug: q.regionSlug });
      plot = await ensureCover(plot, user.id);
      await afterClaim(plot, user.id);
      return text({ ok: true, free: true, url: web(`/p/${plot.slug}`), editUrl: web(`/dashboard/plots/${plot.id}`) });
    },
  );

  server.registerResource(
    'plot',
    new ResourceTemplate('flatmeta://plot/{slug}', { list: undefined }),
    { title: 'FlatMeta plot', description: 'A plot mini-page as Markdown', mimeType: 'text/markdown' },
    async (uri, { slug }) => {
      const plot = await loadPlot(String(slug));
      if (!plot) return { contents: [{ uri: uri.href, text: 'Not found' }] };
      const owners = await ownersFor([plot]);
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: plotMarkdown(plotView(plot, owners.get(plot.id) ?? null)) }] };
    },
  );

  server.registerResource(
    'country',
    new ResourceTemplate('flatmeta://country/{code}', { list: undefined }),
    { title: 'FlatMeta country', description: 'Country summary', mimeType: 'application/json' },
    async (uri, { code }) => {
      const cc = String(code).toUpperCase();
      const [c] = await db.select().from(schema.countries).where(eq(schema.countries.code, cc));
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(c ?? { error: 'not found' }) }] };
    },
  );

  return server;
}
