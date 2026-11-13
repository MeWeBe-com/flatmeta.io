'use client';

import { useEffect, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { nearestPlots, type NearPlot } from '@/lib/nearest';

type Near = NearPlot;
const km = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : d < 100 ? `${d.toFixed(d < 10 ? 1 : 0)} km` : `${Math.round(d).toLocaleString()} km`);

/**
 * "Nearby on FlatMeta" (G3): right after the start position is known, the closest landmarks, showcase plots and
 * published plots, so a first visit never looks like an empty map. Tapping one flies there and opens it.
 */
export function NearbyCard({ at, onOpen }: { at: { lat: number; lng: number } | null; onOpen: (p: Near) => void }) {
  const [list, setList] = useState<Near[] | null>(null);
  const [closed, setClosed] = useState(false);
  // Keyed on the rounded position, not the object: the page passes a new object on every render (M2: this used
  // to refetch /plots/nearest 8+ times per load).
  const lat = at ? Number(at.lat.toFixed(2)) : null;
  const lng = at ? Number(at.lng.toFixed(2)) : null;
  useEffect(() => {
    if (lat === null || lng === null) return;
    const ctl = new AbortController();
    nearestPlots(lat, lng, 6, ctl.signal)
      .then((plots) => setList(plots.slice(0, 4)))
      .catch(() => undefined);
    return () => ctl.abort();
  }, [lat, lng]);
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
