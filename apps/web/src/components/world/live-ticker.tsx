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

/** GL3d: activity older than this reads as an empty world ("12d ago"); the panel shows only what is fresh. */
export const FRESH_MS = 7 * 86_400_000;
export function freshActivity<T extends { createdAt: string }>(list: T[], now = Date.now()): T[] {
  return list.filter((a) => now - new Date(a.createdAt).getTime() <= FRESH_MS);
}

export function LiveTicker({ onSelect, onClaim, limit = 6 }: { onSelect: (a: Activity) => void; onClaim?: () => void; limit?: number }) {
  const { activity: all, connected } = useLive();
  const activity = freshActivity(all);
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
        {!activity.length && (
          <li className="px-2 space-y-2" data-testid="live-empty">
            <p className="text-xs muted">Quiet this week. Be the first: your first land is free.</p>
            {onClaim && (
              <button className="btn-sm btn-ghost" onClick={onClaim}>
                Claim free land
              </button>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
