'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { post } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { GameResult } from '@/lib/types';
import { useGame, useSession } from '../providers';

const STEPS = [
  { target: null, title: 'tour.s1t', body: 'tour.s1b' },
  { target: 'search', title: 'tour.s2t', body: 'tour.s2b' },
  { target: 'quests', title: 'tour.s3t', body: 'tour.s3b' },
  { target: 'claim', title: 'tour.s4t', body: 'tour.s4b' },
];
const KEY = 'fm-tour-done';

export function useTourState() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setTimeout(() => setOpen(true), 1600);
    } catch {
      /* ignore */
    }
  }, []);
  return { open, start: () => setOpen(true), close: () => setOpen(false) };
}

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const { me } = useSession();
  const { handleGame } = useGame();
  const step = STEPS[i]!;

  useLayoutEffect(() => {
    if (!open) return;
    const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [open, i, step.target]);
  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  if (!open) return null;
  const finish = async () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    onClose();
    if (me.user) {
      const r = await post<{ game: GameResult }>('/me/tour').catch(() => null);
      handleGame(r?.game);
    }
  };
  const pad = 8;
  const boxStyle = rect
    ? { left: Math.min(window.innerWidth - 336, Math.max(16, rect.left)), top: rect.bottom + 14 > window.innerHeight - 200 ? Math.max(16, rect.top - 190) : rect.bottom + 14 }
    : { left: '50%', top: '42%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="fixed inset-0 z-[58]" role="dialog" aria-label="Guided tour">
      <div className="absolute inset-0 bg-black/45" onClick={() => void finish()} />
      {rect && (
        <div
          className="absolute rounded-2xl pointer-events-none"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgb(0 0 0 / .45), 0 0 0 2px var(--color-teal)' }}
        />
      )}
      <div className="absolute w-80 card p-5 animate-pop" style={boxStyle}>
        <div className="text-[11px] uppercase tracking-wider text-[var(--color-teal)] font-semibold">Step {i + 1} of {STEPS.length}</div>
        <h3 className="text-lg font-bold mt-1">{t(step.title)}</h3>
        <p className="text-sm muted mt-1">{t(step.body)}</p>
        <div className="flex items-center gap-2 mt-4">
          <button className="text-xs muted underline" onClick={() => void finish()}>{t('tour.skip')}</button>
          <button className="btn-primary btn-sm ml-auto" onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : void finish())}>
            {i < STEPS.length - 1 ? t('tour.next') : t('tour.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
