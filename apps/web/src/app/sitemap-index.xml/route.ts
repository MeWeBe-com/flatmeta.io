import { abs } from '@/lib/sitemaps/feed';

/** The old index URL (G4): moved permanently to /sitemap.xml (S1). */
export function GET() {
  return new Response(null, { status: 301, headers: { location: abs('/sitemap.xml'), 'cache-control': 'public, max-age=86400' } });
}
