import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/site-chrome';
import { RegionHero } from '@/components/region-hero';
import { Avatar, EmptyState, PlotGrid, SectionTitle } from '@/components/ui';
import { VisitTracker } from '@/components/visit-tracker';
import { serverApi } from '@/lib/server-api';
import { SITE_URL } from '@/lib/config';
import { JsonLd } from '@/lib/seo';
import type { Plot, Region } from '@/lib/types';

type Params = { params: Promise<{ code: string }> };
interface CountryRes {
  country: { code: string; name: string; flag: string; lat: number; lng: number; plotCount: number; cellCount: number; showcaseCount: number; explorers: number };
  cities: Region[];
  trending: Plot[];
  showcase: Plot[];
  newest: Plot[];
  leaderboard: { rank: number; score: number; user?: { username: string; displayName: string; avatarUrl: string | null; level: number } }[];
}

const load = (code: string) => serverApi<CountryRes>(`/countries/${code.toUpperCase()}`, { auth: false, revalidate: 120 });

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const d = await load(code).catch(() => null);
  if (!d) return { title: 'Country not found' };
  const title = `${d.country.name} on the world map`;
  return {
    title,
    description: `Explore ${d.country.plotCount + d.country.showcaseCount} plots in ${d.country.name} on FlatMeta: trending places, showcase brands and the top landholders. Claim your own corner of ${d.country.name}.`,
    alternates: { canonical: `${SITE_URL}/c/${code.toLowerCase()}` },
  };
}

export default async function CountryPage({ params }: Params) {
  const { code } = await params;
  const d = await load(code);
  if (!d) notFound();
  const c = d.country;
  return (
    <PageShell wide>
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${c.name} on FlatMeta`, url: `${SITE_URL}/c/${code.toLowerCase()}`, about: { '@type': 'Country', name: c.name } }} />
      <VisitTracker path={`/countries/${c.code}/visit`} />
      <div className="space-y-12" id="main">
        <RegionHero
          flag={c.flag}
          kicker="Country"
          title={c.name}
          intro={`Every glowing tile in ${c.name} belongs to an explorer, a local business or a showcase brand. Find your favourites, then plant your own flag.`}
          stats={[{ label: 'plots', value: c.plotCount }, { label: 'showcase', value: c.showcaseCount }, { label: 'cells owned', value: c.cellCount }, { label: 'explorers', value: c.explorers }]}
          mapHref={`/?at=${c.lat},${c.lng},5`}
          bg={d.showcase[0]?.coverImageUrl}
        />
        {d.cities.length > 0 && (
          <section>
            <SectionTitle>Cities</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {d.cities.map((r) => (
                <Link key={r.slug} href={`/r/${r.slug}`} className="chip h-9 px-4 text-sm normal-case tracking-normal hover:border-[var(--color-teal)]">{r.name}{r.tier === 'S' && ' ★'}</Link>
              ))}
            </div>
          </section>
        )}
        <section>
          <SectionTitle sub="Sample plots showing how well-known organisations could use FlatMeta. Not affiliated.">Showcase</SectionTitle>
          <PlotGrid plots={d.showcase} empty={<EmptyState icon="star" title="No showcase plots here yet" />} />
        </section>
        <section>
          <SectionTitle>Trending</SectionTitle>
          <PlotGrid plots={d.trending} empty={<EmptyState icon="flag" title={`No community plots in ${c.name} yet`} body="Be the Early Settler and earn a legendary badge." action={<Link className="btn-primary" href={`/?at=${c.lat},${c.lng},6`}>Claim the first plot</Link>} />} />
        </section>
        {d.newest.length > 0 && (
          <section>
            <SectionTitle>Newest</SectionTitle>
            <PlotGrid plots={d.newest} />
          </section>
        )}
        <section>
          <SectionTitle action={<Link href={`/leaderboards?board=cells-country&country=${c.code}`} className="text-sm muted hover:text-[var(--text)]">Full leaderboard →</Link>}>Top landholders</SectionTitle>
          {d.leaderboard.filter((r) => r.user).length ? (
            <ol className="surface divide-y divide-[var(--line)]">
              {d.leaderboard.filter((r) => r.user).map((r) => (
                <li key={r.rank} className="flex items-center gap-3 p-3">
                  <span className="w-6 text-center font-display font-bold muted">{r.rank}</span>
                  <Avatar name={r.user!.displayName} url={r.user!.avatarUrl} size={32} level={r.user!.level} />
                  <Link href={`/u/${r.user!.username}`} className="font-semibold">{r.user!.displayName}</Link>
                  <span className="ml-auto text-sm muted">{r.score} cells</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted text-sm">Nobody owns land here yet.</p>
          )}
        </section>
      </div>
    </PageShell>
  );
}
