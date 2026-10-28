'use client';

import { Map as MapLibreMap, setWorkerUrl, type GeoJSONSource, type ImageSource, type LngLat, type Map as MLMap, type MapMouseEvent, type MapTouchEvent } from 'maplibre-gl';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { MAP_STYLE_URL } from '@/lib/config';
import { bboxToRect, lngLatToCell, normalizeRect, rectBounds, rectPolygon, type Rect } from '@/lib/grid';
import type { WorldPlot } from '@/lib/types';
import { buildStyle, FIRST_LABEL_LAYER } from './style';

export type SelectionState = 'idle' | 'checking' | 'ok' | 'free' | 'conflict' | 'invalid';

export interface WorldMapHandle {
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  fitBounds: (b: { west: number; south: number; east: number; north: number }, maxZoom?: number) => void;
  zoomBy: (delta: number) => void;
  getZoom: () => number;
  reload: () => void;
}

interface Props {
  ref?: Ref<WorldMapHandle>;
  theme: 'dark' | 'light';
  claimMode: boolean;
  selection: Rect | null;
  selectionState: SelectionState;
  maxSide: number;
  focusPlotId?: string | null;
  initialView?: { lng: number; lat: number; zoom: number };
  onSelect: (rect: Rect | null) => void;
  onPlotClick: (plot: WorldPlot) => void;
  onViewChange?: (v: { lng: number; lat: number; zoom: number }) => void;
  onPlotsLoaded?: (count: number) => void;
}

// MapLibre's worker module is copied to /vendor by scripts/copy-maplibre-worker.mjs.
if (typeof window !== 'undefined') setWorkerUrl('/vendor/maplibre-gl-worker.mjs');

const DEFAULT_COLORS = ['#2DE2C4', '#8B7CFF', '#FF8FB1', '#3FA9F5', '#FFC94D', '#4ADE80', '#FB923C'];
const ART_MIN_ZOOM = 12.5;
const ART_MAX = 90;
const GRID_MIN_ZOOM = 14;

function colorFor(p: WorldPlot): string {
  if (p.theme?.primary) return p.theme.primary;
  let h = 0;
  for (const c of p.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return DEFAULT_COLORS[h % DEFAULT_COLORS.length]!;
}

function toFeatures(plots: WorldPlot[]) {
  const polys: GeoJSON.Feature[] = [];
  const points: GeoJSON.Feature[] = [];
  for (const p of plots) {
    const props = {
      id: p.id,
      slug: p.slug,
      title: p.title,
      color: colorFor(p),
      accent: p.theme?.accent ?? '#FFFFFF',
      showcase: p.kind === 'showcase' ? 1 : 0,
      mine: p.mine ? 1 : 0,
      spotlight: p.spotlight ? 1 : 0,
      beacon: p.beacon || p.spotlight ? 1 : 0,
      cells: p.cellCount,
      label: p.kind === 'showcase' ? `★ ${p.title}` : p.title,
    };
    polys.push({ type: 'Feature', id: undefined, properties: props, geometry: { type: 'Polygon', coordinates: [rectPolygon(p.rect)] } });
    points.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [p.center.lng, p.center.lat] } });
  }
  return { polys: { type: 'FeatureCollection' as const, features: polys }, points: { type: 'FeatureCollection' as const, features: points } };
}

function gridLines(map: MLMap): GeoJSON.FeatureCollection {
  const b = map.getBounds();
  const r = bboxToRect(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
  const w = r.maxGx - r.minGx;
  const h = r.maxGy - r.minGy;
  if (w > 260 || h > 260 || w < 0) return { type: 'FeatureCollection', features: [] };
  const lines: number[][][] = [];
  const top = rectBounds({ minGx: r.minGx, minGy: r.minGy, maxGx: r.maxGx + 1, maxGy: r.maxGy + 1 });
  for (let gx = r.minGx; gx <= r.maxGx + 1; gx++) {
    const x = rectBounds({ minGx: gx, minGy: r.minGy, maxGx: gx, maxGy: r.minGy }).west;
    lines.push([[x, top.north], [x, top.south]]);
  }
  for (let gy = r.minGy; gy <= r.maxGy + 1; gy++) {
    const y = rectBounds({ minGx: r.minGx, minGy: gy, maxGx: r.minGx, maxGy: gy }).north;
    lines.push([[top.west, y], [top.east, y]]);
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } }] };
}

