import type { Metadata } from 'next';
import { API_INTERNAL_URL } from '@/lib/internal';
import { Suspense } from 'react';
import { WorldExperience } from '@/components/world/world-experience';

// The map takes ?at=, ?plot=, ?dm= … parameters: they all describe the same page.
export const metadata: Metadata = { alternates: { canonical: '/' } };

async function getStats() {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/v1/world/stats`, { next: { revalidate: 60 } });
    return res.ok ? ((await res.json()) as { plots: number; showcase: number; countries: number; explorers: number }) : null;
  } catch {
    return null;
  }
}

export default async function Home() {
  const stats = await getStats();
  return (
    <main id="main">
      <Suspense>
        <WorldExperience stats={stats} />
      </Suspense>
    </main>
  );
}
