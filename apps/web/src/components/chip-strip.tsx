'use client';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * M6/M7: a row of filter chips that never wraps into a wall or widens the page on phones: one line that scrolls
 * sideways (scroll-snap, edges fading where there is more), and the current chip (aria-current, or aria-pressed for
 * filter buttons) scrolled into view, on load and whenever `current` changes.
 * From `wrapFrom` up it wraps like a normal row. Every chip stays a plain link in the HTML (crawlable).
 */
export function ChipStrip({ label, children, wrapFrom = 'md', current, className = '' }: { label: string; children: ReactNode; wrapFrom?: 'md' | 'lg' | 'never'; current?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-current="page"], [aria-current="true"], [aria-pressed="true"]');
    // Scroll only the strip (never the page) so the current chip sits in the middle when it can.
    if (active && el.scrollWidth > el.clientWidth) {
      const a = active.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      el.scrollLeft += a.left - r.left - (r.width - a.width) / 2;
    }
    const fade = () => {
      el.dataset.start = String(el.scrollLeft <= 1);
      el.dataset.end = String(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    };
    fade();
    el.addEventListener('scroll', fade, { passive: true });
    window.addEventListener('resize', fade);
    return () => {
      el.removeEventListener('scroll', fade);
      window.removeEventListener('resize', fade);
    };
  }, [current]);
  const wrap = wrapFrom === 'md' ? 'md:flex-wrap md:overflow-visible md:[mask-image:none]' : wrapFrom === 'lg' ? 'lg:flex-wrap lg:overflow-visible lg:[mask-image:none]' : '';
  return (
    <nav aria-label={label}>
      <div ref={ref} className={`chip-strip flex gap-2 overflow-x-auto snap-x snap-mandatory overscroll-x-contain ${wrap} ${className}`} data-testid="chip-strip">
        {children}
      </div>
    </nav>
  );
}
