'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gift, Lightbulb, MousePointer2, ZoomIn, X, Sparkles, ShoppingCart } from 'lucide-react';
import { ApiError, post } from '@/lib/api';
import { TIER_COLOR, TIER_LABEL, flag, usd } from '@/lib/format';
import type { Rect } from '@/lib/grid';
import { t } from '@/lib/i18n';
import type { GameResult, Plot, Quote } from '@/lib/types';
import { useAfterSignIn, useGame, useSession } from '../providers';
import { Spinner, clsx } from '../ui';
import type { SelectionState } from '../map/world-map';

interface Suggestion { rect: Rect; center: { lat: number; lng: number }; near: string; neighbours: number; reason: string; quote: Quote }

export function ClaimPanel({
  selection,
  zoom,
  onClose,
  onState,
  onClaimed,
  onPick,
  onZoomIn,
  initialTitle,
}: {
  selection: Rect | null;
  zoom: number;
  onClose: () => void;
  onState: (s: SelectionState) => void;
  onClaimed: (plot: Plot) => void;
  onPick: (s: Suggestion) => void;
  onZoomIn: () => void;
  initialTitle?: string;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(initialTitle ?? '');
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [goal, setGoal] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const { me, openSignIn } = useSession();
  const { handleGame, confetti, toast } = useGame();
  const router = useRouter();
  const seq = useRef(0);
  const touch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    if (!selection) {
      setQuote(null);
      onState('idle');
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    onState('checking');
    const tm = setTimeout(async () => {
      try {
        const r = await post<{ quote: Quote }>('/plots/quote', selection);
        if (id !== seq.current) return;
        setQuote(r.quote);
        onState(r.quote.conflicts.length || r.quote.tooLarge ? 'conflict' : r.quote.free ? 'free' : r.quote.available ? 'ok' : 'invalid');
      } catch {
        if (id === seq.current) onState('invalid');
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.minGx, selection?.minGy, selection?.maxGx, selection?.maxGy, me.user?.id]);

  const [afterSignIn, signedInGo] = useAfterSignIn();
  const claim = async () => {
    if (!selection || !quote) return;
    if (!me.user) return openSignIn(quote.free ? 'Sign in to claim your free Homestead. It takes 20 seconds.' : 'Sign in to buy this land.', afterSignIn);
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ plot?: Plot; game?: GameResult; checkoutUrl?: string }>('/plots/claim', { rect: selection, ...(title.trim().length >= 2 ? { title: title.trim() } : {}) });
      if (r.checkoutUrl) {
        window.location.assign(r.checkoutUrl);
        return;
      }
      if (r.plot) {
        confetti();
        handleGame(r.game);
        toast({ kind: 'success', title: `${r.plot.title} is yours!`, body: 'Plot claimed' });
        onClaimed(r.plot);
        router.push(`/dashboard/plots/${r.plot.id}?welcome=1&designer=1`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not claim this land');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (signedInGo) void claim(); // the claim the visitor started before signing in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInGo]);

  const suggest = async () => {
    if (!goal.trim()) return;
    setSuggesting(true);
    try {
      const r = await post<{ suggestions: Suggestion[] }>('/ai/suggest-plots', { goal, size: 2 });
      setSuggestions(r.suggestions);
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'No suggestions right now' });
    } finally {
      setSuggesting(false);
    }
  };

  const needZoom = zoom < 13.5;

  return (
    <div className="absolute z-30 inset-x-3 bottom-3 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[460px] glass rounded-3xl p-4 animate-rise" role="dialog" aria-label={t('claim.title')}>
      <div className="flex items-center gap-2 mb-3">
        <span className="size-8 rounded-xl grid place-items-center bg-[rgb(45_226_196/.12)] text-[var(--color-teal)]">
          <MousePointer2 size={16} />
        </span>
        <h2 className="font-display font-bold text-lg">{t('claim.title')}</h2>
        <button className="icon-btn ml-auto size-8" onClick={onClose} aria-label={t('claim.cancel')}>
          <X size={16} />
        </button>
      </div>

      {needZoom ? (
        <div className="space-y-3">
          <p className="text-sm muted">{t('claim.zoomIn')}</p>
          <button className="btn-primary w-full" onClick={onZoomIn}>
            <ZoomIn size={16} /> Zoom to cell level
          </button>
        </div>
      ) : !selection ? (
        <p className="text-sm muted">{touch ? t('claim.hintTouch') : t('claim.hint')}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">
                {quote ? `${quote.width}×${quote.height} · ${t('claim.cells', { count: quote.cells })}` : `${selection.maxGx - selection.minGx + 1}×${selection.maxGy - selection.minGy + 1}`}
                {quote && <span className="ml-2">{flag(quote.countryCode)}</span>}
              </div>
              {quote && (
                <div className="text-xs mt-0.5" style={{ color: TIER_COLOR[quote.tier] }}>
                  {t('claim.tier', { label: TIER_LABEL[quote.tier] ?? quote.tier })} · {usd(quote.unitCents)}/cell{quote.regionSlug ? ` · near ${quote.regionSlug.replace(/-/g, ' ')}` : ''}
                </div>
              )}
            </div>
            <div className="text-right">
              {loading || !quote ? (
                <Spinner />
              ) : quote.free ? (
                <div className="font-display text-xl font-bold text-[var(--color-gold)] flex items-center gap-1"><Gift size={18} /> Free</div>
              ) : (
                <div className="font-display text-xl font-bold">{usd(quote.totalCents)}</div>
              )}
            </div>
          </div>
          {quote?.free && <p className="text-xs rounded-xl px-3 py-2 bg-[rgb(255_201_77/.1)] text-[var(--color-gold)]">{t('claim.freeExplain')}</p>}
          {quote && quote.reasons.length > 0 && <p className="text-xs rounded-xl px-3 py-2 bg-[rgb(255_107_107/.1)] text-[var(--color-coral)]">{quote.reasons.join(' ')}</p>}
          <input className="input" placeholder="Name your plot (you can change it later)" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          {error && <p className="text-sm text-[var(--color-coral)]">{error}</p>}
          <button className={clsx('w-full btn-lg', quote?.free ? 'btn-gold' : 'btn-primary')} disabled={!quote || !quote.available || busy || loading} onClick={() => void claim()}>
            {busy ? <Spinner /> : quote?.free ? <Gift size={18} /> : <ShoppingCart size={18} />}
            {quote?.free ? t('claim.claimFree') : quote ? t('claim.buy', { price: usd(quote.totalCents) }) : t('claim.checking')}
          </button>
        </div>
      )}

      <details className="mt-3 group">
        <summary className="text-xs muted cursor-pointer inline-flex items-center gap-1.5 hover:text-[var(--text)]">
          <Lightbulb size={14} /> {t('claim.suggest')}
        </summary>
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <input className="input h-10" placeholder="e.g. a visible spot for my café in Lisbon" value={goal} onChange={(e) => setGoal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void suggest()} />
            <button className="btn-ghost h-10" onClick={() => void suggest()} disabled={suggesting}>
              {suggesting ? <Spinner /> : <Sparkles size={16} />}
            </button>
          </div>
          {suggestions?.map((s, i) => (
            <button key={i} className="w-full text-left surface p-3 hover:border-[var(--color-teal)] transition" onClick={() => onPick(s)}>
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Near {s.near}</span>
                <span style={{ color: TIER_COLOR[s.quote.tier] }}>{s.quote.free ? 'Free' : usd(s.quote.totalCents)}</span>
              </div>
              <p className="text-xs muted mt-1">{s.reason}</p>
            </button>
          ))}
          {suggestions && !suggestions.length && <p className="text-xs muted">No free spots found for that. Try another goal.</p>}
        </div>
      </details>
    </div>
  );
}

export type { Suggestion };
