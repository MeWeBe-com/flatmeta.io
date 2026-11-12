import { audit } from '../lib/audit.js';
import { visibleLogo } from '../companies/logos.js';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { publicShowcase } from '../lib/visibility.js';
import { z } from 'zod';
import type { App } from '../app.js';
import { db, schema } from '../db/client.js';
import type { Plot, User } from '../db/schema.js';
import { requireUser } from '../lib/auth.js';
import { badRequest, forbidden, notFound, paymentRequired } from '../lib/errors.js';
import { bboxToRect, rectBounds } from '../lib/grid.js';
import { haversineKm } from '../lib/geo.js';
import { countUniqueVisit, isBot, uniqueVisitors, visitorHash } from '../lib/visitors.js';
import { dailyCap } from '../lib/caps.js';
import { safeUrl, stripText } from '../lib/markdown.js';
import { key, redis } from '../lib/redis.js';
import { storeImage } from '../lib/storage.js';
import { config, showcaseLocationCheck } from '../config.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { publishActivity, notify } from '../game/activity.js';
import { dayKey } from '../game/dates.js';
import { mergeResults, recordAction, type GameResult } from '../game/engine.js';
import { setPlotLikes } from '../game/leaderboards.js';
import { FRAMES } from '../game/levels.js';
import { checkContent } from '../services/moderation.js';
import { freeLimitFor } from '../services/referrals.js';
import { recordCustomHtmlVersion, reportCustomHtml, type SavedHtml } from '../services/custom-html.js';
import { MAX_CUSTOM_HTML, screenCustomHtml } from '../lib/html.js';
import { afterClaim, assertCanActForOrg, createPlot, ensureCover, neighbours, ownedCells, quoteFor, type QuoteResult } from '../services/plots.js';
import { createCheckout } from '../services/billing.js';
import { assertCanEditPlot, canEditPlot, ownersFor, plotView } from './views.js';

export const RectSchema = z.object({
  minGx: z.number().int(),
  minGy: z.number().int(),
  maxGx: z.number().int(),
  maxGy: z.number().int(),
});

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const LinkSchema = z.object({ label: z.string().min(1).max(40), url: z.string().max(500) });
const HoursSchema = z.record(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), z.array(z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)])).max(3));

export const PlotPatch = z.object({
  title: z.string().min(2).max(80).optional(),
  tagline: z.string().max(140).nullable().optional(),
  descriptionMd: z.string().max(5000).nullable().optional(),
  customHtml: z.string().max(MAX_CUSTOM_HTML).nullable().optional(),
  links: z.array(LinkSchema).max(5).optional(),
  cta: LinkSchema.nullable().optional(),
  category: z.string().max(40).nullable().optional(),
  tags: z.array(z.string().min(1).max(24)).max(8).optional(),
  theme: z.object({ primary: hex, accent: hex }).nullable().optional(),
  frame: z.string().max(20).optional(),
  coverMediaId: z.uuid().optional(),
  galleryMediaIds: z.array(z.uuid()).max(6).optional(),
  /** Remove one image from the gallery by its URL. */
  galleryRemove: z.string().max(500).optional(),
  guestbookOpen: z.boolean().optional(),
  business: z
    .object({
      phone: z.string().max(40).optional(),
      email: z.email().max(120).optional(),
      address: z.string().max(200).optional(),
      hours: HoursSchema.optional(),
      timezone: z.string().max(60).optional(),
      bookingUrl: z.string().max(500).optional(),
      offer: z.string().max(140).optional(),
    })
    .nullable()
    .optional(),
});
export type PlotPatchInput = z.infer<typeof PlotPatch>;

/** Plots anyone may see. */
export const visiblePlot = (): SQL =>
  and(
    or(eq(schema.plots.status, 'active'), publicShowcase()),
    sql`${schema.plots.moderationStatus} <> 'flagged'`,
  )!;

export async function loadPlot(idOrSlug: string): Promise<Plot | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const [p] = await db
    .select()
    .from(schema.plots)
    .where(isUuid ? eq(schema.plots.id, idOrSlug) : eq(schema.plots.slug, idOrSlug))
    .limit(1);
  return p ?? null;
}

export async function viewFor(plot: Plot, user: { id: string; role: string } | null) {
  const owners = await ownersFor([plot]);
  const fullUser = user ? (await db.select().from(schema.users).where(eq(schema.users.id, user.id)))[0] ?? null : null;
  const liked = user ? (await db.select().from(schema.plotLikes).where(and(eq(schema.plotLikes.plotId, plot.id), eq(schema.plotLikes.userId, user.id)))).length > 0 : false;
  const [listing] = await db.select().from(schema.listings).where(and(eq(schema.listings.plotId, plot.id), eq(schema.listings.status, 'active')));
  return {
    ...plotView(plot, owners.get(plot.id) ?? null, { likedByMe: liked, canEdit: await canEditPlot(fullUser, plot), withHtml: true }),
    listing: listing ? { id: listing.id, priceCents: listing.priceCents, currency: listing.currency, version: listing.version } : null,
  };
}

async function mediaOwnedUrl(mediaId: string, userId: string, isAdmin: boolean) {
  const [m] = await db.select().from(schema.media).where(eq(schema.media.id, mediaId));
  if (!m || (!isAdmin && m.ownerUserId && m.ownerUserId !== userId)) throw badRequest('Image not found');
  return m;
}

