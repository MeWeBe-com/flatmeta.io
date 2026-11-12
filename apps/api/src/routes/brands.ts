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
import { notFound } from '../lib/errors.js';

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
        brands: rows.slice(0, per).map(({ showcase, ...b }) => ({ ...b, logoUrl: visibleLogo({ showcase })?.url ?? null })),
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
}
