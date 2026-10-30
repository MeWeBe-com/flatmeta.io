'use client';

import { useState } from 'react';

/**
 * Single-series daily bar chart (title names the series, so no legend).
 * One hue, 4px rounded tops anchored to the baseline, 2px gaps, recessive axis,
 * per-bar hover tooltip, and an sr-only table for screen readers.
 */
export function DailyBars({ title, data, days = 14, format = (v: number) => String(v), color = 'var(--color-teal)' }: { title: string; data: { day: string; value: number }[]; days?: number; format?: (v: number) => string; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [now] = useState(() => Date.now());
  const series: { day: string; value: number }[] = [];
  const byDay = new Map(data.map((d) => [d.day, d.value]));
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400_000).toISOString().slice(0, 10);
    series.push({ day: d, value: byDay.get(d) ?? 0 });
  }
  const max = Math.max(1, ...series.map((s) => s.value));
  const W = 420;
  const H = 120;
  const gap = 2;
  const bw = W / series.length - gap;
  const total = series.reduce((s, x) => s + x.value, 0);
  return (
    <figure className="surface p-5">
      <figcaption className="flex items-baseline justify-between mb-3">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs muted">{format(total)} in {days} days</span>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full h-auto" role="img" aria-label={`${title}, last ${days} days`}>
          <line x1={0} x2={W} y1={H} y2={H} stroke="var(--line-strong)" strokeWidth={1} />
          {series.map((s, i) => {
            const h = s.value ? Math.max(3, (s.value / max) * (H - 8)) : 0;
            const x = i * (bw + gap);
            const r = Math.min(4, bw / 2, h);
            return (
              <g key={s.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={x} y={0} width={bw + gap} height={H} fill="transparent" />
                {h > 0 && <path d={`M${x},${H} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z`} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />}
                {(i === 0 || i === series.length - 1) && <text x={i === 0 ? x : x + bw} y={H + 14} textAnchor={i === 0 ? 'start' : 'end'} fontSize="10" fill="var(--text-muted)">{s.day.slice(5)}</text>}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="absolute -top-2 glass rounded-lg px-2 py-1 text-xs pointer-events-none" style={{ left: `${((hover + 0.5) / series.length) * 100}%`, transform: 'translate(-50%, -100%)' }}>
            <div className="muted">{series[hover]!.day}</div>
            <div className="font-semibold">{format(series[hover]!.value)}</div>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>{series.map((s) => <tr key={s.day}><th>{s.day}</th><td>{format(s.value)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
