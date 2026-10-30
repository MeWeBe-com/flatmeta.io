import type { Metadata } from 'next';
import { PageShell } from '@/components/site-chrome';
import { serverApi } from '@/lib/server-api';
import type { Country, Listing } from '@/lib/types';
import { MarketClient } from './market-client';

export const metadata: Metadata = {
  title: 'Marketplace',
  description: 'Buy land from other FlatMeta players. Plots are licences to display your content on the map, not investments.',
};

export default async function MarketplacePage() {
  const [listings, countries] = await Promise.all([
    serverApi<{ listings: Listing[]; nextCursor: number | null; feeBps: number }>('/listings?limit=24', { auth: false, revalidate: 30 }).catch(() => null),
    serverApi<{ countries: Country[] }>('/countries', { auth: false, revalidate: 600 }).catch(() => null),
  ]);
  return (
    <PageShell wide>
      <div id="main" className="space-y-8">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold">The <span className="text-gradient">marketplace</span></h1>
          <p className="muted mt-2 max-w-2xl">Plots other explorers have put up for sale. The seller keeps 90% and FlatMeta keeps a 10% fee. Land is a licence to show your content on the map: it is for building something, not an investment.</p>
        </div>
        <MarketClient initial={listings?.listings ?? []} initialNext={listings?.nextCursor ?? null} feeBps={listings?.feeBps ?? 1000} countries={countries?.countries ?? []} />
      </div>
    </PageShell>
  );
}
