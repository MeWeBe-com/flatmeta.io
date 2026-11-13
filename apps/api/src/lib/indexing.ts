import { config } from '../config.js';
import { logger } from './logger.js';
import { key, redis } from './redis.js';

/**
 * S2: what happens when a plot's public page appears, changes or goes away (publish, edit, hide, remove):
 *   - the cached sitemap feed is dropped (a version bump in Redis), so the next sitemap request is fresh;
 *   - IndexNow is told about the URL (async, logged; a failure never blocks the save).
 */
export const SITEMAP_VERSION_KEY = () => key('sitemap', 'version');

export async function sitemapVersion(): Promise<string> {
  return (await redis.get(SITEMAP_VERSION_KEY()).catch(() => null)) ?? '0';
}

let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function plotIndexChanged(slug: string, reason: 'publish' | 'edit' | 'hide' | 'remove' | 'show') {
  void redis.incr(SITEMAP_VERSION_KEY()).catch(() => undefined);
  if (!config.INDEXNOW_KEY || !/^https:\/\//.test(config.APP_URL)) return;
  pending.add(`${config.APP_URL.replace(/\/$/, '')}/p/${slug}`);
  logger.debug({ slug, reason }, 'indexnow: queued');
  // Batch the URLs of a burst of edits into one ping a few seconds later.
  timer ??= setTimeout(() => void flushIndexNow(), 5000);
}

export async function flushIndexNow(): Promise<{ ok: boolean; status?: number; urls: string[] }> {
  timer = null;
  const urls = [...pending];
  pending = new Set();
  if (!urls.length || !config.INDEXNOW_KEY) return { ok: true, urls };
  const site = new URL(config.APP_URL);
  try {
    const res = await fetch(config.INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: site.host, key: config.INDEXNOW_KEY, keyLocation: `${site.origin}/indexnow-key.txt`, urlList: urls }),
      signal: AbortSignal.timeout(10_000),
    });
    logger.info({ status: res.status, urls: urls.length }, 'indexnow: pinged');
    return { ok: res.ok, status: res.status, urls };
  } catch (err) {
    logger.warn({ err: (err as Error).message, urls: urls.length }, 'indexnow: ping failed');
    return { ok: false, urls };
  }
}

/** The same, when only the plot's id is at hand (admin actions, jobs). */
export async function plotIndexChangedById(id: string, reason: Parameters<typeof plotIndexChanged>[1]) {
  const { db, schema } = await import('../db/client.js');
  const { eq } = await import('drizzle-orm');
  const [p] = await db.select({ slug: schema.plots.slug }).from(schema.plots).where(eq(schema.plots.id, id)).catch(() => []);
  if (p) plotIndexChanged(p.slug, reason);
}

/** Many plots changed at once (a ban hides all of a user's land): drop the cached sitemap. */
export function sitemapChanged() {
  void redis.incr(SITEMAP_VERSION_KEY()).catch(() => undefined);
}
