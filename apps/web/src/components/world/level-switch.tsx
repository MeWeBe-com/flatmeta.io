'use client';

import { Globe2, Landmark, MapPinned } from 'lucide-react';
import { clsx } from '../ui';

export type Level = 'world' | 'city' | 'land';
export const CITY_MIN = 6.5;
export const LAND_MIN = 13.5;
export const levelOf = (zoom: number): Level => (zoom >= LAND_MIN ? 'land' : zoom >= CITY_MIN ? 'city' : 'world');
/** Zoom each preset flies to. */
export const LEVEL_ZOOM: Record<Level, number> = { world: 2.2, city: 10.5, land: 15.5 };

const ITEMS: { key: Level; label: string; hint: string; icon: typeof Globe2 }[] = [
  { key: 'world', label: 'World', hint: 'The whole globe', icon: Globe2 },
  { key: 'city', label: 'City', hint: 'Explore and meet people', icon: Landmark },
  { key: 'land', label: 'Land', hint: 'See, claim and edit plots', icon: MapPinned },
];

/**
 * The three named levels, as a labelled segmented control (M4: no more cryptic W / C / L at 36 px). Zoom is still
 * continuous; these are presets and show where you are.
 */
export function LevelSwitch({ zoom, onPick }: { zoom: number; onPick: (l: Level) => void }) {
  const current = levelOf(zoom);
  return (
    <div role="group" aria-label="Zoom level: World, City or Land" className="glass rounded-full p-1 flex gap-0.5">
      {ITEMS.map((i) => (
        <button
          key={i.key}
          type="button"
          onClick={() => onPick(i.key)}
          title={i.hint}
          aria-pressed={current === i.key}
          className={clsx('min-h-11 px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors', current === i.key ? 'bg-[var(--color-teal)] text-[#0b1020]' : 'hover:bg-white/10')}
        >
          <i.icon size={14} aria-hidden /> {i.label}
        </button>
      ))}
    </div>
  );
}
