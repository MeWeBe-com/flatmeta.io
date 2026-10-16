/**
 * FlatMeta land grid.
 *
 * Land is a fixed grid of 40x40px squares at Leaflet zoom 15 (the "buy" level).
 * Every square is identified by integer grid coordinates (gx, gy); the lat/lng
 * stored on the server is always the square's north-west corner.
 */

export const GRID_ZOOM = 15;
export const TILE_PIXEL_SIZE = 40;

/** The three zoom levels the brief allows: buy/edit, roam, planet. */
export const ZOOM_LEVELS = { BUY: 15, ROAM: 10, PLANET: 5 } as const;
export const ALLOWED_ZOOMS = [ZOOM_LEVELS.PLANET, ZOOM_LEVELS.ROAM, ZOOM_LEVELS.BUY];

export interface GridPoint {
  gx: number;
  gy: number;
}

export interface GridBounds {
  minGx: number;
  minGy: number;
  maxGx: number;
  maxGy: number;
}

const WORLD_SIZE = 256 * Math.pow(2, GRID_ZOOM);

export function latLngToGrid(lat: number, lng: number): GridPoint {
  const x = ((lng + 180) / 360) * WORLD_SIZE;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * WORLD_SIZE;
  return {
    gx: Math.floor(x / TILE_PIXEL_SIZE),
    gy: Math.floor(y / TILE_PIXEL_SIZE),
  };
}

/** North-west corner of a grid square. */
export function gridToLatLng(gx: number, gy: number): { lat: number; lng: number } {
  const px = gx * TILE_PIXEL_SIZE;
  const py = gy * TILE_PIXEL_SIZE;
  const lng = (px / WORLD_SIZE) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * py) / WORLD_SIZE;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

/** Centre of a grid square, useful for flying the map/avatar to a square. */
export function gridCenterLatLng(gx: number, gy: number): { lat: number; lng: number } {
  const nw = gridToLatLng(gx, gy);
  const se = gridToLatLng(gx + 1, gy + 1);
  return { lat: (nw.lat + se.lat) / 2, lng: (nw.lng + se.lng) / 2 };
}

export function gridKey(gx: number, gy: number): string {
  return `${gx}:${gy}`;
}

export function boundsOf(points: GridPoint[]): GridBounds | null {
  if (!points.length) return null;
  return {
    minGx: Math.min(...points.map((p) => p.gx)),
    minGy: Math.min(...points.map((p) => p.gy)),
    maxGx: Math.max(...points.map((p) => p.gx)),
    maxGy: Math.max(...points.map((p) => p.gy)),
  };
}

export function isValidBounds(b: any): b is GridBounds {
  return (
    !!b &&
    [b.minGx, b.minGy, b.maxGx, b.maxGy].every((v) => Number.isFinite(Number(v))) &&
    Number(b.maxGx) >= Number(b.minGx) &&
    Number(b.maxGy) >= Number(b.minGy)
  );
}

/** A lat/lng rectangle (the map view, a loaded region, or a changed area). */
export interface LatLngBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export function isLatLngBox(b: any): b is LatLngBox {
  return (
    !!b &&
    [b.minLat, b.minLng, b.maxLat, b.maxLng].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    b.maxLat >= b.minLat &&
    b.maxLng >= b.minLng
  );
}

/** Grows a box by `ratio` of its size on every side, like Leaflet's LatLngBounds.pad. */
export function padBox(b: LatLngBox, ratio: number): LatLngBox {
  const dLat = (b.maxLat - b.minLat) * ratio;
  const dLng = (b.maxLng - b.minLng) * ratio;
  return {
    minLat: Math.max(-90, b.minLat - dLat),
    minLng: b.minLng - dLng,
    maxLat: Math.min(90, b.maxLat + dLat),
    maxLng: b.maxLng + dLng,
  };
}

export function boxContains(outer: LatLngBox, inner: LatLngBox): boolean {
  return (
    inner.minLat >= outer.minLat && inner.maxLat <= outer.maxLat && inner.minLng >= outer.minLng && inner.maxLng <= outer.maxLng
  );
}

/** The map wraps around the world, so a box also covers longitudes one world left and right of it. */
const WORLD_SHIFTS = [0, 360, -360];

export function boxesOverlap(a: LatLngBox, b: LatLngBox): boolean {
  if (a.minLat > b.maxLat || b.minLat > a.maxLat) return false;
  return WORLD_SHIFTS.some((s) => a.minLng <= b.maxLng + s && b.minLng + s <= a.maxLng);
}

export function boxContainsPoint(b: LatLngBox, lat: number, lng: number): boolean {
  if (lat < b.minLat || lat > b.maxLat) return false;
  return WORLD_SHIFTS.some((s) => lng + s >= b.minLng && lng + s <= b.maxLng);
}

/**
 * `minLat,minLng,maxLat,maxLng` for the API's `bbox`, with longitudes wrapped
 * into [-180, 180]. A box crossing the antimeridian comes out with minLng > maxLng.
 */
export function bboxParam(b: LatLngBox): string {
  const wrap = (lng: number) => (lng >= -180 && lng <= 180 ? lng : ((((lng + 180) % 360) + 360) % 360) - 180);
  const [minLng, maxLng] = b.maxLng - b.minLng >= 360 ? [-180, 180] : [wrap(b.minLng), wrap(b.maxLng)];
  return [b.minLat, minLng, b.maxLat, maxLng].map((v) => Number(v.toFixed(6))).join(',');
}

/** The lat/lng rectangle covered by whole grid squares. */
export function gridBoundsToBox(b: GridBounds): LatLngBox {
  const nw = gridToLatLng(b.minGx, b.minGy);
  const se = gridToLatLng(b.maxGx + 1, b.maxGy + 1);
  return { minLat: se.lat, minLng: nw.lng, maxLat: nw.lat, maxLng: se.lng };
}

const WORD_LIST = [
  'alpha', 'orbit', 'nexus', 'cyber', 'solar', 'lunar', 'pixel', 'prism',
  'atlas', 'nova', 'pulse', 'spark', 'crest', 'haven', 'plaza', 'tower',
  'delta', 'metro', 'oasis', 'prime', 'coral', 'amber', 'azure', 'emerald',
  'crown', 'ridge', 'forge', 'bloom', 'drift', 'globe', 'light', 'matrix',
];

/** Deterministic default 3-word address for a square (owners can set their own). */
export function gridToThreeWords(gx: number, gy: number): string {
  const hash1 = Math.abs((gx * 73856093) ^ (gy * 19349663));
  const hash2 = Math.abs((gx * 83492791) ^ (gy * 479001599));
  const hash3 = Math.abs((gx + gy) * 2654435761);
  return [hash1, hash2, hash3].map((h) => WORD_LIST[h % WORD_LIST.length]).join('.');
}

export function snapToAllowedZoom(z: number): number {
  if (z <= 7) return ZOOM_LEVELS.PLANET;
  if (z <= 12) return ZOOM_LEVELS.ROAM;
  return ZOOM_LEVELS.BUY;
}

/** Turns free text into a URL-safe slug for flatmeta.io/u/<slug>. */
export function slugify(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^(u|uri)\//, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
