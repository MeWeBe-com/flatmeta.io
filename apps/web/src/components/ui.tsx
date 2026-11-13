'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import { BookOpen, Binoculars, Brush, Building2, CalendarCheck, Castle, Compass, Crown, Eye, Flag, Flame, Gem, Globe, Grid3x3, Hand, Heart, HeartHandshake, Home, Landmark, Map as MapIcon, Moon, Palette, PenLine, Plane, Rocket, Share2, Sparkles, Star, Stars, Store, Sun, TrendingUp, Trophy, UserPlus, Users, X, type LucideIcon } from 'lucide-react';
import { compact, flag } from '@/lib/format';
import type { Plot } from '@/lib/types';

export { clsx };

export function Logo({ size = 28, withText = true, className }: { size?: number; withText?: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2 font-display font-bold tracking-tight', className)}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2DE2C4" />
            <stop offset="0.6" stopColor="#8B7CFF" />
            <stop offset="1" stopColor="#FFC94D" />
          </linearGradient>
        </defs>
        <path d="M32 6 L58 21 L32 36 L6 21 Z" fill="url(#lg)" />
        <path d="M6 21 L32 36 L32 58 L6 43 Z" fill="#1B2550" />
        <path d="M58 21 L32 36 L32 58 L58 43 Z" fill="#121A38" />
        <path d="M19 13.5 L45 28.5 M32 6 L32 36 M45 13.5 L19 28.5" stroke="#0B1020" strokeOpacity=".35" strokeWidth="1.5" />
      </svg>
      {withText && <span style={{ fontSize: size * 0.68 }}>FlatMeta</span>}
    </span>
  );
}

const PALETTE = ['#2DE2C4', '#8B7CFF', '#FFC94D', '#FF6B6B', '#3FA9F5', '#F472B6', '#4ADE80'];
export function Avatar({ name, url, size = 36, level, className }: { name: string; url?: string | null; size?: number; level?: number; className?: string }) {
  const color = PALETTE[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length];
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className={clsx('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt="" className="size-full rounded-full object-cover" />
      ) : (
        <span className="size-full rounded-full grid place-items-center font-bold text-[#0b1020]" style={{ background: color, fontSize: size * 0.38 }}>
          {initials || '?'}
        </span>
      )}
      {level !== undefined && (
        <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-night)] border border-[var(--color-teal)] text-xs font-bold grid place-items-center text-[var(--color-teal)]">
          {level}
        </span>
      )}
    </span>
  );
}

export function LevelRing({ level, progress, size = 44 }: { level: number; progress: number; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }} aria-label={`Level ${level}`}>
      <svg width={size} height={size} className="-rotate-90 absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(255 255 255 / .12)" strokeWidth="4" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringg)"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0.02, Math.min(1, progress)))}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.2,.9,.3,1)' }}
        />
        <defs>
          <linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2DE2C4" />
            <stop offset="1" stopColor="#8B7CFF" />
          </linearGradient>
        </defs>
      </svg>
      <span className="font-display font-bold text-sm">{level}</span>
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx('inline-block size-4 rounded-full border-2 border-current border-r-transparent animate-spin', className)} aria-label="Loading" />;
}

/** Lucide icon by name (used for quests/achievements catalogue icons). */
// Named imports (not `import * as`) so only these icons are shipped, not the whole library.
const ICONS: Record<string, LucideIcon> = {
  flag: Flag, home: Home, grid: Grid3x3, castle: Castle, crown: Crown, sparkles: Sparkles, palette: Palette, rocket: Rocket, globe: Globe,
  plane: Plane, hand: Hand, book: BookOpen, heart: Heart, hearts: HeartHandshake, trending: TrendingUp, flame: Flame, moon: Moon,
  compass: Compass, gem: Gem, store: Store, landmark: Landmark, sun: Sun, users: Users, binoculars: Binoculars, pen: PenLine,
  share: Share2, trophy: Trophy, star: Star, stars: Stars, building: Building2, eye: Eye, calendar: CalendarCheck, brush: Brush,
  'user-plus': UserPlus, map: MapIcon,
};
export function NamedIcon({ name, className, size = 18 }: { name: string; className?: string; size?: number }) {
  const Cmp = ICONS[name] ?? Star;
  return <Cmp className={className} size={size} aria-hidden />;
}

