'use client';

import { Radio } from 'lucide-react';
import { timeAgo } from '@/lib/format';
import type { Activity } from '@/lib/types';
import { useLive } from '../providers';
import { clsx } from '../ui';

export function describeActivity(a: Activity): string {
  const who = a.actor?.displayName ?? 'Someone';
  const what = a.payload.title ?? 'a plot';
  switch (a.kind) {
    case 'plot_claimed':
      return `${who} claimed ${what}${a.payload.cells ? ` (${a.payload.cells} cells)` : ''}`;
    case 'plot_published':
      return `${who} opened ${what}`;
    case 'landmark_claimed':
    case 'landmark_verified':
      return `${what} is now a verified Landmark`;
    case 'wave':
      return `${who} waved at ${what}`;
    case 'achievement':
      return `${who} unlocked ${a.payload.name ?? 'an achievement'}`;
    case 'spotlight':
      return `${what} is in the Spotlight`;
    case 'beacon':
      return `${what} lit a Beacon`;
    default:
      return `${who} · ${what}`;
  }
}

export function LiveTicker({ onSelect, limit = 6 }: { onSelect: (a: Activity) => void; limit?: number }) {
  const { activity, connected } = useLive();
  return (
    <div className="glass rounded-2xl p-3">
      <div className="flex items-center gap-2 px-1 pb-2 text-sm font-display font-bold">
        <Radio size={14} className={clsx(connected ? 'text-[var(--color-coral)] animate-pulse' : 'muted')} /> Live
      </div>
      <ul className="space-y-1">
        {activity.slice(0, limit).map((a) => (
          <li key={a.id}>
            <button className="w-full text-left rounded-xl px-2 py-1.5 hover:bg-white/5 animate-rise" onClick={() => onSelect(a)} disabled={a.lat === null}>
              <div className="text-[13px] leading-snug line-clamp-2">
                <span className="mr-1">{a.flag ?? '🌍'}</span>
                {describeActivity(a)}
              </div>
              <div className="text-xs muted">{timeAgo(a.createdAt)}</div>
            </button>
          </li>
        ))}
        {!activity.length && <li className="text-xs muted px-2">Quiet right now. Be the first to claim something!</li>}
      </ul>
    </div>
  );
}
