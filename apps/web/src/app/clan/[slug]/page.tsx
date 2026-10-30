import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/site-chrome';
import { serverApi } from '@/lib/server-api';
import { SITE_URL } from '@/lib/config';
import type { ClanDetail } from '@/lib/types';
import { ClanClient } from './clan-client';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const d = await serverApi<ClanDetail>(`/clans/${slug}`, { auth: false, revalidate: 120 }).catch(() => null);
  if (!d) return { title: 'Clan not found' };
  return {
    title: `[${d.clan.tag}] ${d.clan.name}`,
    description: d.clan.description ?? `${d.clan.name} is a FlatMeta clan with ${d.clan.memberCount} members.`,
    alternates: { canonical: `${SITE_URL}/clan/${slug}` },
  };
}

export default async function ClanPage({ params }: Params) {
  const { slug } = await params;
  const d = await serverApi<ClanDetail>(`/clans/${slug}`).catch(() => null);
  if (!d) notFound();
  return (
    <PageShell>
      <div id="main">
        <ClanClient slug={slug} initial={d} />
      </div>
    </PageShell>
  );
}
