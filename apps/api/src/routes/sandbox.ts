import { z } from 'zod';
import type { App } from '../app.js';
import { config } from '../config.js';
import { requireUser } from '../lib/auth.js';
import { notFound } from '../lib/errors.js';
import { sandboxHeaders, screenCustomHtml, wrapCustomHtml, MAX_CUSTOM_HTML } from '../lib/html.js';
import { loadPlot } from './plots.js';

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

/**
 * Owner custom HTML is served as its own document (never srcdoc, which would inherit the page's CSP and run in
 * the page's origin policy). The response carries `Content-Security-Policy: sandbox allow-scripts`, so the code
 * runs in an opaque origin wherever it is opened. G8 moves this to the separate usercontent origin.
 */
export default async function sandboxRoutes(app: App) {
  const send = (reply: import('fastify').FastifyReply, html: string, cache: string) => {
    reply.removeHeader('x-frame-options'); // frame-ancestors in the CSP decides who may frame it
    for (const [k, v] of Object.entries(sandboxHeaders(siteOrigins()))) reply.header(k, v);
    return reply.header('cache-control', cache).send(wrapCustomHtml(html));
  };

  app.get(
    '/v1/plots/:idOrSlug/sandbox',
    { schema: { hide: true, params: z.object({ idOrSlug: z.string().max(80) }) } },
    async (req, reply) => {
      const plot = await loadPlot(req.params.idOrSlug);
      // Only published, unflagged plots with custom HTML. (Owners preview drafts through POST /v1/sandbox/preview.)
      if (!plot?.customHtml || plot.status !== 'active' || plot.moderationStatus === 'flagged') throw notFound('Content');
      return send(reply, plot.customHtml, 'public, max-age=60');
    },
  );

  // Preview of unsaved custom HTML in the dashboard: the editor posts a form into the preview iframe.
  await app.register(async (scope) => {
    scope.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: MAX_CUSTOM_HTML * 4 }, (_req, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    });
    scope.post(
      '/v1/sandbox/preview',
      { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { hide: true, body: z.object({ html: z.string().max(MAX_CUSTOM_HTML) }) } },
      async (req, reply) => {
        requireUser(req);
        const screen = screenCustomHtml((req.body as { html: string }).html); // validated by the zod schema above
        const html = screen.ok ? screen.html : `<p style="font:14px system-ui;color:#ff8a8a">This content can’t be published: ${screen.reasons.join(', ')}.</p>`;
        return send(reply, html, 'no-store');
      },
    );
  });
}
