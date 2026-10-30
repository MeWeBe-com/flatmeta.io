import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { db, schema } from '../db/client.js';
import { requireUser } from '../lib/auth.js';
import { badRequest, notFound } from '../lib/errors.js';
import { stripText } from '../lib/markdown.js';
import { consumeCode, issueCode } from './auth.js';
import { loadPlot } from './plots.js';
import { emailMatchesWebsite, landmarkCheckout, verifiedOrgFor } from '../services/showcase-claim.js';

export default async function showcaseRoutes(app: App) {
  app.post(
    '/v1/showcase/:slug/claim',
    {
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
      schema: {
        tags: ['showcase'],
        summary: 'Start claiming a showcase plot for your organisation',
        params: z.object({ slug: z.string().max(80) }),
        body: z.object({ email: z.email().max(200), orgName: z.string().min(2).max(100), note: z.string().max(1000).optional() }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      const plot = await loadPlot(req.params.slug);
      if (!plot || plot.kind !== 'showcase' || plot.status !== 'showcase' || !plot.showcase?.approved) throw notFound('Showcase plot');
      const matches = emailMatchesWebsite(req.body.email, plot.showcase.website);
      const [request] = await db
        .insert(schema.claimRequests)
        .values({
          plotId: plot.id,
          userId: user.id,
          email: req.body.email.toLowerCase(),
          orgName: stripText(req.body.orgName, 100),
          status: matches ? 'pending_email' : 'manual_review',
          note: req.body.note ? stripText(req.body.note, 1000) : null,
        })
        .returning();
      if (!matches) {
        return { requestId: request!.id, status: 'manual_review', message: `Your email isn't at ${new URL(plot.showcase.website).hostname}, so our team will verify your claim by hand (usually within 2 working days).` };
      }
      const devCode = await issueCode(req.body.email, 'claim', request!.id, plot.showcase.brand);
      return { requestId: request!.id, status: 'pending_email', message: `We sent a 6-digit code to ${req.body.email}.`, ...(devCode ? { devCode } : {}) };
    },
  );

  app.post(
    '/v1/showcase/claim/verify',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } }, schema: { tags: ['showcase'], summary: 'Verify the work-email code and get the Landmark checkout link', body: z.object({ requestId: z.uuid(), code: z.string().regex(/^\d{6}$/) }) } },
    async (req) => {
      const user = requireUser(req);
      const [request] = await db.select().from(schema.claimRequests).where(eq(schema.claimRequests.id, req.body.requestId));
      if (!request || request.userId !== user.id) throw notFound('Claim request');
      if (request.status !== 'pending_email' && request.status !== 'verified') throw badRequest('This claim is not waiting for a code');
      if (request.status === 'pending_email') {
        const ok = await consumeCode(request.email, req.body.code, 'claim', request.id);
        if (!ok) throw badRequest('That code is wrong or has expired');
        const plot = await loadPlot(request.plotId);
        const orgId = await verifiedOrgFor(user, request.orgName, plot!.showcase!.website);
        await db.update(schema.claimRequests).set({ status: 'verified', orgId, updatedAt: new Date() }).where(eq(schema.claimRequests.id, request.id));
      }
      const checkout = await landmarkCheckout(user, request.id);
      return { checkoutUrl: checkout.url, orderId: checkout.orderId };
    },
  );

  app.post('/v1/showcase/claim/:id/checkout', { schema: { tags: ['showcase'], summary: 'Checkout for an approved claim', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const user = requireUser(req);
    const checkout = await landmarkCheckout(user, req.params.id);
    return { checkoutUrl: checkout.url, orderId: checkout.orderId };
  });

  app.get('/v1/showcase/claims/mine', { schema: { tags: ['showcase'], summary: 'My claim requests' } }, async (req) => {
    const user = requireUser(req);
    const rows = await db
      .select({ claim: schema.claimRequests, slug: schema.plots.slug, title: schema.plots.title })
      .from(schema.claimRequests)
      .innerJoin(schema.plots, eq(schema.claimRequests.plotId, schema.plots.id))
      .where(eq(schema.claimRequests.userId, user.id))
      .orderBy(desc(schema.claimRequests.createdAt));
    return { claims: rows.map((r) => ({ ...r.claim, plotSlug: r.slug, plotTitle: r.title })) };
  });

  app.post(
    '/v1/showcase/:slug/takedown',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        tags: ['showcase'],
        summary: 'Request removal of a showcase plot',
        params: z.object({ slug: z.string().max(80) }),
        body: z.object({ name: z.string().min(2).max(100), email: z.email().max(200), organisation: z.string().max(120).optional(), message: z.string().min(5).max(2000) }),
      },
    },
    async (req) => {
      const plot = await loadPlot(req.params.slug);
      if (!plot || plot.kind !== 'showcase') throw notFound('Showcase plot');
      await db.insert(schema.takedownRequests).values({
        plotId: plot.id,
        name: stripText(req.body.name, 100),
        email: req.body.email,
        organisation: req.body.organisation ? stripText(req.body.organisation, 120) : null,
        message: stripText(req.body.message, 2000),
      });
      return { ok: true, message: 'Thanks. Our team reviews removal requests within 2 working days.' };
    },
  );
}
