'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { MAP_ATTRIBUTION } from '@/lib/config';

/**
 * The map data credits (OpenStreetMap, the tile provider) behind an ⓘ button in the bottom control bar (M4). MapLibre's
 * own attribution box sat on top of Claim land on phones; this one is part of the bar and opens on demand.
 */
export function MapAttribution() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button type="button" className="glass rounded-full icon-btn" aria-label="Map data credits" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Info size={18} />
      </button>
      {open && (
        <p id={id} role="note" className="absolute bottom-0 right-full mr-2 w-max max-w-[min(18rem,calc(100vw-5rem))] surface px-3 py-2 text-xs shadow-xl">
          {MAP_ATTRIBUTION}
        </p>
      )}
    </div>
  );
}
