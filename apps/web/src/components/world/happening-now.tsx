'use client';

import { useEffect, useState } from 'react';
import { PartyPopper, Users } from 'lucide-react';
import { api } from '@/lib/api';

interface Live { id: string; title: string; endsAt: string; hereNow: number; plot: { id: string; slug: string; title: string; center: { lat: number; lng: number } } }

/** G10: open houses happening right now, with how many people are there. Hidden when there are none. */
export function HappeningNow({ onOpen }: { onOpen: (plotId: string, at: { lat: number; lng: number }) => void }) {
  const [list, setList] = useState<Live[]>([]);
  useEffect(() => {
    const load = () => api<{ openHouses: Live[] }>('/open-houses/now').then((r) => setList(r.openHouses)).catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  if (!list.length) return null;
  return (
    <section aria-label="Happening now" className="glass rounded-2xl p-3">
      <h2 className="text-sm font-semibold inline-flex items-center gap-2"><PartyPopper size={14} /> Happening now</h2>
      <ul className="mt-2 space-y-1">
        {list.slice(0, 4).map((o) => (
          <li key={o.id}>
            <button type="button" className="w-full text-left rounded-xl px-2 py-1.5 hover:bg-white/5 flex items-center gap-2" onClick={() => onOpen(o.plot.id, o.plot.center)}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm truncate">{o.title}</span>
                <span className="block text-xs muted truncate">{o.plot.title}</span>
              </span>
              <span className="chip text-[11px] inline-flex items-center gap-1 shrink-0"><Users size={11} /> {o.hereNow} here</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
