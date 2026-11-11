import { notFound, redirect } from 'next/navigation';
import { serverApi } from '@/lib/server-api';

export const metadata = { robots: { index: false } };

/** flatmeta.io/@handle/plot-slug (rewritten here): one of the owner's plots, only if it really is theirs (G5). */
export default async function HandlePlotPage({ params }: { params: Promise<{ handle: string; plot: string }> }) {
  const { handle, plot } = await params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(handle) || !/^[a-z0-9-]{1,80}$/.test(plot)) notFound();
  const t = await serverApi<{ plots: { slug: string }[] }>(`/handles/${encodeURIComponent(handle)}`, { auth: false, revalidate: 60 }).catch(() => null);
  if (!t?.plots.some((p) => p.slug === plot)) notFound();
  redirect(`/p/${plot}`);
}
