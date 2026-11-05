/**
 * Where my avatar and the camera start on the map (guests and signed-in players, desktop and mobile).
 *
 * A link with ?at=lat,lng,zoom ("meet me here") puts me at that spot. Otherwise, in order (first match wins):
 *   1. saved    – a signed-in player's last position, kept on the server
 *   2. device   – the last position on this device (localStorage only, never sent anywhere but the live map)
 *   3. ip       – Cloudflare's approximate location for this visit (city level), via GET /v1/me/approx-location
 *   4. country  – the centre of the visitor's country
 *   5. home     – the FlatMeta Home plaza. Never a random point.
 * Precise browser geolocation, after the visitor agrees, then glides the avatar to the exact spot.
 */
export type SpawnSource = 'link' | 'saved' | 'device' | 'ip' | 'country' | 'home' | 'precise';

export interface Spawn {
  source: SpawnSource;
  lat: number;
  lng: number;
  zoom: number;
  /** Show the "approximate location" note (until precise geolocation replaces it). */
  approximate: boolean;
  city?: string | null;
}

export interface ServerStart {
  source: 'saved' | 'ip' | 'country' | 'home';
  lat: number;
  lng: number;
  zoom: number;
  approximate: boolean;
  city: string | null;
  country: string | null;
}

/** Next to the FlatMeta HQ landmark (same point as the API's HOME_PLAZA). */
export const HOME_PLAZA = { lat: 51.5029, lng: -0.1206 } as const;
export const SPAWN_ZOOM = { saved: 16, device: 16, ip: 12, country: 7, home: 15, precise: 16 } as const;

const valid = (p: { lat: number; lng: number } | null | undefined): p is { lat: number; lng: number } =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 85 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0);

export function pickSpawn({ server, device }: { server: ServerStart | null; device: { lat: number; lng: number } | null }): Spawn {
  if (server?.source === 'saved' && valid(server)) return { source: 'saved', lat: server.lat, lng: server.lng, zoom: SPAWN_ZOOM.saved, approximate: false };
  if (valid(device)) return { source: 'device', lat: device.lat, lng: device.lng, zoom: SPAWN_ZOOM.device, approximate: false };
  if (server && server.source !== 'saved' && valid(server)) {
    return { source: server.source, lat: server.lat, lng: server.lng, zoom: SPAWN_ZOOM[server.source], approximate: true, city: server.city };
  }
  return { source: 'home', lat: HOME_PLAZA.lat, lng: HOME_PLAZA.lng, zoom: SPAWN_ZOOM.home, approximate: true };
}

/** Sources after which we offer precise location ("Start where you are?"). */
export const wantsPrecise = (s: Spawn) => s.source === 'ip' || s.source === 'country' || s.source === 'home';

export const DEVICE_POS_KEY = 'fm-pos-v2'; // written by the avatar layer as I move
export const GEO_CONSENT_KEY = 'fm-geo'; // 'granted' | 'declined'

export function readDevicePos(): { lat: number; lng: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(DEVICE_POS_KEY) ?? 'null') as [number, number] | null;
    return Array.isArray(v) && v.length === 2 ? { lng: Number(v[0]), lat: Number(v[1]) } : null;
  } catch {
    return null;
  }
}

export function geoConsent(): 'granted' | 'declined' | null {
  try {
    const v = localStorage.getItem(GEO_CONSENT_KEY);
    return v === 'granted' || v === 'declined' ? v : null;
  } catch {
    return null;
  }
}
export function setGeoConsent(v: 'granted' | 'declined') {
  try {
    localStorage.setItem(GEO_CONSENT_KEY, v);
  } catch {
    /* storage blocked */
  }
}

/** One precise reading: high accuracy, 8 s timeout. Rejects with the GeolocationPositionError code (1 = denied). */
export function precisePosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(Object.assign(new Error('unavailable'), { code: 2 }));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => reject(Object.assign(new Error(err.message), { code: err.code })),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

/** Whether the browser already granted location (no prompt needed); null when the Permissions API is missing. */
export async function geoPermission(): Promise<PermissionState | null> {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return p?.state ?? null;
  } catch {
    return null;
  }
}
