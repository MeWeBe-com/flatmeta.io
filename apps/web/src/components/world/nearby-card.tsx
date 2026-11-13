'use client';

import { useEffect, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import type { Plot } from '@/lib/types';

type Near = Plot & { distanceKm: number };
const km = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : d < 100 ? `${d.toFixed(d < 10 ? 1 : 0)} km` : `${Math.round(d).toLocaleString()} km`);

/**
 * "Nearby on FlatMeta" (G3): right after the start position is known, the closest landmarks, showcase plots and
 * published plots, so a first visit never looks like an empty map. Tapping one flies there and opens it.
 */
export function NearbyCard({ at, onOpen }: { at: { lat: number; lng: number } | null; onOpen: (p: Near) => void }) {
  const [list, setList] = useState<Near[] | null>(null);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!at) return;
    let gone = false;
    fetch(`/api/v1/plots/nearest?lat=${at.lat.toFixed(4)}&lng=${at.lng.toFixed(4)}&limit=4`)
      .then((r) => (r.ok ? (r.json() as Promise<{ plots: Near[] }>) : { plots: [] }))
      .then((r) => !gone && setList(r.plots))
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [at]);
  if (closed || !list?.length) return null;
  return (
    <section aria-label="Nearby on FlatMeta" className="glass rounded-2xl p-3 animate-rise">
      <div className="flex items-center gap-2 mb-2">
        <MapPin size={14} className="text-[var(--color-teal)]" />
        <h2 className="text-sm font-semibold flex-1">Nearby on FlatMeta</h2>
        <button className="icon-btn size-7" onClick={() => setClosed(true)} aria-label="Close nearby places"><X size={14} /></button>
      </div>
      <ul className="space-y-1">
        {list.map((p) => (
          <li key={p.id}>
            <button className="w-full text-left rounded-xl px-2 py-1.5 hover:bg-white/5 flex items-center gap-2" onClick={() => onOpen(p)}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{p.showcase?.brand ?? p.title}</span>
                <span className="block text-xs muted truncate">{p.kind === 'showcase' ? 'Reserved for its company · unclaimed' : p.kind === 'landmark' ? 'Landmark' : p.tagline ?? 'Plot'}</span>
              </span>
              <span className="text-xs muted shrink-0">{km(p.distanceKm)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
