/**
 * FlatMeta land grid (kept from v1): Web-Mercator squares of 40 px at zoom 15.
 * Every cell has integer coordinates (gx, gy); a plot is a rectangle of cells.
 */
export const GRID_ZOOM = 15;
export const CELL_PX = 40;
const WORLD = 256 * 2 ** GRID_ZOOM;
export const GRID_MAX = Math.floor(WORLD / CELL_PX) - 1; // 209714

export interface Rect {
  minGx: number;
  minGy: number;
  maxGx: number;
  maxGy: number;
}

export function lngLatToCell(lng: number, lat: number): { gx: number; gy: number } {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = ((lng + 180) / 360) * WORLD;
  const sin = Math.sin((clampedLat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * WORLD;
  return {
    gx: Math.min(GRID_MAX, Math.max(0, Math.floor(x / CELL_PX))),
    gy: Math.min(GRID_MAX, Math.max(0, Math.floor(y / CELL_PX))),
  };
}

/** North-west corner of a cell. */
export function cellToLngLat(gx: number, gy: number): { lng: number; lat: number } {
  const lng = ((gx * CELL_PX) / WORLD) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * gy * CELL_PX) / WORLD;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lng, lat };
}

export function rectBounds(r: Rect): { west: number; south: number; east: number; north: number } {
  const nw = cellToLngLat(r.minGx, r.minGy);
  const se = cellToLngLat(r.maxGx + 1, r.maxGy + 1);
  return { west: nw.lng, north: nw.lat, east: se.lng, south: se.lat };
}

export function rectCenter(r: Rect): { lng: number; lat: number } {
  const b = rectBounds(r);
  return { lng: (b.west + b.east) / 2, lat: (b.north + b.south) / 2 };
}

/** Polygon ring [lng, lat] (closed) for GeoJSON. */
export function rectPolygon(r: Rect): [number, number][] {
  const b = rectBounds(r);
  return [
    [b.west, b.north],
    [b.east, b.north],
    [b.east, b.south],
    [b.west, b.south],
    [b.west, b.north],
  ];
}

export function normalizeRect(r: Rect): Rect {
  return {
    minGx: Math.min(r.minGx, r.maxGx),
    maxGx: Math.max(r.minGx, r.maxGx),
    minGy: Math.min(r.minGy, r.maxGy),
    maxGy: Math.max(r.minGy, r.maxGy),
  };
}

export const rectWidth = (r: Rect) => r.maxGx - r.minGx + 1;
export const rectHeight = (r: Rect) => r.maxGy - r.minGy + 1;
export const rectCells = (r: Rect) => rectWidth(r) * rectHeight(r);

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.minGx <= b.maxGx && b.minGx <= a.maxGx && a.minGy <= b.maxGy && b.minGy <= a.maxGy;
}

export function expandRect(r: Rect, by: number): Rect {
  return { minGx: r.minGx - by, minGy: r.minGy - by, maxGx: r.maxGx + by, maxGy: r.maxGy + by };
}

export function* cellsOf(r: Rect): Generator<{ gx: number; gy: number }> {
  for (let gx = r.minGx; gx <= r.maxGx; gx++) for (let gy = r.minGy; gy <= r.maxGy; gy++) yield { gx, gy };
}

/** A w×h rectangle centred on a coordinate. */
export function rectAround(lng: number, lat: number, w: number, h: number): Rect {
  const c = lngLatToCell(lng, lat);
  const minGx = c.gx - Math.floor((w - 1) / 2);
  const minGy = c.gy - Math.floor((h - 1) / 2);
  return { minGx, minGy, maxGx: minGx + w - 1, maxGy: minGy + h - 1 };
}

/** Converts a lng/lat bbox (west,south,east,north) into a cell rectangle. */
export function bboxToRect(west: number, south: number, east: number, north: number): Rect {
  const a = lngLatToCell(west, north);
  const b = lngLatToCell(east, south);
  return { minGx: a.gx, minGy: a.gy, maxGx: b.gx, maxGy: b.gy };
}

const WORDS = [
  'alpha', 'orbit', 'nexus', 'cyber', 'solar', 'lunar', 'pixel', 'prism',
  'atlas', 'nova', 'pulse', 'spark', 'crest', 'haven', 'plaza', 'tower',
  'delta', 'metro', 'oasis', 'prime', 'coral', 'amber', 'azure', 'emerald',
  'crown', 'ridge', 'forge', 'bloom', 'drift', 'globe', 'light', 'matrix',
];

/** Deterministic 3-word address for a cell (kept from v1). */
export function threeWords(gx: number, gy: number): string {
  const h1 = Math.abs((gx * 73856093) ^ (gy * 19349663));
  const h2 = Math.abs((gx * 83492791) ^ (gy * 479001599));
  const h3 = Math.abs((gx + gy) * 2654435761);
  return [h1, h2, h3].map((h) => WORDS[h % WORDS.length]).join('.');
}
