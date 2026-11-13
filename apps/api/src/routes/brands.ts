import { and, asc, desc, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { requireAdmin } from '../lib/auth.js';
import { db, schema } from '../db/client.js';
import { countryName } from '../lib/geo.js';
import { publicShowcase } from '../lib/visibility.js';
import { runCompanyLand, processCountry } from '../companies/land.js';
import { logosGloballyDisabled, setLogosGloballyDisabled, setPlotLogoHidden, visibleLogo } from '../companies/logos.js';
import { config } from '../config.js';
import { sectorLabel } from '../lib/sector.js';
import { OUTREACH, REGISTER_STATUSES, findContactPages, registerCsv, registerRows } from '../companies/register.js';
import { onDomain } from '../companies/safe-fetch.js';
import { registrableDomain } from '../services/showcase-claim.js';
import { stripText } from '../lib/markdown.js';
import { badRequest, notFound } from '../lib/errors.js';

/** G12: the /brands directory (reserved company land), and the admin trigger for the company-land job. */
export default async function brandRoutes(app: App) {
  app.get(
    '/v1/brands',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['showcase'],
        summary: 'Companies with land reserved for them on FlatMeta',
        querystring: z.object({ country: z.string().regex(/^[A-Za-z]{2}$/).optional(), q: z.string().max(80).optional(), page: z.coerce.number().int().min(1).max(500).default(1) }),
      },
    },
    async (req) => {
      const P = schema.plots;
      const where: SQL[] = [publicShowcase()];
      if (req.query.country) where.push(eq(P.countryCode, req.query.country.toUpperCase()));
      if (req.query.q) where.push(ilike(P.title, `%${req.query.q.replace(/[%_\\]/g, '')}%`));
      const per = 48;
      const rows = await db
        .select({ slug: P.slug, title: P.title, countryCode: P.countryCode, thumbUrl: P.thumbUrl, sector: sql<string>`${P.showcase}->>'sector'`, city: sql<string>`${P.showcase}->>'city'`, source: sql<string | null>`${P.showcase}->>'source'`, showcase: P.showcase })
        .from(P)
        .where(and(...where))
        .orderBy(asc(P.title))
        .limit(per + 1)
        .offset((req.query.page - 1) * per);
      const countries = await db
        .select({ code: P.countryCode, n: sql<number>`count(*)::int` })
        .from(P)
        .where(publicShowcase())
        .groupBy(P.countryCode)
        .orderBy(desc(sql`count(*)`));
      return {
        brands: rows.slice(0, per).map(({ showcase, sector, ...b }) => {
          const logo = visibleLogo({ showcase });
          // M7: one spelling per sector; the logo's fill lets the page show initials for marks too thin for a badge.
          return { ...b, sector: sectorLabel(sector), logoUrl: logo?.url ?? null, logoFill: logo?.fill ?? null };
        }),
        hasMore: rows.length > per,
        countries: countries.filter((c) => c.code).map((c) => ({ code: c.code!, name: countryName(c.code!), count: c.n })),
      };
    },
  );

  // Admin: run the job now (dry run by default), for one country or the normal daily plan.
  app.post(
    '/v1/admin/company-land/run',
    {
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
      schema: { tags: ['admin'], summary: 'Run the company-land job now', body: z.object({ country: z.string().regex(/^[A-Za-z]{2}$/).optional(), take: z.number().int().min(1).max(100).default(10), apply: z.boolean().default(false) }) },
    },
    async (req) => {
      const admin = requireAdmin(req);
      const res = req.body.country
        ? await processCountry(req.body.country, req.body.take, { dryRun: !req.body.apply })
        : req.body.apply
          ? await runCompanyLand({ force: true })
          : { skipped: 'pass a country for a dry run, or apply: true for the daily plan' };
      await db.insert(schema.auditLog).values({ actorId: admin.id, action: req.body.apply ? 'company_land.run' : 'company_land.dry_run', targetType: 'country', targetId: req.body.country ?? null, meta: {} });
      return res;
    },
  );

  // ── H1: logo switches (admins) ──
  app.get('/v1/admin/company-logos', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { tags: ['admin'], summary: 'Company logo switches' } }, async (req) => {
    requireAdmin(req);
    return { enabledByEnv: config.COMPANY_LAND_LOGOS, globallyDisabled: await logosGloballyDisabled() };
  });

  app.post(
    '/v1/admin/company-logos/global',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { tags: ['admin'], summary: 'Kill-switch for every company logo', body: z.object({ disabled: z.boolean() }) } },
    async (req) => {
      const admin = requireAdmin(req);
      await setLogosGloballyDisabled(req.body.disabled, admin.id);
      await db.insert(schema.auditLog).values({ actorId: admin.id, action: req.body.disabled ? 'company_logos.global_disable' : 'company_logos.global_enable', targetType: 'setting', targetId: 'companyLogos.disabled', meta: {} });
      return { ok: true, disabled: req.body.disabled };
    },
  );

  app.post(
    '/v1/admin/plots/:id/logo',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { tags: ['admin'], summary: 'Hide or show one company plot’s logo', params: z.object({ id: z.uuid() }), body: z.object({ hidden: z.boolean() }) } },
    async (req) => {
      const admin = requireAdmin(req);
      const [plot] = await db.select({ id: schema.plots.id }).from(schema.plots).where(eq(schema.plots.id, req.params.id));
      if (!plot) throw notFound('Plot');
      await setPlotLogoHidden(plot.id, req.body.hidden, `hidden by an admin`);
      await db.insert(schema.auditLog).values({ actorId: admin.id, action: req.body.hidden ? 'company_logo.hide' : 'company_logo.show', targetType: 'plot', targetId: plot.id, meta: {} });
      return { ok: true, hidden: req.body.hidden };
    },
  );

  // ── H2: the company land register (admins only; public data stays on /brands) ──
  const filter = z.object({
    country: z.string().regex(/^[A-Za-z]{2}$/).optional(),
    status: z.enum(REGISTER_STATUSES).optional(),
    outreach: z.enum(OUTREACH).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    q: z.string().max(80).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    format: z.enum(['json', 'csv']).default('json'),
  });
  app.get('/v1/admin/company-land', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags: ['admin'], summary: 'Company land register (filters; format=csv exports the filtered view)', querystring: filter } }, async (req, reply) => {
    const admin = requireAdmin(req);
    const q = req.query;
    const rows = await registerRows({ country: q.country, status: q.status, outreach: q.outreach, q: q.q, from: q.from ? new Date(`${q.from}T00:00:00Z`) : undefined, to: q.to ? new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86400_000) : undefined });
    if (q.format === 'csv') {
      await db.insert(schema.auditLog).values({ actorId: admin.id, action: 'company_land.export_csv', targetType: 'register', targetId: null, meta: { rows: rows.length, filter: { ...q, format: undefined, page: undefined } } });
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="flatmeta-company-land-${new Date().toISOString().slice(0, 10)}.csv"`)
        .header('cache-control', 'no-store')
        .send(registerCsv(rows));
    }
    const per = 100;
    const counts = Object.fromEntries(REGISTER_STATUSES.map((s) => [s, 0])) as Record<string, number>;
    for (const r of rows) counts[r.status]!++;
    return { total: rows.length, counts, rows: rows.slice((q.page - 1) * per, q.page * per), page: q.page, pages: Math.max(1, Math.ceil(rows.length / per)), logosGloballyDisabled: await logosGloballyDisabled() };
  });

  app.patch(
    '/v1/admin/company-land/:id',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['admin'],
        summary: 'Update outreach fields',
        params: z.object({ id: z.uuid() }),
        body: z.object({ outreachStatus: z.enum(OUTREACH).optional(), outreachNotes: z.string().max(2000).nullable().optional(), contactedAt: z.iso.datetime({ offset: true }).nullable().optional(), contactUrl: z.string().max(500).nullable().optional() }),
      },
    },
    async (req) => {
      const admin = requireAdmin(req);
      const [row] = await db.select().from(schema.companySources).where(eq(schema.companySources.id, req.params.id));
      if (!row) throw notFound('Company');
      const set: Partial<typeof schema.companySources.$inferInsert> = {};
      if (req.body.outreachStatus) {
        set.outreachStatus = req.body.outreachStatus;
        if (req.body.outreachStatus === 'contacted' && !row.contactedAt && req.body.contactedAt === undefined) set.contactedAt = new Date();
      }
      if (req.body.outreachNotes !== undefined) set.outreachNotes = req.body.outreachNotes ? stripText(req.body.outreachNotes, 2000) : null;
      if (req.body.contactedAt !== undefined) set.contactedAt = req.body.contactedAt ? new Date(req.body.contactedAt) : null;
      if (req.body.contactUrl !== undefined) {
        // Only the company's own public page: a URL on its official domain, never an email address or a person.
        if (req.body.contactUrl) {
          const domain = row.website ? registrableDomain(new URL(row.website).hostname) : null;
          const u = URL.canParse(req.body.contactUrl) ? new URL(req.body.contactUrl) : null;
          if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) throw badRequest('Enter the company’s public contact page URL.');
          const host = u.hostname;
          if (!domain || !onDomain(domain)(host)) throw badRequest(`The contact page must be on the company’s official website (${domain ?? 'none recorded'}).`);
        }
        set.contactUrl = req.body.contactUrl || null;
      }
      const [updated] = await db.update(schema.companySources).set(set).where(eq(schema.companySources.id, row.id)).returning();
      await db.insert(schema.auditLog).values({ actorId: admin.id, action: 'company_land.outreach', targetType: 'company_source', targetId: row.id, meta: { fields: Object.keys(set) } });
      return { ok: true, outreachStatus: updated!.outreachStatus, contactedAt: updated!.contactedAt, contactUrl: updated!.contactUrl };
    },
  );

  app.post('/v1/admin/company-land/find-contacts', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } }, schema: { tags: ['admin'], summary: 'Look up public contact/press pages on the official websites', body: z.object({ limit: z.number().int().min(1).max(100).default(30) }) } }, async (req) => {
    requireAdmin(req);
    return findContactPages(req.body.limit);
  });
}
