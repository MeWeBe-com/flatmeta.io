import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, gte, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { config, showcaseLocationCheck } from '../config.js';
import { db, schema } from '../db/client.js';
import type { ShowcaseInfo } from '../db/schema.js';
import { requireAdmin, requireStaff } from '../lib/auth.js';
import { badRequest, notFound } from '../lib/errors.js';
import { sendEmail, templates } from '../email/index.js';
import { DEFAULT_TIERS } from '../lib/pricing.js';
import { refundOrder } from '../services/billing.js';
import { clearPriceCache, recountCountry, releasePlot } from '../services/plots.js';
import { curatedCountries, generateShowcase, loadCurated, moveShowcasePlot, regenerateShowcaseImage } from '../showcase/generator.js';
import { CITIES } from '../data/cities.js';
import { haversineKm, resolveCountry } from '../lib/geo.js';
import { applyPlotPatch, loadPlot, PlotPatch } from './plots.js';
import { ownersFor, plotView, privateUser } from './views.js';

async function audit(actorId: string, action: string, targetType: string | null, targetId: string | null, meta: Record<string, unknown> = {}) {
  await db.insert(schema.auditLog).values({ actorId, action, targetType, targetId, meta });
}

const page = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.coerce.number().int().min(0).default(0) });

export default async function adminRoutes(app: App) {
  app.get('/v1/admin/stats', { schema: { tags: ['admin'], summary: 'Dashboard numbers' } }, async (req) => {
    requireStaff(req);
    const since30 = new Date(Date.now() - 30 * 86400_000);
    const since14 = new Date(Date.now() - 14 * 86400_000);
    const P = schema.plots;
    const [[users], [plots], [revenue], [orders30], [ai30], [flags], [claims], [takedowns], signups, revenueDaily, [subs]] = await Promise.all([
      db.select({ total: count(), new30: sql<number>`count(*) filter (where ${schema.users.createdAt} >= ${since30})::int` }).from(schema.users),
      db
        .select({
          active: sql<number>`count(*) filter (where ${P.status} = 'active')::int`,
          showcase: sql<number>`count(*) filter (where ${P.status} = 'showcase')::int`,
          showcasePending: sql<number>`count(*) filter (where ${P.status} = 'showcase' and not coalesce((${P.showcase}->>'approved')::boolean, false))::int`,
          cells: sql<number>`coalesce(sum(${P.cellCount}) filter (where ${P.status} = 'active'), 0)::int`,
          published: sql<number>`count(*) filter (where ${P.publishedAt} is not null and ${P.status} = 'active')::int`,
        })
        .from(P),
      db.select({ all: sql<number>`coalesce(sum(${schema.orders.amountCents}),0)::int`, last30: sql<number>`coalesce(sum(${schema.orders.amountCents}) filter (where ${schema.orders.paidAt} >= ${since30}),0)::int` }).from(schema.orders).where(eq(schema.orders.status, 'paid')),
      db.select({ n: count() }).from(schema.orders).where(and(eq(schema.orders.status, 'paid'), gte(schema.orders.paidAt, since30))),
      db.select({ n: count() }).from(schema.aiJobs).where(gte(schema.aiJobs.createdAt, since30)),
      db.select({ n: count() }).from(schema.moderationFlags).where(eq(schema.moderationFlags.status, 'open')),
      db.select({ n: count() }).from(schema.claimRequests).where(inArray(schema.claimRequests.status, ['manual_review', 'pending_email', 'verified'])),
      db.select({ n: count() }).from(schema.takedownRequests).where(eq(schema.takedownRequests.status, 'open')),
      db.select({ day: sql<string>`to_char(${schema.users.createdAt}, 'YYYY-MM-DD')`, n: count() }).from(schema.users).where(gte(schema.users.createdAt, since14)).groupBy(sql`1`).orderBy(sql`1`),
      db
        .select({ day: sql<string>`to_char(${schema.orders.paidAt}, 'YYYY-MM-DD')`, cents: sql<number>`sum(${schema.orders.amountCents})::int` })
        .from(schema.orders)
        .where(and(eq(schema.orders.status, 'paid'), gte(schema.orders.paidAt, since14)))
        .groupBy(sql`1`)
        .orderBy(sql`1`),
      db.select({ active: sql<number>`count(*) filter (where ${schema.subscriptions.status} in ('active','trialing'))::int` }).from(schema.subscriptions),
    ]);
    return {
      users,
      plots,
      revenue: { ...revenue, orders30: orders30?.n ?? 0, activeSubscriptions: subs?.active ?? 0 },
      ai: { jobs30: ai30?.n ?? 0 },
      queues: { moderation: flags?.n ?? 0, claims: claims?.n ?? 0, takedowns: takedowns?.n ?? 0 },
      series: { signups, revenue: revenueDaily },
      env: { appEnv: config.APP_ENV, paymentsMock: !config.STRIPE_SECRET_KEY },
    };
  });

  // ── Users ──
  app.get('/v1/admin/users', { schema: { tags: ['admin'], summary: 'Search users', querystring: page.extend({ q: z.string().max(100).optional() }) } }, async (req) => {
    requireStaff(req);
    const U = schema.users;
    const where = req.query.q ? or(ilike(U.email, `%${req.query.q}%`), ilike(U.username, `%${req.query.q}%`), ilike(U.displayName, `%${req.query.q}%`)) : undefined;
    const rows = await db.select().from(U).where(where).orderBy(desc(U.createdAt)).limit(req.query.limit).offset(req.query.cursor);
    return { users: rows.map((u) => ({ ...privateUser(u), bannedAt: u.bannedAt, aiCreditsBonus: u.aiCreditsBonus })) };
  });

  app.patch(
    '/v1/admin/users/:id',
    {
      schema: {
        tags: ['admin'],
        summary: 'Change role, ban, plan or bonus credits',
        params: z.object({ id: z.uuid() }),
        body: z.object({ role: z.enum(['user', 'moderator', 'admin']).optional(), banned: z.boolean().optional(), plan: z.enum(['free', 'plus']).optional(), aiCreditsBonus: z.number().int().min(0).max(10000).optional() }),
      },
    },
    async (req) => {
      const admin = requireAdmin(req);
      const set: Partial<typeof schema.users.$inferInsert> = { updatedAt: new Date() };
      if (req.body.role) set.role = req.body.role;
      if (req.body.banned !== undefined) set.bannedAt = req.body.banned ? new Date() : null;
      if (req.body.plan) set.plan = req.body.plan;
      if (req.body.aiCreditsBonus !== undefined) set.aiCreditsBonus = req.body.aiCreditsBonus;
      const [u] = await db.update(schema.users).set(set).where(eq(schema.users.id, req.params.id)).returning();
      if (!u) throw notFound('User');
      if (req.body.banned) {
        await db.delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
        await db.update(schema.plots).set({ status: 'hidden' }).where(and(eq(schema.plots.ownerUserId, u.id), eq(schema.plots.status, 'active')));
      }
      await audit(admin.id, 'user.update', 'user', u.id, req.body);
      return { user: privateUser(u) };
    },
  );

  // ── Plots ──
  app.get(
    '/v1/admin/plots',
    { schema: { tags: ['admin'], summary: 'Search plots', querystring: page.extend({ q: z.string().max(100).optional(), status: z.string().max(20).optional(), kind: z.string().max(20).optional(), country: z.string().length(2).optional() }) } },
    async (req) => {
      requireStaff(req);
      const P = schema.plots;
      const where: SQL[] = [];
      if (req.query.q) where.push(or(ilike(P.title, `%${req.query.q}%`), ilike(P.slug, `%${req.query.q}%`))!);
      if (req.query.status) where.push(eq(P.status, req.query.status));
      if (req.query.kind) where.push(eq(P.kind, req.query.kind));
      if (req.query.country) where.push(eq(P.countryCode, req.query.country.toUpperCase()));
      const rows = await db.select().from(P).where(where.length ? and(...where) : undefined).orderBy(desc(P.createdAt)).limit(req.query.limit).offset(req.query.cursor);
      const owners = await ownersFor(rows);
      return { plots: rows.map((p) => plotView(p, owners.get(p.id) ?? null, { canEdit: true })) };
    },
  );

  app.patch(
    '/v1/admin/plots/:id',
    {
      schema: {
        tags: ['admin'],
        summary: 'Moderate or feature a plot',
        params: z.object({ id: z.uuid() }),
        body: z.object({ status: z.enum(['active', 'hidden']).optional(), moderationStatus: z.enum(['ok', 'pending', 'flagged', 'rejected']).optional(), spotlightDays: z.number().int().min(0).max(90).optional() }),
      },
    },
    async (req) => {
      const admin = requireStaff(req);
      const set: Partial<typeof schema.plots.$inferInsert> = { updatedAt: new Date() };
      if (req.body.status) set.status = req.body.status;
      if (req.body.moderationStatus) set.moderationStatus = req.body.moderationStatus;
      if (req.body.spotlightDays !== undefined) set.spotlightUntil = req.body.spotlightDays ? new Date(Date.now() + req.body.spotlightDays * 86400_000) : null;
      const [p] = await db.update(schema.plots).set(set).where(eq(schema.plots.id, req.params.id)).returning();
      if (!p) throw notFound('Plot');
      await recountCountry(p.countryCode);
      await audit(admin.id, 'plot.update', 'plot', p.id, req.body);
      return { plot: plotView(p, null, { canEdit: true }) };
    },
  );

  app.post('/v1/admin/plots/:id/release', { schema: { tags: ['admin'], summary: 'Release a plot (frees its cells)', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const admin = requireAdmin(req);
    const p = await releasePlot(req.params.id);
    if (!p) throw notFound('Plot');
    await audit(admin.id, 'plot.release', 'plot', p.id);
    return { ok: true };
  });

  // ── Moderation queue ──
  app.get('/v1/admin/moderation', { schema: { tags: ['admin'], summary: 'Moderation flags', querystring: page.extend({ status: z.enum(['open', 'actioned', 'dismissed']).default('open') }) } }, async (req) => {
    requireStaff(req);
    const F = schema.moderationFlags;
    const flags = await db.select().from(F).where(eq(F.status, req.query.status)).orderBy(desc(F.score), desc(F.createdAt)).limit(req.query.limit).offset(req.query.cursor);
    const items = [];
    for (const f of flags) {
      let preview: Record<string, unknown> | null = null;
      if (f.targetType === 'plot') {
        const [p] = await db.select().from(schema.plots).where(eq(schema.plots.id, f.targetId));
        if (p) preview = { title: p.title, slug: p.slug, tagline: p.tagline, description: p.descriptionMd?.slice(0, 400), status: p.status, moderationStatus: p.moderationStatus, thumbUrl: p.thumbUrl };
      } else if (f.targetType === 'guestbook') {
        const [g] = await db.select().from(schema.guestbookEntries).where(eq(schema.guestbookEntries.id, f.targetId));
        if (g) preview = { body: g.body, plotId: g.plotId, moderationStatus: g.moderationStatus, deleted: !!g.deletedAt };
      } else if (f.targetType === 'media') {
        const [m] = await db.select().from(schema.media).where(eq(schema.media.id, f.targetId));
        if (m) preview = { url: m.url, thumbUrl: m.thumbUrl };
      } else if (f.targetType === 'user') {
        const [u] = await db.select().from(schema.users).where(eq(schema.users.id, f.targetId));
        if (u) preview = { username: u.username, displayName: u.displayName, bio: u.bio };
      }
      items.push({ ...f, preview });
    }
    return { flags: items };
  });

  app.post(
    '/v1/admin/moderation/:id/resolve',
    { schema: { tags: ['admin'], summary: 'Resolve a flag', params: z.object({ id: z.uuid() }), body: z.object({ action: z.enum(['dismiss', 'approve', 'hide', 'remove', 'ban']) }) } },
    async (req) => {
      const staff = requireStaff(req);
      const [f] = await db.select().from(schema.moderationFlags).where(eq(schema.moderationFlags.id, req.params.id));
      if (!f) throw notFound('Flag');
      const a = req.body.action;
      if (f.targetType === 'plot') {
        if (a === 'approve' || a === 'dismiss') await db.update(schema.plots).set({ moderationStatus: 'ok' }).where(eq(schema.plots.id, f.targetId));
        if (a === 'hide' || a === 'remove' || a === 'ban') await db.update(schema.plots).set({ moderationStatus: 'rejected', status: 'hidden' }).where(eq(schema.plots.id, f.targetId));
      } else if (f.targetType === 'guestbook') {
        if (a === 'approve' || a === 'dismiss') await db.update(schema.guestbookEntries).set({ moderationStatus: 'ok' }).where(eq(schema.guestbookEntries.id, f.targetId));
        else await db.update(schema.guestbookEntries).set({ moderationStatus: 'rejected', deletedAt: new Date() }).where(eq(schema.guestbookEntries.id, f.targetId));
      }
      if (a === 'ban') {
        const ownerId =
          f.targetType === 'plot'
            ? (await db.select({ id: schema.plots.ownerUserId }).from(schema.plots).where(eq(schema.plots.id, f.targetId)))[0]?.id
            : f.targetType === 'guestbook'
              ? (await db.select({ id: schema.guestbookEntries.userId }).from(schema.guestbookEntries).where(eq(schema.guestbookEntries.id, f.targetId)))[0]?.id
              : f.targetType === 'user'
                ? f.targetId
                : null;
        if (ownerId && staff.role === 'admin') {
          await db.update(schema.users).set({ bannedAt: new Date() }).where(eq(schema.users.id, ownerId));
          await db.delete(schema.sessions).where(eq(schema.sessions.userId, ownerId));
        }
      }
      await db
        .update(schema.moderationFlags)
        .set({ status: a === 'dismiss' || a === 'approve' ? 'dismissed' : 'actioned', resolvedBy: staff.id, resolvedAt: new Date() })
        .where(eq(schema.moderationFlags.id, f.id));
      await audit(staff.id, `moderation.${a}`, f.targetType, f.targetId);
      return { ok: true };
    },
  );

  // ── Orders ──
  app.get('/v1/admin/orders', { schema: { tags: ['admin'], summary: 'Orders', querystring: page.extend({ status: z.string().max(20).optional() }) } }, async (req) => {
    requireStaff(req);
    const O = schema.orders;
    const rows = await db
      .select({ order: O, email: schema.users.email, username: schema.users.username })
      .from(O)
      .leftJoin(schema.users, eq(O.userId, schema.users.id))
      .where(req.query.status ? eq(O.status, req.query.status) : undefined)
      .orderBy(desc(O.createdAt))
      .limit(req.query.limit)
      .offset(req.query.cursor);
    return { orders: rows.map((r) => ({ ...r.order, email: r.email, username: r.username })) };
  });

  app.post('/v1/admin/orders/:id/refund', { schema: { tags: ['admin'], summary: 'Refund an order (releases land)', params: z.object({ id: z.uuid() }), body: z.object({ reason: z.string().max(300).default('Refunded by admin') }) } }, async (req) => {
    const admin = requireAdmin(req);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, req.params.id));
    if (!order) throw notFound('Order');
    if (order.status !== 'paid') throw badRequest('Only paid orders can be refunded');
    await refundOrder(order, req.body.reason);
    await audit(admin.id, 'order.refund', 'order', order.id, { reason: req.body.reason });
    return { ok: true };
  });

  // ── Pricing ──
  app.get('/v1/admin/pricing', { schema: { tags: ['admin'], summary: 'Land tier prices' } }, async (req) => {
    requireStaff(req);
    const rows = await db.select().from(schema.pricingTiers).orderBy(schema.pricingTiers.sort);
    return { tiers: rows.length ? rows : DEFAULT_TIERS };
  });

  app.put(
    '/v1/admin/pricing',
    { schema: { tags: ['admin'], summary: 'Update land tier prices', body: z.object({ tiers: z.array(z.object({ tier: z.enum(['S', 'A', 'B', 'C', 'O']), priceCents: z.number().int().min(50).max(1_000_000), label: z.string().max(40).optional(), description: z.string().max(200).optional() })) }) } },
    async (req) => {
      const admin = requireAdmin(req);
      for (const t of req.body.tiers) {
        await db
          .update(schema.pricingTiers)
          .set({ priceCents: t.priceCents, ...(t.label ? { label: t.label } : {}), ...(t.description ? { description: t.description } : {}) })
          .where(eq(schema.pricingTiers.tier, t.tier));
      }
      clearPriceCache();
      await audit(admin.id, 'pricing.update', null, null, { tiers: req.body.tiers });
      return { tiers: await db.select().from(schema.pricingTiers).orderBy(schema.pricingTiers.sort) };
    },
  );

  // ── Showcase manager ──
  app.get(
    '/v1/admin/showcase',
    { schema: { tags: ['admin'], summary: 'Showcase plots', querystring: page.extend({ country: z.string().length(2).optional(), approved: z.enum(['true', 'false']).optional(), q: z.string().max(100).optional() }) } },
    async (req) => {
      requireStaff(req);
      const P = schema.plots;
      const where: SQL[] = [eq(P.kind, 'showcase')];
      if (req.query.country) where.push(eq(P.countryCode, req.query.country.toUpperCase()));
      if (req.query.approved) where.push(sql`coalesce((${P.showcase}->>'approved')::boolean, false) = ${req.query.approved === 'true'}`);
      if (req.query.q) where.push(or(ilike(P.title, `%${req.query.q}%`), sql`${P.showcase}->>'brand' ilike ${'%' + req.query.q + '%'}`)!);
      const rows = await db.select().from(P).where(and(...where)).orderBy(P.countryCode, P.title).limit(req.query.limit).offset(req.query.cursor);
      const [total] = await db.select({ n: count() }).from(P).where(and(...where));
      const batches = await db.select().from(schema.showcaseBatches).orderBy(desc(schema.showcaseBatches.createdAt)).limit(10);
      return {
        plots: rows.map((p) => ({ ...plotView(p, null, { canEdit: true }), showcaseFull: p.showcase })),
        total: total?.n ?? 0,
        batches,
        curatedCountries: await curatedCountries(),
      };
    },
  );

  app.post(
    '/v1/admin/showcase/generate',
    {
      schema: {
        tags: ['admin'],
        summary: 'Generate showcase plots (runs in the background)',
        body: z.object({
          countries: z.array(z.string().length(2)).min(1).max(30),
          source: z.enum(['curated', 'ai']).default('curated'),
          count: z.number().int().min(1).max(30).optional(),
          names: z.array(z.string().max(100)).max(30).optional(),
          images: z.enum(['procedural', 'openai', 'gemini', 'external']).optional(),
          approve: z.boolean().default(false),
          force: z.boolean().default(false),
          regenerateImages: z.boolean().default(false),
        }),
      },
    },
    async (req) => {
      const admin = requireAdmin(req);
      const batchId = randomUUID();
      const countries = req.body.countries.map((c) => c.toUpperCase());
      await db.insert(schema.showcaseBatches).values({ id: batchId, countries, status: 'running', params: req.body, createdBy: admin.id });
      await audit(admin.id, 'showcase.generate', 'batch', batchId, req.body);
      void generateShowcase({ ...req.body, countries, batchId })
        .then((stats) => db.update(schema.showcaseBatches).set({ status: 'done', stats: { ...stats, plots: stats.plots.length }, finishedAt: new Date() }).where(eq(schema.showcaseBatches.id, batchId)))
        .catch((err) => db.update(schema.showcaseBatches).set({ status: 'failed', stats: { error: (err as Error).message }, finishedAt: new Date() }).where(eq(schema.showcaseBatches.id, batchId)));
      return { batchId, status: 'running' };
    },
  );

  app.patch(
    '/v1/admin/showcase/:id',
    {
      schema: {
        tags: ['admin'],
        summary: 'Edit a showcase plot',
        params: z.object({ id: z.uuid() }),
        body: PlotPatch.extend({
          showcase: z.object({ brand: z.string().max(100).optional(), website: z.string().max(300).optional(), sector: z.string().max(40).optional(), useCase: z.string().max(80).optional(), highlights: z.array(z.string().max(120)).max(5).optional(), imagePrompt: z.string().max(800).optional(), approved: z.boolean().optional() }).optional(),
        }),
      },
    },
    async (req) => {
      const admin = requireStaff(req);
      const plot = await loadPlot(req.params.id);
      if (!plot || plot.kind !== 'showcase') throw notFound('Showcase plot');
      const { showcase, ...patch } = req.body;
      const res = await applyPlotPatch(plot, patch, admin);
      let updated = res.plot;
      if (showcase) {
        const merged = { ...plot.showcase!, ...showcase } as ShowcaseInfo;
        [updated] = (await db.update(schema.plots).set({ showcase: merged }).where(eq(schema.plots.id, plot.id)).returning()) as [typeof plot];
        await recountCountry(plot.countryCode);
      }
      await audit(admin.id, 'showcase.edit', 'plot', plot.id);
      return { plot: { ...plotView(updated, null, { canEdit: true }), showcaseFull: updated.showcase } };
    },
  );

  app.post(
    '/v1/admin/showcase/:id/regenerate-image',
    { schema: { tags: ['admin'], summary: 'Regenerate a showcase image', params: z.object({ id: z.uuid() }), body: z.object({ provider: z.enum(['procedural', 'openai', 'gemini', 'external']).optional(), prompt: z.string().max(800).optional() }) } },
    async (req) => {
      const admin = requireStaff(req);
      const res = await regenerateShowcaseImage(req.params.id, req.body.provider, req.body.prompt);
      await audit(admin.id, 'showcase.regenerate_image', 'plot', req.params.id, req.body);
      return { plot: { ...plotView(res.plot, null, { canEdit: true }), showcaseFull: res.plot.showcase }, pending: res.pending, provider: res.provider };
    },
  );

  // ── Showcase locations: check that each plot sits on the right place before it goes public ──
  app.get(
    '/v1/admin/showcase/locations',
    { schema: { tags: ['admin'], summary: 'Showcase plots with location checks', querystring: z.object({ country: z.string().length(2).optional(), status: z.enum(['all', 'unverified', 'verified', 'suspect']).default('all') }) } },
    async (req) => {
      requireStaff(req);
      const P = schema.plots;
      const where: SQL[] = [eq(P.kind, 'showcase')];
      if (req.query.country) where.push(eq(P.countryCode, req.query.country.toUpperCase()));
      const rows = await db.select().from(P).where(and(...where)).orderBy(P.countryCode, P.title).limit(2000);
      // Where the curated file says the organisation is (plots can be pushed aside when space is taken).
      const seeds = new Map<string, { lat: number; lng: number }>();
      for (const code of new Set(rows.map((r) => r.countryCode).filter((c): c is string => !!c))) {
        try {
          for (const e of (await loadCurated(code)).entries) seeds.set(`${code}:${e.brand.toLowerCase()}`, { lat: e.lat, lng: e.lng });
        } catch {
          /* no curated file for this country (AI batch) */
        }
      }
      const out = rows.map((p) => {
        const sc = p.showcase;
        const flags: string[] = [];
        const actual = resolveCountry(p.centerLat, p.centerLng);
        if (actual && p.countryCode && actual !== p.countryCode) flags.push(`map says ${actual}, plot says ${p.countryCode}`);
        const city = sc?.city ? CITIES.find((c) => c.name.toLowerCase() === sc.city.toLowerCase()) : undefined;
        const cityKm = city ? haversineKm(p.centerLat, p.centerLng, city.lat, city.lng) : null;
        if (cityKm !== null && cityKm > 40) flags.push(`${Math.round(cityKm)} km from ${city!.name}`);
        const seed = sc ? seeds.get(`${p.countryCode}:${sc.brand.toLowerCase()}`) : undefined;
        const seedKm = seed ? haversineKm(p.centerLat, p.centerLng, seed.lat, seed.lng) : null;
        if (seedKm !== null && seedKm > 1.5) flags.push(`placed ${seedKm.toFixed(1)} km from its listed address`);
        return {
          id: p.id,
          slug: p.slug,
          title: p.title,
          brand: sc?.brand ?? p.title,
          city: sc?.city ?? null,
          countryCode: p.countryCode,
          lat: p.centerLat,
          lng: p.centerLng,
          size: { w: p.maxGx - p.minGx + 1, h: p.maxGy - p.minGy + 1 },
          approved: !!sc?.approved,
          locationVerified: !!sc?.locationVerified,
          locationCheckedAt: sc?.locationCheckedAt ?? null,
          locationNote: sc?.locationNote ?? null,
          seed,
          flags,
        };
      });
      const filtered = out.filter((r) => (req.query.status === 'unverified' ? !r.locationVerified : req.query.status === 'verified' ? r.locationVerified : req.query.status === 'suspect' ? r.flags.length > 0 : true));
      return {
        plots: filtered,
        total: out.length,
        verified: out.filter((r) => r.locationVerified).length,
        suspect: out.filter((r) => r.flags.length > 0).length,
        // In production, unverified showcase plots are hidden from the public map until checked here.
        publicRequiresCheck: showcaseLocationCheck(),
      };
    },
  );

  app.post(
    '/v1/admin/showcase/locations',
    { schema: { tags: ['admin'], summary: 'Bulk mark showcase locations as checked (or not)', body: z.object({ ids: z.array(z.uuid()).min(1).max(500), verified: z.boolean(), note: z.string().max(200).optional() }) } },
    async (req) => {
      const admin = requireStaff(req);
      const patch = { locationVerified: req.body.verified, locationCheckedAt: new Date().toISOString(), locationNote: req.body.note ?? (req.body.verified ? `checked by ${admin.username}` : `unchecked by ${admin.username}`) };
      await db
        .update(schema.plots)
        .set({ showcase: sql`coalesce(${schema.plots.showcase}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() })
        .where(and(inArray(schema.plots.id, req.body.ids), eq(schema.plots.kind, 'showcase')));
      const codes = await db.selectDistinct({ c: schema.plots.countryCode }).from(schema.plots).where(inArray(schema.plots.id, req.body.ids));
      for (const { c } of codes) await recountCountry(c);
      await audit(admin.id, req.body.verified ? 'showcase.location_verify' : 'showcase.location_unverify', 'plot', null, { count: req.body.ids.length });
      return { ok: true, count: req.body.ids.length };
    },
  );

  app.post(
    '/v1/admin/showcase/:id/move',
    { schema: { tags: ['admin'], summary: 'Nudge a showcase plot to a new point (keeps its size, marks the location checked)', params: z.object({ id: z.uuid() }), body: z.object({ lat: z.number().min(-85).max(85), lng: z.number().min(-180).max(180) }) } },
    async (req) => {
      const admin = requireStaff(req);
      let moved;
      try {
        moved = await moveShowcasePlot(req.params.id, req.body.lat, req.body.lng, admin.username);
      } catch (err) {
        throw badRequest((err as Error).message);
      }
      await audit(admin.id, 'showcase.move', 'plot', moved.id, req.body);
      return { plot: { id: moved.id, lat: moved.centerLat, lng: moved.centerLng, countryCode: moved.countryCode, locationVerified: true } };
    },
  );

  app.post(
    '/v1/admin/showcase/approve',
    { schema: { tags: ['admin'], summary: 'Bulk approve/unapprove showcase plots', body: z.object({ ids: z.array(z.uuid()).min(1).max(500), approved: z.boolean() }) } },
    async (req) => {
      const admin = requireStaff(req);
      await db
        .update(schema.plots)
        .set({ showcase: sql`jsonb_set(${schema.plots.showcase}, '{approved}', ${req.body.approved ? 'true' : 'false'}::jsonb)`, updatedAt: new Date() })
        .where(and(inArray(schema.plots.id, req.body.ids), eq(schema.plots.kind, 'showcase')));
      const codes = await db.selectDistinct({ c: schema.plots.countryCode }).from(schema.plots).where(inArray(schema.plots.id, req.body.ids));
      for (const { c } of codes) await recountCountry(c);
      await audit(admin.id, req.body.approved ? 'showcase.approve' : 'showcase.unapprove', 'plot', null, { count: req.body.ids.length });
      return { ok: true, count: req.body.ids.length };
    },
  );

  app.get('/v1/admin/showcase/export', { schema: { tags: ['admin'], summary: 'Export showcase plots in the curated JSON format', querystring: z.object({ country: z.string().length(2) }) } }, async (req) => {
    requireStaff(req);
    const code = req.query.country.toUpperCase();
    const rows = await db.select().from(schema.plots).where(and(eq(schema.plots.kind, 'showcase'), eq(schema.plots.countryCode, code)));
    return {
      country: { iso2: code, name: code },
      entries: rows.map((p) => ({
        brand: p.showcase?.brand ?? p.title,
        slug: p.slug,
        kind: p.showcase?.kind ?? 'company',
        sector: p.showcase?.sector ?? p.category ?? 'other',
        city: p.showcase?.city ?? '',
        lat: Number(p.centerLat.toFixed(4)),
        lng: Number(p.centerLng.toFixed(4)),
        website: p.showcase?.website ?? '',
        title: p.title,
        tagline: p.tagline ?? '',
        description: (p.descriptionMd ?? '').split('\n\n- ')[0],
        useCase: p.showcase?.useCase ?? '',
        cta: p.cta,
        highlights: p.showcase?.highlights ?? [],
        imagePrompt: p.showcase?.imagePrompt ?? '',
        palette: p.showcase?.palette ?? [],
        motif: p.showcase?.motif ?? 'star',
        size: { w: p.maxGx - p.minGx + 1, h: p.maxGy - p.minGy + 1 },
        tags: p.tags,
      })),
    };
  });

  app.delete('/v1/admin/showcase/:id', { schema: { tags: ['admin'], summary: 'Delete a showcase plot', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const admin = requireAdmin(req);
    const plot = await loadPlot(req.params.id);
    if (!plot || plot.kind !== 'showcase') throw notFound('Showcase plot');
    await releasePlot(plot.id);
    await audit(admin.id, 'showcase.delete', 'plot', plot.id);
    return { ok: true };
  });

  // ── Claims & takedowns ──
  app.get('/v1/admin/claims', { schema: { tags: ['admin'], summary: 'Showcase claim requests', querystring: page.extend({ status: z.string().max(20).optional() }) } }, async (req) => {
    requireStaff(req);
    const C = schema.claimRequests;
    const rows = await db
      .select({ claim: C, slug: schema.plots.slug, title: schema.plots.title, website: sql<string>`${schema.plots.showcase}->>'website'` })
      .from(C)
      .innerJoin(schema.plots, eq(C.plotId, schema.plots.id))
      .where(req.query.status ? eq(C.status, req.query.status) : undefined)
      .orderBy(desc(C.createdAt))
      .limit(req.query.limit)
      .offset(req.query.cursor);
    return { claims: rows.map((r) => ({ ...r.claim, plotSlug: r.slug, plotTitle: r.title, website: r.website })) };
  });

  app.post(
    '/v1/admin/claims/:id',
    { schema: { tags: ['admin'], summary: 'Approve or reject a manual claim', params: z.object({ id: z.uuid() }), body: z.object({ action: z.enum(['approve', 'reject']), note: z.string().max(500).optional() }) } },
    async (req) => {
      const admin = requireStaff(req);
      const [c] = await db.select().from(schema.claimRequests).where(eq(schema.claimRequests.id, req.params.id));
      if (!c) throw notFound('Claim');
      const [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, c.plotId));
      const status = req.body.action === 'approve' ? 'approved' : 'rejected';
      await db.update(schema.claimRequests).set({ status, note: req.body.note ?? c.note, updatedAt: new Date() }).where(eq(schema.claimRequests.id, c.id));
      await sendEmail(c.email, req.body.action === 'approve' ? templates.claimApproved(c.orgName, plot?.slug ?? '', c.id) : templates.claimRejected(c.orgName, req.body.note ?? null));
      await audit(admin.id, `claim.${req.body.action}`, 'claim', c.id, { note: req.body.note });
      return { ok: true, status };
    },
  );

  app.get('/v1/admin/takedowns', { schema: { tags: ['admin'], summary: 'Takedown requests', querystring: page } }, async (req) => {
    requireStaff(req);
    const T = schema.takedownRequests;
    const rows = await db
      .select({ t: T, slug: schema.plots.slug, title: schema.plots.title })
      .from(T)
      .innerJoin(schema.plots, eq(T.plotId, schema.plots.id))
      .orderBy(desc(T.createdAt))
      .limit(req.query.limit)
      .offset(req.query.cursor);
    return { takedowns: rows.map((r) => ({ ...r.t, plotSlug: r.slug, plotTitle: r.title })) };
  });

  app.post('/v1/admin/takedowns/:id', { schema: { tags: ['admin'], summary: 'Act on a takedown request', params: z.object({ id: z.uuid() }), body: z.object({ action: z.enum(['remove', 'reject']) }) } }, async (req) => {
    const admin = requireStaff(req);
    const [t] = await db.select().from(schema.takedownRequests).where(eq(schema.takedownRequests.id, req.params.id));
    if (!t) throw notFound('Takedown');
    if (req.body.action === 'remove') {
      await db
        .update(schema.plots)
        .set({ status: 'hidden', showcase: sql`jsonb_set(${schema.plots.showcase}, '{approved}', 'false'::jsonb)` })
        .where(and(eq(schema.plots.id, t.plotId), eq(schema.plots.kind, 'showcase')));
      const [p] = await db.select({ c: schema.plots.countryCode }).from(schema.plots).where(eq(schema.plots.id, t.plotId));
      await recountCountry(p?.c ?? null);
    }
    await db.update(schema.takedownRequests).set({ status: req.body.action === 'remove' ? 'removed' : 'rejected' }).where(eq(schema.takedownRequests.id, t.id));
    await sendEmail(t.email, templates.takedownResult(req.body.action === 'remove'));
    await audit(admin.id, `takedown.${req.body.action}`, 'plot', t.plotId);
    return { ok: true };
  });

  app.get('/v1/admin/audit', { schema: { tags: ['admin'], summary: 'Audit log', querystring: page } }, async (req) => {
    requireAdmin(req);
    const rows = await db
      .select({ entry: schema.auditLog, username: schema.users.username })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.auditLog.actorId, schema.users.id))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(req.query.limit)
      .offset(req.query.cursor);
    return { entries: rows.map((r) => ({ ...r.entry, actor: r.username })) };
  });
}
