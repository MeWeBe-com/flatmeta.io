import type { Metadata } from 'next';
import { PageShell } from '@/components/site-chrome';
import { BrandsDirectory, type BrandsRes } from '@/components/brands-directory';
import { serverApi } from '@/lib/server-api';
import { SITE_URL } from '@/lib/config';

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = Math.max(1, Math.min(500, Number((await searchParams).page) || 1));
  return {
    title: `Companies on FlatMeta${page > 1 ? ` · page ${page}` : ''}`,
    description: 'Companies with land reserved next to their headquarters on the FlatMeta world map. Claim your company’s plot with your work email or a DNS record.',
    // M7: each page of the list is its own canonical URL, so every company on it stays crawlable.
    alternates: { canonical: `${SITE_URL}/brands${page > 1 ? `?page=${page}` : ''}` },
  };
}

export default async function BrandsPage({ searchParams }: Props) {
  const { q, page: p } = await searchParams;
  const page = Math.max(1, Math.min(500, Number(p) || 1));
  const qs = new URLSearchParams({ page: String(page), ...(q ? { q: q.slice(0, 80) } : {}) });
  const data = (await serverApi<BrandsRes>(`/brands?${qs}`, { auth: false, revalidate: 300 }).catch(() => null)) ?? { brands: [], hasMore: false, countries: [] };
  return (
    <PageShell>
      <BrandsDirectory data={data} q={q} page={page} />
    </PageShell>
  );
}
