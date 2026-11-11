/**
 * Content-Security-Policy for the web app (G2). A fresh nonce per request (proxy.ts); scripts must carry it
 * ('strict-dynamic' lets Next.js load its chunks), so injected markup can't run code. Styles allow inline
 * because React and MapLibre set style attributes; there is no CSS-based script execution in modern browsers.
 */
export interface CspInput {
  nonce: string;
  dev: boolean;
  /** Extra origins the browser connects to (map tiles, glyphs, style, analytics, a separate WebSocket host). */
  connect: string[];
  /** Origins allowed in iframes (owner content on the usercontent origin, video embeds in plot descriptions). */
  frames: string[];
}

const origin = (u: string | undefined): string | null => {
  if (!u) return null;
  try {
    const x = new URL(u.replace('{fontstack}', 'a').replace('{range}', 'b'));
    return x.protocol === 'http:' || x.protocol === 'https:' || x.protocol === 'ws:' || x.protocol === 'wss:' ? x.origin : null;
  } catch {
    return null;
  }
};

export function originsOf(urls: (string | undefined)[]): string[] {
  return [...new Set(urls.map(origin).filter((o): o is string => !!o))];
}

export function buildCsp({ nonce, dev, connect, frames }: CspInput): string {
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', ["'self'", ...connect, ...(dev ? ['ws:', 'http://localhost:*', 'http://127.0.0.1:*'] : [])]],
    ['worker-src', ["'self'", 'blob:']],
    ['child-src', ["'self'", 'blob:']],
    ['frame-src', ["'self'", ...frames]],
    ['media-src', ["'self'", 'https:', 'blob:']],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    // Stripe Checkout and the portal are full-page redirects (window.location), not form posts.
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
  const parts = directives.map(([k, v]) => `${k} ${v.join(' ')}`);
  if (!dev) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

/** Headers for every web response (pages and static files alike). HSTS only where the site is served over https. */
export function securityHeaders(https: boolean): { key: string; value: string }[] {
  return [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    ...(https ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
  ];
}
