'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, HelpCircle, Info, PlayCircle } from 'lucide-react';
import { t } from '@/lib/i18n';

/** The (?) button on the map: replay the guided tour, or read how FlatMeta works. */
export function HelpMenu({ onReplayTour, className = '' }: { onReplayTour: () => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const item = 'flex items-center gap-3 px-3 min-h-11 rounded-xl hover:bg-white/5 text-sm w-full text-left';
  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        className="glass rounded-2xl icon-btn"
        aria-label={t('tour.help')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        data-tour-return
        onClick={() => setOpen((o) => !o)}
      >
        <HelpCircle size={18} />
      </button>
      {open && (
        <div id={id} role="menu" className="absolute left-full ml-2 bottom-0 w-56 surface p-1.5 shadow-2xl animate-pop">
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onReplayTour();
            }}
          >
            <PlayCircle size={16} className="text-[var(--color-teal)]" /> {t('tour.replay')}
          </button>
          <Link role="menuitem" href="/about" className={item}>
            <Info size={16} className="muted" /> How FlatMeta works
          </Link>
          <Link role="menuitem" href="/about/facts" className={item}>
            <BookOpen size={16} className="muted" /> FlatMeta facts
          </Link>
        </div>
      )}
    </div>
  );
}
