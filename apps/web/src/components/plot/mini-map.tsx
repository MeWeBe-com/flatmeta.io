'use client';

import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import Link from 'next/link';
import type { Plot } from '@/lib/types';
import { rectPolygon } from '@/lib/grid';
import { buildStyle } from '../map/style';
import { useTheme } from '../providers';

if (typeof window !== 'undefined') setWorkerUrl('/vendor/maplibre-gl-worker.mjs');

/** Small, static map of a plot with its artwork. */
export function MiniMap({ plot }: { plot: Plot }) {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  useEffect(() => {
    if (!ref.current) return;
    const map = new MapLibreMap({
      container: ref.current,
      style: buildStyle(theme),
      bounds: [[plot.bounds.west, plot.bounds.south], [plot.bounds.east, plot.bounds.north]],
      fitBoundsOptions: { padding: 60, maxZoom: 16.5 },
      interactive: false,
      attributionControl: false,
    });
    map.on('style.load', () => {
      const { west, east, north, south } = plot.bounds;
      if (plot.coverImageUrl) {
        map.addSource('art', { type: 'image', url: plot.thumbUrl && plot.width / plot.height < 1.3 ? plot.thumbUrl : plot.coverImageUrl, coordinates: [[west, north], [east, north], [east, south], [west, south]] });
        map.addLayer({ id: 'art', type: 'raster', source: 'art' });
      }
      map.addSource('plot', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [rectPolygon(plot.rect)] } } });
      map.addLayer({ id: 'plot-line', type: 'line', source: 'plot', paint: { 'line-color': plot.kind === 'showcase' ? '#FFC94D' : '#2DE2C4', 'line-width': 3 } });
    });
    return () => map.remove();
  }, [plot, theme]);
  return (
    <Link href={`/?plot=${plot.slug}`} className="block surface overflow-hidden relative group" aria-label="Show on the world map">
      <div ref={ref} className="h-56 w-full" />
      <span className="absolute bottom-3 right-3 chip chip-teal group-hover:scale-105 transition">Open in world map →</span>
    </Link>
  );
}
