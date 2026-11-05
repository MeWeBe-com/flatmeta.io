import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageShell } from '@/components/site-chrome';
import { serverApi } from '@/lib/server-api';
import type { Country, Plot } from '@/lib/types';
import { ExploreClient } from './explore-client';

export const metadata: Metadata = { title: 'Explore plots', description: 'Discover trending, new and most-loved plots on FlatMeta, plus showcase brands and local businesses from around the world.', alternates: { canonical: '/explore' } };

export default async function ExplorePage() {
  const [plots, countries] = await Promise.all([
    serverApi<{ plots: Plot[] }>('/plots?sort=trending&limit=24', { auth: false, revalidate: 60 }).catch(() => null),
    serverApi<{ countries: Country[] }>('/countries', { auth: false, revalidate: 600 }).catch(() => null),
  ]);
  return (
    <PageShell wide>
      <div id="main" className="space-y-8">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold">Explore the <span className="text-gradient">living map</span></h1>
          <p className="muted mt-2 max-w-2xl">Plots made by explorers, creators, local businesses and showcase brands. Like the ones you love, wave at neighbours and sign guestbooks to earn XP.</p>
        </div>
        <Suspense>
          <ExploreClient initial={plots?.plots ?? []} countries={countries?.countries ?? []} />
        </Suspense>
      </div>
    </PageShell>
  );
}
