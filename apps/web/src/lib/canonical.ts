/**
 * The site's canonical origin, used for canonical tags, sitemaps, robots.txt and share links (G4).
 * CANONICAL_URL wins. Otherwise production on the bare domain (APP_URL=https://flatmeta.io, which the edge
 * redirects to www) uses the www host, so search engines never index a URL that redirects. CANONICAL_WWW=false opts out.
 */
export function canonicalUrl(env: Record<string, string | undefined>): string {
  if (env.CANONICAL_URL) return env.CANONICAL_URL.replace(/\/$/, '');
  const app = (env.APP_URL ?? 'http://localhost:3200').replace(/\/$/, '');
  const domain = env.PRODUCTION_DOMAIN ?? 'flatmeta.io';
  try {
    const u = new URL(app);
    const production = (env.APP_ENV ?? (env.NODE_ENV === 'production' ? 'production' : 'development')) === 'production';
    if (production && u.hostname === domain && env.CANONICAL_WWW !== 'false') return `${u.protocol}//www.${domain}${u.port ? `:${u.port}` : ''}`;
  } catch {
    /* not a URL: use it as given */
  }
  return app;
}

/**
 * S6: the bare domain answers every path with a 301 to the same path on www (production's canonical host), query
 * string kept. nginx does the same before a request reaches the app (deploy/hestia/nodejs-app.conf); this covers a
 * request that reaches Next.js on the bare host anyway. Off when the canonical host is not www.
 */
export function apexRedirects(env: Record<string, string | undefined>) {
  const domain = env.PRODUCTION_DOMAIN ?? 'flatmeta.io';
  const canonical = env.CANONICAL_URL ? env.CANONICAL_URL.replace(/\/$/, '') : `https://www.${domain}`;
  // GL6: old or extra domains (REDIRECT_HOSTS=flatmeta.com,www.flatmeta.com, or the previous domain after a switch)
  // answer every path with a 301 to the same path on the canonical host, whatever the canonical host is.
  const extra = (env.REDIRECT_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) && h !== new URL(canonical).hostname)
    .map((h) => ({ source: '/:path*', has: [{ type: 'host' as const, value: h }], destination: `${canonical}/:path*`, statusCode: 301 as const }));
  if (env.CANONICAL_WWW === 'false' || env.CANONICAL_URL) return extra;
  return [{ source: '/:path*', has: [{ type: 'host' as const, value: domain }], destination: `https://www.${domain}/:path*`, statusCode: 301 as const }, ...extra];
}
