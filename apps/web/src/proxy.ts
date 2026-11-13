import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, originsOf } from './lib/csp';

// Origins the browser talks to besides our own (tiles, glyphs, a custom style, analytics, a separate WS host).
const CONNECT = originsOf([
  process.env.NEXT_PUBLIC_MAP_TILES_URL || 'https://tiles.openfreemap.org/planet',
  process.env.NEXT_PUBLIC_MAP_GLYPHS_URL || 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  process.env.NEXT_PUBLIC_WS_URL,
  process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ? 'https://plausible.io' : undefined,
]);
const FRAMES = originsOf([
  process.env.NEXT_PUBLIC_USERCONTENT_URL,
  'https://www.youtube-nocookie.com',
  'https://www.youtube.com',
  'https://player.vimeo.com',
  'https://open.spotify.com',
]);
const DEV = process.env.NODE_ENV === 'development';

/**
 * S2: a removed plot (released, rejected, taken down) answers 410 Gone, so search engines drop it quickly. Next.js
 * pages can only 404, so the proxy asks the API (cached for 30 s per slug) before the page renders.
 */
const API = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:3201').replace(/\/$/, '');
const goneCache = new Map<string, { gone: boolean; at: number }>();
async function plotGone(slug: string): Promise<boolean> {
  const hit = goneCache.get(slug);
  if (hit && Date.now() - hit.at < 30_000) return hit.gone;
  try {
    const r = await fetch(`${API}/v1/plots/${encodeURIComponent(slug)}/state`, { signal: AbortSignal.timeout(1500), cache: 'no-store' });
    const gone = r.ok && ((await r.json()) as { state?: string }).state === 'gone';
    if (goneCache.size > 5000) goneCache.clear();
    goneCache.set(slug, { gone, at: Date.now() });
    return gone;
  } catch {
    return false; // the page itself decides (404 or the plot)
  }
}
const GONE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>This plot was removed · FlatMeta</title></head><body style="font:16px system-ui;background:#0b1020;color:#e8ecf8;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center"><main><h1>This plot was removed</h1><p>The land is no longer on FlatMeta.</p><p><a style="color:#2de2c4" href="/">Back to the map</a> · <a style="color:#2de2c4" href="/explore">Explore places</a></p></main></body></html>`;

/** A nonce-based CSP on every page (G2). Next.js reads the nonce from the request's CSP header and applies it to its scripts. */
export async function proxy(request: NextRequest) {
  const m = /^\/p\/([a-z0-9-]{1,80})$/.exec(request.nextUrl.pathname);
  if (m && (await plotGone(m[1]!))) {
    return new NextResponse(GONE_HTML, { status: 410, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex', 'cache-control': 'public, max-age=300' } });
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  // Upgrade sub-requests only on a page served over https (nginx sets X-Forwarded-Proto); see lib/csp.ts.
  const https = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'https' || request.nextUrl.protocol === 'https:';
  const csp = buildCsp({ nonce, dev: DEV, connect: CONNECT, frames: FRAMES, https });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the API (proxied), static chunks, media, icons or prefetches.
      source: '/((?!api/|_next/static|_next/image|media/|icons/|favicon|sw.js|manifest.webmanifest|robots.txt|sitemap).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
