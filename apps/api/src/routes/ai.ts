import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { db, schema } from '../db/client.js';
import { requireUser } from '../lib/auth.js';
import { badRequest, forbidden, notFound, paymentRequired } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { consumeAiCredit } from '../lib/users.js';
import { plotIdeas, runDesign } from '../ai/designer.js';
import { suggestPlots } from '../ai/suggest.js';
import { textProvider } from '../config.js';
import { mergeResults, recordAction } from '../game/engine.js';
import { applyPlotPatch, loadPlot, viewFor } from './plots.js';
import { canEditPlot } from './views.js';

export default async function aiRoutes(app: App) {
  const aiLimit = { rateLimit: { max: 20, timeWindow: '1 hour' } };

  app.post(
    '/v1/ai/design',
    {
      config: aiLimit,
      schema: {
        tags: ['ai'],
        summary: 'AI Plot Designer: 3 variations of copy + cover art (async job, uses 1 credit)',
        body: z.object({ plotId: z.uuid(), brief: z.string().min(3).max(1500), name: z.string().max(60).optional(), style: z.string().max(120).optional(), website: z.string().max(200).optional() }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      const plot = await loadPlot(req.body.plotId);
      if (!plot) throw notFound('Plot');
      if (!(await canEditPlot(user, plot))) throw forbidden();
      if (!(await consumeAiCredit(user))) throw paymentRequired('You are out of AI designs this month. Get a Design Pack or upgrade to Plus.', 'credits');
      const [job] = await db.insert(schema.aiJobs).values({ userId: user.id, kind: 'design', status: 'running', input: { ...req.body }, provider: textProvider() }).returning();
      const jobId = job!.id;
      // Runs in-process; the client polls GET /v1/ai/jobs/:id.
      void runDesign(plot, req.body, user.id, jobId)
        .then(async (output) => {
          await db.update(schema.aiJobs).set({ status: 'done', output, provider: output.provider, finishedAt: new Date() }).where(eq(schema.aiJobs.id, jobId));
          const game = await recordAction(user.id, 'design', { ref: jobId, noXp: true });
          await db.update(schema.aiJobs).set({ output: { ...output, game } }).where(eq(schema.aiJobs.id, jobId));
        })
        .catch(async (err) => {
          logger.error({ err, jobId }, 'Design job failed');
          await db.update(schema.aiJobs).set({ status: 'failed', error: (err as Error).message.slice(0, 500), finishedAt: new Date() }).where(eq(schema.aiJobs.id, jobId));
        });
      return { jobId, status: 'running' };
    },
  );

  app.get('/v1/ai/jobs/:id', { schema: { tags: ['ai'], summary: 'Poll an AI job', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const user = requireUser(req);
    const [job] = await db.select().from(schema.aiJobs).where(and(eq(schema.aiJobs.id, req.params.id), eq(schema.aiJobs.userId, user.id)));
    if (!job) throw notFound('Job');
    return { job: { id: job.id, kind: job.kind, status: job.status, output: job.output, error: job.error, createdAt: job.createdAt, finishedAt: job.finishedAt } };
  });

  app.post(
    '/v1/ai/jobs/:id/apply',
    { schema: { tags: ['ai'], summary: 'Apply one design variation to the plot', params: z.object({ id: z.uuid() }), body: z.object({ index: z.number().int().min(0).max(2), withImage: z.boolean().default(true) }) } },
    async (req) => {
      const user = requireUser(req);
      const [job] = await db.select().from(schema.aiJobs).where(and(eq(schema.aiJobs.id, req.params.id), eq(schema.aiJobs.userId, user.id)));
      if (!job || job.status !== 'done') throw badRequest('This design is not ready');
      const plot = await loadPlot(String(job.input.plotId));
      if (!plot) throw notFound('Plot');
      if (!(await canEditPlot(user, plot))) throw forbidden();
      type V = { title: string; tagline: string; descriptionMd: string; category: string; tags: string[]; theme: { primary: string; accent: string }; cta: { label: string } | null; image?: { mediaId: string } };
      const v = ((job.output as { variations?: V[] } | null)?.variations ?? [])[req.body.index];
      if (!v) throw badRequest('Unknown variation');
      const website = typeof job.input.website === 'string' ? job.input.website : undefined;
      const res = await applyPlotPatch(
        plot,
        {
          title: v.title,
          tagline: v.tagline,
          descriptionMd: v.descriptionMd,
          category: v.category,
          tags: v.tags,
          theme: v.theme,
          ...(v.cta && website ? { cta: { label: v.cta.label, url: website } } : {}),
          ...(req.body.withImage && v.image?.mediaId ? { coverMediaId: v.image.mediaId } : {}),
        },
        user,
      );
      const game = await recordAction(user.id, 'apply_design', { ref: `${job.id}:${req.body.index}` });
      return { plot: await viewFor(res.plot, user), game: mergeResults(res.game, game) };
    },
  );

  app.post(
    '/v1/ai/suggest-plots',
    {
      config: aiLimit,
      schema: {
        tags: ['ai'],
        summary: 'Where should I claim? Ranked available spots for a goal',
        body: z.object({ goal: z.string().min(3).max(300), lat: z.number().optional(), lng: z.number().optional(), country: z.string().length(2).optional(), size: z.number().int().min(1).max(5).optional() }),
      },
    },
    async (req) => suggestPlots(req.user, req.body),
  );

  app.post('/v1/ai/ideas', { config: aiLimit, schema: { tags: ['ai'], summary: 'Content ideas for a plot', body: z.object({ plotId: z.uuid() }) } }, async (req) => {
    requireUser(req);
    const plot = await loadPlot(req.body.plotId);
    if (!plot) throw notFound('Plot');
    return { ideas: await plotIdeas(plot) };
  });
}
