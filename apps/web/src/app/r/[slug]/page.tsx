import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/site-chrome';
import { RegionHero } from '@/components/region-hero';
import { EmptyState, PlotGrid, SectionTitle } from '@/components/ui';
import { VisitTracker } from '@/components/visit-tracker';
import { serverApi } from '@/lib/server-api';
import { SITE_URL } from '@/lib/config';
import { JsonLd } from '@/lib/seo';
import type { Plot, Region } from '@/lib/types';

type Params = { params: Promise<{ slug: string }> };
interface RegionRes {
  region: Region & { flag: string; plots: number; cells: number; showcase: number };
  trending: Plot[];
  showcase: Plot[];
  newest: Plot[];
  nearby: Region[];
}
const load = (slug: string) => serverApi<RegionRes>(`/regions/${encodeURIComponent(slug)}`, { auth: false, revalidate: 120 });

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug).catch(() => null);
  if (!d) return { title: 'City not found' };
  return {
    title: `${d.region.name}: plots, places and brands`,
    description: `Discover ${d.region.plots + d.region.showcase} plots in ${d.region.name} on FlatMeta, from local favourites to showcase brands. Claim your own corner of ${d.region.name}.`,
    alternates: { canonical: `${SITE_URL}/r/${slug}` },
  };
}

export default async function RegionPage({ params }: Params) {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) notFound();
  const r = d.region;
  return (
    <PageShell wide>
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${r.name} on FlatMeta`, url: `${SITE_URL}/r/${slug}`, about: { '@type': 'City', name: r.name, geo: { '@type': 'GeoCoordinates', latitude: r.lat, longitude: r.lng } } }} />
      <VisitTracker path={`/regions/${r.slug}/visit`} />
      <div className="space-y-12" id="main">
        <RegionHero
          flag={r.flag}
          kicker={r.tier === 'S' ? 'Icon city' : 'City'}
          title={r.name}
          intro={`The living map of ${r.name}: claim a plot, design it with AI, and climb the city leaderboard.`}
          stats={[{ label: 'plots', value: r.plots }, { label: 'showcase', value: r.showcase }, { label: 'cells owned', value: r.cells }]}
          mapHref={`/?at=${r.lat},${r.lng},13`}
          bg={d.showcase[0]?.coverImageUrl}
        />
        <section>
          <SectionTitle sub="Samples for well-known organisations. Not affiliated. Brands can claim them.">Showcase in {r.name}</SectionTitle>
          <PlotGrid plots={d.showcase} empty={<EmptyState icon="star" title="No showcase plots here yet" />} />
        </section>
        <section>
          <SectionTitle>Trending in {r.name}</SectionTitle>
          <PlotGrid plots={d.trending} empty={<EmptyState icon="flag" title="No community plots yet" body={`Claim the first plot in ${r.name} and get the city to yourself.`} action={<Link className="btn-primary" href={`/?at=${r.lat},${r.lng},15`}>Claim land in {r.name}</Link>} />} />
        </section>
        {d.nearby.length > 0 && (
          <section>
            <SectionTitle>More cities</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {d.nearby.map((n) => (
                <Link key={n.slug} href={`/r/${n.slug}`} className="chip h-9 px-4 text-sm normal-case tracking-normal">{n.name}</Link>
              ))}
              <Link href={`/c/${r.countryCode.toLowerCase()}`} className="chip chip-teal h-9 px-4 text-sm normal-case tracking-normal">All of {r.flag} →</Link>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
