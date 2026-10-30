'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { Plot } from '@/lib/types';

const MiniMap = dynamic(() => import('./mini-map').then((m) => m.MiniMap), { ssr: false, loading: () => <div className="skeleton h-56" /> });

/** The map library is about 300 KB: only fetch it when the map is about to scroll into view. */
export function MiniMapLazy({ plot }: { plot: Plot }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (!('IntersectionObserver' in window)) return setShow(true);
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && (setShow(true), io.disconnect()), { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return <div ref={ref}>{show ? <MiniMap plot={plot} /> : <div className="skeleton h-56" aria-hidden />}</div>;
}
