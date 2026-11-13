'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { post } from '@/lib/api';
import { t } from '@/lib/i18n';
import { placeTour, type Box, type TourPlacement } from '@/lib/tour-layout';
import type { GameResult } from '@/lib/types';
import { useGame, useSession } from '../providers';

const STEPS = [
  { target: null, title: 'tour.s1t', body: 'tour.s1b' },
  { target: 'search', title: 'tour.s2t', body: 'tour.s2b' },
  { target: 'quests', title: 'tour.s3t', body: 'tour.s3b' },
  { target: 'claim', title: 'tour.s4t', body: 'tour.s4b' },
] as const;
export const TOUR_KEY = 'fm-tour-done';

export function useTourState() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) {
        const id = setTimeout(() => setOpen(true), 1600);
        return () => clearTimeout(id);
      }
    } catch {
      /* ignore */
    }
  }, []);
  return { open, start: () => setOpen(true), close: () => setOpen(false) };
}

/** The first visible element marked data-tour="<name>" (the same control can exist in a desktop and a phone layout). */
function findTarget(name: string | null): Box | null {
  if (!name) return null;
  for (const el of document.querySelectorAll(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth) {
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
  }
  return null;
}

/**
 * The first-visit guided tour (M1). A modal: above every floating control (portal, --z-tour in globals.css), a dimmed backdrop with a
 * spotlight on the control each step is about, a counter, Back / Skip / Next (44 px), Esc to skip and the arrow keys
 * to move. Everything behind it is inert while it runs, and focus returns to where it was when it ends. Tapping outside the card does nothing, so the tour is never lost by accident; Skip is explicit. Phones get a
 * bottom (or top) sheet, larger screens a card clamped to the viewport; see lib/tour-layout.ts.
 */
export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [target, setTarget] = useState<Box | null>(null);
  const [place, setPlace] = useState<TourPlacement | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const { me } = useSession();
  const { handleGame } = useGame();
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  // Modal: the page behind is inert (no taps, no Tab, hidden from screen readers); focus comes back afterwards.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const behind = [...document.body.children].filter((el) => el instanceof HTMLElement && !el.contains(card.current) && !el.matches('script')) as HTMLElement[];
    const was = behind.map((el) => el.inert);
    behind.forEach((el) => (el.inert = true));
    return () => {
      behind.forEach((el, k) => (el.inert = was[k]!));
      const back = opener?.isConnected && opener !== document.body ? opener : document.querySelector<HTMLElement>('[data-tour-return]');
      back?.focus({ preventScroll: true });
    };
  }, [open]);

  const layout = useCallback(() => {
    if (!open) return;
    const box = findTarget(step.target);
    setTarget(box);
    setPlace(placeTour({ vw: innerWidth, vh: innerHeight, target: box, cardHeight: card.current?.scrollHeight ?? 220 }));
  }, [open, step.target]);

  useLayoutEffect(() => {
    layout();
    if (!open) return;
    // Recompute whenever the screen, the card or the target changes size (rotation, keyboard, panels loading).
    const vv = window.visualViewport;
    window.addEventListener('resize', layout);
    window.addEventListener('orientationchange', layout);
    window.addEventListener('scroll', layout, true);
    vv?.addEventListener('resize', layout);
    const ro = new ResizeObserver(() => layout());
    if (card.current) ro.observe(card.current);
    const t1 = setTimeout(layout, 300);
    return () => {
      window.removeEventListener('resize', layout);
      window.removeEventListener('orientationchange', layout);
      window.removeEventListener('scroll', layout, true);
      vv?.removeEventListener('resize', layout);
      ro.disconnect();
      clearTimeout(t1);
    };
  }, [layout, open, i]);

  const finish = useCallback(async () => {
    try {
      localStorage.setItem(TOUR_KEY, '1');
    } catch {
      /* ignore */
    }
    onClose();
    if (me.user) {
      const r = await post<{ game: GameResult }>('/me/tour').catch(() => null);
      handleGame(r?.game);
    }
  }, [onClose, me.user, handleGame]);
  const next = useCallback(() => (last ? void finish() : setI((n) => n + 1)), [last, finish]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  // Keyboard: Esc skips, → / ← move, Tab stays inside the card. Captured before the map's own shortcuts.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        void finish();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopImmediatePropagation();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopImmediatePropagation();
        back();
      } else if (e.key === 'Tab' && card.current) {
        const items = [...card.current.querySelectorAll<HTMLElement>('button')];
        const first = items[0];
        const lastItem = items[items.length - 1];
        if (!first || !lastItem) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && (document.activeElement === lastItem || !card.current.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      } else if (!['Enter', ' ', 'Shift'].includes(e.key)) {
        // The map's own shortcuts (/, c, Esc…) wait until the tour is over.
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, finish, next, back]);

  // Focus moves into the card once it is placed (it is invisible, and can't take focus, while it is measured).
  const placed = place !== null;
  useEffect(() => {
    if (open && placed) nextBtn.current?.focus({ preventScroll: true });
  }, [open, i, placed]);

  if (!open || typeof document === 'undefined') return null;
  const pad = 8;
  const sheet = place?.mode === 'sheet';
  const cardStyle: React.CSSProperties = !place
    ? { visibility: 'hidden', left: 12, top: 12, width: 'min(360px, calc(100vw - 24px))' }
    : place.mode === 'sheet'
      ? {
          left: 'calc(8px + env(safe-area-inset-left))',
          right: 'calc(8px + env(safe-area-inset-right))',
          ...(place.edge === 'bottom' ? { bottom: 'calc(8px + env(safe-area-inset-bottom))' } : { top: 'calc(8px + env(safe-area-inset-top))' }),
          maxHeight: 'calc(100dvh - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
        }
      : { left: place.left, top: place.top, width: place.width, maxHeight: place.maxHeight };

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-tour)]" role="dialog" aria-modal="true" aria-label={t('tour.label')} aria-describedby="fm-tour-body" data-testid="tour">
      {/* The backdrop takes every tap outside the card and ignores it: only Skip ends the tour. */}
      <div className="absolute inset-0" data-testid="tour-backdrop" style={{ background: target ? 'transparent' : 'rgb(0 0 0 / .55)' }} onClick={(e) => e.stopPropagation()} />
      {target && (
        <div
          className="absolute rounded-2xl pointer-events-none"
          data-testid="tour-spotlight"
          style={{
            left: target.left - pad,
            top: target.top - pad,
            width: target.width + pad * 2,
            height: target.height + pad * 2,
            boxShadow: '0 0 0 200vmax rgb(0 0 0 / .55), 0 0 0 3px var(--color-teal)',
          }}
        />
      )}
      <div
        ref={card}
        data-testid="tour-card"
        data-placement={place ? (place.mode === 'sheet' ? `sheet-${place.edge}` : place.side) : 'measuring'}
        className={`absolute surface shadow-2xl overflow-y-auto overscroll-contain p-5 ${sheet ? 'rounded-3xl' : ''} animate-rise`}
        style={cardStyle}
      >
        <div className="text-xs uppercase tracking-wider text-[var(--color-teal)] font-semibold" aria-live="polite">
          {t('tour.step', { n: i + 1, total: STEPS.length })}
        </div>
        <h2 className="text-lg font-bold mt-1">{t(step.title)}</h2>
        <p id="fm-tour-body" className="text-sm muted mt-1">{t(step.body)}</p>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button type="button" className="btn-ghost min-h-11 px-3 text-sm" onClick={() => void finish()}>{t('tour.skip')}</button>
          <span className="ml-auto flex gap-2">
            {i > 0 && (
              <button type="button" className="btn-ghost min-h-11 px-4" onClick={back}>{t('tour.back')}</button>
            )}
            <button ref={nextBtn} type="button" className="btn-primary min-h-11 px-5" onClick={next}>
              {last ? t('tour.done') : t('tour.next')}
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
