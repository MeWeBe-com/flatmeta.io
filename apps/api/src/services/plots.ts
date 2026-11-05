import { and, count, eq, gte, inArray, lte, ne, or, sql } from 'drizzle-orm';
import { publicShowcase, publicShowcaseRaw } from '../lib/visibility.js';
import { db, schema, type Tx } from '../db/client.js';
import { config, paidCheckout } from '../config.js';
import type { Plot, User } from '../db/schema.js';
import { generateImage } from '../ai/image/index.js';
import { pickPalette } from '../ai/image/procedural.js';
import { conflict, badRequest, forbidden } from '../lib/errors.js';
import { nearestCity, resolveCountry } from '../lib/geo.js';
import { type Rect, normalizeRect, rectCenter, rectCells, cellsOf, GRID_MAX } from '../lib/grid.js';
import { DEFAULT_TIERS, PLANS, quote, type PlanKey, type Quote, type Tier } from '../lib/pricing.js';
import { uniqueSlug } from '../lib/slug.js';
import { effectivePlan } from '../lib/users.js';
import { publishActivity } from '../game/activity.js';
import { recordAction, unlock, mergeResults, type GameResult } from '../game/engine.js';
import { setUserCells } from '../game/leaderboards.js';
import { orgRole } from '../routes/views.js';

let priceCache: { at: number; prices: Record<Tier, number> } | null = null;

export async function getPrices(): Promise<Record<Tier, number>> {
  if (priceCache && Date.now() - priceCache.at < 60_000) return priceCache.prices;
  const rows = await db.select().from(schema.pricingTiers);
  const prices = Object.fromEntries(DEFAULT_TIERS.map((t) => [t.tier, t.priceCents])) as Record<Tier, number>;
  for (const r of rows) prices[r.tier as Tier] = r.priceCents;
  priceCache = { at: Date.now(), prices };
  return prices;
}
export const clearPriceCache = () => {
  priceCache = null;
};

export function validRect(input: Rect): Rect {
  const r = normalizeRect(input);
  for (const v of [r.minGx, r.minGy, r.maxGx, r.maxGy]) {
    if (!Number.isInteger(v) || v < 0 || v > GRID_MAX) throw badRequest('Cell coordinates are out of range');
  }
  return r;
}

/** Active, showcase or held (pending) plots overlapping a rectangle. */
export async function overlapping(r: Rect, exceptId?: string): Promise<Pick<Plot, 'id' | 'slug' | 'title' | 'status' | 'kind'>[]> {
  const P = schema.plots;
  return db
    .select({ id: P.id, slug: P.slug, title: P.title, status: P.status, kind: P.kind })
    .from(P)
    .where(
      and(
        lte(P.minGx, r.maxGx),
        gte(P.maxGx, r.minGx),
        lte(P.minGy, r.maxGy),
        gte(P.maxGy, r.minGy),
        inArray(P.status, ['active', 'showcase', 'pending_payment', 'hidden']),
        ...(exceptId ? [ne(P.id, exceptId)] : []),
      ),
    )
    .limit(20);
}

export interface QuoteResult extends Quote {
  rect: Rect;
  center: { lat: number; lng: number };
  countryCode: string | null;
  regionSlug: string | null;
  conflicts: { id: string; slug: string; title: string }[];
  available: boolean;
  plan: PlanKey;
  plotLimitReached: boolean;
  reasons: string[];
  /** False while paid checkout is off (launch): only land within the free allowance can be claimed. */
  paidCheckout: boolean;
  /** Free-land allowance while paid checkout is off: squares per person or organisation, and how many are used. */
  freeAllowance: { limit: number; used: number } | null;
  /** True when this land would need a payment, and payments aren't open yet. */
  comingSoon: boolean;
}