/** Applies an owner's edit (shared by REST, MCP and the AI designer). */
export async function applyPlotPatch(plot: Plot, patch: PlotPatchInput, actor: { id: string; role: string; level: number; plan: string }): Promise<{ plot: Plot; game: GameResult | null; customHtml?: SavedHtml }> {
  const set: Partial<typeof schema.plots.$inferInsert> = { lastEditedAt: new Date(), updatedAt: new Date() };
  let htmlNotes: string[] | null = null; // set when this patch saves a new custom HTML version
  if (patch.title !== undefined) set.title = stripText(patch.title, 80);
  if (patch.tagline !== undefined) set.tagline = patch.tagline ? stripText(patch.tagline, 140) : null;
  if (patch.descriptionMd !== undefined) set.descriptionMd = patch.descriptionMd;
  if (patch.customHtml !== undefined) {
    if (patch.customHtml) {
      let allowed = actor.role === 'admin' || actor.plan !== 'free';
      if (!allowed && plot.ownerOrgId) {
        const [org] = await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, plot.ownerOrgId));
        allowed = ['business', 'brand', 'enterprise'].includes(org?.plan ?? 'free');
      }
      if (!allowed) throw paymentRequired('Custom HTML is part of FlatMeta Plus and organisation plans');
      const screen = screenCustomHtml(patch.customHtml);
      if (!screen.ok) throw badRequest(`Your HTML ${screen.reasons.join(', ')}.`);
      const mod = await checkContent('plot', plot.id, screen.html.replace(/<[^>]+>/g, ' '));
      if (mod.status === 'flagged') throw badRequest('Our moderator flagged the text in your HTML. Please edit it and try again.');
      if (screen.html !== plot.customHtml || plot.customHtmlStatus === 'none') {
        set.customHtml = screen.html;
        htmlNotes = mod.status === 'pending' ? ['The automatic moderator wants a human to look at the text'] : [];
      }
    } else if (plot.customHtml || plot.customHtmlLive) {
      set.customHtml = null;
      htmlNotes = [];
    }
  }
  if (patch.links !== undefined) {
    set.links = patch.links
      .map((l) => ({ label: stripText(l.label, 40), url: safeUrl(l.url) }))
      .filter((l): l is { label: string; url: string } => !!l.url);
  }
  if (patch.cta !== undefined) {
    const url = patch.cta ? safeUrl(patch.cta.url) : null;
    set.cta = patch.cta && url ? { label: stripText(patch.cta.label, 40), url } : null;
  }
  if (patch.category !== undefined) set.category = patch.category ? stripText(patch.category, 40).toLowerCase() : null;
  if (patch.tags !== undefined) set.tags = [...new Set(patch.tags.map((t) => stripText(t, 24).toLowerCase()).filter(Boolean))];
  if (patch.theme !== undefined) set.theme = patch.theme;
  if (patch.frame !== undefined) {
    const f = FRAMES.find((x) => x.key === patch.frame);
    if (!f) throw badRequest('Unknown frame');
    const isStaff = actor.role === 'admin';
    if (!isStaff && actor.level < f.level) throw forbidden(`The ${f.name} frame unlocks at level ${f.level}`);
    if (!isStaff && f.plan === 'plus' && actor.plan === 'free') throw paymentRequired('This frame is part of FlatMeta Plus');
    set.frame = f.key;
  }
  if (patch.coverMediaId) {
    const m = await mediaOwnedUrl(patch.coverMediaId, actor.id, actor.role === 'admin');
    set.coverImageUrl = m.url;
    set.thumbUrl = m.thumbUrl;
  }
  if (patch.guestbookOpen !== undefined) set.guestbookOpen = patch.guestbookOpen;
  if (patch.galleryRemove) set.gallery = (plot.gallery ?? []).filter((u) => u !== patch.galleryRemove);
  if (patch.galleryMediaIds) {
    const urls: string[] = [];
    for (const id of patch.galleryMediaIds) urls.push((await mediaOwnedUrl(id, actor.id, actor.role === 'admin')).url);
    set.gallery = urls;
  }
  if (patch.business !== undefined) {
    if (patch.business && !plot.ownerOrgId && actor.role !== 'admin') throw paymentRequired('Business details are for organisation plots on the Business or Brand plan', 'business');
    if (patch.business && plot.ownerOrgId) {
      const [org] = await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, plot.ownerOrgId));
      if (actor.role !== 'admin' && !['business', 'brand', 'enterprise'].includes(org?.plan ?? 'free')) {
        throw paymentRequired('Business details need the Business or Brand plan', 'business');
      }
    }
    set.business = patch.business
      ? { ...patch.business, bookingUrl: safeUrl(patch.business.bookingUrl) ?? undefined, address: patch.business.address ? stripText(patch.business.address, 200) : undefined }
      : null;
  }

  // Moderate the public text of published plots on every change.
  const textChanged = ['title', 'tagline', 'descriptionMd', 'links', 'cta'].some((k) => k in patch);
  if (textChanged && plot.publishedAt) {
    const merged = { ...plot, ...set };
    const text = [merged.title, merged.tagline, merged.descriptionMd, ...(merged.links ?? []).map((l) => `${l.label} ${l.url}`)].filter(Boolean).join('\n');
    const mod = await checkContent('plot', plot.id, text);
    set.moderationStatus = mod.status;
  }
  let [updated] = await db.update(schema.plots).set(set).where(eq(schema.plots.id, plot.id)).returning();
  let customHtml: SavedHtml | undefined;
  if (htmlNotes) {
    customHtml = await recordCustomHtmlVersion(updated!, set.customHtml ?? null, actor, htmlNotes);
    [updated] = await db.select().from(schema.plots).where(eq(schema.plots.id, plot.id));
  }
  // H3: every content change is recorded: who, which plot, which fields.
  await audit(actor.id || null, 'plot.edit', 'plot', plot.id, { fields: Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined) });
  const game = actor.id ? await recordAction(actor.id, 'edit_plot', { ref: plot.id, noXp: true }) : null;
  return { plot: updated!, game, ...(customHtml ? { customHtml } : {}) };
}

