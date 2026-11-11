'use client';

import Link from 'next/link';
import { OpenHouses } from '../plot/open-houses';
import { useEffect, useState } from 'react';
import { ExternalLink, Hand, Heart, Share2, X, MapPin, Sparkles, Pencil, Eye } from 'lucide-react';
import { ApiError, api, del, post } from '@/lib/api';
import { compact, flag, TIER_COLOR, TIER_LABEL } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { GameResult, Plot } from '@/lib/types';
import { useGame, useSession } from '../providers';
import { Avatar, KindChip, Spinner, clsx } from '../ui';
import { sharePlot } from './share';

export function PlotSheet({ plotId, onClose, onFocus }: { plotId: string; onClose: () => void; onFocus: (p: Plot) => void }) {
  const [plot, setPlot] = useState<Plot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { me, openSignIn } = useSession();
  const { handleGame, toast } = useGame();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setPlot(null);
    setError(null);
    api<{ plot: Plot }>(`/plots/${plotId}`)
      .then((r) => {
        if (!alive) return;
        setPlot(r.plot);
        post<{ game: GameResult | null }>(`/plots/${r.plot.id}/visit`).then((v) => handleGame(v.game)).catch(() => undefined);
      })
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Could not load this plot'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotId]);

  const requireAuth = (reason: string, fn: () => void) => (me.user ? fn() : openSignIn(reason, fn));

  const like = () =>
    requireAuth('Sign in to like plots and earn XP.', async () => {
      if (!plot) return;
      setBusy('like');
      try {
        const r = plot.likedByMe ? await del<{ likesCount: number }>(`/plots/${plot.id}/like`) : await post<{ likesCount: number; game: GameResult }>(`/plots/${plot.id}/like`);
        setPlot({ ...plot, likedByMe: !plot.likedByMe, likesCount: r.likesCount });
        if ('game' in r) handleGame(r.game as GameResult);
      } finally {
        setBusy(null);
      }
    });

  const wave = () =>
    requireAuth('Sign in to wave at your neighbours.', async () => {
      if (!plot) return;
      setBusy('wave');
      try {
        const r = await post<{ waved: boolean; message?: string; game: GameResult | null }>(`/plots/${plot.id}/wave`);
        if (r.waved) toast({ kind: 'success', title: `You waved at ${plot.title} 👋` });
        else toast({ kind: 'info', title: r.message ?? 'Already waved today' });
        handleGame(r.game);
      } catch (e) {
        toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not wave' });
      } finally {
        setBusy(null);
      }
    });

  return (
    <aside
      className="absolute z-30 glass animate-rise overflow-hidden flex flex-col
        inset-x-0 bottom-0 max-h-[78vh] rounded-t-3xl
        md:inset-auto md:left-4 md:top-20 md:bottom-4 md:w-[400px] md:max-h-none md:rounded-3xl"
      aria-label="Plot details"
    >
      <button className="icon-btn absolute right-3 top-3 z-10 bg-black/40" onClick={onClose} aria-label="Close">
        <X size={18} />
      </button>
      {!plot && !error && (
        <div className="p-5 space-y-3">
          <div className="skeleton aspect-[3/2]" />
          <div className="skeleton h-6 w-2/3" />
          <div className="skeleton h-4 w-full" />
        </div>
      )}
      {error && <div className="p-6 text-sm text-[var(--color-coral)]">{error}</div>}
      {plot && (
        <div className="overflow-y-auto">
          <div className={clsx('relative aspect-[3/2] bg-[var(--color-night-3)]')}>
            {plot.coverImageUrl && <img src={plot.coverImageUrl} alt="" className="size-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[rgb(11_16_32/.95)] via-transparent to-transparent" />
            <div className="absolute left-4 top-4 flex gap-1.5">
              <KindChip plot={plot} />
              {plot.spotlight && <span className="chip chip-gold">Spotlight</span>}
            </div>
            <div className="absolute left-4 right-4 bottom-3">
              <h2 className="text-2xl font-bold leading-tight text-white drop-shadow">{plot.title}</h2>
              {plot.tagline && <p className="text-sm text-white/80 mt-1 line-clamp-2">{plot.tagline}</p>}
            </div>
          </div>

          <div className="p-5 space-y-4">
            {plot.showcase && (
              <div className="rounded-2xl p-3 text-xs border border-[rgb(255_201_77/.35)] bg-[rgb(255_201_77/.08)]">
                <div className="font-semibold text-[var(--color-gold)] mb-1">{t('plot.showcaseTitle')}</div>
                <p className="muted">{t('plot.showcaseNote', { brand: plot.showcase.brand })}</p>
                <div className="flex gap-3 mt-2">
                  <Link href={`/claim/${plot.slug}`} className="font-semibold text-[var(--color-gold)] underline">{t('plot.claimIt')}</Link>
                  <Link href={`/claim/${plot.slug}?takedown=1`} className="muted underline">{t('plot.requestRemoval')}</Link>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 text-sm">
              {plot.owner ? (
                <Link href={plot.owner.type === 'org' ? `/o/${plot.owner.handle}` : `/u/${plot.owner.handle}`} className="flex items-center gap-2 min-w-0">
                  <Avatar name={plot.owner.displayName} url={plot.owner.avatarUrl} size={30} level={plot.owner.level} />
                  <span className="truncate">
                    <span className="muted">{t('plot.ownedBy')} </span>
                    <span className="font-semibold">{plot.owner.displayName}</span>
                    {plot.owner.verified && <span className="ml-1 text-[var(--color-teal)]">✓</span>}
                  </span>
                </Link>
              ) : (
                <span className="muted">{plot.showcase ? plot.showcase.useCase : 'Unclaimed'}</span>
              )}
              <span className="ml-auto shrink-0" title={plot.countryName ?? 'Ocean'}>
                {flag(plot.countryCode)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="surface py-2"><div className="font-display text-lg font-bold">{compact(plot.likesCount)}</div><div className="muted">likes</div></div>
              <div className="surface py-2"><div className="font-display text-lg font-bold">{compact(plot.visitsCount)}</div><div className="muted">visits</div></div>
              <div className="surface py-2">
                <div className="font-display text-lg font-bold" style={{ color: TIER_COLOR[plot.tier] }}>{plot.width}×{plot.height}</div>
                <div className="muted">{TIER_LABEL[plot.tier]} tier</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={like} disabled={busy === 'like'} className={clsx('btn-ghost', plot.likedByMe && 'text-[var(--color-coral)] border-[rgb(255_107_107/.4)]')}>
                <Heart size={16} fill={plot.likedByMe ? 'currentColor' : 'none'} /> {plot.likedByMe ? t('plot.liked') : t('plot.like')}
              </button>
              {!plot.canEdit && plot.kind !== 'showcase' && (
                <button onClick={wave} disabled={busy === 'wave'} className="btn-ghost">
                  {busy === 'wave' ? <Spinner /> : <Hand size={16} />} {t('plot.wave')}
                </button>
              )}
              <button onClick={() => void sharePlot(plot, me.user ? (g) => handleGame(g) : undefined)} className="btn-ghost">
                <Share2 size={16} /> {t('plot.share')}
              </button>
              <button onClick={() => onFocus(plot)} className="btn-ghost" aria-label={t('plot.showOnMap')}>
                <MapPin size={16} />
              </button>
            </div>

            <OpenHouses plotId={plot.id} compact />

            {plot.cta && (
              <a href={plot.cta.url} target="_blank" rel="noopener nofollow" className="btn-primary w-full btn-lg">
                {plot.cta.label} <ExternalLink size={16} />
              </a>
            )}

            <div className="flex gap-2">
              <Link href={`/p/${plot.slug}`} className="btn-ghost flex-1">
                <Eye size={16} /> Open page
              </Link>
              {plot.canEdit && (
                <Link href={`/dashboard/plots/${plot.id}`} className="btn-gold flex-1">
                  <Pencil size={16} /> {t('plot.edit')}
                </Link>
              )}
              {plot.canEdit && (
                <Link href={`/dashboard/plots/${plot.id}?designer=1`} className="btn-ghost" aria-label="AI Designer">
                  <Sparkles size={16} />
                </Link>
              )}
            </div>

            {plot.descriptionHtml && <div className="prose-plot text-sm line-clamp-6" dangerouslySetInnerHTML={{ __html: plot.descriptionHtml }} />}
            <p className="text-[11px] muted">
              {t('plot.address')}: <span className="font-mono">{plot.threeWords}</span>
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
