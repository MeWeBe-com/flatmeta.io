'use client';
import { useEffect } from 'react';
import { post } from '@/lib/api';
import type { GameResult } from '@/lib/types';
import { useGame, useSession } from './providers';

/** Records a country/region visit (for XP + quests) once the viewer is known. */
export function VisitTracker({ path }: { path: string }) {
  const { me } = useSession();
  const { handleGame } = useGame();
  useEffect(() => {
    if (!me.user) return;
    post<{ game: GameResult | null }>(path).then((r) => handleGame(r.game)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.user?.id, path]);
  return null;
}