/**
 * Free land: within the free allowance (paid land off), paid by referral bonus squares, or the Homestead.
 * Shared by REST (POST /v1/plots/claim) and MCP (claim_plot). Returns the new plot; the caller runs afterClaim.
 */
export async function claimFreeLand(user: User, q: QuoteResult, title: string, orgId: string | null): Promise<Plot> {
  if (!q.homesteadEligible) {
    if (q.bonus) {
      // Paid land is on: spend referral bonus squares first, atomically, so two claims can't spend them twice.
      const [spent] = await db
        .update(schema.users)
        .set({ bonusCellsUsed: sql`${schema.users.bonusCellsUsed} + ${q.cells}` })
        .where(and(eq(schema.users.id, user.id), sql`${schema.users.bonusCells} - ${schema.users.bonusCellsUsed} >= ${q.cells}`))
        .returning({ id: schema.users.id });
      if (!spent) throw badRequest('Your bonus squares were just used. Pick a smaller plot or pay for this one.');
    }
    const plot = await createPlot({ rect: q.rect, title, kind: 'standard', status: 'active', ownerUserId: user.id, ownerOrgId: orgId, tier: q.tier, countryCode: q.countryCode, regionSlug: q.regionSlug });
    // Two claims at once could both fit on their own: check the total again now that this one exists.
    const limit = freeLimitFor(user, orgId);
    if (!q.bonus && (await ownedCells(user.id, orgId)) > limit) {
      await db.delete(schema.plots).where(eq(schema.plots.id, plot.id));
      throw badRequest(`That would take you past your ${limit} free squares. Paid land is coming soon.`);
    }
    if (!user.homeCountry && q.countryCode) await db.update(schema.users).set({ homeCountry: q.countryCode }).where(eq(schema.users.id, user.id));
    return ensureCover(plot, user.id);
  }
  // Mark the homestead as used first so two parallel requests can't both get one.
  const [marked] = await db
    .update(schema.users)
    .set({ homesteadUsed: true })
    .where(and(eq(schema.users.id, user.id), eq(schema.users.homesteadUsed, false)))
    .returning({ id: schema.users.id });
  if (!marked) throw badRequest('Your free Homestead has already been claimed');
  let plot: Plot;
  try {
    plot = await createPlot({ rect: q.rect, title, kind: 'homestead', status: 'active', ownerUserId: user.id, tier: q.tier, countryCode: q.countryCode, regionSlug: q.regionSlug });
  } catch (err) {
    await db.update(schema.users).set({ homesteadUsed: false }).where(eq(schema.users.id, user.id));
    throw err;
  }
  if (!user.homeCountry && q.countryCode) await db.update(schema.users).set({ homeCountry: q.countryCode }).where(eq(schema.users.id, user.id));
  return ensureCover(plot, user.id);
}

export async function publishPlot(plot: Plot, actorId: string): Promise<{ plot: Plot; game: GameResult | null; blocked?: string }> {
  await audit(actorId, 'plot.publish', 'plot', plot.id);
  const text = [plot.title, plot.tagline, plot.descriptionMd, ...(plot.links ?? []).map((l) => `${l.label} ${l.url}`)].filter(Boolean).join('\n');
  const mod = await checkContent('plot', plot.id, text);
  if (mod.status === 'flagged') {
    await db.update(schema.plots).set({ moderationStatus: 'flagged' }).where(eq(schema.plots.id, plot.id));
    return { plot, game: null, blocked: 'Our moderator flagged this content. Please edit it and try again, or contact support if you think this is a mistake.' };
  }
  const first = !plot.publishedAt;
  const [updated] = await db
    .update(schema.plots)
    .set({ publishedAt: plot.publishedAt ?? new Date(), moderationStatus: mod.status, lastEditedAt: new Date() })
    .where(eq(schema.plots.id, plot.id))
    .returning();
  let game: GameResult | null = null;
  if (first) {
    game = await recordAction(actorId, 'publish', { ref: plot.id, countryCode: plot.countryCode });
    await publishActivity({ kind: 'plot_published', actorUserId: actorId, plotId: plot.id, countryCode: plot.countryCode, lat: plot.centerLat, lng: plot.centerLng, payload: { title: plot.title, slug: plot.slug } });
  }
  return { plot: updated!, game };
}

