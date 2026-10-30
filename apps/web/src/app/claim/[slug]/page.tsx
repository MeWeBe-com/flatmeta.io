import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/site-chrome';
import { serverApi } from '@/lib/server-api';
import type { Plot } from '@/lib/types';
import { ClaimWizard } from './claim-client';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ takedown?: string; request?: string }> };

export const metadata: Metadata = { title: 'Claim a landmark', robots: { index: false } };

export default async function ClaimPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const [d, plans] = await Promise.all([
    serverApi<{ plot: Plot }>(`/plots/${encodeURIComponent(slug)}`),
    serverApi<{ landmarkPriceCents: number }>('/billing/plans', { auth: false, revalidate: 300 }).catch(() => null),
  ]);
  if (!d || d.plot.kind !== 'showcase') notFound();
  return (
    <PageShell wide>
      <div id="main" className="space-y-8">
        <div>
          <h1 className="text-3xl md:text-5xl font-bold">{d.plot.showcase?.brand ?? d.plot.title}</h1>
          <p className="muted mt-2">This showcase plot is a sample. It isn’t created, endorsed or affiliated with {d.plot.showcase?.brand}. Claim it for your organisation, or ask us to remove it.</p>
        </div>
        <ClaimWizard plot={d.plot} takedown={sp.takedown === '1'} requestId={sp.request ?? null} landmarkCents={plans?.landmarkPriceCents ?? 99000} />
      </div>
    </PageShell>
  );
}
