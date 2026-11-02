'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';
import { PricingClient, type Plans } from './pricing-client';

/** Used when the page was prerendered without the API (e.g. at build time): fetch the plans in the browser. */
export function PricingLoader() {
  const [data, setData] = useState<Plans | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api<Plans>('/billing/plans').then(setData).catch(() => setFailed(true));
  }, []);
  if (data) return <PricingClient data={data} />;
  return <p className="text-center muted">{failed ? 'Prices are unavailable right now. Please refresh in a moment.' : <Spinner />}</p>;
}
