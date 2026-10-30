'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Compass, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import type { Plot } from '@/lib/types';
import { EmptyState, KindChip, SectionTitle, clsx } from '@/components/ui';

export default function MyPlotsPage() {
  const [plots, setPlots] = useState<Plot[] | null>(null);
  useEffect(() => {
    api<{ plots: Plot[] }>('/me/plots').then((r) => setPlots(r.plots)).catch(() => setPlots([]));
  }, []);
  return (
    <div className="space-y-6">
      <SectionTitle action={<Link href="/?claim" className="btn-primary"><Compass size={16} /> Claim more land</Link>}>My plots</SectionTitle>
      {plots === null ? <div className="skeleton h-60" /> : plots.length === 0 ? (
        <EmptyState icon="flag" title="No plots yet" body="Your first plot is free." action={<Link href="/?claim" className="btn-gold">Claim your Homestead</Link>} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plots.map((p) => (
            <div key={p.id} className="surface overflow-hidden flex flex-col">
              <div className="relative aspect-[3/2] bg-[var(--color-night-3)]">
                {p.coverImageUrl && <img src={p.coverImageUrl} alt="" className="size-full object-cover" />}
                <div className="absolute left-3 top-3 flex gap-1.5">
                  <KindChip plot={p} />
                  <span className={clsx('chip', p.status === 'pending_payment' ? 'chip-coral' : p.published ? 'chip-teal' : 'chip-gold')}>{p.status === 'pending_payment' ? 'Awaiting payment' : p.published ? 'Live' : 'Draft'}</span>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col gap-1">
                <div className="font-semibold">{p.title}</div>
                <div className="text-xs muted">{p.width}×{p.height} cells · {p.countryName ?? 'Ocean'} · ♥ {p.likesCount} · {p.visitsCount} visits</div>
                {p.owner?.type === 'org' && <div className="text-xs text-[var(--color-teal)]">{p.owner.displayName}</div>}
                <div className="flex gap-2 mt-3">
                  <Link href={`/dashboard/plots/${p.id}`} className="btn-gold btn-sm flex-1"><Pencil size={14} /> Edit</Link>
                  <Link href={`/p/${p.slug}`} className="btn-ghost btn-sm flex-1">View</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
