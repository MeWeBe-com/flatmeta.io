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

/** A nonce-based CSP on every page (G2). Next.js reads the nonce from the request's CSP header and applies it to its scripts. */
export function proxy(request: NextRequest) {
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