/** Squares the person (or organisation) already holds, active or waiting for payment. */
export async function ownedCells(userId: string, orgId?: string | null): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.plots.cellCount}), 0)::int` })
    .from(schema.plots)
    .where(and(orgId ? eq(schema.plots.ownerOrgId, orgId) : and(eq(schema.plots.ownerUserId, userId), sql`${schema.plots.ownerOrgId} is null`), inArray(schema.plots.status, ['active', 'pending_payment'])));
  return row?.n ?? 0;
}

export async function quoteFor(user: User | null, rectIn: Rect, orgId?: string | null): Promise<QuoteResult> {
  const rect = validRect(rectIn);
  const plan = user ? await effectivePlan(user, orgId) : 'free';
  const homesteadAvailable = !orgId && (!user || !user.homesteadUsed);
  const q = quote({ rect, prices: await getPrices(), plan, homesteadAvailable });
  // Launch without payments: everything within the free allowance is free, anything beyond waits for payments.
  const paid = paidCheckout();
  let freeAllowance: QuoteResult['freeAllowance'] = null;
  let comingSoon = false;
  if (!paid) {
    const used = user ? await ownedCells(user.id, orgId) : 0;
    freeAllowance = { limit: config.FREE_LAND_CELLS, used };
    if (used + q.cells <= config.FREE_LAND_CELLS) {
      q.free = true;
      q.discountCents = q.subtotalCents;
      q.totalCents = 0;
    } else {
      q.free = false;
      comingSoon = true;
    }
  }
  const center = rectCenter(rect);
  const conflicts = await overlapping(rect);
  let owned = 0;
  if (user) {
    const [row] = await db
      .select({ n: count() })
      .from(schema.plots)
      .where(and(orgId ? eq(schema.plots.ownerOrgId, orgId) : eq(schema.plots.ownerUserId, user.id), inArray(schema.plots.status, ['active', 'pending_payment'])));
    owned = row?.n ?? 0;
  }
  const plotLimitReached = owned >= PLANS[plan].maxPlots;
  const reasons: string[] = [];
  if (conflicts.length) reasons.push('Some of these cells are already taken.');
  if (q.tooLarge) reasons.push(`Plots on your plan can be at most ${q.maxSide}×${q.maxSide} cells.`);
  if (plotLimitReached) reasons.push(paid ? `Your plan allows ${PLANS[plan].maxPlots} plots. Upgrade for more.` : `You can hold ${PLANS[plan].maxPlots} plots for now. More plots come with paid plans, coming soon.`);
  if (comingSoon && freeAllowance) {
    const left = Math.max(0, freeAllowance.limit - freeAllowance.used);
    reasons.push(left > 0 ? `Paid land is coming soon. You can claim ${left} more square${left === 1 ? '' : 's'} free: pick a smaller plot.` : `You have used your ${freeAllowance.limit} free squares. Paid land is coming soon.`);
  }
  const near = nearestCity(center.lat, center.lng, 30);
  return {
    ...q,
    rect,
    center,
    countryCode: resolveCountry(center.lat, center.lng),
    regionSlug: near?.city.slug ?? null,
    conflicts: conflicts.map((c) => ({ id: c.id, slug: c.slug, title: c.title })),
    available: conflicts.length === 0 && !q.tooLarge && !plotLimitReached && !comingSoon,
    plan,
    plotLimitReached,
    reasons,
    paidCheckout: paid,
    freeAllowance,
    comingSoon,
  };
}

async function slugExists(s: string) {
  const [hit] = await db.select({ id: schema.plots.id }).from(schema.plots).where(eq(schema.plots.slug, s));
  return !!hit;
}

const isUniqueViolation = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
};

export interface CreatePlotInput {
  rect: Rect;
  title: string;
  kind: 'standard' | 'homestead' | 'showcase' | 'landmark';
  status: 'active' | 'pending_payment' | 'showcase';
  ownerUserId?: string | null;
  ownerOrgId?: string | null;
  tier: Tier;
  countryCode: string | null;
  regionSlug: string | null;
  slugBase?: string;
  holdMinutes?: number;
  extra?: Partial<typeof schema.plots.$inferInsert>;
}

/** Inserts a plot and its cells in one transaction; the cell primary key rejects any overlap. */
export async function createPlot(input: CreatePlotInput, tx?: Tx): Promise<Plot> {
  const rect = input.rect;
  const center = rectCenter(rect);
  const slug = await uniqueSlug(input.slugBase ?? input.title, slugExists);
  const run = async (t: Tx) => {
    const [plot] = await t
      .insert(schema.plots)
      .values({
        slug,
        title: input.title,
        kind: input.kind,
        status: input.status,
        ownerUserId: input.ownerUserId ?? null,
        ownerOrgId: input.ownerOrgId ?? null,
        ...rect,
        cellCount: rectCells(rect),
        centerLat: center.lat,
        centerLng: center.lng,
        tier: input.tier,
        countryCode: input.countryCode,
        regionSlug: input.regionSlug,
        holdExpiresAt: input.holdMinutes ? new Date(Date.now() + input.holdMinutes * 60_000) : null,
        theme: { primary: pickPalette(slug)[1]!, accent: pickPalette(slug)[2]! },
        lastEditedAt: new Date(),
        ...input.extra,
      })
      .returning();
    const cells = [...cellsOf(rect)].map((c) => ({ ...c, plotId: plot!.id }));
    for (let i = 0; i < cells.length; i += 500) await t.insert(schema.plotCells).values(cells.slice(i, i + 500));
    return plot!;
  };
  try {
    return tx ? await run(tx) : await db.transaction(run);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('Someone just claimed some of these cells. Pick another spot.');
    throw err;
  }
}

/** Gives a plot an original procedural cover so it never looks empty. */
export async function ensureCover(plot: Plot, ownerUserId?: string | null): Promise<Plot> {
  if (plot.coverImageUrl) return plot;
  const img = await generateImage({ id: plot.id, prompt: plot.title, provider: 'procedural', ownerUserId });
  const [updated] = await db.update(schema.plots).set({ coverImageUrl: img.url, thumbUrl: img.thumbUrl }).where(eq(schema.plots.id, plot.id)).returning();
  return updated!;
}

export async function recountCountry(code: string | null) {
  if (!code) return;
  await db.execute(sql`
    update countries c set
      plot_count = coalesce(s.plots, 0), cell_count = coalesce(s.cells, 0), showcase_count = coalesce(s.showcase, 0)
    from (
      select
        count(*) filter (where status = 'active')::int as plots,
        coalesce(sum(cell_count) filter (where status = 'active'), 0)::int as cells,
        count(*) filter (where ${publicShowcaseRaw()})::int as showcase
      from plots where country_code = ${code}
    ) s
    where c.code = ${code}`);
}

async function userCellsIn(userId: string, code: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.plots.cellCount}),0)::int` })
    .from(schema.plots)
    .where(and(eq(schema.plots.ownerUserId, userId), eq(schema.plots.countryCode, code), eq(schema.plots.status, 'active')));
  return r?.n ?? 0;
}

