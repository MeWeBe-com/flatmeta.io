import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PageShell } from '@/components/site-chrome';
import { serverApi } from '@/lib/server-api';
import { Breadcrumbs } from '@/lib/seo';
import type { Country, Plot } from '@/lib/types';
import { ExploreClient } from './explore-client';

const PER_PAGE = 24;
type Props = { searchParams: Promise<{ page?: string }> };
const pageOf = (p?: string) => Math.max(1, Math.min(500, Math.floor(Number(p)) || 1));

/**
 * S4: /explore is paginated for search engines: ?page=N lists the next 24 trending plots, with plain Previous / Next
 * links and its own canonical URL. Sorting, filters and search stay in the page (they all share /explore's canonical).
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = pageOf((await searchParams).page);
  return {
    title: page > 1 ? `Explore plots · page ${page}` : 'Explore plots',
    description: 'Discover trending, new and most-loved plots on FlatMeta, plus showcase brands and local businesses from around the world.',
    alternates: { canonical: page > 1 ? `/explore?page=${page}` : '/explore' },
  };
}

export default async function ExplorePage({ searchParams }: Props) {
  const page = pageOf((await searchParams).page);
  const [plots, countries] = await Promise.all([
    serverApi<{ plots: Plot[]; nextCursor: number | null }>(`/plots?sort=trending&limit=${PER_PAGE}&cursor=${(page - 1) * PER_PAGE}`, { auth: false, revalidate: 60 }).catch(() => null),
    serverApi<{ countries: Country[] }>('/countries', { auth: false, revalidate: 600 }).catch(() => null),
  ]);
  // Past the last page: a real 404, not an empty list.
  if (page > 1 && plots && plots.plots.length === 0) notFound();
  const hasMore = plots?.nextCursor != null;
  return (
    <PageShell wide>
      <Breadcrumbs trail={[{ name: 'Explore', path: '/explore' }, ...(page > 1 ? [{ name: `Page ${page}`, path: `/explore?page=${page}` }] : [])]} />
      <div id="main" className="space-y-8">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold">Explore the <span className="text-gradient">living map</span></h1>
          <p className="muted mt-2 max-w-2xl">Plots made by explorers, creators, local businesses and showcase brands. Like the ones you love, wave at neighbours and sign guestbooks to earn XP.</p>
        </div>
        <Suspense>
          <ExploreClient initial={plots?.plots ?? []} countries={countries?.countries ?? []} page={page} />
        </Suspense>
        {(page > 1 || hasMore) && (
          <nav className="flex items-center justify-center gap-3" aria-label="Pages">
            {page > 1 && <Link className="btn-ghost" rel="prev" href={page === 2 ? '/explore' : `/explore?page=${page - 1}`}>Previous</Link>}
            <span className="text-sm muted">Page {page}</span>
            {hasMore && <Link className="btn-ghost" rel="next" href={`/explore?page=${page + 1}`}>Next</Link>}
          </nav>
        )}
      </div>
    </PageShell>
  );
}
