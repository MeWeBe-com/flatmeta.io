import type { Metadata } from 'next';
import { API_INTERNAL_URL } from '@/lib/internal';
import { Suspense } from 'react';
import { WorldExperience } from '@/components/world/world-experience';
import { HomeFirstPaint } from '@/components/world/home-first-paint';
import { JsonLd } from '@/lib/seo';
import { SITE_URL } from '@/lib/config';

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
      {/* G15c: site name and search box for search engines and agents. */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'FlatMeta',
          url: SITE_URL,
          description: 'A shared world map where people, businesses and brands own land.',
          potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/explore?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
        }}
      />
      {/* The map reads its URL (?at=, ?plot=…), so it renders in the browser; the server sends a real first screen. */}
      <Suspense fallback={<HomeFirstPaint stats={stats} />}>
        <WorldExperience stats={stats} />
      </Suspense>
    </main>
  );
}
