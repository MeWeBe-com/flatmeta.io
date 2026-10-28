'use client';
import { post } from '@/lib/api';
import { SITE_URL } from '@/lib/config';
import type { GameResult, Plot } from '@/lib/types';

/** Native share sheet when available, otherwise copy the link. Records the share for XP/quests when signed in. */
export async function sharePlot(plot: Pick<Plot, 'id' | 'slug' | 'title' | 'tagline'>, onGame?: (g: GameResult | null) => void) {
  const url = `${typeof window !== 'undefined' ? location.origin : SITE_URL}/p/${plot.slug}`;
  let channel = 'copy';
  try {
    if (navigator.share) {
      await navigator.share({ title: `${plot.title} on FlatMeta`, text: plot.tagline ?? 'A plot on the world map you can own a piece of', url });
      channel = 'native';
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copied!');
    }
  } catch {
    return;
  }
  if (onGame) {
    const r = await post<{ game: GameResult | null }>('/me/share', { plotId: plot.id, channel }).catch(() => null);
    onGame(r?.game ?? null);
  }
}

export function shareLinks(url: string, text: string) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  return {
    x: `https://twitter.com/intent/tweet?url=${u}&text=${t}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    whatsapp: `https://wa.me/?text=${t}%20${u}`,
  };
}
