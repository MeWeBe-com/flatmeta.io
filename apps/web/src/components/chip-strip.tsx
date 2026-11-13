'use client';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * M6/M7: a row of filter chips that never wraps into a wall or widens the page on phones: one line that scrolls
 * sideways (scroll-snap, edges fading where there is more), and the current chip (aria-current) scrolled into view.
 * From `wrapFrom` up it wraps like a normal row. Every chip stays a plain link in the HTML (crawlable).
 */
export function ChipStrip({ label, children, wrapFrom = 'md' }: { label: string; children: ReactNode; wrapFrom?: 'md' | 'lg' | 'never' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const current = el.querySelector<HTMLElement>('[aria-current="page"], [aria-current="true"]');
    // Scroll only the strip (never the page) so the current chip sits in the middle when it can.
    if (current && el.scrollWidth > el.clientWidth) el.scrollLeft = current.offsetLeft - el.offsetLeft - (el.clientWidth - current.offsetWidth) / 2;
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
  }, []);
  const wrap = wrapFrom === 'md' ? 'md:flex-wrap md:overflow-visible md:[mask-image:none]' : wrapFrom === 'lg' ? 'lg:flex-wrap lg:overflow-visible lg:[mask-image:none]' : '';
  return (
    <nav aria-label={label}>
      <div ref={ref} className={`chip-strip flex gap-2 overflow-x-auto snap-x snap-mandatory overscroll-x-contain ${wrap}`} data-testid="chip-strip">
        {children}
      </div>
    </nav>
  );
}
