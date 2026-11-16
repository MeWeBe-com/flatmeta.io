/**
 * GL6: the FlatMeta edge worker (Cloudflare Workers), only where the edge really helps:
 *  1. Images: /media/* and /api/v1/plots/<slug>/cover.jpg are resized at the edge when a ?w= width is asked for
 *     (Cloudflare Image Resizing, `cf.image`: webp/avif by Accept, never upscaled) and cached for a year (the URLs are
 *     content-addressed or carry the width).
 *  2. Feeds: /sitemap*.xml, /llms.txt, /llms-full.txt and /robots.txt are cached at the edge for 10 minutes, so crawlers
 *     never wait on the origin; the app still decides their content (IndexNow tells engines when it changes).
 * Everything else, HTML pages included, goes straight to the origin untouched: pages carry a per-request CSP nonce and
 * signed-in state, so they must not be cached at the edge.
 */
export const FEED = /^\/(sitemap[\w-]*\.xml|llms(-full)?\.txt|robots\.txt)$/;
export const IMAGE = /^\/(media\/.+\.(png|jpe?g|webp|gif)|api\/v1\/plots\/[a-z0-9-]{1,80}\/cover\.jpg)$/;

/** What to do with a request: 'image', 'feed' or 'pass' (GET/HEAD only; anything else always passes). */
export function routeFor(method, pathname) {
  if (method !== 'GET' && method !== 'HEAD') return 'pass';
  if (IMAGE.test(pathname)) return 'image';
  if (FEED.test(pathname)) return 'feed';
  return 'pass';
}

/** The resize options for an image request: width from ?w= (clamped 32..2048), else none (serve as is). */
export function imageOptions(url, accept) {
  const w = Number(url.searchParams.get('w'));
  if (!Number.isFinite(w) || w <= 0) return null;
  const width = Math.min(2048, Math.max(32, Math.round(w)));
  const format = /image\/avif/.test(accept ?? '') ? 'avif' : /image\/webp/.test(accept ?? '') ? 'webp' : undefined;
  return { width, fit: 'scale-down', quality: 82, ...(format ? { format } : {}) };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const route = routeFor(request.method, url.pathname);
    if (route === 'pass') return fetch(request);
    if (route === 'feed') {
      const cache = caches.default;
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) {
        const copy = new Response(res.body, res);
        copy.headers.set('cache-control', 'public, max-age=600, s-maxage=600');
        ctx.waitUntil(cache.put(request, copy.clone()));
        return copy;
      }
      return res;
    }
    const image = imageOptions(url, request.headers.get('accept'));
    const res = await fetch(request, { cf: { cacheEverything: true, cacheTtl: 31536000, ...(image && env.IMAGE_RESIZING !== 'off' ? { image } : {}) } });
    if (!res.ok) return res;
    const out = new Response(res.body, res);
    out.headers.set('cache-control', 'public, max-age=31536000, immutable');
    out.headers.set('vary', 'Accept');
    return out;
  },
};
