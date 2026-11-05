/**
 * Where a visitor's avatar and camera start on the map, in this order:
 *   1. saved   – a signed-in player's last position (stored server-side only for signed-in users)
 *   2. ip      – Cloudflare's approximate visitor location (cf-iplatitude / cf-iplongitude, city level)
 *   3. country – the centre of the visitor's country (cf-ipcountry)
 *   4. home    – the FlatMeta Home plaza, next to FlatMeta HQ. Never a random point.
 * Precise browser geolocation (with the visitor's consent) is handled by the web app on top of this.
 */
export type StartSource = 'saved' | 'ip' | 'country' | 'home';

export interface StartLocation {
  source: StartSource;
  lat: number;
  lng: number;
  /** Suggested camera zoom: Land level for a saved spot, City level for IP, a wide view (still showing avatars) for a country. */
  zoom: number;
  /** True unless this is the player's own saved spot. The web shows an "approximate location" note. */
  approximate: boolean;
  city: string | null;
  country: string | null;
}

/** Next to the FlatMeta HQ landmark (London South Bank), so nobody spawns inside the HQ plot. */
export const HOME_PLAZA = { lat: 51.5029, lng: -0.1206 } as const;
export const ZOOM = { saved: 16, ip: 12, country: 7, home: 15 } as const; // 7+: avatars are visible from 6.5

const coord = (v: unknown, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
};
const header = (h: Record<string, string | string[] | undefined>, name: string): string | null => {
  const v = h[name];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : null;
};
/** Cloudflare sends city names percent-encoded when they contain non-ASCII characters. */
const decode = (s: string | null) => {
  if (!s) return null;
  try {
    return decodeURIComponent(s).slice(0, 80);
  } catch {
    return s.slice(0, 80);
  }
};

export interface StartInput {
  saved?: { lat: number | null; lng: number | null } | null;
  headers: Record<string, string | string[] | undefined>;
  /** Country centre for an ISO code (from the countries table), or null if unknown. */
  countryCentre: (code: string) => { lat: number; lng: number } | null | Promise<{ lat: number; lng: number } | null>;
}

export async function resolveStart({ saved, headers, countryCentre }: StartInput): Promise<StartLocation> {
  const rawCountry = header(headers, 'cf-ipcountry')?.toUpperCase() ?? null;
  // Cloudflare uses XX (unknown) and T1 (Tor) for visitors it can't place.
  const country = rawCountry && /^[A-Z]{2}$/.test(rawCountry) && rawCountry !== 'XX' && rawCountry !== 'T1' ? rawCountry : null;
  const city = decode(header(headers, 'cf-ipcity'));

  const sLat = coord(saved?.lat, 85);
  const sLng = coord(saved?.lng, 180);
  if (sLat !== null && sLng !== null) return { source: 'saved', lat: sLat, lng: sLng, zoom: ZOOM.saved, approximate: false, city: null, country };

  const lat = coord(header(headers, 'cf-iplatitude'), 85);
  const lng = coord(header(headers, 'cf-iplongitude'), 180);
  // 0,0 is "Null Island": a missing value, not a visitor in the Gulf of Guinea.
  if (lat !== null && lng !== null && !(lat === 0 && lng === 0)) return { source: 'ip', lat, lng, zoom: ZOOM.ip, approximate: true, city, country };

  if (country) {
    const c = await countryCentre(country);
    if (c) return { source: 'country', lat: c.lat, lng: c.lng, zoom: ZOOM.country, approximate: true, city: null, country };
  }
  return { source: 'home', lat: HOME_PLAZA.lat, lng: HOME_PLAZA.lng, zoom: ZOOM.home, approximate: true, city: null, country };
}
