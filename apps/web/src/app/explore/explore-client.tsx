'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import type { Country, Plot } from '@/lib/types';
import { EmptyState, PlotGrid, Spinner, clsx } from '@/components/ui';
import { ChipStrip } from '@/components/chip-strip';

const TABS = [
  { key: 'trending', label: 'Trending', q: 'sort=trending' },
  { key: 'new', label: 'New', q: 'sort=new' },
  { key: 'loved', label: 'Most loved', q: 'sort=loved' },
  { key: 'showcase', label: 'Showcase', q: 'kind=showcase&sort=loved' },
  { key: 'business', label: 'Businesses', q: 'kind=business&sort=trending' },
];
const CATEGORIES = ['food & drink', 'technology', 'culture', 'sport', 'music', 'arts', 'travel', 'education', 'nature', 'shopping', 'community'];

export function ExploreClient({ initial, countries }: { initial: Plot[]; countries: Country[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') ?? 'trending';
  const country = params.get('country') ?? '';
  const category = params.get('category') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [plots, setPlots] = useState<Plot[]>(initial);
  const [next, setNext] = useState<number | null>(initial.length >= 24 ? 24 : null);
  const [loading, setLoading] = useState(false);

  const query = (cursor = 0) => {
    const t = TABS.find((x) => x.key === tab) ?? TABS[0]!;
    const parts = [t.q, `limit=24`, `cursor=${cursor}`];
    if (country) parts.push(`country=${country}`);
    if (category) parts.push(`category=${encodeURIComponent(category)}`);
    if (params.get('q')) parts.push(`q=${encodeURIComponent(params.get('q')!)}`);
    return `/plots?${parts.join('&')}`;
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<{ plots: Plot[]; nextCursor: number | null }>(query())
      .then((r) => {
        if (!alive) return;
        setPlots(r.plots);
        setNext(r.nextCursor);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const set = (k: string, v: string) => {
    const sp = new URLSearchParams(params.toString());
    if (v) sp.set(k, v);
    else sp.delete(k);
    router.replace(`/explore?${sp.toString()}`, { scroll: false });
  };
  const more = async () => {
    if (next === null) return;
    const r = await api<{ plots: Plot[]; nextCursor: number | null }>(query(next));
    setPlots((p) => [...p, ...r.plots]);
    setNext(r.nextCursor);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        {/* M6: the sort tabs and the categories are sideways strips on phones (snap, faded edges, the active one in view). */}
        <div className="min-w-0 p-1 surface rounded-full">
          <ChipStrip label="Sort" wrapFrom="never" current={tab} className="gap-1">
            {TABS.map((t) => (
              <button key={t.key} aria-pressed={tab === t.key} onClick={() => set('tab', t.key === 'trending' ? '' : t.key)} className={clsx('tap justify-center px-4 h-9 rounded-full text-sm whitespace-nowrap transition', tab === t.key ? 'bg-[var(--color-teal)] text-[#04141a] font-semibold' : 'muted hover:text-[var(--text)]')}>
                {t.label}
              </button>
            ))}
          </ChipStrip>
        </div>
        <form className="relative md:ml-auto md:w-72" onSubmit={(e) => { e.preventDefault(); set('q', q); }}>
          <Search size={16} className="absolute left-3 top-3 muted" />
          <input className="input pl-9" placeholder="Search plots" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <select className="input md:w-48" value={country} onChange={(e) => set('country', e.target.value)} aria-label="Country">
          <option value="">All countries</option>
          {countries.filter((c) => c.plotCount + c.showcaseCount > 0).map((c) => (
            <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
          ))}
        </select>
      </div>
      <ChipStrip label="Categories" current={category}>
        {CATEGORIES.map((c) => (
          <button key={c} aria-pressed={category === c} onClick={() => set('category', category === c ? '' : c)} className={clsx('chip tap h-8 px-3 normal-case tracking-normal text-xs', category === c && 'chip-teal')}>
            {c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
      </ChipStrip>
      {loading && !plots.length ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton aspect-[3/4]" />)}</div>
      ) : (
        <PlotGrid plots={plots} empty={<EmptyState title="Nothing here yet" body="Try another filter, or claim the first plot yourself." />} />
      )}
      {loading && plots.length > 0 && <div className="text-center"><Spinner /></div>}
      {next !== null && !loading && <div className="text-center"><button className="btn-ghost" onClick={() => void more()}>Load more</button></div>}
    </div>
  );
}