const SELECTION_COLORS: Record<SelectionState, string> = {
  idle: '#2DE2C4',
  checking: '#9AA5C7',
  ok: '#2DE2C4',
  free: '#FFC94D',
  conflict: '#FF6B6B',
  invalid: '#FF6B6B',
};

export function WorldMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const plotsRef = useRef<Map<string, WorldPlot>>(new Map());
  const artRef = useRef<Map<string, string>>(new Map()); // plot id → image url currently shown
  const propsRef = useRef(props);
  propsRef.current = props;
  const [hover, setHover] = useState<{ x: number; y: number; plot: WorldPlot } | null>(null);
  const [ready, setReady] = useState(false);
  const loadSeq = useRef(0);

  useImperativeHandle(props.ref, () => ({
    flyTo: (lng, lat, zoom) => mapRef.current?.flyTo({ center: [lng, lat], zoom: zoom ?? Math.max(mapRef.current.getZoom(), 15), speed: 1.4, curve: 1.5, essential: true }),
    fitBounds: (b, maxZoom = 16.5) => mapRef.current?.fitBounds([[b.west, b.south], [b.east, b.north]], { padding: 120, maxZoom, duration: 1600 }),
    zoomBy: (d) => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + d, duration: 300 }),
    getZoom: () => mapRef.current?.getZoom() ?? 0,
    reload: () => void loadPlots(true),
  }));

  // ── data loading ──
  async function loadPlots(force = false) {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const zoom = map.getZoom();
    const padX = (b.getEast() - b.getWest()) * 0.25;
    const padY = (b.getNorth() - b.getSouth()) * 0.25;
    const west = zoom < 3 ? -180 : Math.max(-180, b.getWest() - padX);
    const east = zoom < 3 ? 180 : Math.min(180, b.getEast() + padX);
    const south = Math.max(-85, b.getSouth() - padY);
    const north = Math.min(85, b.getNorth() + padY);
    const seq = ++loadSeq.current;
    try {
      const res = await fetch(`/api/v1/world/plots?bbox=${west.toFixed(5)},${south.toFixed(5)},${east.toFixed(5)},${north.toFixed(5)}&zoom=${zoom.toFixed(1)}`, { cache: force ? 'no-store' : 'default' });
      if (!res.ok || seq !== loadSeq.current) return;
      const data = (await res.json()) as { plots: WorldPlot[] };
      const cache = plotsRef.current;
      for (const p of data.plots) cache.set(p.id, p);
      // Keep the cache bounded: drop the oldest entries beyond 4000.
      if (cache.size > 4000) [...cache.keys()].slice(0, cache.size - 4000).forEach((k) => cache.delete(k));
      const all = [...cache.values()];
      const f = toFeatures(all);
      (map.getSource('plots') as GeoJSONSource | undefined)?.setData(f.polys);
      (map.getSource('plot-points') as GeoJSONSource | undefined)?.setData(f.points);
      propsRef.current.onPlotsLoaded?.(data.plots.length);
      syncArt();
    } catch {
      /* offline or aborted */
    }
  }

  // ── plot artwork (image sources) at high zoom ──
  function syncArt() {
    const map = mapRef.current;
    // isStyleLoaded() is false while tiles stream in; our own layer existing is the right readiness check.
    if (!map || !map.getLayer('plots-outline')) return;
    const zoom = map.getZoom();
    const want = new Map<string, string>();
    if (zoom >= ART_MIN_ZOOM) {
      const b = map.getBounds();
      const visible = [...plotsRef.current.values()]
        .filter((p) => p.thumbUrl && p.bounds.east >= b.getWest() && p.bounds.west <= b.getEast() && p.bounds.north >= b.getSouth() && p.bounds.south <= b.getNorth())
        .sort((a, b2) => b2.cellCount - a.cellCount)
        .slice(0, ART_MAX);
      for (const p of visible) {
        const wide = (p.rect.maxGx - p.rect.minGx + 1) / (p.rect.maxGy - p.rect.minGy + 1) >= 1.3;
        const url = wide ? p.thumbUrl!.replace('-thumb.webp', '.webp') : p.thumbUrl!;
        want.set(p.id, url);
      }
    }
    for (const [id] of artRef.current) {
      if (!want.has(id)) {
        if (map.getLayer(`art-${id}`)) map.removeLayer(`art-${id}`);
        if (map.getSource(`art-${id}`)) map.removeSource(`art-${id}`);
        artRef.current.delete(id);
      }
    }
    for (const [id, url] of want) {
      if (artRef.current.get(id) === url) continue;
      const p = plotsRef.current.get(id)!;
      const { west, east, north, south } = p.bounds;
      const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [[west, north], [east, north], [east, south], [west, south]];
      try {
        if (map.getSource(`art-${id}`)) {
          (map.getSource(`art-${id}`) as ImageSource).updateImage({ url, coordinates });
        } else {
          map.addSource(`art-${id}`, { type: 'image', url, coordinates });
          map.addLayer(
            { id: `art-${id}`, type: 'raster', source: `art-${id}`, paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], ART_MIN_ZOOM, 0, ART_MIN_ZOOM + 0.6, 1], 'raster-fade-duration': 200 } },
            'plots-outline',
          );
        }
        artRef.current.set(id, url);
      } catch {
        /* image failed */
      }
    }
  }

  // ── init ──
  useEffect(() => {
    if (!container.current) return;
    const iv = propsRef.current.initialView ?? { lng: 8, lat: 28, zoom: 1.6 };
    const map = new MapLibreMap({
      container: container.current,
      style: MAP_STYLE_URL || buildStyle(propsRef.current.theme),
      center: [iv.lng, iv.lat],
      zoom: iv.zoom,
      minZoom: 1,
      maxZoom: 19,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
      fadeDuration: 200,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    const addLayers = () => {
      if (map.getSource('plots')) return;
      map.addSource('plots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id' });
      map.addSource('plot-points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('grid', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('selection', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      const before = map.getLayer(FIRST_LABEL_LAYER) ? FIRST_LABEL_LAYER : undefined;
      map.addLayer(
        {
          id: 'plots-fill',
          type: 'fill',
          source: 'plots',
          minzoom: 8,
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.9, 12, 0.75, 14, 0.45],
          },
        },
        before,
      );
      map.addLayer(
        {
          id: 'plots-outline',
          type: 'line',
          source: 'plots',
          minzoom: 9,
          paint: {
            'line-color': ['case', ['==', ['get', 'mine'], 1], '#8B7CFF', ['==', ['get', 'showcase'], 1], '#FFC94D', ['get', 'accent']],
            'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 1.6, 17, 3],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 13, 0.95],
            'line-dasharray': ['case', ['==', ['get', 'showcase'], 1], ['literal', [2, 1.2]], ['literal', [1, 0]]],
          },
        },
        before,
      );
      map.addLayer(
        {
          id: 'plots-focus',
          type: 'line',
          source: 'plots',
          filter: ['==', ['get', 'id'], ''],
          paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 17, 5], 'line-blur': 1 },
        },
        before,
      );
      map.addLayer({
        id: 'plots-glow',
        type: 'circle',
        source: 'plot-points',
        maxzoom: 12,
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['+', 3, ['*', ['sqrt', ['get', 'cells']], 1.2]], 6, ['+', 6, ['*', ['sqrt', ['get', 'cells']], 2.4]], 11, ['+', 10, ['*', ['sqrt', ['get', 'cells']], 4]]],
          'circle-blur': 0.85,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.55, 10, 0.45, 12, 0],
        },
      });
      map.addLayer({
        id: 'plots-core',
        type: 'circle',
        source: 'plot-points',
        maxzoom: 12,
        paint: {
          'circle-color': ['case', ['==', ['get', 'showcase'], 1], '#FFE08A', '#FFFFFF'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.2, 8, 2.5, 11, 3.5],
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.9, 11.5, 0.9, 12, 0],
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-width': 1,
        },
      });
      map.addLayer({
        id: 'plots-beacon',
        type: 'circle',
        source: 'plot-points',
        filter: ['==', ['get', 'beacon'], 1],
        paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#FFC94D', 'circle-stroke-width': 2, 'circle-radius': 10, 'circle-stroke-opacity': 0.8 },
      });
      map.addLayer({
        id: 'plots-label',
        type: 'symbol',
        source: 'plot-points',
        minzoom: 11.5,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 11.5, 10, 16, 14],
          'text-offset': [0, 0],
          'text-max-width': 10,
          'symbol-sort-key': ['-', 0, ['get', 'cells']],
        },
        paint: { 'text-color': '#FFFFFF', 'text-halo-color': 'rgba(11,16,32,0.92)', 'text-halo-width': 1.6, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 12, 1] },
      });
      map.addLayer({ id: 'grid', type: 'line', source: 'grid', minzoom: GRID_MIN_ZOOM, paint: { 'line-color': '#2DE2C4', 'line-opacity': ['interpolate', ['linear'], ['zoom'], GRID_MIN_ZOOM, 0.12, 16, 0.3], 'line-width': 0.7 } });
      map.addLayer({ id: 'selection-fill', type: 'fill', source: 'selection', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.28 } });
      map.addLayer({ id: 'selection-line', type: 'line', source: 'selection', paint: { 'line-color': ['get', 'color'], 'line-width': 2.5 } });
    };

    map.on('style.load', () => {
      addLayers();
      artRef.current.clear();
      setReady(true);
      void loadPlots();
    });

    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    map.on('moveend', () => {
      const c = map.getCenter();
      propsRef.current.onViewChange?.({ lng: c.lng, lat: c.lat, zoom: map.getZoom() });
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => void loadPlots(), 220);
      if (propsRef.current.claimMode) (map.getSource('grid') as GeoJSONSource | undefined)?.setData(gridLines(map));
      syncArt();
    });
    map.on('idle', () => syncArt());

    // Hover + click on plots
    const plotAt = (e: MapMouseEvent) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['plots-fill', 'plots-glow', 'plots-core', 'plots-label'].filter((l) => map.getLayer(l)) })[0];
      return f ? plotsRef.current.get(String(f.properties?.id)) ?? null : null;
    };
    map.on('mousemove', (e: MapMouseEvent) => {
      if (propsRef.current.claimMode) return;
      const p = plotAt(e);
      map.getCanvas().style.cursor = p ? 'pointer' : '';
      setHover(p ? { x: e.point.x, y: e.point.y, plot: p } : null);
    });
    map.on('mouseout', () => setHover(null));
    map.on('click', (e: MapMouseEvent) => {
      if (propsRef.current.claimMode) return;
      const p = plotAt(e);
      if (p) propsRef.current.onPlotClick(p);
    });

    // Beacon pulse animation (only runs while beacons exist)
    let raf = 0;
    const animate = (t: number) => {
      if (map.getLayer('plots-beacon')) {
        const phase = (t % 2000) / 2000;
        map.setPaintProperty('plots-beacon', 'circle-radius', 8 + phase * 26);
        map.setPaintProperty('plots-beacon', 'circle-stroke-opacity', 0.9 * (1 - phase));
      }
      raf = requestAnimationFrame(animate);
    };
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme switch → new style (layers are re-added on style.load)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || MAP_STYLE_URL) return;
    map.setStyle(buildStyle(props.theme), { diff: false });
  }, [props.theme]);

  // Focus outline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer('plots-focus')) return;
    map.setFilter('plots-focus', ['==', ['get', 'id'], props.focusPlotId ?? '']);
  }, [props.focusPlotId, ready]);

  // ── claim mode: grid + drag/tap selection ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!props.claimMode) {
      map.dragPan.enable();
      (map.getSource('grid') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
      map.getCanvas().style.cursor = '';
      return;
    }
    setHover(null);
    map.dragPan.disable();
    map.getCanvas().style.cursor = 'crosshair';
    (map.getSource('grid') as GeoJSONSource | undefined)?.setData(gridLines(map));

    let start: { gx: number; gy: number } | null = null;
    let anchor: { gx: number; gy: number } | null = null;
    let moved = false;
    const clamp = (a: { gx: number; gy: number }, b: { gx: number; gy: number }): Rect => {
      const max = propsRef.current.maxSide - 1;
      const gx = Math.max(a.gx - max, Math.min(a.gx + max, b.gx));
      const gy = Math.max(a.gy - max, Math.min(a.gy + max, b.gy));
      return normalizeRect({ minGx: a.gx, minGy: a.gy, maxGx: gx, maxGy: gy });
    };
    const cellOf = (lngLat: LngLat) => lngLatToCell(lngLat.lng, lngLat.lat);
    const tooFar = () => map.getZoom() < GRID_MIN_ZOOM - 0.5;

    const down = (e: MapMouseEvent | MapTouchEvent) => {
      if ('points' in e && e.points.length > 1) return;
      if (tooFar()) return;
      start = cellOf(e.lngLat);
      moved = false;
    };
    const move = (e: MapMouseEvent | MapTouchEvent) => {
      if (!start) return;
      const c = cellOf(e.lngLat);
      if (c.gx !== start.gx || c.gy !== start.gy) moved = true;
      if (moved) propsRef.current.onSelect(clamp(start, c));
    };
    const up = (e: MapMouseEvent | MapTouchEvent) => {
      if (!start) return;
      const c = cellOf(e.lngLat);
      if (moved) {
        propsRef.current.onSelect(clamp(start, c));
        anchor = null;
      } else if (anchor && (anchor.gx !== c.gx || anchor.gy !== c.gy)) {
        propsRef.current.onSelect(clamp(anchor, c));
        anchor = null;
      } else {
        anchor = c;
        propsRef.current.onSelect({ minGx: c.gx, minGy: c.gy, maxGx: c.gx, maxGy: c.gy });
      }
      start = null;
    };
    map.on('mousedown', down);
    map.on('mousemove', move);
    map.on('mouseup', up);
    map.on('touchstart', down);
    map.on('touchmove', move);
    map.on('touchend', up);
    return () => {
      map.off('mousedown', down);
      map.off('mousemove', move);
      map.off('mouseup', up);
      map.off('touchstart', down);
      map.off('touchmove', move);
      map.off('touchend', up);
    };
  }, [props.claimMode, ready]);

  // Selection rectangle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource('selection') as GeoJSONSource | undefined;
    if (!src) return;
    if (!props.selection || !props.claimMode) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    src.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { color: SELECTION_COLORS[props.selectionState] }, geometry: { type: 'Polygon', coordinates: [rectPolygon(props.selection)] } }],
    });
  }, [props.selection, props.selectionState, props.claimMode, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" aria-label="World map" role="application" />
      {hover && !props.claimMode && (
        <div className="pointer-events-none absolute z-10 glass rounded-xl px-3 py-2 text-sm animate-pop max-w-64" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="font-semibold truncate">{hover.plot.title}</div>
          <div className="text-xs muted truncate">
            {hover.plot.kind === 'showcase' ? 'Showcase · unclaimed sample' : hover.plot.ownerName ? `by ${hover.plot.ownerName}` : 'Claimed'}
            {hover.plot.likesCount ? ` · ♥ ${hover.plot.likesCount}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
