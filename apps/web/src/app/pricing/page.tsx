import type { Metadata } from 'next';
import { PageShell } from '@/components/site-chrome';
import { serverApi } from '@/lib/server-api';
import { PricingClient, type Plans } from './pricing-client';
import { PricingLoader } from './pricing-loader';

export const metadata: Metadata = { title: 'Pricing', description: 'Free Homestead plot for everyone. Buy land by the cell, boost your plot, or get Plus, Business or Brand.' };

export default async function PricingPage() {
  const data = await serverApi<Plans>('/billing/plans', { auth: false, revalidate: 300 }).catch(() => null);
  return (
    <PageShell wide>
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
