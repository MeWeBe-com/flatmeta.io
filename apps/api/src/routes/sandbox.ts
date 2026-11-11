import { z } from 'zod';
import type { App } from '../app.js';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import { requireAdmin, requireUser } from '../lib/auth.js';
import { dailyCap } from '../lib/caps.js';
import { forbidden, notFound } from '../lib/errors.js';
import { sandboxHeaders, screenCustomHtml, wrapCustomHtml, MAX_CUSTOM_HTML } from '../lib/html.js';
import {
  customHtmlGloballyDisabled,
  customHtmlVisible,
  getVersion,
  listVersions,
  loadPreview,
  reviewQueue,
  reviewVersion,
  setCustomHtmlGloballyDisabled,
  setPlotCustomHtmlDisabled,
  storePreview,
} from '../services/custom-html.js';
import { applyPlotPatch, loadPlot, viewFor } from './plots.js';
import { canEditPlot } from './views.js';
import { eq } from 'drizzle-orm';

/** Our own site origins (apex and www): the only pages allowed to frame owner content. */
export function siteOrigins(): string[] {
  const u = new URL(config.APP_URL);
  const host = u.hostname;
  const alt = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  const port = u.port ? `:${u.port}` : '';
  const list = [`${u.protocol}//${host}${port}`];
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)) list.push(`${u.protocol}//${alt}${port}`);
  return list;
}

const errorDoc = (reasons: string[]) => `<p style="font:14px system-ui;color:#ff8a8a">This content can’t be published: ${reasons.map((r) => r.replace(/[<>&]/g, '')).join(', ')}.</p>`;

/**
 * Owner custom HTML (G8). Documents are served on the separate usercontent origin (USERCONTENT_URL; lib/usercontent.ts
 * keeps the hosts apart) with `Content-Security-Policy: sandbox allow-scripts`, so the code runs in an opaque origin
 * wherever it is opened, can't read flatmeta.io cookies or storage, can't navigate the top window, and can only be
 * framed by our own pages. Drafts are previewed through short-lived tokens, so that origin never needs cookies.
 */
