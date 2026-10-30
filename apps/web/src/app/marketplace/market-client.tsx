'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { flag, TIER_LABEL, TIER_COLOR, usd } from '@/lib/format';
import type { Country, Listing } from '@/lib/types';
import { EmptyState, Spinner } from '@/components/ui';

export function ListingCard({ l }: { l: Listing }) {
  const p = l.plot;
  return (
    <Link href={`/p/${p.slug}`} className="group surface overflow-hidden flex flex-col transition hover:-translate-y-0.5 hover:border-[var(--line-strong)]">
      <div className="relative aspect-[3/2] overflow-hidden bg-[var(--color-night-3)]">
        {p.coverImageUrl && <img src={p.thumbUrl ?? p.coverImageUrl} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" />}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
        <span className="absolute left-3 top-3 chip" style={{ borderColor: TIER_COLOR[p.tier], color: TIER_COLOR[p.tier] }}>{TIER_LABEL[p.tier]}</span>
        <span className="absolute right-3 top-3 text-lg" title={p.countryName ?? 'Ocean'}>{flag(p.countryCode)}</span>
        <span className="absolute left-3 bottom-3 text-2xl font-display font-bold drop-shadow">{usd(l.priceCents)}</span>
      </div>
      <div className="p-4 space-y-1">
        <h3 className="font-semibold line-clamp-1">{p.title}</h3>
        <p className="text-xs muted">{p.cellCount} cell{p.cellCount === 1 ? '' : 's'} · {p.regionSlug ? p.regionSlug.replace(/-/g, ' ') : p.countryName ?? 'Open water'} · by {p.owner?.displayName ?? 'someone'}</p>
      </div>
    </Link>
  );
}

export function MarketClient({ initial, initialNext, feeBps, countries }: { initial: Listing[]; initialNext: number | null; feeBps: number; countries: Country[] }) {
  const [listings, setListings] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [loading, setLoading] = useState(false);
  const [country, setCountry] = useState('');
  const [tier, setTier] = useState('');
  const [sort, setSort] = useState('new');
  const first = useRef(true);

  const url = (cursor: number) => `/listings?limit=24&cursor=${cursor}&sort=${sort}${country ? `&country=${country}` : ''}${tier ? `&tier=${tier}` : ''}`;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let alive = true;
    setLoading(true);
    api<{ listings: Listing[]; nextCursor: number | null }>(url(0))
      .then((r) => {
        if (!alive) return;
        setListings(r.listings);
        setNext(r.nextCursor);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, tier, sort]);

  const more = async () => {
    if (next === null) return;
    setLoading(true);
    try {
      const r = await api<{ listings: Listing[]; nextCursor: number | null }>(url(next));
      setListings((l) => [...l, ...r.listings]);
      setNext(r.nextCursor);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 items-center">
        <select className="input w-auto" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
          <option value="">All countries</option>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
        </select>
        <select className="input w-auto" value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Zone">
          <option value="">Any zone</option>
          {Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="new">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
        <span className="ml-auto text-xs muted">Platform fee {(feeBps / 100).toFixed(0)}%, paid by the seller</span>
      </div>
      {listings.length === 0 && !loading ? (
        <EmptyState icon="store" title="Nothing for sale here yet" body="Be the first: open one of your plots and press “Sell this plot”. Free Homestead land can’t be resold." action={<Link href="/dashboard/plots" className="btn-primary">My plots</Link>} />
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {listings.map((l) => <ListingCard key={l.id} l={l} />)}
        </div>
      )}
      {loading && <div className="grid place-items-center py-6"><Spinner /></div>}
      {next !== null && !loading && <div className="text-center"><button className="btn-ghost" onClick={() => void more()}>Show more</button></div>}
    </div>
  );
}
