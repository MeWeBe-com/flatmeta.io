'use client';
import dynamic from 'next/dynamic';
import type { Plot } from '@/lib/types';

const MiniMap = dynamic(() => import('./mini-map').then((m) => m.MiniMap), { ssr: false, loading: () => <div className="skeleton h-56" /> });
export function MiniMapLazy({ plot }: { plot: Plot }) {
  return <MiniMap plot={plot} />;
}