export function Modal({ open, onClose, children, title, wide, className }: { open: boolean; onClose: () => void; children: ReactNode; title?: string; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,button,[tabindex]')?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[var(--z-modal)] grid place-items-end sm:place-items-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      {/* Tapping the backdrop closes too; it's not a second "Close" button for screen readers (that one is in the card). */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className={clsx('relative card w-full animate-rise p-6 max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-b-[var(--radius-card)]', wide ? 'sm:max-w-3xl' : 'sm:max-w-md', className)}>
        <button className="icon-btn absolute right-3 top-3" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        {title && <h2 className="text-xl font-bold mb-4 pr-10">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'compass', title, body, action }: { icon?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="surface p-10 text-center grid place-items-center gap-3">
      <span className="size-14 rounded-2xl grid place-items-center bg-[rgb(45_226_196/.1)] text-[var(--color-teal)]">
        <NamedIcon name={icon} size={26} />
      </span>
      <h3 className="text-lg font-semibold">{title}</h3>
      {body && <p className="muted max-w-sm text-sm">{body}</p>}
      {action}
    </div>
  );
}

export function KindChip({ plot }: { plot: Pick<Plot, 'kind' | 'business' | 'owner'> }) {
  if (plot.kind === 'showcase') return <span className="chip chip-gold">Showcase</span>;
  if (plot.kind === 'landmark') return <span className="chip chip-violet">Landmark</span>;
  if (plot.business) return <span className="chip chip-teal">Business</span>;
  if (plot.kind === 'homestead') return <span className="chip">Homestead</span>;
  return null;
}

export function PlotCard({ plot, compactView = false }: { plot: Plot; compactView?: boolean }) {
  return (
    <Link
      href={`/p/${plot.slug}`}
      className={clsx('group surface overflow-hidden flex flex-col transition hover:-translate-y-0.5 hover:border-[var(--line-strong)]', plot.spotlight && 'ring-1 ring-[var(--color-gold)]')}
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-[var(--color-night-3)]">
        {plot.coverImageUrl && <img src={plot.thumbUrl && compactView ? plot.thumbUrl : plot.coverImageUrl} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" />}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <KindChip plot={plot} />
          {plot.spotlight && <span className="chip chip-gold">Spotlight</span>}
        </div>
        <span className="absolute right-3 top-3 text-lg" title={plot.countryName ?? 'Ocean'}>
          {flag(plot.countryCode)}
        </span>
      </div>
      <div className="p-4 flex-1 flex flex-col gap-1">
        <h3 className="font-semibold leading-snug line-clamp-1">{plot.title}</h3>
        {!compactView && plot.tagline && <p className="muted text-sm line-clamp-2">{plot.tagline}</p>}
        <div className="mt-auto pt-2 flex items-center gap-3 text-xs muted">
          <span className="inline-flex items-center gap-1">
            <Heart size={13} /> {compact(plot.likesCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Eye size={13} /> {compact(plot.visitsCount)}
          </span>
          <span className="ml-auto truncate">{plot.owner?.displayName ?? plot.showcase?.city ?? ''}</span>
        </div>
      </div>
    </Link>
  );
}

export function PlotGrid({ plots, empty }: { plots: Plot[]; empty?: ReactNode }) {
  if (!plots.length) return <>{empty ?? null}</>;
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {plots.map((p) => (
        <PlotCard key={p.id} plot={p} />
      ))}
    </div>
  );
}

export function Stat({ label, value, icon }: { label: string; value: ReactNode; icon?: string }) {
  return (
    <div className="surface p-4 flex items-center gap-3">
      {icon && (
        <span className="size-10 rounded-xl grid place-items-center bg-white/5 text-[var(--color-teal)]">
          <NamedIcon name={icon} />
        </span>
      )}
      <div>
        <div className="text-xl font-display font-bold">{value}</div>
        <div className="text-xs muted">{label}</div>
      </div>
    </div>
  );
}

export function SectionTitle({ children, action, sub }: { children: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        <h2 className="text-2xl font-bold">{children}</h2>
        {sub && <p className="muted text-sm mt-1">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