export default async function plotRoutes(app: App) {
  // ── World map feed ──
  app.get(
    '/v1/world/plots',
    {
      schema: {
        tags: ['world'],
        summary: 'Plots in a map viewport (lightweight)',
        querystring: z.object({ bbox: z.string().regex(/^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/), zoom: z.coerce.number().min(0).max(24).optional() }),
      },
    },
    async (req) => {
      const [w, s, e, n] = req.query.bbox.split(',').map(Number) as [number, number, number, number];
      const zoom = req.query.zoom ?? 10;
      const rects = w <= e ? [bboxToRect(w, s, e, n)] : [bboxToRect(w, s, 180, n), bboxToRect(-180, s, e, n)];
      const P = schema.plots;
      const limit = zoom < 6 ? 600 : 1000;
      const rows: Plot[] = [];
      for (const r of rects) {
        rows.push(
          ...(await db
            .select()
            .from(P)
            .where(and(lte(P.minGx, r.maxGx), gte(P.maxGx, r.minGx), lte(P.minGy, r.maxGy), gte(P.maxGy, r.minGy), visiblePlot()))
            .orderBy(desc(sql`coalesce(${P.spotlightUntil} > now(), false)`), desc(P.cellCount), desc(P.likesCount))
            .limit(limit)),
        );
      }
      const owners = await ownersFor(rows);
      const me = req.user?.id;
      const now = Date.now();
      return {
        plots: rows.map((p) => {
          const o = owners.get(p.id);
          return {
            id: p.id,
            slug: p.slug,
            kind: p.kind,
            title: p.title,
            tagline: p.tagline,
            rect: { minGx: p.minGx, minGy: p.minGy, maxGx: p.maxGx, maxGy: p.maxGy },
            bounds: rectBounds(p),
            center: { lat: p.centerLat, lng: p.centerLng },
            cellCount: p.cellCount,
            thumbUrl: p.thumbUrl,
            theme: p.theme,
            frame: p.frame,
            countryCode: p.countryCode,
            likesCount: p.likesCount,
            spotlight: !!p.spotlightUntil && p.spotlightUntil.getTime() > now,
            beacon: !!p.beaconUntil && p.beaconUntil.getTime() > now,
            ownerName: o?.displayName ?? (p.showcase ? p.showcase.brand : null),
            // H1: a small official logo for company plots (badge at close zoom; never the main artwork).
            logoUrl: p.showcase ? (visibleLogo(p)?.url ?? null) : null,
            verified: o?.type === 'org' ? !!o.verified : false,
            mine: !!me && (p.ownerUserId === me),
            published: !!p.publishedAt,
          };
        }),
      };
    },
  );

  // ── List / discover ──
  app.get(
    '/v1/plots',
    {
      schema: {
        tags: ['plots'],
        summary: 'List and search published plots',
        querystring: z.object({
          q: z.string().max(100).optional(),
          country: z.string().length(2).optional(),
          region: z.string().max(60).optional(),
          category: z.string().max(40).optional(),
          kind: z.enum(['standard', 'homestead', 'showcase', 'landmark', 'business']).optional(),
          owner: z.string().max(60).optional(),
          sort: z.enum(['trending', 'new', 'loved', 'nearest']).default('trending'),
          lat: z.coerce.number().optional(),
          lng: z.coerce.number().optional(),
          limit: z.coerce.number().int().min(1).max(60).default(24),
          cursor: z.coerce.number().int().min(0).default(0),
        }),
      },
    },
    async (req) => {
      const q = req.query;
      const P = schema.plots;
      const where: SQL[] = [visiblePlot()];
      if (q.kind !== 'showcase') where.push(or(isNotNull(P.publishedAt), eq(P.status, 'showcase'))!);
      if (q.country) where.push(eq(P.countryCode, q.country.toUpperCase()));
      if (q.region) where.push(eq(P.regionSlug, q.region));
      if (q.category) where.push(eq(P.category, q.category.toLowerCase()));
      if (q.kind === 'business') where.push(isNotNull(P.business));
      else if (q.kind) where.push(eq(P.kind, q.kind));
      if (q.owner) {
        const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, q.owner));
        const [o] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.slug, q.owner));
        where.push(or(u ? eq(P.ownerUserId, u.id) : sql`false`, o ? eq(P.ownerOrgId, o.id) : sql`false`)!);
      }
      if (q.q) {
        const term = q.q.trim();
        where.push(sql`(${P.search} @@ plainto_tsquery('simple', ${term}) or ${P.title} % ${term} or ${P.title} ilike ${'%' + term + '%'} or ${P.showcase}->>'brand' ilike ${'%' + term + '%'})`);
      }
      const order =
        q.sort === 'new'
          ? [desc(sql`coalesce(${P.publishedAt}, ${P.createdAt})`)]
          : q.sort === 'loved'
            ? [desc(P.likesCount), desc(P.visitsCount)]
            : q.sort === 'nearest' && q.lat !== undefined && q.lng !== undefined
              ? [sql`(${P.centerLat} - ${q.lat})^2 + ((${P.centerLng} - ${q.lng}) * cos(radians(${q.lat})))^2`]
              : [desc(sql`${P.likesCount} * 3 + ${P.visitsCount} + ${P.guestbookCount} * 4 + case when ${P.spotlightUntil} > now() then 1000 else 0 end + greatest(0, 200 - extract(epoch from now() - coalesce(${P.publishedAt}, ${P.createdAt})) / 3600)`)];
      const rows = await db.select().from(P).where(and(...where)).orderBy(...order).limit(q.limit + 1).offset(q.cursor);
      const page = rows.slice(0, q.limit);
      const owners = await ownersFor(page);
      return { plots: page.map((p) => plotView(p, owners.get(p.id) ?? null)), nextCursor: rows.length > q.limit ? q.cursor + q.limit : null };
    },
  );

  // The nearest public plots to a point (G3): a new visitor sees content around their start straight away.
  app.get(
    '/v1/plots/nearest',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: { tags: ['plots'], summary: 'Nearest public plots (landmarks, showcase, published) to a point', querystring: z.object({ lat: z.coerce.number().min(-85).max(85), lng: z.coerce.number().min(-180).max(180), limit: z.coerce.number().int().min(1).max(12).default(5) }) },
    },
    async (req) => {
      const { lat, lng, limit } = req.query;
      const P = schema.plots;
      const k = Math.cos((lat * Math.PI) / 180);
      // Planar distance with longitude scaled by latitude: good enough to rank, and an index-free scan of public plots.
      const d2 = sql`power(${P.centerLat} - ${lat}, 2) + power((${P.centerLng} - ${lng}) * ${k}, 2)`;
      const rows = await db
        .select()
        .from(P)
        .where(and(visiblePlot(), or(isNotNull(P.publishedAt), eq(P.status, 'showcase'), eq(P.kind, 'landmark'))))
        .orderBy(sql`${d2} asc`)
        .limit(limit);
      const owners = await ownersFor(rows);
      return {
        plots: rows.map((p) => ({
          ...plotView(p, owners.get(p.id) ?? null),
          distanceKm: Math.round(haversineKm(lat, lng, p.centerLat, p.centerLng) * 10) / 10,
        })),
      };
    },
  );

  app.get(
    '/v1/plots/:idOrSlug',
    { schema: { tags: ['plots'], summary: 'Get a plot (mini-page data)', params: z.object({ idOrSlug: z.string().max(80) }) } },
    async (req) => {
      const plot = await loadPlot(req.params.idOrSlug);
      if (!plot || plot.status === 'released') throw notFound('Plot');
      const view = await viewFor(plot, req.user);
      const showcaseOk = plot.status === 'showcase' && !!plot.showcase?.approved && (!showcaseLocationCheck() || !!plot.showcase.locationVerified);
      const publicOk = (plot.status === 'active' || showcaseOk) && plot.moderationStatus !== 'flagged';
      const staff = req.user?.role === 'admin' || req.user?.role === 'moderator';
      if (!publicOk && !view.canEdit && !staff) throw notFound('Plot');
      return { plot: view };
    },
  );

  app.get(
    '/v1/plots/:idOrSlug/neighbours',
    { schema: { tags: ['plots'], summary: 'Neighbouring and nearby plots', params: z.object({ idOrSlug: z.string().max(80) }) } },
    async (req) => {
      const plot = await loadPlot(req.params.idOrSlug);
      if (!plot) throw notFound('Plot');
      const direct = await neighbours(plot, 12, 5);
      const nearby = direct.length < 6 ? await neighbours(plot, 12, 300) : [];
      const all = [...direct, ...nearby.filter((p) => !direct.some((d) => d.id === p.id))];
      const owners = await ownersFor(all);
      return {
        neighbours: direct.map((p) => plotView(p, owners.get(p.id) ?? null)),
        nearby: nearby.filter((p) => !direct.some((d) => d.id === p.id)).map((p) => plotView(p, owners.get(p.id) ?? null)),
      };
    },
  );

  // JPEG cover for share cards / OG images (Satori and many social scrapers can't read WebP).
  app.get(
    '/v1/plots/:idOrSlug/cover.jpg',
    { schema: { tags: ['plots'], summary: 'Plot cover as JPEG (for share cards)', params: z.object({ idOrSlug: z.string().max(80) }), querystring: z.object({ w: z.coerce.number().int().min(64).max(1600).default(1200) }) } },
    async (req, reply) => {
      const plot = await loadPlot(req.params.idOrSlug);
      if (!plot?.coverImageUrl) throw notFound('Cover');
      const cacheKey = key('cover', plot.id, plot.coverImageUrl, req.query.w);
      const cached = await redis.getBuffer(cacheKey);
      let jpg = cached;
      if (!jpg) {
        let src: Buffer;
        const prefix = config.MEDIA_PUBLIC_URL.replace(/\/$/, '') + '/';
        if (plot.coverImageUrl.startsWith(prefix)) src = await readFile(path.resolve(config.MEDIA_DIR, plot.coverImageUrl.slice(prefix.length)));
        else src = Buffer.from(await (await fetch(plot.coverImageUrl)).arrayBuffer());
        jpg = await sharp(src).resize({ width: req.query.w, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
        await redis.set(cacheKey, jpg, 'EX', 60 * 60 * 24);
      }
      return reply.header('content-type', 'image/jpeg').header('cache-control', 'public, max-age=3600').send(jpg);
    },
  );

  // ── Claiming ──
  app.post(
    '/v1/plots/quote',
    { schema: { tags: ['plots'], summary: 'Price, tier and availability for a rectangle of cells', body: RectSchema.extend({ orgId: z.uuid().optional() }) } },
    async (req) => {
      const { orgId, ...rect } = req.body;
      return { quote: await quoteFor(req.user, rect, orgId) };
    },
  );

  app.post(
    '/v1/plots/claim',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['plots'],
        summary: 'Claim a free Homestead or start checkout for paid land',
        body: z.object({ rect: RectSchema, title: z.string().min(2).max(80).optional(), orgId: z.uuid().optional() }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      const { rect, orgId } = req.body;
      if (orgId) await assertCanActForOrg(user, orgId);
      const q = await quoteFor(user, rect, orgId);
      if (!q.available) throw badRequest(q.reasons[0] ?? 'This land is not available', { quote: q });
      const title = stripText(req.body.title ?? (q.regionSlug ? `${user.displayName}'s corner` : `${user.displayName}'s plot`), 80);
      if (q.free) {
        const plot = await claimFreeLand(user, q, title, orgId ?? null);
        const game = await afterClaim(plot, user.id);
        return { plot: await viewFor(plot, user), game };
      }
      const plot = await createPlot({
        rect: q.rect,
        title,
        kind: 'standard',
        status: 'pending_payment',
        ownerUserId: user.id,
        ownerOrgId: orgId ?? null,
        tier: q.tier,
        countryCode: q.countryCode,
        regionSlug: q.regionSlug,
        holdMinutes: 30,
      });
      const checkout = await createCheckout({
        user,
        orgId: orgId ?? null,
        kind: 'land',
        plotId: plot.id,
        items: [{ type: 'land', description: `${q.cells} cell${q.cells > 1 ? 's' : ''} of ${q.tier}-tier land · ${title}`, amountCents: q.totalCents, meta: { rect: q.rect, tier: q.tier } }],
        successPath: `/dashboard/plots/${plot.id}?welcome=1`,
        cancelPath: `/?claim=cancelled`,
      });
      return { checkoutUrl: checkout.url, orderId: checkout.orderId, plotId: plot.id };
    },
  );

  // ── Editing ──
  app.patch(
    '/v1/plots/:id',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags: ['plots'], summary: 'Update plot content', params: z.object({ id: z.uuid() }), body: PlotPatch } },
    async (req) => {
      const user = requireUser(req);
      await dailyCap(user.id, 'plot-edit', 300, 'plot edits');
      const plot = await loadPlot(req.params.id);
      if (!plot) throw notFound('Plot');
      await assertCanEditPlot(user, plot);
      const res = await applyPlotPatch(plot, req.body, user);
      return { plot: await viewFor(res.plot, user), game: res.game, customHtml: res.customHtml ?? null };
    },
  );

  app.post(
    '/v1/plots/:id/publish',
    { schema: { tags: ['plots'], summary: 'Publish a plot (runs moderation)', params: z.object({ id: z.uuid() }) } },
    async (req) => {
      const user = requireUser(req);
      const plot = await loadPlot(req.params.id);
      if (!plot) throw notFound('Plot');
      await assertCanEditPlot(user, plot);
      if (plot.status !== 'active') throw badRequest('Only active plots can be published');
      const res = await publishPlot(plot, user.id);
      if (res.blocked) throw badRequest(res.blocked);
      return { plot: await viewFor(res.plot, user), game: res.game };
    },
  );

  app.post(
    '/v1/plots/:id/media',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { tags: ['plots'], summary: 'Upload an image (multipart field "file"); use=cover|gallery applies it', params: z.object({ id: z.uuid() }), querystring: z.object({ use: z.enum(['cover', 'gallery', 'none']).default('none') }) },
    },
    async (req) => {
      const user = requireUser(req);
      const plot = await loadPlot(req.params.id);
      if (!plot) throw notFound('Plot');
      await assertCanEditPlot(user, plot);
      await dailyCap(user.id, 'upload', 60, 'image uploads');
      const file = await req.file();
      if (!file) throw badRequest('Attach an image in the "file" field');
      const buf = await file.toBuffer();
      const img = await storeImage(buf, { ownerUserId: user.id, source: 'upload' });
      const mod = await checkContent('media', img.id, `Image uploaded for plot "${plot.title}"`, img.url);
      if (mod.status === 'flagged') throw badRequest('This image was flagged by our moderator. Please choose another one.');
      let updated = plot;
      if (req.query.use === 'cover') {
        [updated] = (await db.update(schema.plots).set({ coverImageUrl: img.url, thumbUrl: img.thumbUrl, lastEditedAt: new Date() }).where(eq(schema.plots.id, plot.id)).returning()) as [Plot];
      } else if (req.query.use === 'gallery') {
        const gallery = [...(plot.gallery ?? []), img.url].slice(-6);
        [updated] = (await db.update(schema.plots).set({ gallery, lastEditedAt: new Date() }).where(eq(schema.plots.id, plot.id)).returning()) as [Plot];
      }
      await audit(user.id, 'plot.upload', 'plot', plot.id, { use: req.query.use, media: img.id });
      return { media: img, plot: await viewFor(updated, user) };
    },
  );

  // ── Social actions ──
  app.post('/v1/plots/:id/like', { schema: { tags: ['social'], summary: 'Like a plot', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const user = requireUser(req);
    const plot = await loadPlot(req.params.id);
    if (!plot) throw notFound('Plot');
    const inserted = await db.insert(schema.plotLikes).values({ plotId: plot.id, userId: user.id }).onConflictDoNothing().returning();
    let game: GameResult | null = null;
    if (inserted.length) {
      const [p] = await db.update(schema.plots).set({ likesCount: sql`${schema.plots.likesCount} + 1` }).where(eq(schema.plots.id, plot.id)).returning({ likes: schema.plots.likesCount });
      await setPlotLikes(plot.id, p?.likes ?? 0).catch(() => undefined);
      const own = plot.ownerUserId === user.id;
      game = await recordAction(user.id, 'like', { ref: plot.id, noXp: own });
      if (plot.ownerUserId && !own) {
        await recordAction(plot.ownerUserId, 'receive_like', { ref: `${plot.id}:${user.id}` });
        await notify(plot.ownerUserId, 'like', { plotId: plot.id, plotTitle: plot.title, from: user.displayName });
      }
    }
    const [fresh] = await db.select({ likes: schema.plots.likesCount }).from(schema.plots).where(eq(schema.plots.id, plot.id));
    return { liked: true, likesCount: fresh?.likes ?? 0, game };
  });

  app.delete('/v1/plots/:id/like', { schema: { tags: ['social'], summary: 'Remove a like', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const user = requireUser(req);
    const removed = await db.delete(schema.plotLikes).where(and(eq(schema.plotLikes.plotId, req.params.id), eq(schema.plotLikes.userId, user.id))).returning();
    if (removed.length) await db.update(schema.plots).set({ likesCount: sql`greatest(0, ${schema.plots.likesCount} - 1)` }).where(eq(schema.plots.id, req.params.id));
    const [fresh] = await db.select({ likes: schema.plots.likesCount }).from(schema.plots).where(eq(schema.plots.id, req.params.id));
    if (fresh) await setPlotLikes(req.params.id, fresh.likes).catch(() => undefined);
    return { liked: false, likesCount: fresh?.likes ?? 0 };
  });

  app.post('/v1/plots/:id/visit', { schema: { tags: ['social'], summary: 'Record a visit to a plot page', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const plot = await loadPlot(req.params.id);
    if (!plot) throw notFound('Plot');
    // Owners looking at their own plot, and bots, aren't visitors. No IP is stored: see lib/visitors.ts (G6).
    const own = !!req.user && (plot.ownerUserId === req.user.id);
    if (isBot(req.headers['user-agent'])) return { ok: true, game: null };
    const day = dayKey();
    const visitor = await visitorHash(req, day);
    const fresh = own ? false : await countUniqueVisit(plot.id, visitor);
    if (fresh) {
      await db.update(schema.plots).set({ visitsCount: sql`${schema.plots.visitsCount} + 1` }).where(eq(schema.plots.id, plot.id));
      await db
        .insert(schema.plotVisitDays)
        .values({ plotId: plot.id, day, visits: 1 })
        .onConflictDoUpdate({ target: [schema.plotVisitDays.plotId, schema.plotVisitDays.day], set: { visits: sql`${schema.plotVisitDays.visits} + 1` } });
    }
    if (!req.user || !fresh) return { ok: true, game: null };
    const userId = req.user.id; // never the owner here: their own visits aren't counted above
    const results: GameResult[] = [await recordAction(userId, 'visit_plot', { ref: plot.id })];
    if (plot.kind === 'showcase') results.push(await recordAction(userId, 'visit_showcase', { ref: plot.id, noXp: true }));
    if (plot.countryCode) {
      const newCountry = await db.insert(schema.userCountryVisits).values({ userId, countryCode: plot.countryCode }).onConflictDoNothing().returning();
      if (newCountry.length) results.push(await recordAction(userId, 'visit_country', { ref: plot.countryCode }));
    }
    return { ok: true, game: mergeResults(...results) };
  });

  // Unique visitors today / this week (G6): public, counts only.
  app.get(
    '/v1/plots/:id/visitors',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } }, schema: { tags: ['social'], summary: 'Unique visitors today and this week', params: z.object({ id: z.uuid() }) } },
    async (req) => {
      const plot = await loadPlot(req.params.id);
      if (!plot || plot.status === 'released') throw notFound('Plot');
      return { ...(await uniqueVisitors(plot.id)), total: plot.visitsCount };
    },
  );

  app.post('/v1/plots/:id/wave', { schema: { tags: ['social'], summary: 'Wave at a plot (once a day)', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const user = requireUser(req);
    const plot = await loadPlot(req.params.id);
    if (!plot) throw notFound('Plot');
    if (plot.ownerUserId === user.id) throw badRequest("You can't wave at your own plot");
    const inserted = await db.insert(schema.waves).values({ fromUserId: user.id, plotId: plot.id, day: dayKey() }).onConflictDoNothing().returning();
    if (!inserted.length) return { waved: false, message: 'You already waved here today', game: null };
    const game = await recordAction(user.id, 'wave', { ref: plot.id });
    if (plot.ownerUserId) {
      await recordAction(plot.ownerUserId, 'receive_wave', { ref: `${plot.id}:${user.id}` });
      await notify(plot.ownerUserId, 'wave', { plotId: plot.id, plotTitle: plot.title, from: user.displayName, fromUsername: user.username });
    }
    await publishActivity({ kind: 'wave', actorUserId: user.id, plotId: plot.id, countryCode: plot.countryCode, lat: plot.centerLat, lng: plot.centerLng, payload: { title: plot.title, slug: plot.slug } });
    return { waved: true, game };
  });

  app.get(
    '/v1/plots/:id/guestbook',
    { schema: { tags: ['social'], summary: 'Guestbook entries', params: z.object({ id: z.uuid() }), querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.coerce.number().int().min(0).default(0) }) } },
    async (req) => {
      const G = schema.guestbookEntries;
      const rows = await db
        .select({ id: G.id, body: G.body, createdAt: G.createdAt, userId: schema.users.id, username: schema.users.username, displayName: schema.users.displayName, avatarUrl: schema.users.avatarUrl, level: schema.users.level })
        .from(G)
        .innerJoin(schema.users, eq(G.userId, schema.users.id))
        .where(and(eq(G.plotId, req.params.id), isNull(G.deletedAt), inArray(G.moderationStatus, ['ok', 'pending'])))
        .orderBy(desc(G.createdAt))
        .limit(req.query.limit + 1)
        .offset(req.query.cursor);
      return {
        entries: rows.slice(0, req.query.limit).map((r) => ({ id: r.id, body: r.body, createdAt: r.createdAt, author: { id: r.userId, username: r.username, displayName: r.displayName, avatarUrl: r.avatarUrl, level: r.level } })),
        nextCursor: rows.length > req.query.limit ? req.query.cursor + req.query.limit : null,
      };
    },
  );

  app.post(
    '/v1/plots/:id/guestbook',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { tags: ['social'], summary: 'Sign the guestbook', params: z.object({ id: z.uuid() }), body: z.object({ body: z.string().min(1).max(280) }) } },
    async (req) => {
      const user = requireUser(req);
      const plot = await loadPlot(req.params.id);
      if (!plot) throw notFound('Plot');
      // H3: visitors can't place anything on land that isn't owned; owners can close their guestbook.
      if (plot.kind === 'showcase' || plot.status !== 'active' || (!plot.ownerUserId && !plot.ownerOrgId)) throw forbidden('This land has no guestbook: it isn’t owned by anyone yet.');
      if (!plot.guestbookOpen) throw forbidden('The owner has closed this guestbook.');
      const body = stripText(req.body.body, 280);
      if (!body) throw badRequest('Write something first');
      const [entry] = await db.insert(schema.guestbookEntries).values({ plotId: plot.id, userId: user.id, body }).returning();
      const mod = await checkContent('guestbook', entry!.id, body);
      if (mod.status !== 'ok') await db.update(schema.guestbookEntries).set({ moderationStatus: mod.status }).where(eq(schema.guestbookEntries.id, entry!.id));
      if (mod.status === 'flagged') throw badRequest('Your note was held by our moderator.');
      await db.update(schema.plots).set({ guestbookCount: sql`${schema.plots.guestbookCount} + 1` }).where(eq(schema.plots.id, plot.id));
      const own = plot.ownerUserId === user.id;
      const game = await recordAction(user.id, 'guestbook', { ref: plot.id, noXp: own });
      if (plot.ownerUserId && !own) {
        await recordAction(plot.ownerUserId, 'receive_guestbook', { ref: entry!.id });
        await notify(plot.ownerUserId, 'guestbook', { plotId: plot.id, plotTitle: plot.title, from: user.displayName, body: body.slice(0, 80) });
      }
      return {
        entry: { id: entry!.id, body, createdAt: entry!.createdAt, author: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl, level: user.level } },
        game,
      };
    },
  );

  app.delete('/v1/guestbook/:id', { schema: { tags: ['social'], summary: 'Delete a guestbook entry (author, plot owner or staff)', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const user = requireUser(req);
    const [entry] = await db.select().from(schema.guestbookEntries).where(eq(schema.guestbookEntries.id, req.params.id));
    if (!entry || entry.deletedAt) throw notFound('Entry');
    const plot = await loadPlot(entry.plotId);
    const staff = user.role === 'admin' || user.role === 'moderator';
    if (entry.userId !== user.id && !staff && !(plot && (await canEditPlot(user, plot)))) throw forbidden();
    await db.update(schema.guestbookEntries).set({ deletedAt: new Date() }).where(eq(schema.guestbookEntries.id, entry.id));
    await db.update(schema.plots).set({ guestbookCount: sql`greatest(0, ${schema.plots.guestbookCount} - 1)` }).where(eq(schema.plots.id, entry.plotId));
    return { ok: true };
  });

  app.post(
    '/v1/plots/:id/report',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } }, schema: { tags: ['social'], summary: 'Report a plot (or only its custom HTML)', params: z.object({ id: z.uuid() }), body: z.object({ reason: z.string().min(3).max(500), about: z.enum(['plot', 'custom_html']).default('plot') }) } },
    async (req) => {
      const plot = await loadPlot(req.params.id);
      if (!plot) throw notFound('Plot');
      if (req.body.about === 'custom_html') {
        const { paused } = await reportCustomHtml(plot, stripText(req.body.reason, 500), req.user?.id ?? null);
        return { ok: true, paused };
      }
      await db.insert(schema.moderationFlags).values({ targetType: 'plot', targetId: plot.id, source: 'report', reason: stripText(req.body.reason, 500), reporterId: req.user?.id ?? null });
      return { ok: true };
    },
  );
}