/** Everything that happens when a plot becomes someone's: game, feed, stats. */
export async function afterClaim(plot: Plot, actorUserId: string | null): Promise<GameResult | null> {
  await recountCountry(plot.countryCode);
  await publishActivity({
    kind: plot.kind === 'landmark' ? 'landmark_claimed' : 'plot_claimed',
    actorUserId,
    plotId: plot.id,
    countryCode: plot.countryCode,
    lat: plot.centerLat,
    lng: plot.centerLng,
    payload: { title: plot.title, slug: plot.slug, cells: plot.cellCount, tier: plot.tier, kind: plot.kind },
  });
  if (!actorUserId) return null;
  if (plot.countryCode) await setUserCells(actorUserId, plot.countryCode, await userCellsIn(actorUserId, plot.countryCode)).catch(() => undefined);
  const results: (GameResult | null)[] = [];
  results.push(await recordAction(actorUserId, 'claim_plot', { ref: plot.id, countryCode: plot.countryCode }));
  if (plot.kind === 'homestead') results.push(await unlock(actorUserId, 'homesteader'));
  if (plot.countryCode) {
    const [first] = await db
      .select({ n: count() })
      .from(schema.plots)
      .where(and(eq(schema.plots.countryCode, plot.countryCode), inArray(schema.plots.kind, ['standard', 'homestead', 'landmark']), eq(schema.plots.status, 'active')));
    if ((first?.n ?? 0) === 1) results.push(await unlock(actorUserId, 'early-settler'));
  }
  return mergeResults(...results);
}

/** Moves a pending plot to active (after payment). Idempotent. */
export async function activatePlot(plotId: string): Promise<Plot | null> {
  const [plot] = await db
    .update(schema.plots)
    .set({ status: 'active', holdExpiresAt: null, updatedAt: sql`now()` })
    .where(and(eq(schema.plots.id, plotId), eq(schema.plots.status, 'pending_payment')))
    .returning();
  return plot ?? null;
}

/** Frees cells of a plot (release/refund/expiry). */
export async function releasePlot(plotId: string, tx?: Tx) {
  const run = async (t: Tx) => {
    await t.delete(schema.plotCells).where(eq(schema.plotCells.plotId, plotId));
    const [p] = await t.update(schema.plots).set({ status: 'released', updatedAt: sql`now()` }).where(eq(schema.plots.id, plotId)).returning();
    return p;
  };
  const p = tx ? await run(tx) : await db.transaction(run);
  if (p) await recountCountry(p.countryCode);
  return p;
}

/** Releases unpaid holds older than their expiry. */
export async function expireHolds(): Promise<number> {
  const expired = await db
    .select({ id: schema.plots.id })
    .from(schema.plots)
    .where(and(eq(schema.plots.status, 'pending_payment'), lte(schema.plots.holdExpiresAt, new Date())));
  for (const p of expired) {
    await releasePlot(p.id);
    await db.update(schema.orders).set({ status: 'expired', updatedAt: sql`now()` }).where(and(eq(schema.orders.plotId, p.id), eq(schema.orders.status, 'pending')));
  }
  return expired.length;
}

export async function assertCanActForOrg(user: User, orgId: string) {
  const role = await orgRole(user.id, orgId);
  if (!role || role === 'editor') throw forbidden('Only organisation owners and admins can claim land for it');
}

/** Plots within `by` cells of this one (5 = direct neighbours; larger = "nearby"). */
export async function neighbours(plot: Plot, limit = 12, by = 5) {
  const P = schema.plots;
  return db
    .select()
    .from(P)
    .where(
      and(
        lte(P.minGx, plot.maxGx + by),
        gte(P.maxGx, plot.minGx - by),
        lte(P.minGy, plot.maxGy + by),
        gte(P.maxGy, plot.minGy - by),
        ne(P.id, plot.id),
        or(eq(P.status, 'active'), publicShowcase()),
      ),
    )
    .limit(limit);
}

