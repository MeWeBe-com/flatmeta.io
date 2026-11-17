'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { clsx } from '@/components/ui';

interface Step { key: string; label: string; n: number; source: string; rate: number | null }
interface Funnel { days: number; steps: Step[]; side: { demoViews: number; claimStarts: number }; series: { day: string; visits: number; demoViews: number; claimStarts: number }[]; note: string }

/**
 * R3f: the funnel (visit > sign-up > first value > paid) for the last 7, 30 or 90 days. One hue; each bar is labelled
 * with its number and the step-to-step conversion, so nothing depends on colour; the daily numbers are in a table.
 */
export default function FunnelPage() {
  const [days, setDays] = useState(30);
  const [f, setF] = useState<Funnel | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setF(null);
    api<Funnel>(`/admin/funnel?days=${days}`).then(setF).catch((e: Error) => setError(e.message || 'Could not load the funnel.'));
  }, [days]);
  const top = Math.max(1, ...(f?.steps.map((s) => s.n) ?? [1]));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">Funnel</h1>
        <div className="flex gap-1" role="group" aria-label="Period">
          {[7, 30, 90].map((d) => (
            <button key={d} aria-pressed={days === d} onClick={() => setDays(d)} className={clsx('chip tap h-8 px-3', days === d && 'chip-teal')}>
              {d} days
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-[var(--color-coral)]" role="alert">{error}</p>}
      {!f && !error && <div className="skeleton h-64" />}
      {f && (
        <>
          <ol className="space-y-3" data-testid="funnel-steps">
            {f.steps.map((s) => (
              <li key={s.key} className="surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{s.label}</span>
                  <span className="text-sm muted">
                    <strong className="text-[var(--text)] text-lg font-display">{s.n.toLocaleString('en')}</strong>
                    {s.rate !== null && <> · {s.rate}% of the step before</>}
                  </span>
                </div>
                <div className="mt-2 h-3 rounded-full bg-white/5" aria-hidden="true">
                  <div className="h-3 rounded-full bg-[var(--color-teal)]" style={{ width: `${Math.max(s.n ? 2 : 0, (s.n / top) * 100)}%` }} />
                </div>
                <p className="text-xs muted mt-1">{s.source}</p>
              </li>
            ))}
          </ol>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="surface p-4"><div className="text-2xl font-display font-bold">{f.side.demoViews}</div><div className="text-sm muted">demo views (/demo)</div></div>
            <div className="surface p-4"><div className="text-2xl font-display font-bold">{f.side.claimStarts}</div><div className="text-sm muted">claims started on the map</div></div>
          </div>
          <details className="surface p-4">
            <summary className="cursor-pointer font-semibold tap">Daily numbers</summary>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead><tr className="text-left muted"><th className="py-1 pr-4">Day</th><th className="py-1 pr-4">Visitors</th><th className="py-1 pr-4">Demo views</th><th className="py-1">Claims started</th></tr></thead>
                <tbody>
                  {[...f.series].reverse().map((r) => (
                    <tr key={r.day} className="border-t border-[var(--line)]"><td className="py-1 pr-4">{r.day}</td><td className="py-1 pr-4">{r.visits}</td><td className="py-1 pr-4">{r.demoViews}</td><td className="py-1">{r.claimStarts}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="text-xs muted">{f.note}</p>
        </>
      )}
    </div>
  );
}
