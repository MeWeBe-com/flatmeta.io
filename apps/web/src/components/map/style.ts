import type { StyleSpecification, ExpressionSpecification } from 'maplibre-gl';
import { MAP_ATTRIBUTION, MAP_GLYPHS_URL, MAP_TILES_URL } from '@/lib/config';

/**
 * FlatMeta basemap styles on OpenMapTiles-schema vector tiles (OpenFreeMap by default).
 * "night": deep navy land, teal water, faint golden roads, the globe with an atmosphere.
 * "day": parchment and pastels.
 */
interface Palette {
  land: string;
  water: string;
  waterLine: string;
  grass: string;
  wood: string;
  park: string;
  sand: string;
  urban: string;
  roadMajor: string;
  roadMinor: string;
  roadCasing: string;
  rail: string;
  building: string;
  border: string;
  borderState: string;
  label: string;
  labelMuted: string;
  labelHalo: string;
  waterLabel: string;
  sky: string;
  horizon: string;
  fog: string;
}

const NIGHT: Palette = {
  land: '#18224a',
  water: '#06162a',
  waterLine: '#12406a',
  grass: '#173236',
  wood: '#16322f',
  park: '#1a3a36',
  sand: '#1a1f36',
  urban: '#1d2856',
  roadMajor: '#4a4570',
  roadMinor: '#2c3768',
  roadCasing: '#0b1020',
  rail: '#2a3060',
  building: '#26326a',
  border: '#5a6aa8',
  borderState: '#2f3a6b',
  label: '#e3e8ff',
  labelMuted: '#8b95c4',
  labelHalo: '#0b1020',
  waterLabel: '#5aa9d6',
  sky: '#0b1020',
  horizon: '#2b3f8a',
  fog: '#1a2a66',
};

const DAY: Palette = {
  land: '#f4ede0',
  water: '#a9d3e8',
  waterLine: '#86bcd8',
  grass: '#e3ead2',
  wood: '#d6e3c3',
  park: '#d2e6c4',
  sand: '#f0e3c2',
  urban: '#ede4d6',
  roadMajor: '#ffd99a',
  roadMinor: '#ffffff',
  roadCasing: '#e0d2bb',
  rail: '#c9bba5',
  building: '#e4d8c6',
  border: '#9a8fb8',
  borderState: '#c9bfd9',
  label: '#2a2f52',
  labelMuted: '#6b6f8c',
  labelHalo: '#fbf7ef',
  waterLabel: '#3d7ea6',
  sky: '#cfe6f5',
  horizon: '#f6f1e7',
  fog: '#f6f1e7',
};

const z = (stops: [number, number][]): ExpressionSpecification => ['interpolate', ['exponential', 1.4], ['zoom'], ...stops.flat()] as ExpressionSpecification;
const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];

export function buildStyle(mode: 'dark' | 'light'): StyleSpecification {
  const p = mode === 'dark' ? NIGHT : DAY;
  return {
    version: 8,
    name: `FlatMeta ${mode}`,
    glyphs: MAP_GLYPHS_URL,
    projection: { type: 'globe' },
    sky: {
      'sky-color': p.sky,
      'horizon-color': p.horizon,
      'fog-color': p.fog,
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.85,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
    },
    sources: {
      omt: { type: 'vector', url: MAP_TILES_URL, attribution: MAP_ATTRIBUTION },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': p.land } },
      { id: 'landcover-wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-color': p.wood, 'fill-opacity': 0.8 } },
      { id: 'landcover-grass', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['grass', 'farmland', 'wetland']]], paint: { 'fill-color': p.grass, 'fill-opacity': 0.6 } },
      { id: 'landcover-sand', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['sand', 'rock']]], paint: { 'fill-color': p.sand, 'fill-opacity': 0.6 } },
      { id: 'landuse-urban', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood', 'commercial', 'industrial', 'retail']]], maxzoom: 14, paint: { 'fill-color': p.urban, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0, 8, 0.8] } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': p.park, 'fill-opacity': 0.9 } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': p.water } },
      { id: 'water-edge', type: 'line', source: 'omt', 'source-layer': 'water', minzoom: 5, paint: { 'line-color': p.waterLine, 'line-width': z([[5, 0.4], [14, 1.4]]), 'line-opacity': 0.7 } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', minzoom: 8, paint: { 'line-color': p.waterLine, 'line-width': z([[8, 0.5], [16, 3]]) } },
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': p.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 0.85] } },
      { id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 11, filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'street', 'tertiary', 'path', 'track']]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.roadMinor, 'line-width': z([[11, 0.3], [18, 8]]) } },
      { id: 'road-major-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 6, filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.roadCasing, 'line-width': z([[6, 0.8], [18, 16]]) } },
      { id: 'road-major', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 5, filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.roadMajor, 'line-width': z([[5, 0.4], [18, 12]]), 'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 0.9] } },
      { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 11, filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': p.rail, 'line-width': 1, 'line-dasharray': [3, 3] } },
      { id: 'boundary-state', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 3, filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': p.borderState, 'line-width': 0.8, 'line-dasharray': [3, 2] } },
      { id: 'boundary-country', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': p.border, 'line-width': z([[0, 0.6], [10, 2]]), 'line-opacity': 0.75 } },
      // ── labels ──
      { id: 'water-label', type: 'symbol', source: 'omt', 'source-layer': 'water_name', minzoom: 2, layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': 12, 'text-letter-spacing': 0.15 }, paint: { 'text-color': p.waterLabel, 'text-halo-color': p.labelHalo, 'text-halo-width': 1 } },
      { id: 'road-label', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 12, layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': 11, 'symbol-placement': 'line' }, paint: { 'text-color': p.labelMuted, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.2 } },
      {
        id: 'place-small',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 10,
        filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter', 'village', 'hamlet']]],
        layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': z([[10, 10], [16, 14]]), 'text-transform': 'uppercase', 'text-letter-spacing': 0.1 },
        paint: { 'text-color': p.labelMuted, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.2 },
      },
      {
        id: 'place-town',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 7,
        filter: ['==', ['get', 'class'], 'town'],
        layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': z([[7, 10], [14, 15]]) },
        paint: { 'text-color': p.label, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.4 },
      },
      {
        id: 'place-city',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 3,
        filter: ['==', ['get', 'class'], 'city'],
        layout: { 'text-field': NAME, 'text-font': FONT_BOLD, 'text-size': z([[3, 11], [12, 20]]), 'symbol-sort-key': ['get', 'rank'] },
        paint: { 'text-color': p.label, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.6 },
      },
      {
        id: 'place-country',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        maxzoom: 8,
        filter: ['==', ['get', 'class'], 'country'],
        layout: { 'text-field': NAME, 'text-font': FONT_BOLD, 'text-size': z([[1, 10], [6, 16]]), 'text-transform': 'uppercase', 'text-letter-spacing': 0.2, 'text-max-width': 8 },
        paint: { 'text-color': p.labelMuted, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.5 },
      },
    ],
  };
}

/** First basemap label layer: plot layers are inserted below it so place names stay readable. */
export const FIRST_LABEL_LAYER = 'water-label';
