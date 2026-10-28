import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { PageShell } from '@/components/site-chrome';
import { Avatar, EmptyState, PlotGrid, SectionTitle } from '@/components/ui';
import { serverApi } from '@/lib/server-api';
import { SITE_URL } from '@/lib/config';
import { JsonLd } from '@/lib/seo';
import type { Org, Plot } from '@/lib/types';

type Params = { params: Promise<{ slug: string }> };
const load = (s: string) => serverApi<{ org: Org; plots: Plot[]; myRole: string | null }>(`/orgs/${encodeURIComponent(s)}`);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug).catch(() => null);
  if (!d) return { title: 'Organisation not found' };
  return { title: d.org.name, description: d.org.description ?? `${d.org.name} on FlatMeta: ${d.plots.length} plots on the world map.`, alternates: { canonical: `${SITE_URL}/o/${d.org.slug}` } };
}

export default async function OrgPage({ params }: Params) {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) notFound();
  const o = d.org;
  return (
    <PageShell>
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Organization', name: o.name, url: o.website ?? `${SITE_URL}/o/${o.slug}`, logo: o.logoUrl ?? undefined, description: o.description ?? undefined }} />
      <div id="main" className="space-y-10">
        <header className="surface p-6 md:p-8 flex flex-col md:flex-row gap-6 md:items-center">
          <Avatar name={o.name} url={o.logoUrl} size={88} />
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{o.name} {o.verified && <span className="chip chip-teal align-middle ml-2">✓ Verified</span>}</h1>
            <p className="muted capitalize">{o.kind}{o.plan !== 'free' && ` · ${o.plan} plan`}</p>
            {o.description && <p className="mt-3 max-w-xl">{o.description}</p>}
          </div>
          {o.website && <a href={o.website} target="_blank" rel="noopener" className="btn-ghost"><ExternalLink size={16} /> Website</a>}
        </header>
        <section>
          <SectionTitle>Plots</SectionTitle>
          <PlotGrid plots={d.plots} empty={<EmptyState icon="store" title="No plots yet" />} />
        </section>
      </div>
    </PageShell>
  );
}
