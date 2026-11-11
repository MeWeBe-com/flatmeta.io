'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usd } from '@/lib/format';
import { clsx } from '@/components/ui';

interface Day { date: string; signups: number; claims: number; conversions: number; revenueCents: number; paywallViews: number }
interface Metrics { days: number; series: Day[]; totals: Omit<Day, 'date'>; mrrCents: number; note: string }

type Key = 'signups' | 'claims' | 'conversions' | 'revenueCents';
const CHARTS: { key: Key; title: string; money?: boolean }[] = [
  { key: 'signups', title: 'Signups' },
  { key: 'claims', title: 'Land claims' },
  { key: 'conversions', title: 'Paid conversions' },
  { key: 'revenueCents', title: 'Revenue', money: true },
];

/** G13: signups, claims, paid conversions and revenue per day. One series per chart, one hue, values on hover. */
export default function MetricsPage() {
  const [days, setDays] = useState(30);
  const [m, setM] = useState<Metrics | null>(null);
  const [table, setTable] = useState(false);
  useEffect(() => {
    api<Metrics>(`/admin/metrics?days=${days}`).then(setM).catch(() => setM(null));
  }, [days]);
  if (!m) return <div className="skeleton h-64" />;
  const fmt = (k: Key, v: number) => (k === 'revenueCents' ? usd(v) : String(v));
  const conv = m.totals.paywallViews ? `${((m.totals.conversions / Math.max(1, m.totals.paywallViews)) * 100).toFixed(1)}%` : '–';
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Metrics</h1>
          <p className="text-sm muted mt-1">Per day, UTC. {m.note}</p>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Range">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={clsx('chip', days === d && 'chip-teal')}>{d} days</button>
          ))}
          <button type="button" className="chip" aria-pressed={table} onClick={() => setTable((t) => !t)}>{table ? 'Charts' : 'Table'}</button>
        </div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-6 gap-3" aria-label="Totals">
        {[
          ['Signups', String(m.totals.signups)],
          ['Claims', String(m.totals.claims)],
          ['Paid conversions', String(m.totals.conversions)],
          ['Revenue', usd(m.totals.revenueCents)],
          ['MRR', usd(m.mrrCents)],
          ['Paywall → paid', conv],
        ].map(([label, value]) => (
          <div key={label} className="surface p-4">
            <div className="text-xs muted">{label}</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
          </div>
        ))}
      </section>

      {table ? (
        <div className="surface overflow-auto">
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="text-left muted"><th className="p-2">Date</th><th className="p-2">Signups</th><th className="p-2">Claims</th><th className="p-2">Conversions</th><th className="p-2">Revenue</th><th className="p-2">Paywall views</th></tr></thead>
            <tbody>
              {[...m.series].reverse().map((d) => (
                <tr key={d.date} className="border-t border-[var(--line)]"><td className="p-2">{d.date}</td><td className="p-2">{d.signups}</td><td className="p-2">{d.claims}</td><td className="p-2">{d.conversions}</td><td className="p-2">{usd(d.revenueCents)}</td><td className="p-2">{d.paywallViews}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {CHARTS.map((c) => (
            <BarChart key={c.key} title={c.title} data={m.series.map((d) => ({ x: d.date, y: d[c.key] }))} format={(v) => fmt(c.key, v)} />
          ))}
        </div>
      )}
    </div>
  );
}

function BarChart({ title, data, format }: { title: string; data: { x: string; y: number }[]; format: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 520;
  const H = 160;
  const pad = { l: 8, r: 8, t: 12, b: 22 };
  const max = Math.max(1, ...data.map((d) => d.y));
  const slot = (W - pad.l - pad.r) / data.length;
  const bar = Math.max(2, slot - 2); // 2 px gap between bars
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const total = data.reduce((s, d) => s + d.y, 0);
  const h = hover !== null ? data[hover] : null;
  return (
    <figure className="surface p-4 space-y-2">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className="text-sm muted tabular-nums">{h ? `${h.x}: ${format(h.y)}` : `total ${format(total)}`}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${title} per day, total ${format(total)}`} onMouseLeave={() => setHover(null)}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line)" strokeWidth="1" />
        <text x={pad.l} y={pad.t - 2} fontSize="10" fill="var(--muted, #8B93B5)">{format(max)}</text>
        {data.map((d, i) => {
          const x = pad.l + i * slot + (slot - bar) / 2;
          const top = y(d.y);
          const hgt = H - pad.b - top;
          return (
            <g key={d.x} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${d.x}: ${format(d.y)}`}>
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
              {d.y > 0 && <rect x={x} y={top} width={bar} height={Math.max(1, hgt)} rx={Math.min(3, bar / 2)} fill="var(--color-teal)" opacity={hover === null || hover === i ? 1 : 0.45} />}
            </g>
          );
        })}
        <text x={pad.l} y={H - 6} fontSize="10" fill="var(--muted, #8B93B5)">{data[0]?.x.slice(5)}</text>
        <text x={W - pad.r} y={H - 6} fontSize="10" textAnchor="end" fill="var(--muted, #8B93B5)">{data.at(-1)?.x.slice(5)}</text>
      </svg>
    </figure>
  );
}
