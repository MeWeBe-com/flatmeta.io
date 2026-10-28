import { Suspense } from 'react';
import { WorldExperience } from '@/components/world/world-experience';

async function getStats() {
  try {
    const res = await fetch(`${process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000'}/v1/world/stats`, { next: { revalidate: 60 } });
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
