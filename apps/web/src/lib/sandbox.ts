/**
 * Where an owner-HTML document loads from (G8). With NEXT_PUBLIC_USERCONTENT_URL set, the API already returns
 * absolute URLs on that separate origin. Without it (dev, tests) the document is served by our own /api, so the URL is
 * made relative: it then works whatever host the page is opened on.
 */
export function sandboxSrc(url: string): string {
  if (process.env.NEXT_PUBLIC_USERCONTENT_URL) return url;
  try {
    const u = new URL(url, 'http://x.invalid');
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}
