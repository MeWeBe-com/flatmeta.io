import type { Metadata } from 'next';
import { FREE_LAND_CELLS, PAID_CHECKOUT } from '@/lib/config';
import { PageShell } from '@/components/site-chrome';
import { Breadcrumbs } from '@/lib/seo';
import { serverApi } from '@/lib/server-api';
import { PricingClient, type Plans } from './pricing-client';
import { PricingLoader } from './pricing-loader';

export const metadata: Metadata = {
  title: 'Pricing',
  description: PAID_CHECKOUT ? 'Free Homestead plot for everyone. Buy land by the cell, boost your plot, or get Plus, Business or Brand.' : `Claim up to ${FREE_LAND_CELLS} squares of the world map for free. Paid plans, boosts and more land are coming soon.`,
  alternates: { canonical: '/pricing' },
};

export default async function PricingPage() {
  const data = await serverApi<Plans>('/billing/plans', { auth: false, revalidate: 300 }).catch(() => null);
  return (
    <PageShell wide>
      <Breadcrumbs trail={[{ name: 'Pricing', path: '/pricing' }]} />
      <div id="main" className="space-y-12">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-bold">Simple, <span className="text-gradient">fair</span> pricing</h1>
          <p className="muted mt-4 text-lg">Play for free forever. Pay for more land, more reach and business tools. Never for XP.</p>
        </div>
        {data ? <PricingClient data={data} /> : <PricingLoader />}
      </div>
    </PageShell>
  );
}
