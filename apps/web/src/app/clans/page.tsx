import type { Metadata } from 'next';
import { PageShell } from '@/components/site-chrome';
import { serverApi } from '@/lib/server-api';
import type { Clan, ClanRank } from '@/lib/types';
import { ClansClient } from './clans-client';

export const metadata: Metadata = {
  alternates: { canonical: '/clans' },
  title: 'Clans',
  description: 'Team up with other explorers. Found a clan, climb the clan leaderboard, and chat with your team on the FlatMeta map.',
};

export default async function ClansPage() {
  const [board, list] = await Promise.all([
    serverApi<{ clans: ClanRank[] }>('/clans/leaderboard', { auth: false, revalidate: 60 }).catch(() => null),
    serverApi<{ clans: Clan[] }>('/clans?limit=24', { auth: false, revalidate: 60 }).catch(() => null),
  ]);
  return (
    <PageShell wide>
      <div id="main" className="space-y-8">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold">Find your <span className="text-gradient">clan</span></h1>
          <p className="muted mt-2 max-w-2xl">Clans pool their members’ XP, share a private chat and climb the clan leaderboard together. Up to 50 players each.</p>
        </div>
        <ClansClient board={board?.clans ?? []} initial={list?.clans ?? []} />
      </div>
    </PageShell>
  );
}
