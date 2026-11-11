import { notFound, redirect } from 'next/navigation';
import { serverApi } from '@/lib/server-api';

interface Target {
  type: 'user' | 'org';
  handle: string;
  plots: { slug: string }[];
}

export const metadata = { robots: { index: false } };

/** flatmeta.io/@handle (rewritten here): the owner's primary plot, or their profile when they have none (G5). */
export default async function HandlePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(handle)) notFound();
  const t = await serverApi<Target>(`/handles/${encodeURIComponent(handle)}`, { auth: false, revalidate: 60 }).catch(() => null);
  if (!t) notFound();
  if (t.plots[0]) redirect(`/p/${t.plots[0].slug}`);
  redirect(t.type === 'user' ? `/u/${t.handle}` : `/o/${t.handle}`);
}