export default async function sandboxRoutes(app: App) {
  const send = (reply: import('fastify').FastifyReply, html: string, cache: string) => {
    reply.removeHeader('x-frame-options'); // frame-ancestors in the CSP decides who may frame it
    for (const [k, v] of Object.entries(sandboxHeaders(siteOrigins()))) reply.header(k, v);
    return reply.header('cache-control', cache).send(wrapCustomHtml(html));
  };

  // ── Documents (the only routes the usercontent host answers) ──
  app.get(
    '/v1/plots/:idOrSlug/sandbox',
    { schema: { hide: true, params: z.object({ idOrSlug: z.string().regex(/^[A-Za-z0-9-]{1,80}$/) }), querystring: z.object({ v: z.coerce.number().int().optional() }) } },
    async (req, reply) => {
      const plot = await loadPlot(req.params.idOrSlug);
      // Only the approved version of an active, unflagged plot whose custom HTML isn't switched off.
      if (!plot || !(await customHtmlVisible(plot))) throw notFound('Content');
      return send(reply, plot.customHtmlLive!, 'public, max-age=60');
    },
  );

  app.get(
    '/v1/sandbox/preview/:token',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } }, schema: { hide: true, params: z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) }) } },
    async (req, reply) => {
      const html = await loadPreview(req.params.token);
      if (html === null) throw notFound('Preview');
      return send(reply, html, 'no-store');
    },
  );

  // ── Owner: preview, versions, restore ──
  app.post(
    '/v1/sandbox/preview',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: { tags: ['plots'], summary: 'Preview custom HTML (returns a short-lived URL on the usercontent origin)', body: z.object({ html: z.string().max(MAX_CUSTOM_HTML * 2) }) },
    },
    async (req) => {
      const user = requireUser(req);
      await dailyCap(user.id, 'html-preview', 2000, 'previews');
      const screen = screenCustomHtml(req.body.html);
      const { url } = await storePreview(screen.ok ? screen.html : errorDoc(screen.reasons));
      return { ok: screen.ok, reasons: screen.reasons, url };
    },
  );

  const editable = async (req: import('fastify').FastifyRequest, id: string) => {
    const user = requireUser(req);
    const plot = await loadPlot(id);
    if (!plot) throw notFound('Plot');
    if (!(await canEditPlot(user, plot))) throw forbidden('You can only edit your own plots');
    return { user, plot };
  };

  app.get(
    '/v1/plots/:id/custom-html/versions',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { tags: ['plots'], summary: 'Saved versions of a plot’s custom HTML', params: z.object({ id: z.uuid() }) } },
    async (req) => {
      const { plot } = await editable(req, req.params.id);
      return { status: plot.customHtmlStatus, current: plot.customHtmlVersion, disabled: plot.customHtmlDisabled || (await customHtmlGloballyDisabled()), versions: await listVersions(plot.id) };
    },
  );

  app.post(
    '/v1/plots/:id/custom-html/versions/:version/restore',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { tags: ['plots'], summary: 'Restore an earlier version (saved as a new version, scanned again)', params: z.object({ id: z.uuid(), version: z.coerce.number().int().min(1) }) },
    },
    async (req) => {
      const { user, plot } = await editable(req, req.params.id);
      await dailyCap(user.id, 'plot-edit', 300, 'plot edits');
      const v = await getVersion(plot.id, req.params.version);
      if (!v) throw notFound('Version');
      const res = await applyPlotPatch(plot, { customHtml: v.html }, user);
      return { plot: await viewFor(res.plot, user), customHtml: res.customHtml ?? null };
    },
  );

  // ── Admin: review queue and kill-switches ──
  const audit = (actorId: string, action: string, targetType: string, targetId: string | null, meta: Record<string, unknown> = {}) =>
    db.insert(schema.auditLog).values({ actorId, action, targetType, targetId, meta });

  app.get('/v1/admin/custom-html', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { tags: ['admin'], summary: 'Custom HTML review queue and switches' } }, async (req) => {
    requireAdmin(req);
    const disabledPlots = await db
      .select({ id: schema.plots.id, slug: schema.plots.slug, title: schema.plots.title })
      .from(schema.plots)
      .where(eq(schema.plots.customHtmlDisabled, true))
      .limit(100);
    return { globallyDisabled: await customHtmlGloballyDisabled(), queue: await reviewQueue(), disabledPlots };
  });

  app.post(
    '/v1/admin/custom-html/versions/:id/preview',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { tags: ['admin'], summary: 'Preview a version waiting for review', params: z.object({ id: z.uuid() }) } },
    async (req) => {
      requireAdmin(req);
      const [v] = await db.select().from(schema.customHtmlVersions).where(eq(schema.customHtmlVersions.id, req.params.id));
      if (!v) throw notFound('Version');
      const { url } = await storePreview(v.html);
      return { url, html: v.html };
    },
  );

  app.post(
    '/v1/admin/custom-html/versions/:id/review',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: { tags: ['admin'], summary: 'Approve or reject a custom HTML version', params: z.object({ id: z.uuid() }), body: z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(300).optional() }) },
    },
    async (req) => {
      const admin = requireAdmin(req);
      const res = await reviewVersion(req.params.id, req.body.decision, admin.id, req.body.note);
      if (!res) throw notFound('Version');
      await audit(admin.id, `custom_html.${req.body.decision}`, 'plot', res.plotId, { version: res.version });
      return res;
    },
  );

  app.post(
    '/v1/admin/plots/:id/custom-html',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: { tags: ['admin'], summary: 'Kill-switch for one plot’s custom HTML', params: z.object({ id: z.uuid() }), body: z.object({ disabled: z.boolean() }) },
    },
    async (req) => {
      const admin = requireAdmin(req);
      const plot = await loadPlot(req.params.id);
      if (!plot) throw notFound('Plot');
      await setPlotCustomHtmlDisabled(plot.id, req.body.disabled, admin.id);
      await audit(admin.id, req.body.disabled ? 'custom_html.disable' : 'custom_html.enable', 'plot', plot.id);
      return { ok: true, disabled: req.body.disabled };
    },
  );

  app.post(
    '/v1/admin/custom-html/global',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { tags: ['admin'], summary: 'Kill-switch for all custom HTML', body: z.object({ disabled: z.boolean() }) } },
    async (req) => {
      const admin = requireAdmin(req);
      await setCustomHtmlGloballyDisabled(req.body.disabled, admin.id);
      await audit(admin.id, req.body.disabled ? 'custom_html.global_disable' : 'custom_html.global_enable', 'setting', 'customHtml.disabled');
      return { ok: true, disabled: req.body.disabled };
    },
  );
}
