'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Hand, Heart, Map as MapIcon, Pencil, Share2, Sparkles, Flag, Megaphone } from 'lucide-react';
import { ApiError, del, post } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { GameResult, Plot } from '@/lib/types';
import { useGame, useSession } from '../providers';
import { Modal, Spinner, clsx } from '../ui';
import { shareLinks, sharePlot } from '../world/share';

export function PlotActions({ plot: initial }: { plot: Plot }) {
  const [plot, setPlot] = useState(initial);
  const { me, openSignIn } = useSession();
  const { handleGame, toast } = useGame();
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState('');
  const [canEdit, setCanEdit] = useState(initial.canEdit);

  // Record the visit and refresh viewer-specific fields (liked, canEdit) client-side.
  useEffect(() => {
    post<{ game: GameResult | null }>(`/plots/${initial.id}/visit`).then((r) => handleGame(r.game)).catch(() => undefined);
    fetch(`/api/v1/plots/${initial.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { plot: Plot } | null) => {
        if (d) {
          setPlot((p) => ({ ...p, likedByMe: d.plot.likedByMe, likesCount: d.plot.likesCount }));
          setCanEdit(d.plot.canEdit);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id, me.user?.id]);

  const auth = (reason: string, fn: () => void) => (me.user ? fn() : openSignIn(reason, fn));
  const like = () =>
    auth('Sign in to like plots and earn XP.', async () => {
      setBusy('like');
      try {
        if (plot.likedByMe) {
          const r = await del<{ likesCount: number }>(`/plots/${plot.id}/like`);
          setPlot({ ...plot, likedByMe: false, likesCount: r.likesCount });
        } else {
          const r = await post<{ likesCount: number; game: GameResult }>(`/plots/${plot.id}/like`);
          setPlot({ ...plot, likedByMe: true, likesCount: r.likesCount });
          handleGame(r.game);
        }
      } finally {
        setBusy(null);
      }
    });
  const wave = () =>
    auth('Sign in to wave at your neighbours.', async () => {
      setBusy('wave');
      try {
        const r = await post<{ waved: boolean; message?: string; game: GameResult | null }>(`/plots/${plot.id}/wave`);
        toast({ kind: r.waved ? 'success' : 'info', title: r.waved ? `You waved at ${plot.title} 👋` : r.message ?? 'Already waved today' });
        handleGame(r.game);
      } catch (e) {
        toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not wave' });
      } finally {
        setBusy(null);
      }
    });
  const sendReport = async () => {
    await post(`/plots/${plot.id}/report`, { reason }).catch(() => undefined);
    setReport(false);
    setReason('');
    toast({ kind: 'success', title: 'Thanks, our moderators will take a look.' });
  };
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(location.origin), []);
  const links = shareLinks(`${origin}/p/${plot.slug}`, `${plot.title} on FlatMeta`);

  return (
    <div className="surface p-5 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={like} disabled={busy === 'like'} className={clsx('btn-ghost', plot.likedByMe && 'text-[var(--color-coral)] border-[rgb(255_107_107/.4)]')}>
          {busy === 'like' ? <Spinner /> : <Heart size={16} fill={plot.likedByMe ? 'currentColor' : 'none'} />} {plot.likesCount} {plot.likedByMe ? t('plot.liked') : t('plot.like')}
        </button>
        {plot.kind !== 'showcase' && !canEdit ? (
          <button onClick={wave} disabled={busy === 'wave'} className="btn-ghost">
            {busy === 'wave' ? <Spinner /> : <Hand size={16} />} {t('plot.wave')}
          </button>
        ) : plot.kind === 'showcase' ? (
          <Link href={`/claim/${plot.slug}`} className="btn-gold">Claim it</Link>
        ) : (
          <Link href={`/dashboard/plots/${plot.id}`} className="btn-ghost"><Pencil size={16} /> Edit</Link>
        )}
        <button onClick={() => void sharePlot(plot, me.user ? handleGame : undefined)} className="btn-ghost">
          <Share2 size={16} /> {t('plot.share')}
        </button>
        <Link href={`/?plot=${plot.slug}`} className="btn-ghost"><MapIcon size={16} /> {t('plot.showOnMap')}</Link>
      </div>
      <div className="flex justify-center gap-4 text-xs muted">
        <a href={links.x} target="_blank" rel="noopener" className="hover:text-[var(--text)]">X</a>
        <a href={links.facebook} target="_blank" rel="noopener" className="hover:text-[var(--text)]">Facebook</a>
        <a href={links.linkedin} target="_blank" rel="noopener" className="hover:text-[var(--text)]">LinkedIn</a>
        <a href={links.whatsapp} target="_blank" rel="noopener" className="hover:text-[var(--text)]">WhatsApp</a>
      </div>
      {canEdit && (
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/dashboard/plots/${plot.id}`} className="btn-gold"><Pencil size={16} /> {t('plot.edit')}</Link>
          <Link href={`/dashboard/plots/${plot.id}?designer=1`} className="btn-ghost"><Sparkles size={16} /> AI Designer</Link>
          <Link href={`/dashboard/plots/${plot.id}?tab=boost`} className="btn-ghost col-span-2"><Megaphone size={16} /> Spotlight this plot</Link>
        </div>
      )}
      <button className="text-xs muted inline-flex items-center gap-1 hover:text-[var(--text)]" onClick={() => setReport(true)}>
        <Flag size={12} /> {t('plot.report')}
      </button>
      <Modal open={report} onClose={() => setReport(false)} title="Report this plot">
        <p className="text-sm muted mb-3">Tell us what's wrong. Reports are confidential.</p>
        <textarea className="input" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. offensive image, scam link, impersonation…" />
        <button className="btn-danger w-full mt-3" disabled={reason.trim().length < 3} onClick={() => void sendReport()}>Send report</button>
      </Modal>
    </div>
  );
}
