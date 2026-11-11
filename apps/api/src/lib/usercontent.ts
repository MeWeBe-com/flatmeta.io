import type { App } from '../app.js';
import { config } from '../config.js';

/** Hostname of the separate origin that serves owner custom HTML, when configured (G8). */
export function usercontentHost(): string | null {
  if (!config.USERCONTENT_URL) return null;
  try {
    return new URL(config.USERCONTENT_URL).host.toLowerCase();
  } catch {
    return null;
  }
}

/** The only API paths the usercontent origin answers: sandbox documents and the health check. */
export function isSandboxDocumentPath(method: string, url: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  const path = url.split('?')[0]!;
  return /^\/v1\/plots\/[A-Za-z0-9-]{1,80}\/sandbox$/.test(path) || /^\/v1\/sandbox\/preview\/[A-Za-z0-9_-]{16,64}$/.test(path) || path === '/healthz';
}

/**
 * Keeps the two origins apart. On the usercontent host only sandbox documents are served and cookies are dropped
 * before anything reads them; on the site's own host the sandbox documents are refused, so owner code never runs on
 * flatmeta.io. Without USERCONTENT_URL (dev, tests) both are served by the one host.
 */
export function registerUsercontentGuard(app: App) {
  app.addHook('onRequest', async (req, reply) => {
    const uc = usercontentHost();
    if (!uc) return;
    const host = String(req.headers.host ?? '').trim().toLowerCase(); // nginx passes Host through; X-Forwarded-Host is client-controlled
    const sandbox = isSandboxDocumentPath(req.method, req.url);
    if (host === uc) {
      delete req.headers.cookie;
      delete req.headers.authorization;
      if (!sandbox) return reply.code(404).header('content-type', 'text/plain').send('Not found');
    } else if (sandbox && req.url.split('?')[0] !== '/healthz') {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Custom content is served from the usercontent origin' } });
    }
  });
}
