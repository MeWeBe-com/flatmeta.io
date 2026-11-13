'use client';

import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { post } from '@/lib/api';
import { SITE_URL } from '@/lib/config';
import type { GameResult, Plot } from '@/lib/types';
import { shareLinks } from './world/share';
import { useGame, useSession } from './providers';

/** The friendly link for a plot: flatmeta.io/@handle/plot-slug when it has an owner, else /p/slug (G5). */
export function plotShareUrl(plot: Pick<Plot, 'slug' | 'owner'>): string {
  return plot.owner?.handle ? `${SITE_URL}/@${plot.owner.handle}/${plot.slug}` : `${SITE_URL}/p/${plot.slug}`;
}

/**
 * Copy link, the native share sheet, and WhatsApp / X / Facebook / LinkedIn (G5). Shares by signed-in players are
 * recorded for XP and quests. Links open in a new tab without passing a referrer or opener.
 */
export function SharePanel({ url, text, plotId, compact = false }: { url: string; text: string; plotId?: string; compact?: boolean }) {
  const { me } = useSession();
  const { toast, handleGame } = useGame();
  const [copied, setCopied] = useState(false);
  const record = (channel: string) => {
    if (!me.user || !plotId) return;
    void post<{ game: GameResult | null }>('/me/share', { plotId, channel })
      .then((r) => handleGame(r.game))
      .catch(() => undefined);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ kind: 'success', title: 'Link copied' });
      record('copy');
    } catch {
      toast({ kind: 'error', title: 'Could not copy. Select the link and copy it.' });
    }
  };
  const native = async () => {
    try {
      await navigator.share({ title: text, url });
      record('native');
    } catch {
      /* cancelled */
    }
  };
  const links = shareLinks(url, text);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <div className="space-y-2" aria-label="Share">
      <div className="flex gap-2">
        <input className="input flex-1 min-w-0 text-xs font-mono" value={url} readOnly aria-label="Link to share" onFocus={(e) => e.currentTarget.select()} />
        <button className="btn-ghost btn-sm" onClick={() => void copy()} aria-label="Copy link">
          {copied ? <Check size={14} /> : <Copy size={14} />} {compact ? '' : copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      {/* M5: real buttons (44 px on touch screens), the phone's own share sheet first. */}
      <div className="flex flex-wrap gap-2">
        {canShare && (
          <button className="btn-primary btn-sm" onClick={() => void native()} aria-label="Share…">
            <Share2 size={14} /> Share
          </button>
        )}
        {([['WhatsApp', links.whatsapp, 'whatsapp'], ['X', links.x, 'x'], ['Facebook', links.facebook, 'facebook'], ['LinkedIn', links.linkedin, 'linkedin']] as const).map(([label, href, ch]) => (
          <a key={ch} href={href} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm" aria-label={`Share on ${label}`} onClick={() => record(ch)}>
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
