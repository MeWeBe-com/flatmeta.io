import Link from 'next/link';
import { t } from '@/lib/i18n';

type Stats = { plots: number; showcase: number; countries: number; explorers: number } | null;

/**
 * The home page's first screen (M2). Rendered on the server, so phones see the headline, the numbers and real links
 * as soon as the HTML arrives, before any JavaScript runs; the interactive map loads after it and replaces it.
 * No hooks and no client APIs: it is also the Suspense fallback, and the backdrop while MapLibre starts (`behind`).
 */
export function HomeFirstPaint({ stats, behind = false }: { stats: Stats; behind?: boolean }) {
  const n = (x: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(x);
  return (
    // Behind the map controls it is decoration only (no links, not tappable, hidden from assistive tech), but it keeps the same headline
    // in the same place, so the first screen doesn't flash empty between the HTML and the map.
    <div className="fixed inset-0 overflow-hidden bg-[var(--bg)]" data-testid="home-first-paint" aria-hidden={behind || undefined} style={behind ? { pointerEvents: 'none', userSelect: 'none' } : undefined}>
      {/* A faint world grid instead of an empty navy rectangle. */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 50% 45%, rgb(45 226 196 / .16), transparent 60%), linear-gradient(rgb(45 226 196 / .07) 1px, transparent 1px), linear-gradient(90deg, rgb(45 226 196 / .07) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 48px 48px, 48px 48px',
        }}
      />
        <div className="relative h-full grid place-items-center px-4 text-center">
          <div className="max-w-xl">
            {behind ? (
              <p className="font-display font-bold text-3xl sm:text-5xl leading-tight">{t('app.tagline')}</p>
            ) : (
              <h1 className="font-display font-bold text-3xl sm:text-5xl leading-tight">{t('app.tagline')}</h1>
            )}
            <p className="muted mt-3 text-base sm:text-lg">Explore glowing plots around the globe, meet people nearby, and claim your own land. Your first plot is free.</p>
            {stats && (
              <p className="mt-4 text-sm muted">
                {n(stats.plots + stats.showcase)} plots · {stats.countries} countries · {n(stats.explorers)} explorers
              </p>
            )}
            {!behind && (
            <nav className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Start here">
              <Link href="/explore" className="btn-primary min-h-11">Explore places</Link>
              <Link href="/brands" className="btn-ghost min-h-11">Companies on the map</Link>
              <Link href="/pricing" className="btn-ghost min-h-11">Pricing</Link>
            </nav>
            )}
            <p className="mt-6 text-xs muted" role="status">Loading the live map…</p>
          </div>
        </div>
    </div>
  );
}
