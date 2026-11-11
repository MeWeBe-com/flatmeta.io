'use client';

import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { api } from '@/lib/api';

/** "N visitors today · M this week" (G6): privacy-friendly unique visitors, counted without storing IPs. */
export function VisitorStats({ plotId, delayMs = 0, className }: { plotId: string; delayMs?: number; className?: string }) {
  const [v, setV] = useState<{ today: number; week: number; total: number } | null>(null);
  useEffect(() => {
    // A short delay on the plot page lets this visit be counted first.
    const t = setTimeout(() => {
      api<{ today: number; week: number; total: number }>(`/plots/${plotId}/visitors`).then(setV).catch(() => undefined);
    }, delayMs);
    return () => clearTimeout(t);
  }, [plotId, delayMs]);
  if (!v) return null;
  const n = (x: number, one: string) => `${x.toLocaleString()} ${one}${x === 1 ? '' : 's'}`;
  return (
    <p className={className ?? 'text-xs muted inline-flex items-center gap-1.5'} aria-label="Visitors">
      <Eye size={13} /> {n(v.today, 'visitor')} today · {v.week.toLocaleString()} this week
    </p>
  );
}
