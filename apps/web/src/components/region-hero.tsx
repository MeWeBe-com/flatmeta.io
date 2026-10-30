import Link from 'next/link';
import { Compass } from 'lucide-react';
import { compact } from '@/lib/format';

export function RegionHero({ flag, kicker, title, intro, stats, mapHref, bg }: { flag: string; kicker: string; title: string; intro: string; stats: { label: string; value: number }[]; mapHref: string; bg?: string | null }) {
  return (
    <header className="relative overflow-hidden rounded-[28px] p-8 md:p-12 min-h-[300px] flex flex-col justify-end" style={{ background: 'radial-gradient(120% 120% at 80% 0%, rgb(139 124 255 / .35), transparent 50%), radial-gradient(120% 120% at 0% 100%, rgb(45 226 196 / .25), transparent 50%), var(--color-night-2)' }}>
      {bg && <img src={bg} alt="" className="absolute inset-0 size-full object-cover opacity-30" />}
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-night)] via-transparent to-transparent" />
      <div className="relative">
        <div className="text-sm font-semibold text-[var(--color-teal)] uppercase tracking-widest">{kicker}</div>
        <h1 className="text-4xl md:text-6xl font-bold mt-2 flex items-center gap-4"><span>{flag}</span>{title}</h1>
        <p className="muted max-w-2xl mt-3 text-lg">{intro}</p>
        <div className="flex flex-wrap gap-6 mt-6">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="font-display text-3xl font-bold">{compact(s.value)}</div>
              <div className="text-xs muted uppercase tracking-wide">{s.label}</div>
            </div>
          ))}
          <Link href={mapHref} className="btn-primary btn-lg ml-auto self-center"><Compass size={18} /> Claim land here</Link>
        </div>
      </div>
    </header>
  );
}
