import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/site-chrome';
import { BrandsDirectory, type BrandsRes } from '@/components/brands-directory';
import { serverApi } from '@/lib/server-api';
import { SITE_URL } from '@/lib/config';

type Props = { params: Promise<{ country: string }>; searchParams: Promise<{ q?: string; page?: string }> };

const load = (cc: string, qs = '') => serverApi<BrandsRes>(`/brands?country=${cc}${qs}`, { auth: false, revalidate: 300 }).catch(() => null);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { country } = await params;
  const page = Math.max(1, Math.min(500, Number((await searchParams).page) || 1));
  if (!/^[a-z]{2}$/i.test(country)) return { title: 'Not found' };
  const data = await load(country.toUpperCase());
  const name = data?.countries.find((c) => c.code === country.toUpperCase())?.name ?? country.toUpperCase();
  return {
    title: `Companies in ${name} on FlatMeta${page > 1 ? ` · page ${page}` : ''}`,
    description: `Companies in ${name} with land reserved next to their headquarters on the FlatMeta world map.`,
    // M7: each page of the list is its own canonical URL (page 2 is not a copy of page 1), so every company is crawlable.
    alternates: { canonical: `${SITE_URL}/brands/${country.toLowerCase()}${page > 1 ? `?page=${page}` : ''}` },
  };
}

export default async function BrandsCountryPage({ params, searchParams }: Props) {
  const { country } = await params;
  if (!/^[a-z]{2}$/i.test(country)) notFound();
  const { q, page: p } = await searchParams;
  const page = Math.max(1, Math.min(500, Number(p) || 1));
  const data = await load(country.toUpperCase(), `&page=${page}${q ? `&q=${encodeURIComponent(q.slice(0, 80))}` : ''}`);
  if (!data) notFound();
  return (
    <PageShell>
      <BrandsDirectory data={data} country={country.toUpperCase()} q={q} page={page} />
    </PageShell>
  );
}
