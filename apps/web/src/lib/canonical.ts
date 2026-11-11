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
