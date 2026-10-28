import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageShell } from '@/components/site-chrome';
import { serverApi } from '@/lib/server-api';
import type { Country } from '@/lib/types';
import { LeaderboardClient } from './leaderboard-client';

export const metadata: Metadata = { title: 'Leaderboards', description: 'The top explorers, landholders and most-loved plots on FlatMeta, by week, all time and by country.' };

export default async function LeaderboardsPage() {
  const countries = await serverApi<{ countries: Country[] }>('/countries', { auth: false, revalidate: 600 }).catch(() => null);
  return (
    <PageShell>
      <div id="main" className="space-y-8">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold">Leaderboards</h1>
          <p className="muted mt-2">Weekly boards reset every Monday. Top 10 each week earn a badge. XP can’t be bought.</p>
        </div>
        <Suspense>
          <LeaderboardClient countries={countries?.countries ?? []} />
        </Suspense>
      </div>
    </PageShell>
  );
}
